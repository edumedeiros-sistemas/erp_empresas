import { db } from '@/firebase'
import {
  clientsCol,
  dashboardDoc,
  productsCol,
  receivablesCol,
  saleItemsCol,
  salesCol,
} from '@/lib/firestorePaths'
import type { SaleItem } from '@/types'
import { doc, getDoc, getDocs, query, runTransaction, serverTimestamp, Timestamp, where } from 'firebase/firestore'

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

function roundMoney(n: number) {
  return Math.round(n * 100) / 100
}

function parseInstallmentCount(paymentMethod: string): number {
  const instMatch = paymentMethod.match(/·\s*(\d+)\s*x\s*$/i)
  return instMatch ? Math.max(1, parseInt(instMatch[1]!, 10)) : 1
}

function addMonthsToDate(date: Date, months: number): Date {
  const d = new Date(date)
  const day = d.getDate()
  d.setMonth(d.getMonth() + months)
  if (d.getDate() < day) d.setDate(0)
  return d
}

function shouldCreateReceivables(paymentMethod: string, amountPending: number): boolean {
  if (amountPending > 0.005) return true
  const pm = paymentMethod.trim()
  return /^Crediário/i.test(pm) || /^Cartão de Crédito/i.test(pm)
}

type ReceivableWriteCtx = {
  orgId: string
  saleId: string
  clientId: string
  clientName: string
  date: Date
  paymentMethod: string
  subtotal: number
  amountReceived: number
  amountPending: number
  saleTs: Timestamp
}

function writeReceivablesForSale(
  transaction: Parameters<Parameters<typeof runTransaction>[1]>[0],
  ctx: ReceivableWriteCtx,
) {
  const { orgId, saleId, paymentMethod, subtotal, amountReceived, amountPending, saleTs, date } = ctx
  if (!shouldCreateReceivables(paymentMethod, amountPending)) return

  const installmentCount = parseInstallmentCount(paymentMethod)
  const common = {
    saleId,
    clientId: ctx.clientId,
    clientName: ctx.clientName,
    paymentMethod,
    saleDate: saleTs,
    saleSubtotal: subtotal,
    amountReceivedAtSale: amountReceived,
    amountPendingAtSale: amountPending,
    createdAt: serverTimestamp(),
  }

  if (amountReceived > 0.005) {
    transaction.set(doc(receivablesCol(db, orgId), `${saleId}_entrada`), {
      ...common,
      installmentNumber: 0,
      installmentCount,
      installmentLabel: 'Recebido na venda',
      amount: roundMoney(amountReceived),
      status: 'recebido',
      receivedAt: saleTs,
      dueDate: saleTs,
    })
  }

  const pending = roundMoney(amountPending)
  if (pending <= 0.005) return

  const n = installmentCount
  let allocated = 0
  for (let i = 1; i <= n; i++) {
    const isLast = i === n
    const parcelAmount = isLast ? roundMoney(pending - allocated) : roundMoney(pending / n)
    allocated += parcelAmount
    transaction.set(doc(receivablesCol(db, orgId), `${saleId}_p${String(i).padStart(2, '0')}`), {
      ...common,
      installmentNumber: i,
      installmentCount: n,
      installmentLabel: `Parcela ${i}/${n}`,
      amount: parcelAmount,
      status: 'aberto',
      receivedAt: null,
      dueDate: Timestamp.fromDate(addMonthsToDate(date, i)),
    })
  }
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

    writeReceivablesForSale(transaction, {
      orgId,
      saleId: saleRef.id,
      clientId,
      clientName,
      date,
      paymentMethod,
      subtotal,
      amountReceived: roundMoney(amountReceived),
      amountPending: roundMoney(amountPending),
      saleTs,
    })
  })

  return saleRef.id
}

export type UpdateSaleInput = CreateSaleInput & { saleId: string }

async function receivableRefsForSale(orgId: string, saleId: string) {
  const [recSnap, legacyRecSnap] = await Promise.all([
    getDocs(query(receivablesCol(db, orgId), where('saleId', '==', saleId))),
    getDoc(doc(receivablesCol(db, orgId), saleId)),
  ])
  const refs = recSnap.docs.map((d) => d.ref)
  if (legacyRecSnap.exists()) refs.push(legacyRecSnap.ref)
  return refs
}

