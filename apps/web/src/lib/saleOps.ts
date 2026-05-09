import { db } from '@/firebase'
import {
  clientsCol,
  dashboardDoc,
  productsCol,
  saleItemsCol,
  salesCol,
} from '@/lib/firestorePaths'
import type { SaleItem } from '@/types'
import { doc, getDocs, runTransaction, serverTimestamp, Timestamp } from 'firebase/firestore'

export interface SaleLineInput {
  productId: string
  quantity: number
  unitPrice: number
}

export interface CreateSaleInput {
  orgId: string
  clientId: string
  clientName: string
  date: Date
  paymentMethod: string
  status: string
  amountReceived: number
  amountPending: number
  lines: SaleLineInput[]
}

function mergePaymentMix(
  current: Record<string, number>,
  method: string,
  delta: number,
): Record<string, number> {
  const next = { ...current }
  const key = method || '—'
  next[key] = (next[key] ?? 0) + delta
  if (next[key] <= 0) delete next[key]
  return next
}

export async function createSale(input: CreateSaleInput) {
  const { orgId, clientId, clientName, date, paymentMethod, status, amountReceived, amountPending, lines } =
    input

  if (!lines.length) throw new Error('Adicione pelo menos um item à venda.')

  const saleRef = doc(salesCol(db, orgId))

  await runTransaction(db, async (transaction) => {
    const productSnaps: { ref: ReturnType<typeof doc>; stock: number; code: string; name: string; size: string; unitCost: number }[] = []

    for (const line of lines) {
      const pref = doc(productsCol(db, orgId), line.productId)
      const ps = await transaction.get(pref)
      if (!ps.exists()) throw new Error('Produto não encontrado.')
      const d = ps.data()
      const stock = Number(d.stock ?? 0)
      if (stock < line.quantity) throw new Error(`Stock insuficiente para ${d.name as string}.`)
      productSnaps.push({
        ref: pref,
        stock,
        code: String(d.code ?? ''),
        name: String(d.name ?? ''),
        size: String(d.size ?? ''),
        unitCost: Number(d.totalCost ?? d.cost ?? 0),
      })
    }

    const clientRef = doc(clientsCol(db, orgId), clientId)
    const clientSnap = await transaction.get(clientRef)
    if (!clientSnap.exists()) throw new Error('Cliente não encontrado.')

    const dashRef = dashboardDoc(db, orgId)
    const dashSnap = await transaction.get(dashRef)
    const dash = dashSnap.exists()
      ? (dashSnap.data() as Record<string, unknown>)
      : {
          revenueTotal: 0,
          profitTotal: 0,
          saleCount: 0,
          paymentMix: {},
          financialIn: 0,
          financialOut: 0,
        }

    let subtotal = 0
    let totalProfit = 0
    const saleItems: Omit<SaleItem, 'id'>[] = []

    lines.forEach((line, idx) => {
      const meta = productSnaps[idx]!
      const lineTotal = line.quantity * line.unitPrice
      const lineProfit = line.quantity * (line.unitPrice - meta.unitCost)
      subtotal += lineTotal
      totalProfit += lineProfit
      saleItems.push({
        productId: line.productId,
        productCode: meta.code,
        productName: meta.name,
        size: meta.size,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        unitCost: meta.unitCost,
        lineTotal,
        lineProfit,
      })
    })

    const clientData = clientSnap.data() as Record<string, unknown>
    const prevTotal = Number(clientData.totalPurchased ?? 0)
    const prevQty = Number(clientData.purchaseCount ?? 0)
    const qtyAdd = lines.reduce((s, l) => s + l.quantity, 0)
    const newTotal = prevTotal + subtotal
    const newQty = prevQty + qtyAdd
    const newAvg = newQty > 0 ? newTotal / newQty : 0

    const prevLast = clientData.lastPurchaseAt as Timestamp | undefined
    const saleTs = Timestamp.fromDate(date)
    const lastPurchaseAt =
      !prevLast || saleTs.toMillis() >= prevLast.toMillis() ? saleTs : prevLast

    transaction.set(clientRef, {
      totalPurchased: newTotal,
      purchaseCount: newQty,
      avgTicket: Number.isFinite(newAvg) ? newAvg : 0,
      lastPurchaseAt,
    }, { merge: true })

    productSnaps.forEach((meta, idx) => {
      const line = lines[idx]!
      const newStock = meta.stock - line.quantity
      transaction.update(meta.ref, { stock: newStock })
    })

    const revenueTotal = Number(dash.revenueTotal ?? 0) + subtotal
    const profitTotal = Number(dash.profitTotal ?? 0) + totalProfit
    const saleCount = Number(dash.saleCount ?? 0) + 1
    const paymentMix = mergePaymentMix(
      (dash.paymentMix as Record<string, number>) ?? {},
      paymentMethod,
      subtotal,
    )

    transaction.set(dashRef, {
      revenueTotal,
      profitTotal,
      saleCount,
      avgTicket: saleCount > 0 ? revenueTotal / saleCount : 0,
      paymentMix,
      financialIn: Number(dash.financialIn ?? 0),
      financialOut: Number(dash.financialOut ?? 0),
      updatedAt: serverTimestamp(),
    }, { merge: true })

    transaction.set(saleRef, {
      clientId,
      clientName,
      date: saleTs,
      paymentMethod,
      status,
      amountReceived,
      amountPending,
      subtotal,
      totalProfit,
      createdAt: serverTimestamp(),
    })

    saleItems.forEach((item) => {
      const itemRef = doc(saleItemsCol(db, orgId, saleRef.id))
      transaction.set(itemRef, item)
    })
  })

  return saleRef.id
}

