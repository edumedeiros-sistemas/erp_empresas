import { db } from '@/firebase'
import {
  lastNfeMetaDoc,
  payablesCol,
  productDraftsCol,
  suppliersCol,
} from '@/lib/firestorePaths'
import type { Firestore } from 'firebase/firestore'
import { getDocs, query, where, writeBatch } from 'firebase/firestore'

export type ResolvedSupplier = {
  id: string
  cnpj: string
  tradeName: string
  legalName: string
  name: string
}

export function supplierBrandLabel(s: Pick<ResolvedSupplier, 'tradeName' | 'legalName' | 'name'>): string {
  return (s.tradeName || s.legalName || s.name || '').trim()
}

export async function findSupplierByTaxId(
  firestore: Firestore,
  orgId: string,
  taxId: string,
): Promise<ResolvedSupplier | null> {
  const digits = taxId.replace(/\D/g, '')
  if (!digits) return null
  const snap = await getDocs(query(suppliersCol(firestore, orgId), where('cnpj', '==', digits)))
  if (snap.empty) return null
  const docSnap = snap.docs[0]!
  const x = docSnap.data() as Record<string, unknown>
  return {
    id: docSnap.id,
    cnpj: digits,
    tradeName: String(x.tradeName ?? '').trim(),
    legalName: String(x.legalName ?? '').trim(),
    name: String(x.name ?? '').trim(),
  }
}

/** Após cadastrar marca/fornecedor da NF-e: liga contas a pagar e pré-cadastros de produto. */
export async function linkSupplierAfterNfeRegistration(
  orgId: string,
  supplierId: string,
  taxId: string,
  nfeChave: string | null | undefined,
): Promise<void> {
  const digits = taxId.replace(/\D/g, '')
  const chave = String(nfeChave ?? '').trim()
  const brand = await (async () => {
    const s = await findSupplierByTaxId(db, orgId, digits)
    return s ? supplierBrandLabel(s) : ''
  })()

  let batch = writeBatch(db)
  let n = 0

  async function flush() {
    if (n > 0) {
      await batch.commit()
      batch = writeBatch(db)
      n = 0
    }
  }

  if (chave) {
    const paySnap = await getDocs(query(payablesCol(db, orgId), where('nfeChave', '==', chave)))
    for (const p of paySnap.docs) {
      const patch: Record<string, unknown> = { supplierId }
      if (brand) patch.supplierName = brand
      batch.update(p.ref, patch)
      n++
      if (n >= 400) await flush()
    }

    const draftSnap = await getDocs(query(productDraftsCol(db, orgId), where('nfeChave', '==', chave)))
    for (const d of draftSnap.docs) {
      const patch: Record<string, unknown> = { supplierId }
      if (brand) {
        patch.brand = brand
        patch.nfeBrand = brand
        patch.nfeEmitFantasia = brand
      }
      if (digits) patch.nfeEmitCnpj = digits
      batch.update(d.ref, patch)
      n++
      if (n >= 400) await flush()
    }

    batch.set(
      lastNfeMetaDoc(db, orgId),
      {
        supplierId,
        emitCnpj: digits || null,
        ...(brand ? { emitFantasia: brand } : {}),
      },
      { merge: true },
    )
    n++
    if (n >= 400) await flush()
  }

  await flush()
}
