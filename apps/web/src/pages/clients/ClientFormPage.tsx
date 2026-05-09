import { Button, Card, Field, Input, PageTitle, TextArea } from '@/components/Ui'
import { db } from '@/firebase'
import { clientsCol } from '@/lib/firestorePaths'
import { useOrg } from '@/contexts/OrgContext'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

export default function ClientFormPage() {
  const { id } = useParams()
  const isNew = id === 'novo' || !id
  const { orgId } = useOrg()
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [city, setCity] = useState('')
  const [instagram, setInstagram] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!orgId || isNew || !id) return
    let cancelled = false
    ;(async () => {
      const snap = await getDoc(doc(clientsCol(db, orgId), id))
      if (cancelled || !snap.exists()) return
      const x = snap.data() as Record<string, unknown>
      setCode(String(x.code ?? ''))
      setName(String(x.name ?? ''))
      setPhone(String(x.phone ?? ''))
      setCity(String(x.city ?? ''))
      setInstagram(String(x.instagram ?? ''))
      setNotes(String(x.notes ?? ''))
    })()
    return () => {
      cancelled = true
    }
  }, [orgId, id, isNew])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!orgId) return
    setBusy(true)
    try {
      const ref = isNew ? doc(clientsCol(db, orgId)) : doc(clientsCol(db, orgId), id!)
      await setDoc(
        ref,
        {
          code: code.trim(),
          name: name.trim(),
          phone: phone.trim(),
          city: city.trim(),
          instagram: instagram.trim(),
          notes: notes.trim(),
          registeredAt: isNew ? serverTimestamp() : undefined,
          totalPurchased: isNew ? 0 : undefined,
          purchaseCount: isNew ? 0 : undefined,
          avgTicket: isNew ? 0 : undefined,
        },
        { merge: true },
      )
      navigate('/app/clientes')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageTitle
        title={isNew ? 'Novo cliente' : 'Editar cliente'}
        actions={
          <Link to="/app/clientes">
            <Button variant="secondary" type="button">
              Voltar
            </Button>
          </Link>
        }
      />
      <Card>
        <form onSubmit={onSubmit} className="max-w-xl space-y-3">
          <Field label="Código">
            <Input value={code} onChange={(e) => setCode(e.target.value)} required />
          </Field>
          <Field label="Nome">
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="Telefone">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label="Cidade">
            <Input value={city} onChange={(e) => setCity(e.target.value)} />
          </Field>
          <Field label="Instagram">
            <Input value={instagram} onChange={(e) => setInstagram(e.target.value)} />
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
