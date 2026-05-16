import { Button, Card, Field, Input, PageTitle, TextArea } from '@/components/Ui'
import { db } from '@/firebase'
import { linkSupplierAfterNfeRegistration } from '@/lib/nfeSupplierLink'
import { supplierDraftsCol, suppliersCol } from '@/lib/firestorePaths'
import { digitsOnlyTaxId, formatBrazilTaxIdForDisplay } from '@/lib/taxIdBr'
import { useOrg } from '@/contexts/OrgContext'
import { deleteDoc, deleteField, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'

export default function SupplierFormPage() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const draftId = searchParams.get('draft')
  const isNew = id === 'novo' || !id
  const { orgId } = useOrg()
  const navigate = useNavigate()
  const [cnpj, setCnpj] = useState('')
  const [tradeName, setTradeName] = useState('')
  const [legalName, setLegalName] = useState('')
  const [stateRegistration, setStateRegistration] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [draftNfeChave, setDraftNfeChave] = useState<string | null>(null)

  useEffect(() => {
    if (!orgId || isNew || !id) return
    let cancelled = false
    ;(async () => {
      const snap = await getDoc(doc(suppliersCol(db, orgId), id))
      if (cancelled || !snap.exists()) return
      const x = snap.data() as Record<string, unknown>
      const rawCnpj = String(x.cnpj ?? '')
      setCnpj(rawCnpj ? formatBrazilTaxIdForDisplay(rawCnpj) : '')
      const tRaw = String(x.tradeName ?? '').trim()
      const lRaw = String(x.legalName ?? '').trim()
      const legacy = String(x.name ?? '').trim()
      setTradeName(tRaw || (!lRaw && legacy ? legacy : ''))
      setLegalName(lRaw)
      setStateRegistration(String(x.stateRegistration ?? ''))
      setPhone(String(x.phone ?? ''))
      setNotes(String(x.notes ?? ''))
    })()
    return () => {
      cancelled = true
    }
  }, [orgId, id, isNew])

  useEffect(() => {
    if (!orgId || !isNew || !draftId) return
    let cancelled = false
    ;(async () => {
      const snap = await getDoc(doc(supplierDraftsCol(db, orgId), draftId))
      if (cancelled || !snap.exists()) return
      const x = snap.data() as Record<string, unknown>
      const rawCnpj = String(x.cnpj ?? '')
      setCnpj(rawCnpj ? formatBrazilTaxIdForDisplay(rawCnpj) : '')
      setTradeName(String(x.tradeName ?? ''))
      setLegalName(String(x.legalName ?? ''))
      setStateRegistration(String(x.stateRegistration ?? ''))
      setDraftNfeChave(String(x.nfeChave ?? '').trim() || null)
    })()
    return () => {
      cancelled = true
    }
  }, [orgId, isNew, draftId])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!orgId) return
    const taxDigits = digitsOnlyTaxId(cnpj)
    const tn = tradeName.trim()
    const ln = legalName.trim()
    const sr = stateRegistration.trim()
    const displayName = tn || ln || (taxDigits ? formatBrazilTaxIdForDisplay(taxDigits) : '') || 'Fornecedor'
    if (!tn && !ln && !taxDigits) {
      window.alert('Preencha pelo menos: nome fantasia, razão social ou CNPJ/CPF.')
      return
    }
    setBusy(true)
    try {
      const ref = isNew ? doc(suppliersCol(db, orgId)) : doc(suppliersCol(db, orgId), id!)
      const payload: Record<string, unknown> = {
        name: displayName,
        phone: phone.trim(),
        notes: notes.trim(),
        createdAt: isNew ? serverTimestamp() : undefined,
      }
      payload.cnpj = taxDigits.length > 0 ? taxDigits : deleteField()
      payload.tradeName = tn ? tn : deleteField()
      payload.legalName = ln ? ln : deleteField()
      payload.stateRegistration = sr ? sr : deleteField()
      await setDoc(ref, payload, { merge: true })
      let chaveLink = draftNfeChave
      if (orgId && draftId) {
        const draftSnap = await getDoc(doc(supplierDraftsCol(db, orgId), draftId))
        if (draftSnap.exists()) {
          chaveLink = String(draftSnap.data()?.nfeChave ?? '').trim() || chaveLink
        }
      }
      if (orgId && taxDigits && chaveLink) {
        await linkSupplierAfterNfeRegistration(orgId, ref.id, taxDigits, chaveLink)
      }
      if (orgId && draftId) {
        await deleteDoc(doc(supplierDraftsCol(db, orgId), draftId))
      }
      navigate(draftId ? '/app/entradas/nfe' : '/app/cadastros/marcas')
    } finally {
      setBusy(false)
    }
  }

  async function onDeleteSupplier() {
    if (!orgId || !id || isNew) return
    const label = tradeName.trim() || legalName.trim() || 'fornecedor'
    if (!confirm(`Excluir o fornecedor «${label}»? Esta ação não pode ser desfeita.`)) return
    setDeleteBusy(true)
    setDeleteError(null)
    try {
      await deleteDoc(doc(suppliersCol(db, orgId), id))
      navigate('/app/cadastros/marcas')
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Não foi possível excluir.')
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <div>
      <PageTitle
        title={isNew ? (draftId ? 'Completar fornecedor (NF-e)' : 'Novo fornecedor') : 'Editar fornecedor'}
        subtitle={
          draftId
            ? 'Passo 1 da NF-e: cadastre a marca/fornecedor. Depois volte à importação para completar os produtos já vinculados.'
            : isNew
              ? 'CNPJ, nome fantasia, razão social e IE conforme o cadastro fiscal.'
              : undefined
        }
        actions={
          <Link to={draftId ? '/app/entradas/nfe' : '/app/cadastros/marcas'}>
            <Button variant="secondary" type="button">
              Voltar
            </Button>
          </Link>
        }
      />
      <Card>
        <form onSubmit={onSubmit} className="max-w-xl space-y-3">
          <Field label="CNPJ / CPF">
            <Input
              value={cnpj}
              onChange={(e) => setCnpj(e.target.value)}
              placeholder="Somente números ou com máscara"
              autoComplete="off"
            />
          </Field>
          <Field label="Nome fantasia">
            <Input value={tradeName} onChange={(e) => setTradeName(e.target.value)} placeholder="Como aparece na nota (xFant)" />
          </Field>
          <Field label="Razão social">
            <Input value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="Razão social (xNome)" />
          </Field>
          <Field label="Inscrição estadual (IE)">
            <Input value={stateRegistration} onChange={(e) => setStateRegistration(e.target.value)} placeholder="IE do emitente" />
          </Field>
          <Field label="Telefone">
            <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="Observações">
            <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <Button type="submit" disabled={busy || deleteBusy}>
            Guardar
          </Button>
        </form>
      </Card>

      {!isNew && id ? (
        <Card className="mt-6 max-w-xl border-red-200 bg-red-50/30 dark:border-red-900 dark:bg-red-950/20">
          <h2 className="text-sm font-semibold text-red-900 dark:text-red-200">Excluir fornecedor</h2>
          <p className="mt-1 text-sm text-red-900/90 dark:text-red-200/90">
            Remove este cadastro da lista. Os produtos que usam o nome da marca como texto não são alterados automaticamente.
          </p>
          {deleteError ? <p className="mt-2 text-sm text-red-700 dark:text-red-300">{deleteError}</p> : null}
          <Button
            type="button"
            variant="danger"
            className="mt-3"
            disabled={busy || deleteBusy}
            onClick={() => void onDeleteSupplier()}
          >
            {deleteBusy ? 'A excluir…' : 'Excluir fornecedor'}
          </Button>
        </Card>
      ) : null}
    </div>
  )
}
