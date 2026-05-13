import { Button, Card, Field, Input, PageTitle, TextArea } from '@/components/Ui'
import { db } from '@/firebase'
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
      if (orgId && draftId) {
        await deleteDoc(doc(supplierDraftsCol(db, orgId), draftId))
      }
      navigate('/app/cadastros/marcas')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageTitle
        title={isNew ? (draftId ? 'Completar fornecedor (NF-e)' : 'Novo fornecedor') : 'Editar fornecedor'}
        subtitle={
          draftId
            ? 'Dados preenchidos a partir do emitente da nota; complete telefone e o que faltar.'
            : isNew
              ? 'CNPJ, nome fantasia, razão social e IE conforme o cadastro fiscal.'
              : undefined
        }
        actions={
          <Link to="/app/cadastros/marcas">
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
          <Button type="submit" disabled={busy}>
            Guardar
          </Button>
        </form>
      </Card>
    </div>
  )
}
