import { db } from '@/firebase'
import { productsCol, stockMovementsCol } from '@/lib/firestorePaths'
import { doc, runTransaction, serverTimestamp, Timestamp } from 'firebase/firestore'

export async function addStockEntry(input: {
  orgId: string
  productId: string
  productCode: string
  productName: string
  size: string
  quantity: number
  unitCost: number
  date: Date
}) {
  const { orgId, productId, productCode, productName, size, quantity, unitCost, date } = input
  const total = quantity * unitCost
  const moveRef = doc(stockMovementsCol(db, orgId))
  const prodRef = doc(productsCol(db, orgId), productId)

  await runTransaction(db, async (transaction) => {
    const ps = await transaction.get(prodRef)
    if (!ps.exists()) throw new Error('Produto não encontrado.')
    const stock = Number(ps.data().stock ?? 0)
    transaction.update(prodRef, { stock: stock + quantity })
    transaction.set(moveRef, {
      date: Timestamp.fromDate(date),
      productId,
      productCode,
      productName,
      size,
      quantity,
      unitCost,
      total,
      type: 'purchase_in',
      createdAt: serverTimestamp(),
    })
  })
}
