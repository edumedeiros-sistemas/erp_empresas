import { Button, Card, Field, Input, PageTitle, TextArea } from '@/components/Ui'
import { db } from '@/firebase'
import { clientsCol } from '@/lib/firestorePaths'
import { useOrg } from '@/contexts/OrgContext'
import { deleteDoc, deleteField, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
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
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

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

  async function onDeleteClient() {
    if (!orgId || !id || isNew) return
    const label = name.trim() || 'cliente'
    if (!confirm(`Excluir o cliente «${label}»? Esta ação não pode ser desfeita.`)) return
    setDeleteBusy(true)
    setDeleteError(null)
    try {
      await deleteDoc(doc(clientsCol(db, orgId), id))
      navigate('/app/cadastros/clientes')
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Não foi possível excluir.')
    } finally {
      setDeleteBusy(false)
    }
  }

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
          <Button type="submit" disabled={busy || deleteBusy}>
            Guardar
          </Button>
        </form>
      </Card>

      {!isNew && id ? (
        <Card className="mt-6 max-w-xl border-red-200 bg-red-50/30 dark:border-red-900 dark:bg-red-950/20">
          <h2 className="text-sm font-semibold text-red-900 dark:text-red-200">Excluir cliente</h2>
          <p className="mt-1 text-sm text-red-900/90 dark:text-red-200/90">
            Remove este cadastro. As vendas antigas mantêm o nome do cliente gravado no momento da venda.
          </p>
          {deleteError ? <p className="mt-2 text-sm text-red-700 dark:text-red-300">{deleteError}</p> : null}
          <Button
            type="button"
            variant="danger"
            className="mt-3"
            disabled={busy || deleteBusy}
            onClick={() => void onDeleteClient()}
          >
            {deleteBusy ? 'A excluir…' : 'Excluir cliente'}
          </Button>
        </Card>
      ) : null}
    </div>
  )
}
