import { db } from '@/firebase'
import { orgDoc, userDoc } from '@/lib/firestorePaths'
import { collectionGroup, getDoc, getDocs, query, updateDoc, where } from 'firebase/firestore'

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
