import { Button, Card, Field, Input, PageTitle, TextArea } from '@/components/Ui'
import { db } from '@/firebase'
import { clientsCol } from '@/lib/firestorePaths'
import { useOrg } from '@/contexts/OrgContext'
import { deleteField, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

export default function ClientFormPage() {
  const { id } = useParams()
  const isNew = id === 'novo' || !id
  const { orgId } = useOrg()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!orgId || isNew || !id) return
    let cancelled = false
    ;(async () => {
      const snap = await getDoc(doc(clientsCol(db, orgId), id))
      if (cancelled || !snap.exists()) return
      const x = snap.data() as Record<string, unknown>
      setName(String(x.name ?? ''))
      setPhone(String(x.phone ?? ''))
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
          name: name.trim(),
          phone: phone.trim(),
          notes: notes.trim(),
          code: deleteField(),
          city: deleteField(),
          instagram: deleteField(),
          registeredAt: isNew ? serverTimestamp() : undefined,
          totalPurchased: isNew ? 0 : undefined,
          purchaseCount: isNew ? 0 : undefined,
          avgTicket: isNew ? 0 : undefined,
        },
        { merge: true },
      )
      navigate('/app/cadastros/clientes')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageTitle
        title={isNew ? 'Novo cliente' : 'Editar cliente'}
        subtitle={isNew ? 'O identificador é criado automaticamente.' : undefined}
        actions={
          <Link to="/app/cadastros/clientes">
            <Button variant="secondary" type="button">
              Voltar
            </Button>
          </Link>
        }
      />
      <Card>
        <form onSubmit={onSubmit} className="max-w-xl space-y-3">
          <Field label="Nome">
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
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
