import { db } from '@/firebase'
import { payablesCol, productDraftsCol, productsCol, stockMovementsCol, supplierDraftsCol, suppliersCol } from '@/lib/firestorePaths'
import { guessSizeFromDescription, type NFeItemLine, type NFeParsed } from '@/lib/nfeXml'
import {
  addDoc,
  collection,
  doc,
  getDocs,
  increment,
  query,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
} from 'firebase/firestore'
import type { Product } from '@/types'

type ProductRow = Pick<Product, 'id' | 'code' | 'name' | 'size' | 'cost' | 'ipi' | 'freight'>

function findProductForLine(
  products: ProductRow[],
  line: NFeItemLine,
): { product: ProductRow; reason: 'unique' | 'size_match' } | { product: null; reason: 'none' | 'ambiguous' } {
  const code = line.cProd.trim()
  if (!code) return { product: null, reason: 'none' }

  const same = products.filter((p) => p.code.trim() === code)
  if (same.length === 0) return { product: null, reason: 'none' }
  if (same.length === 1) return { product: same[0]!, reason: 'unique' }

  const guessed = guessSizeFromDescription(line.xProd)
  if (guessed) {
    const hit = same.find((p) => String(p.size).toUpperCase() === guessed)
    if (hit) return { product: hit, reason: 'size_match' }
  }
  return { product: null, reason: 'ambiguous' }
}

export interface NFeImportResult {
  chave?: string
  nNF?: string
  serie?: string
  linesProcessed: number
  stockLines: number
  draftsCreated: number
  pendingDraftIds: string[]
  /** Foi criado pré-cadastro de fornecedor (emitente) para completar em Marcas. */
  supplierDraftCreated: boolean
  errors: string[]
}

const MAX_BATCH = 450

function supplierTaxIdFromParsed(parsed: NFeParsed): string {
  if (parsed.emitCnpj && parsed.emitCnpj.length === 14) return parsed.emitCnpj
  if (parsed.emitCpf && parsed.emitCpf.length === 11) return parsed.emitCpf
  return ''
}

function supplierDisplayNameFromParsed(parsed: NFeParsed): string {
  return (parsed.emitFantasia ?? parsed.emitRazaoSocial ?? parsed.emitenteNome ?? '').trim()
}

function dueDateFromDup(dVenc: string): Timestamp | null {
  const raw = dVenc.trim()
  let d = raw.slice(0, 10)
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (br) d = `${br[3]}-${br[2]}-${br[1]}`
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null
  const dt = new Date(`${d}T12:00:00`)
  return Number.isNaN(dt.getTime()) ? null : Timestamp.fromDate(dt)
}

