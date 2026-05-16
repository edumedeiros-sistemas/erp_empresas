import { db } from '@/firebase'
import {
  accessRequestsCol,
  clientsCol,
  financialCol,
  invitesCol,
  membersCol,
  orgDirectoryDoc,
  orgDoc,
  payablesCol,
  productDraftsCol,
  productsCol,
  receivablesCol,
  saleItemsCol,
  salesCol,
  stockMovementsCol,
  supplierDraftsCol,
  suppliersCol,
} from '@/lib/firestorePaths'
import type { CollectionReference } from 'firebase/firestore'
import { collection, deleteDoc, getDocs, limit, query, writeBatch } from 'firebase/firestore'

const CHUNK = 400

async function deleteQueryInChunks(colRef: CollectionReference): Promise<void> {
  while (true) {
    const snap = await getDocs(query(colRef, limit(CHUNK)))
    if (snap.empty) return
    const b = writeBatch(db)
    for (const d of snap.docs) {
      b.delete(d.ref)
    }
    await b.commit()
  }
}

/** Apaga subcoleções conhecidas e o documento da organização (e orgDirectory). */
export async function deleteOrganizationTree(orgId: string): Promise<void> {
  await deleteQueryInChunks(membersCol(db, orgId))
  await deleteQueryInChunks(invitesCol(db, orgId))
  await deleteQueryInChunks(accessRequestsCol(db, orgId))
  await deleteQueryInChunks(clientsCol(db, orgId))
  await deleteQueryInChunks(suppliersCol(db, orgId))
  await deleteQueryInChunks(productsCol(db, orgId))
  await deleteQueryInChunks(productDraftsCol(db, orgId))
  await deleteQueryInChunks(supplierDraftsCol(db, orgId))
  await deleteQueryInChunks(stockMovementsCol(db, orgId))
  await deleteQueryInChunks(financialCol(db, orgId))
  await deleteQueryInChunks(payablesCol(db, orgId))
  await deleteQueryInChunks(receivablesCol(db, orgId))

  const salesSnap = await getDocs(salesCol(db, orgId))
  for (const s of salesSnap.docs) {
    await deleteQueryInChunks(saleItemsCol(db, orgId, s.id))
    await deleteDoc(s.ref)
  }

  const metaCol = collection(db, 'organizations', orgId, 'meta')
  const metaSnap = await getDocs(metaCol)
  for (const m of metaSnap.docs) {
    await deleteDoc(m.ref)
  }

  await deleteDoc(orgDirectoryDoc(db, orgId)).catch(() => {})
  await deleteDoc(orgDoc(db, orgId))
}
