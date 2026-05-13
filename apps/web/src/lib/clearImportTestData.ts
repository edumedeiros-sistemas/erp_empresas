import { payablesCol, productDraftsCol, productsCol, stockMovementsCol, supplierDraftsCol } from '@/lib/firestorePaths'
import type { Firestore } from 'firebase/firestore'
import {
  doc,
  getDocs,
  increment,
  limit,
  query,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'

export interface ClearImportTestResult {
  nfeMovementsRemoved: number
  productsStockAdjusted: number
  payablesRemoved: number
  draftsRemoved: number
  supplierDraftsRemoved: number
}

/**
 * Remove dados gerados por testes de importação NF-e nesta organização:
 * movimentos `nfe_in` (reverte stock), contas a pagar, pré-cadastros de produto e de fornecedor.
 * Não altera organizações, utilizadores, membros, produtos (exceto stock), vendas, etc.
 */
export async function clearImportTestData(db: Firestore, orgId: string): Promise<ClearImportTestResult> {
  const result: ClearImportTestResult = {
    nfeMovementsRemoved: 0,
    productsStockAdjusted: 0,
    payablesRemoved: 0,
    draftsRemoved: 0,
    supplierDraftsRemoved: 0,
  }

  const nfeSnap = await getDocs(query(stockMovementsCol(db, orgId), where('type', '==', 'nfe_in')))
  const qtyByProduct = new Map<string, number>()
  for (const d of nfeSnap.docs) {
    const x = d.data() as Record<string, unknown>
    const q = Number(x.quantity ?? 0)
    const pid = String(x.productId ?? '')
    if (!pid || q <= 0) continue
    qtyByProduct.set(pid, (qtyByProduct.get(pid) ?? 0) + q)
  }

  for (const [pid, qty] of qtyByProduct) {
    await updateDoc(doc(productsCol(db, orgId), pid), { stock: increment(-qty) })
    result.productsStockAdjusted++
  }

  let batch = writeBatch(db)
  let ops = 0
  for (const d of nfeSnap.docs) {
    batch.delete(d.ref)
    result.nfeMovementsRemoved++
    ops++
    if (ops >= 450) {
      await batch.commit()
      batch = writeBatch(db)
      ops = 0
    }
  }
  if (ops > 0) await batch.commit()

  const page = 400
  while (true) {
    const s = await getDocs(query(payablesCol(db, orgId), limit(page)))
    if (s.empty) break
    const b = writeBatch(db)
    for (const d of s.docs) b.delete(d.ref)
    await b.commit()
    result.payablesRemoved += s.size
  }

  while (true) {
    const s = await getDocs(query(productDraftsCol(db, orgId), limit(page)))
    if (s.empty) break
    const b = writeBatch(db)
    for (const d of s.docs) b.delete(d.ref)
    await b.commit()
    result.draftsRemoved += s.size
  }

  while (true) {
    const s = await getDocs(query(supplierDraftsCol(db, orgId), limit(page)))
    if (s.empty) break
    const b = writeBatch(db)
    for (const d of s.docs) b.delete(d.ref)
    await b.commit()
    result.supplierDraftsRemoved += s.size
  }

  return result
}
