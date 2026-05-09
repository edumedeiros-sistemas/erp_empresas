import type { Firestore } from 'firebase/firestore'
import { collection, doc } from 'firebase/firestore'

export function orgDoc(db: Firestore, orgId: string) {
  return doc(db, 'organizations', orgId)
}

export function clientsCol(db: Firestore, orgId: string) {
  return collection(db, 'organizations', orgId, 'clients')
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

export function membersCol(db: Firestore, orgId: string) {
  return collection(db, 'organizations', orgId, 'members')
}

export function settingsDoc(db: Firestore, orgId: string) {
  return doc(db, 'organizations', orgId, 'meta', 'settings')
}

export function dashboardDoc(db: Firestore, orgId: string) {
  return doc(db, 'organizations', orgId, 'meta', 'dashboard')
}

export function userDoc(db: Firestore, uid: string) {
  return doc(db, 'users', uid)
}
