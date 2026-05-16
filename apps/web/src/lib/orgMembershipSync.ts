import { db } from '@/firebase'
import {
  membersCol,
  orgDirectoryCol,
  orgDoc,
  organizationsCol,
  userDoc,
  userPublicLookupDoc,
} from '@/lib/firestorePaths'
import { normalizeEmail } from '@/lib/emailNormalize'
import type { MemberRole } from '@/types'
import {
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'

export type UserMembershipRow = {
  orgId: string
  orgName: string
  role: MemberRole
}

/** Mantém só IDs de organizações que ainda existem no Firestore. */
export async function filterExistingOrgIds(orgIds: string[]): Promise<string[]> {
  const unique = [...new Set(orgIds.filter(Boolean))]
  const checks = await Promise.all(
    unique.map(async (id) => {
      const snap = await getDoc(orgDoc(db, id))
      return snap.exists() ? id : null
    }),
  )
  return checks.filter((id): id is string => id != null)
}

/** Remove um orgId do array users.orgIds de cada UID (ex.: ao eliminar empresa). */
export async function stripOrgIdFromUserProfiles(orgId: string, userIds: string[]): Promise<void> {
  const uids = [...new Set(userIds.filter(Boolean))]
  await Promise.all(
    uids.map(async (uid) => {
      const uref = userDoc(db, uid)
      const snap = await getDoc(uref)
      if (!snap.exists()) return
      const orgIds = ((snap.data().orgIds as string[] | undefined) ?? []).filter((x) => x !== orgId)
      await updateDoc(uref, { orgIds })
    }),
  )
}

/**
 * Lista empresas do utilizador (super-admin): percorre organizations e faz get em members/{uid}.
 * Evita collection group, que falha em permissões ao listar membros de outro UID.
 */
export async function listUserMembershipsForAdmin(uid: string): Promise<UserMembershipRow[]> {
  const orgsSnap = await getDocs(organizationsCol(db))
  const rows: UserMembershipRow[] = []
  for (const org of orgsSnap.docs) {
    const orgId = org.id
    const orgName = String((org.data().name as string) ?? orgId)
    const memSnap = await getDoc(doc(membersCol(db, orgId), uid))
    if (!memSnap.exists()) continue
    const x = memSnap.data() as Record<string, unknown>
    rows.push({
      orgId,
      orgName,
      role: (x.role as MemberRole) ?? 'staff',
    })
  }
  rows.sort((a, b) => a.orgName.localeCompare(b.orgName, 'pt-BR'))
  return rows
}

/** @deprecated Use listUserMembershipsForAdmin — mantido como alias. */
export async function listUserMemberships(uid: string): Promise<UserMembershipRow[]> {
  return listUserMembershipsForAdmin(uid)
}

/**
 * Reconstrói users.orgIds a partir dos documentos members ativos (fonte de verdade).
 * Remove IDs de empresas já apagadas.
 */
export async function repairUserOrgIdsFromMembers(uid: string): Promise<string[]> {
  const rows = await listUserMembershipsForAdmin(uid)
  const orgIds = await filterExistingOrgIds(rows.map((r) => r.orgId))
  const uref = userDoc(db, uid)
  const us = await getDoc(uref)
  if (us.exists()) {
    await updateDoc(uref, { orgIds })
  }
  return orgIds
}

export async function updateUserEmailAdmin(uid: string, email: string): Promise<void> {
  const trimmed = email.trim()
  const emailLower = normalizeEmail(trimmed)
  if (!emailLower) throw new Error('Email inválido.')

  await setDoc(
    userDoc(db, uid),
    { email: trimmed, emailLower, updatedAt: serverTimestamp() },
    { merge: true },
  )
  await setDoc(
    userPublicLookupDoc(db, uid),
    { email: trimmed, emailLower, updatedAt: serverTimestamp() },
    { merge: true },
  )

  const memberships = await listUserMembershipsForAdmin(uid)
  if (memberships.length > 0) {
    const batch = writeBatch(db)
    for (const m of memberships) {
      batch.update(doc(membersCol(db, m.orgId), uid), { email: trimmed })
    }
    await batch.commit()
  }
}

export async function removeUserFromOrgMembership(uid: string, orgId: string): Promise<void> {
  await deleteDoc(doc(membersCol(db, orgId), uid))
  const uref = userDoc(db, uid)
  const us = await getDoc(uref)
  if (us.exists()) {
    const orgIds = ((us.data().orgIds as string[] | undefined) ?? []).filter((x) => x !== orgId)
    await updateDoc(uref, { orgIds })
  }
}

/** Apaga perfil Firestore e membros em todas as empresas (não remove conta Firebase Auth). */
export async function deleteUserFirestoreData(uid: string): Promise<void> {
  const memberships = await listUserMembershipsForAdmin(uid)
  let batch = writeBatch(db)
  let n = 0
  for (const m of memberships) {
    batch.delete(doc(membersCol(db, m.orgId), uid))
    n++
    if (n >= 400) {
      await batch.commit()
      batch = writeBatch(db)
      n = 0
    }
  }
  if (n > 0) await batch.commit()
  await deleteDoc(userDoc(db, uid))
  await deleteDoc(userPublicLookupDoc(db, uid)).catch(() => {})
}

/**
 * IDs de org do utilizador (refresh / F5).
 * Não usa collection group em `members` — regras Firestore só permitem list a admin/super-admin.
 */
export async function listMembershipOrgIdsForUser(uid: string): Promise<string[]> {
  const usnap = await getDoc(userDoc(db, uid))
  const profileIds: string[] = usnap.exists()
    ? ((usnap.data().orgIds as string[]) ?? []).filter(Boolean)
    : []

  let candidates = [...new Set(profileIds)]

  if (candidates.length === 0) {
    try {
      const dirSnap = await getDocs(orgDirectoryCol(db))
      candidates = dirSnap.docs.map((d) => d.id)
    } catch {
      /* sem orgDirectory legível */
    }
  }

  const verified = await verifyMembershipOrgIds(uid, candidates)
  return filterExistingOrgIds(verified)
}

/** Confirma orgIds com documento member existente (remove fantasmas do perfil). */
export async function verifyMembershipOrgIds(uid: string, orgIds: string[]): Promise<string[]> {
  const verified: string[] = []
  for (const orgId of orgIds) {
    const orgSnap = await getDoc(orgDoc(db, orgId))
    if (!orgSnap.exists()) continue
    const memSnap = await getDoc(doc(membersCol(db, orgId), uid))
    if (memSnap.exists()) verified.push(orgId)
  }
  return verified
}