export async function importNFeXmlToOrg(orgId: string, parsed: NFeParsed): Promise<NFeImportResult> {
  const errors: string[] = []
  const pendingDraftIds: string[] = []
  let stockLines = 0
  let draftsCreated = 0
  let supplierDraftCreated = false

  const snap = await getDocs(collection(db, 'organizations', orgId, 'products'))
  const products: ProductRow[] = snap.docs.map((d) => {
    const x = d.data() as Record<string, unknown>
    return {
      id: d.id,
      code: String(x.code ?? ''),
      name: String(x.name ?? ''),
      size: String(x.size ?? ''),
      cost: Number(x.cost ?? 0),
      ipi: Number(x.ipi ?? 0),
      freight: Number(x.freight ?? 0),
    }
  })

  const movementDate = parsed.dhEmi ? Timestamp.fromDate(new Date(parsed.dhEmi)) : Timestamp.now()

  type Matched = { line: NFeItemLine; product: ProductRow }
  const matched: Matched[] = []
  type DraftLine = { line: NFeItemLine; reason: string; guessedSize: string }
  const draftLines: DraftLine[] = []

  for (const line of parsed.items) {
    if (line.qCom <= 0) continue
    const match = findProductForLine(products, line)
    if (match.product) {
      matched.push({ line, product: match.product })
    } else {
      const reason =
        match.reason === 'ambiguous'
          ? 'Varios tamanhos para este codigo; confira a descricao da nota e complete o cadastro.'
          : 'Produto nao cadastrado; pre-cadastro a partir da NF-e.'
      const guessedSize = guessSizeFromDescription(line.xProd) ?? 'U'
      draftLines.push({ line, reason, guessedSize })
    }
  }

  const importLineCount = parsed.items.filter((l) => l.qCom > 0).length
  const vFreteTotal = parsed.vFrete ?? 0
  const freightPerLine = importLineCount > 0 && vFreteTotal > 0 ? vFreteTotal / importLineCount : 0

  /** Por produto: soma dos R$ de frete rateados (uma fatia por linha da NF) e quantidade total da NF nesse produto → R$/unidade. */
  const freightAgg = new Map<string, { sum: number; qty: number }>()
  for (const { line, product } of matched) {
    const id = product.id
    const cur = freightAgg.get(id) ?? { sum: 0, qty: 0 }
    cur.sum += freightPerLine
    cur.qty += line.qCom
    freightAgg.set(id, cur)
  }
  const freightPerUnitByProduct = new Map<string, number>()
  freightAgg.forEach((agg, id) => {
    freightPerUnitByProduct.set(id, agg.qty > 0 ? agg.sum / agg.qty : 0)
  })

  /** IPI por unidade a partir do vIPI de cada linha da NF-e. */
  const ipiAgg = new Map<string, { sumVIpi: number; qty: number }>()
  for (const { line, product } of matched) {
    if (line.vIPI <= 0) continue
    const id = product.id
    const cur = ipiAgg.get(id) ?? { sumVIpi: 0, qty: 0 }
    cur.sumVIpi += line.vIPI
    cur.qty += line.qCom
    ipiAgg.set(id, cur)
  }
  const ipiPerUnitByProduct = new Map<string, number>()
  ipiAgg.forEach((agg, id) => {
    ipiPerUnitByProduct.set(id, agg.qty > 0 ? agg.sumVIpi / agg.qty : 0)
  })

  const stockByProduct = new Map<string, number>()
  for (const { line, product } of matched) {
    stockByProduct.set(product.id, (stockByProduct.get(product.id) ?? 0) + line.qCom)
  }

  let batch = writeBatch(db)
  let ops = 0

  async function commitIfFull() {
    if (ops >= MAX_BATCH) {
      await batch.commit()
      batch = writeBatch(db)
      ops = 0
    }
  }

  for (const { line, product } of matched) {
    const moveRef = doc(stockMovementsCol(db, orgId))
    batch.set(moveRef, {
      date: movementDate,
      productId: product.id,
      productCode: product.code,
      productName: product.name,
      size: product.size,
      quantity: line.qCom,
      unitCost: line.vUnCom,
      total: line.vProd || line.qCom * line.vUnCom,
      type: 'nfe_in',
      nfeChave: parsed.chave ?? null,
      nfeNNF: parsed.nNF ?? null,
      nfeItem: line.nItem,
      createdAt: serverTimestamp(),
    })
    ops++
    stockLines++
    await commitIfFull()
  }

  for (const [productId, qtyAdd] of stockByProduct) {
    const pref = doc(productsCol(db, orgId), productId)
    const p = products.find((x) => x.id === productId)
    const base = p ?? { cost: 0, ipi: 0, freight: 0 }
    const hasFreight = freightPerLine > 0
    const hasIpi = ipiPerUnitByProduct.has(productId)
    const nf = hasFreight
      ? Math.round((freightPerUnitByProduct.get(productId) ?? base.freight) * 100) / 100
      : base.freight
    const ip = hasIpi
      ? Math.round((ipiPerUnitByProduct.get(productId) ?? 0) * 100) / 100
      : base.ipi
    const patch: Record<string, unknown> = { stock: increment(qtyAdd) }
    if (hasFreight) patch.freight = nf
    if (hasIpi && ip > 0) patch.ipi = ip
    if (hasFreight || (hasIpi && ip > 0)) {
      patch.totalCost = Math.round((base.cost + nf + ip) * 100) / 100
    }
    batch.update(pref, patch)
    ops++
    await commitIfFull()
  }

  for (const { line, reason, guessedSize } of draftLines) {
    const draftRef = doc(productDraftsCol(db, orgId))
    const freightUnitDraft = freightPerLine > 0 && line.qCom > 0 ? freightPerLine / line.qCom : 0
    const ipiUnitDraft = line.vIPI > 0 && line.qCom > 0 ? line.vIPI / line.qCom : 0
    const draftPayload: Record<string, unknown> = {
      code: line.cProd.trim(),
      name: line.xProd.trim(),
      size: guessedSize,
      unit: line.uCom,
      lastQty: line.qCom,
      lastUnitCost: line.vUnCom,
      lastLineTotal: line.vProd,
      nfeChave: parsed.chave ?? null,
      nfeNNF: parsed.nNF ?? null,
      nfeSerie: parsed.serie ?? null,
      nfeItem: line.nItem,
      needsCompletion: true,
      matchNote: reason,
      createdAt: serverTimestamp(),
    }
    if (freightUnitDraft > 0) draftPayload.nfeFreightPerUnit = freightUnitDraft
    if (ipiUnitDraft > 0) draftPayload.nfeIpiPerUnit = Math.round(ipiUnitDraft * 100) / 100
    batch.set(draftRef, draftPayload)
    ops++
    draftsCreated++
    pendingDraftIds.push(draftRef.id)
    await commitIfFull()
  }

  if (ops > 0) await batch.commit()

  const totalFromItems = parsed.items.reduce((s, i) => s + (i.vProd > 0 ? i.vProd : i.qCom * i.vUnCom), 0)
  const totalAmount =
    parsed.vNF != null && parsed.vNF > 0 ? parsed.vNF : totalFromItems > 0 ? totalFromItems : 0

  if (parsed.chave) {
    try {
      const existing = await getDocs(query(payablesCol(db, orgId), where('nfeChave', '==', parsed.chave)))
      if (existing.empty) {
        const parcelas = parsed.duplicatas ?? []
        if (parcelas.length > 0) {
          for (const dup of parcelas) {
            await addDoc(payablesCol(db, orgId), {
              nfeChave: parsed.chave,
              nNF: parsed.nNF ?? '',
              serie: parsed.serie ?? '',
              orderRef: (parsed.xPed ?? '').trim(),
              supplierName: supplierDisplayNameFromParsed(parsed) || (parsed.emitenteNome ?? '').trim(),
              amount: Math.round(dup.vDup * 100) / 100,
              dupNumber: dup.nDup,
              dueDate: dueDateFromDup(dup.dVenc),
              dhEmi: movementDate,
              status: 'aberto',
              createdAt: serverTimestamp(),
            })
          }
        } else if (totalAmount > 0) {
          await addDoc(payablesCol(db, orgId), {
            nfeChave: parsed.chave,
            nNF: parsed.nNF ?? '',
            serie: parsed.serie ?? '',
            orderRef: (parsed.xPed ?? '').trim(),
            supplierName: supplierDisplayNameFromParsed(parsed) || (parsed.emitenteNome ?? '').trim(),
            amount: Math.round(totalAmount * 100) / 100,
            dhEmi: movementDate,
            status: 'aberto',
            createdAt: serverTimestamp(),
          })
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      errors.push(
        `Entrada em stock concluída, mas a conta a pagar não foi gravada (${msg}). ` +
          'Publique as regras Firestore do projeto (coleção payables) com: firebase deploy --only firestore:rules',
      )
    }
  }

  if (parsed.chave) {
    try {
      const taxId = supplierTaxIdFromParsed(parsed)
      const legal = (parsed.emitRazaoSocial ?? parsed.emitenteNome ?? '').trim()
      const trade = (parsed.emitFantasia ?? '').trim()
      const ie = (parsed.emitIE ?? '').trim()
      if (taxId || legal || trade) {
        let skipDraft = false
        if (taxId) {
          const supSnap = await getDocs(query(suppliersCol(db, orgId), where('cnpj', '==', taxId)))
          if (!supSnap.empty) skipDraft = true
        }
        if (!skipDraft) {
          const dupDraft = await getDocs(query(supplierDraftsCol(db, orgId), where('nfeChave', '==', parsed.chave)))
          if (dupDraft.empty) {
            await addDoc(supplierDraftsCol(db, orgId), {
              cnpj: taxId,
              legalName: legal,
              tradeName: trade,
              stateRegistration: ie,
              nfeChave: parsed.chave,
              nfeNNF: parsed.nNF ?? '',
              nfeSerie: parsed.serie ?? '',
              needsCompletion: true,
              createdAt: serverTimestamp(),
            })
            supplierDraftCreated = true
          }
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      errors.push(
        `Pré-cadastro do fornecedor não foi gravado (${msg}). ` +
          'Publique as regras Firestore (coleção supplierDrafts): firebase deploy --only firestore:rules',
      )
    }
  }

  return {
    chave: parsed.chave,
    nNF: parsed.nNF,
    serie: parsed.serie,
    linesProcessed: parsed.items.length,
    stockLines,
    draftsCreated,
    pendingDraftIds,
    supplierDraftCreated,
    errors,
  }
}
