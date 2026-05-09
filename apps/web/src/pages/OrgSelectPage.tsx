import { Button, Card, Field, Input, PageTitle } from '@/components/Ui'
import { db } from '@/firebase'
import { orgDoc } from '@/lib/firestorePaths'
import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'
import { getDoc } from 'firebase/firestore'
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'

export default function OrgSelectPage() {
  const { logout } = useAuth()
  const { orgIds, setOrgId, createOrganization, loadingList } = useOrg()
  const navigate = useNavigate()
  const [names, setNames] = useState<Record<string, string>>({})
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const entries: Record<string, string> = {}
      for (const id of orgIds) {
        const snap = await getDoc(orgDoc(db, id))
        if (!cancelled && snap.exists()) entries[id] = (snap.data().name as string) ?? id
      }
      if (!cancelled) setNames(entries)
    })()
    return () => {
      cancelled = true
    }
  }, [orgIds])

  function openOrg(id: string) {
    setOrgId(id)
    navigate('/app', { replace: true })
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!newName.trim()) return
    setBusy(true)
    try {
      await createOrganization(newName.trim())
      setNewName('')
      navigate('/app', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível criar a empresa.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <PageTitle
        title="Organizações"
        subtitle="Escolha a empresa ou crie uma nova."
        actions={
          <Button variant="ghost" type="button" onClick={() => void logout().then(() => navigate('/login'))}>
            Sair
          </Button>
        }
      />

      {loadingList ? (
        <p className="text-sm text-zinc-500">A carregar…</p>
      ) : orgIds.length === 0 ? (
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          Ainda não pertence a nenhuma empresa. Crie a primeira abaixo.
        </p>
      ) : (
        <ul className="mb-6 space-y-2">
          {orgIds.map((id) => (
            <li key={id}>
              <button
                type="button"
                className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-left text-sm font-medium shadow-sm transition hover:border-violet-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-violet-700"
                onClick={() => openOrg(id)}
              >
                {names[id] ?? id}
              </button>
            </li>
          ))}
        </ul>
      )}

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-zinc-800 dark:text-zinc-200">Nova empresa</h2>
        <form onSubmit={onCreate} className="space-y-3">
          <Field label="Nome da loja / empresa">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ex.: Aura Casa" />
          </Field>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button type="submit" disabled={busy}>
            {busy ? 'A criar…' : 'Criar e abrir'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
