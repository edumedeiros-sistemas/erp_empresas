import { productsCol, stockMovementsCol } from '@/lib/firestorePaths'
import type { Firestore } from 'firebase/firestore'
import { deleteDoc, doc, getDocs, limit, query, where, writeBatch } from 'firebase/firestore'

/**
 * Apaga o documento do produto e todos os movimentos de stock que referenciam esse `productId`.
 * Não altera vendas nem outros documentos que possam guardar o id do produto.
 */
export async function deleteProductForOrg(db: Firestore, orgId: string, productId: string): Promise<void> {
  const page = 400
  while (true) {
    const s = await getDocs(
      query(stockMovementsCol(db, orgId), where('productId', '==', productId), limit(page)),
    )
    if (s.empty) break
    const b = writeBatch(db)
    for (const d of s.docs) b.delete(d.ref)
    await b.commit()
  }
  await deleteDoc(doc(productsCol(db, orgId), productId))
}
