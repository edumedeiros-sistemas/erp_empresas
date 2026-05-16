import { db } from '@/firebase'
import { membersCol, orgDoc, userDoc, userPublicLookupDoc } from '@/lib/firestorePaths'
import { normalizeEmail } from '@/lib/emailNormalize'
import type { MemberRole } from '@/types'
import {
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
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
 * Reconstrói users.orgIds a partir dos documentos members ativos (fonte de verdade).
 * Remove IDs de empresas já apagadas.
 */
export async function repairUserOrgIdsFromMembers(uid: string): Promise<string[]> {
  const q = query(collectionGroup(db, 'members'), where('memberUid', '==', uid))
  const snap = await getDocs(q)
  const fromMembers = [
    ...new Set(
      snap.docs
        .map((d) => d.ref.parent.parent?.id)
        .filter((id): id is string => Boolean(id)),
    ),
  ]
  const orgIds = await filterExistingOrgIds(fromMembers)
  const uref = userDoc(db, uid)
  const us = await getDoc(uref)
  if (us.exists()) {
    await updateDoc(uref, { orgIds })
  }
  return orgIds
}

export async function listUserMemberships(uid: string): Promise<UserMembershipRow[]> {
  const q = query(collectionGroup(db, 'members'), where('memberUid', '==', uid))
  const snap = await getDocs(q)
  const rows: UserMembershipRow[] = []
  for (const d of snap.docs) {
    const orgId = d.ref.parent.parent?.id
    if (!orgId) continue
    const x = d.data() as Record<string, unknown>
    const orgSnap = await getDoc(orgDoc(db, orgId))
    rows.push({
      orgId,
      orgName: orgSnap.exists() ? String((orgSnap.data().name as string) ?? orgId) : orgId,
      role: (x.role as MemberRole) ?? 'staff',
    })
  }
  rows.sort((a, b) => a.orgName.localeCompare(b.orgName, 'pt-BR'))
  return rows
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

  const snap = await getDocs(query(collectionGroup(db, 'members'), where('memberUid', '==', uid)))
  if (!snap.empty) {
    const batch = writeBatch(db)
    for (const d of snap.docs) {
      batch.update(d.ref, { email: trimmed })
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
  const snap = await getDocs(query(collectionGroup(db, 'members'), where('memberUid', '==', uid)))
  let batch = writeBatch(db)
  let n = 0
  for (const d of snap.docs) {
    batch.delete(d.ref)
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