export async function deleteSale(orgId: string, saleId: string) {
  const itemsSnap = await getDocs(saleItemsCol(db, orgId, saleId))
  const items = itemsSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Record<string, unknown>),
  })) as { id: string; productId: string; quantity: number }[]

  await runTransaction(db, async (transaction) => {
    const saleRef = doc(salesCol(db, orgId), saleId)
    const saleSnap = await transaction.get(saleRef)
    if (!saleSnap.exists()) return

    const s = saleSnap.data() as Record<string, unknown>
    const clientId = String(s.clientId ?? '')
    const subtotal = Number(s.subtotal ?? 0)
    const totalProfit = Number(s.totalProfit ?? 0)
    const paymentMethod = String(s.paymentMethod ?? '')
    const clientRef = doc(clientsCol(db, orgId), clientId)
    const clientSnap = await transaction.get(clientRef)
    const dashRef = dashboardDoc(db, orgId)
    const dashSnap = await transaction.get(dashRef)

    const productSnaps: { ref: ReturnType<typeof doc>; qty: number; stock: number }[] = []
    for (const it of items) {
      const pref = doc(productsCol(db, orgId), String(it.productId))
      const ps = await transaction.get(pref)
      const qty = Number(it.quantity ?? 0)
      if (ps.exists()) {
        productSnaps.push({
          ref: pref,
          qty,
          stock: Number(ps.data().stock ?? 0),
        })
      }
    }

    if (clientSnap.exists()) {
      const c = clientSnap.data() as Record<string, unknown>
      const prevTotal = Number(c.totalPurchased ?? 0)
      const prevQty = Number(c.purchaseCount ?? 0)
      const qty = items.reduce((sum, it) => sum + Number(it.quantity ?? 0), 0)
      const newTotal = Math.max(0, prevTotal - subtotal)
      const newQty = Math.max(0, prevQty - qty)
      const newAvg = newQty > 0 ? newTotal / newQty : 0
      transaction.set(
        clientRef,
        {
          totalPurchased: newTotal,
          purchaseCount: newQty,
          avgTicket: newAvg,
        },
        { merge: true },
      )
    }

    for (const p of productSnaps) {
      transaction.update(p.ref, { stock: p.stock + p.qty })
    }

    if (dashSnap.exists()) {
      const dash = dashSnap.data() as Record<string, unknown>
      const revenueTotal = Math.max(0, Number(dash.revenueTotal ?? 0) - subtotal)
      const profitTotal = Math.max(0, Number(dash.profitTotal ?? 0) - totalProfit)
      const saleCount = Math.max(0, Number(dash.saleCount ?? 0) - 1)
      const paymentMix = mergePaymentMix(
        (dash.paymentMix as Record<string, number>) ?? {},
        paymentMethod,
        -subtotal,
      )
      transaction.set(
        dashRef,
        {
          revenueTotal,
          profitTotal,
          saleCount,
          avgTicket: saleCount > 0 ? revenueTotal / saleCount : 0,
          paymentMix,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
    }

    itemsSnap.docs.forEach((d) => {
      transaction.delete(d.ref)
    })
    transaction.delete(saleRef)
  })
}
