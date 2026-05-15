import type { Firestore } from 'firebase/firestore'
import { collection, doc } from 'firebase/firestore'

export function orgDoc(db: Firestore, orgId: string) {
  return doc(db, 'organizations', orgId)
}

export function clientsCol(db: Firestore, orgId: string) {
  return collection(db, 'organizations', orgId, 'clients')
}

export function suppliersCol(db: Firestore, orgId: string) {
  return collection(db, 'organizations', orgId, 'suppliers')
}

export function productsCol(db: Firestore, orgId: string) {
  return collection(db, 'organizations', orgId, 'products')
}

export function salesCol(db: Firestore, orgId: string) {
  return collection(db, 'organizations', orgId, 'sales')
}

export function saleItemsCol(db: Firestore, orgId: string, saleId: string) {
  return collection(db, 'organizations', orgId, 'sales', saleId, 'items')
}

export function stockMovementsCol(db: Firestore, orgId: string) {
  return collection(db, 'organizations', orgId, 'stockMovements')
}

export function financialCol(db: Firestore, orgId: string) {
  return collection(db, 'organizations', orgId, 'financialTransactions')
}

export function payablesCol(db: Firestore, orgId: string) {
  return collection(db, 'organizations', orgId, 'payables')
}

export function receivablesCol(db: Firestore, orgId: string) {
  return collection(db, 'organizations', orgId, 'receivables')
}

export function membersCol(db: Firestore, orgId: string) {
  return collection(db, 'organizations', orgId, 'members')
}

export function settingsDoc(db: Firestore, orgId: string) {
  return doc(db, 'organizations', orgId, 'meta', 'settings')
}

export function productDraftsCol(db: Firestore, orgId: string) {
  return collection(db, 'organizations', orgId, 'productDrafts')
}

export function supplierDraftsCol(db: Firestore, orgId: string) {
  return collection(db, 'organizations', orgId, 'supplierDrafts')
}

export function dashboardDoc(db: Firestore, orgId: string) {
  return doc(db, 'organizations', orgId, 'meta', 'dashboard')
}

export function userDoc(db: Firestore, uid: string) {
  return doc(db, 'users', uid)
}

export function userPublicLookupDoc(db: Firestore, uid: string) {
  return doc(db, 'userPublicLookup', uid)
}

export function userPublicLookupCol(db: Firestore) {
  return collection(db, 'userPublicLookup')
}

export function orgDirectoryDoc(db: Firestore, orgId: string) {
  return doc(db, 'orgDirectory', orgId)
}

export function orgDirectoryCol(db: Firestore) {
  return collection(db, 'orgDirectory')
}

export function invitesCol(db: Firestore, orgId: string) {
  return collection(db, 'organizations', orgId, 'invites')
}

export function accessRequestsCol(db: Firestore, orgId: string) {
  return collection(db, 'organizations', orgId, 'accessRequests')
}