function applyClientPurchaseDelta(
  transaction: Parameters<Parameters<typeof runTransaction>[1]>[0],
  clientRef: ReturnType<typeof doc>,
  clientSnap: Awaited<ReturnType<typeof getDoc>>,
  subtotalDelta: number,
  qtyDelta: number,
  saleTs: Timestamp,
) {
  if (!clientSnap.exists()) return
  const c = clientSnap.data() as Record<string, unknown>
  const prevTotal = Number(c.totalPurchased ?? 0)
  const prevQty = Number(c.purchaseCount ?? 0)
  const newTotal = Math.max(0, prevTotal + subtotalDelta)
  const newQty = Math.max(0, prevQty + qtyDelta)
  const newAvg = newQty > 0 ? newTotal / newQty : 0
  const prevLast = c.lastPurchaseAt as Timestamp | undefined
  const lastPurchaseAt =
    qtyDelta > 0 && (!prevLast || saleTs.toMillis() >= prevLast.toMillis()) ? saleTs : prevLast
  transaction.set(
    clientRef,
    {
      totalPurchased: newTotal,
      purchaseCount: newQty,
      avgTicket: Number.isFinite(newAvg) ? newAvg : 0,
      ...(lastPurchaseAt ? { lastPurchaseAt } : {}),
    },
    { merge: true },
  )
}

export async function updateSale(input: UpdateSaleInput) {
  const { orgId, saleId, clientId, clientName, date, paymentMethod, status, amountReceived, amountPending, lines } =
    input

  if (!lines.length) throw new Error('Adicione pelo menos um item à venda.')

  const [oldItemsSnap, receivableRefs] = await Promise.all([
    getDocs(saleItemsCol(db, orgId, saleId)),
    receivableRefsForSale(orgId, saleId),
  ])

  const oldItems = oldItemsSnap.docs.map((d) => {
    const x = d.data() as Record<string, unknown>
    return {
      id: d.id,
      productId: String(x.productId ?? ''),
      quantity: Number(x.quantity ?? 0),
    }
  })

  await runTransaction(db, async (transaction) => {
    const saleRef = doc(salesCol(db, orgId), saleId)
    const oldSaleSnap = await transaction.get(saleRef)
    if (!oldSaleSnap.exists()) throw new Error('Venda não encontrada.')

    const oldS = oldSaleSnap.data() as Record<string, unknown>
    const oldClientId = String(oldS.clientId ?? '')
    const oldSubtotal = Number(oldS.subtotal ?? 0)
    const oldProfit = Number(oldS.totalProfit ?? 0)
    const oldPaymentMethod = String(oldS.paymentMethod ?? '')

    const returnByProduct = new Map<string, number>()
    for (const it of oldItems) {
      const pid = String(it.productId ?? '')
      if (!pid) continue
      returnByProduct.set(pid, (returnByProduct.get(pid) ?? 0) + Number(it.quantity ?? 0))
    }

    const productSnaps: {
      ref: ReturnType<typeof doc>
      stock: number
      code: string
      name: string
      size: string
      unitCost: number
    }[] = []

    for (const line of lines) {
      const pref = doc(productsCol(db, orgId), line.productId)
      const ps = await transaction.get(pref)
      if (!ps.exists()) throw new Error('Produto não encontrado.')
      const d = ps.data() as Record<string, unknown>
      const stock = Number(d.stock ?? 0)
      const back = returnByProduct.get(line.productId) ?? 0
      if (stock + back < line.quantity) {
        throw new Error(`Stock insuficiente para ${String(d.name ?? 'produto')}.`)
      }
      productSnaps.push({
        ref: pref,
        stock,
        code: String(d.code ?? ''),
        name: String(d.name ?? ''),
        size: String(d.size ?? ''),
        unitCost: Number(d.totalCost ?? d.cost ?? 0),
      })
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

    const saleTs = Timestamp.fromDate(date)
    const newQty = lines.reduce((s, l) => s + l.quantity, 0)
    const oldQty = oldItems.reduce((s, it) => s + Number(it.quantity ?? 0), 0)

    const oldClientRef = oldClientId ? doc(clientsCol(db, orgId), oldClientId) : null
    const newClientRef = doc(clientsCol(db, orgId), clientId)
    const newClientSnap = await transaction.get(newClientRef)
    if (!newClientSnap.exists()) throw new Error('Cliente não encontrado.')

    if (oldClientId && oldClientId !== clientId && oldClientRef) {
      const oldClientSnap = await transaction.get(oldClientRef)
      applyClientPurchaseDelta(transaction, oldClientRef, oldClientSnap, -oldSubtotal, -oldQty, saleTs)
      applyClientPurchaseDelta(transaction, newClientRef, newClientSnap, subtotal, newQty, saleTs)
    } else {
      applyClientPurchaseDelta(
        transaction,
        newClientRef,
        newClientSnap,
        subtotal - oldSubtotal,
        newQty - oldQty,
        saleTs,
      )
    }

    const netStock = new Map<string, number>()
    for (const it of oldItems) {
      const pid = String(it.productId ?? '')
      if (!pid) continue
      netStock.set(pid, (netStock.get(pid) ?? 0) + Number(it.quantity ?? 0))
    }
    for (const line of lines) {
      netStock.set(line.productId, (netStock.get(line.productId) ?? 0) - line.quantity)
    }
    for (const [pid, delta] of netStock) {
      if (delta === 0) continue
      const pref = doc(productsCol(db, orgId), pid)
      const ps = await transaction.get(pref)
      if (!ps.exists()) continue
      const stock = Number((ps.data() as Record<string, unknown>).stock ?? 0)
      const next = stock + delta
      if (next < 0) throw new Error('Stock insuficiente após alteração da venda.')
      transaction.update(pref, { stock: next })
    }

    const dashRef = dashboardDoc(db, orgId)
    const dashSnap = await transaction.get(dashRef)
    if (dashSnap.exists()) {
      const dash = dashSnap.data() as Record<string, unknown>
      let revenueTotal = Number(dash.revenueTotal ?? 0) - oldSubtotal + subtotal
      let profitTotal = Number(dash.profitTotal ?? 0) - oldProfit + totalProfit
      revenueTotal = Math.max(0, revenueTotal)
      profitTotal = Math.max(0, profitTotal)
      const saleCount = Number(dash.saleCount ?? 0)
      let paymentMix = mergePaymentMix(
        (dash.paymentMix as Record<string, number>) ?? {},
        oldPaymentMethod,
        -oldSubtotal,
      )
      paymentMix = mergePaymentMix(paymentMix, paymentMethod, subtotal)
      transaction.set(
        dashRef,
        {
          revenueTotal,
          profitTotal,
          saleCount,
          avgTicket: saleCount > 0 ? revenueTotal / saleCount : 0,
          paymentMix,
          financialIn: Number(dash.financialIn ?? 0),
          financialOut: Number(dash.financialOut ?? 0),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
    }

    oldItemsSnap.docs.forEach((d) => {
      transaction.delete(d.ref)
    })
    for (const ref of receivableRefs) {
      const rs = await transaction.get(ref)
      if (rs.exists()) transaction.delete(ref)
    }

    transaction.set(
      saleRef,
      {
        clientId,
        clientName,
        date: saleTs,
        paymentMethod,
        status,
        amountReceived: roundMoney(amountReceived),
        amountPending: roundMoney(amountPending),
        subtotal,
        totalProfit,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )

    saleItems.forEach((item) => {
      const itemRef = doc(saleItemsCol(db, orgId, saleId))
      transaction.set(itemRef, item)
    })

    writeReceivablesForSale(transaction, {
      orgId,
      saleId,
      clientId,
      clientName,
      date,
      paymentMethod,
      subtotal,
      amountReceived: roundMoney(amountReceived),
      amountPending: roundMoney(amountPending),
      saleTs,
    })
  })
}

export async function deleteSale(orgId: string, saleId: string) {
  const [itemsSnap, receivableRefs] = await Promise.all([
    getDocs(saleItemsCol(db, orgId, saleId)),
    receivableRefsForSale(orgId, saleId),
  ])

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
    for (const ref of receivableRefs) {
      const rs = await transaction.get(ref)
      if (rs.exists()) transaction.delete(ref)
    }
    transaction.delete(saleRef)
  })
}
