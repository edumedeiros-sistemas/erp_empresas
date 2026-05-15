import { Button, Card, Field, Input, PageTitle } from '@/components/Ui'
import { db } from '@/firebase'
import { accessRequestsCol, orgDirectoryCol } from '@/lib/firestorePaths'
import { normalizeEmail } from '@/lib/emailNormalize'
import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'
import type { OrgDirectoryEntry } from '@/types'
import {
  addDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

type Row = { id: string; name: string }

export default function RequestOrgAccessPage() {
  const { user } = useAuth()
  const { orgIds, refreshOrgs } = useOrg()
  const navigate = useNavigate()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [busyOrg, setBusyOrg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendingByOrg, setPendingByOrg] = useState<Record<string, boolean>>({})

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const snap = await getDocs(orgDirectoryCol(db))
        if (cancelled) return
        const list: Row[] = snap.docs.map((d) => ({
          id: d.id,
          name: String((d.data() as OrgDirectoryEntry).name ?? d.id),
        }))
        list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
        setRows(list)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    ;(async () => {
      const m: Record<string, boolean> = {}
      for (const r of rows) {
        if (orgIds.includes(r.id)) continue
        const q = query(
          accessRequestsCol(db, r.id),
          where('requesterUid', '==', user.uid),
          where('status', '==', 'pending'),
        )
        const s = await getDocs(q)
        if (cancelled) return
        m[r.id] = !s.empty
      }
      if (!cancelled) setPendingByOrg(m)
    })()
    return () => {
      cancelled = true
    }
  }, [rows, user, orgIds])

  const filtered = useMemo(() => {
    const t = filter.trim().toLowerCase()
    if (!t) return rows
    return rows.filter((r) => r.name.toLowerCase().includes(t) || r.id.toLowerCase().includes(t))
  }, [rows, filter])

  async function requestAccess(orgId: string) {
    if (!user?.email) {
      setError('A sua conta não tem email definido.')
      return
    }
    if (orgIds.includes(orgId)) {
      setError('Já é membro desta empresa.')
      return
    }
    setError(null)
    setBusyOrg(orgId)
    try {
      await addDoc(accessRequestsCol(db, orgId), {
        requesterUid: user.uid,
        requesterEmail: user.email,
        status: 'pending',
        createdAt: serverTimestamp(),
      })
      setPendingByOrg((prev) => ({ ...prev, [orgId]: true }))
      await refreshOrgs()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível enviar o pedido.')
    } finally {
      setBusyOrg(null)
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <PageTitle
        title="Pedir acesso a empresa"
        subtitle="Escolha a empresa e envie um pedido. Um administrador pode aceitar ou recusar."
        actions={
          <Button variant="ghost" type="button" onClick={() => navigate('/orgs')}>
            Voltar
          </Button>
        }
      />

      <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
        Só aparecem empresas publicadas no diretório. Conta:{' '}
        <span className="font-medium">{user?.email ?? '—'}</span> ({normalizeEmail(user?.email ?? '')})
      </p>

      <Card className="mb-6">
        <Field label="Procurar por nome">
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtrar lista…" />
        </Field>
      </Card>

      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}

      {loading ? (
        <p className="text-sm text-zinc-500">A carregar empresas…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Nenhuma empresa no diretório. Peça a um administrador para publicar a empresa (abrir a página
          Organizações com permissões de admin).
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((r) => {
            const isMember = orgIds.includes(r.id)
            const pending = pendingByOrg[r.id]
            return (
              <li
                key={r.id}
                className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{r.name}</p>
                  <p className="text-xs text-zinc-500">{r.id}</p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {isMember ? (
                    <span className="text-xs text-emerald-600 dark:text-emerald-400">Já tem acesso</span>
                  ) : pending ? (
                    <span className="text-xs text-amber-600 dark:text-amber-400">Pedido pendente</span>
                  ) : (
                    <Button
                      type="button"
                      className="text-xs py-1"
                      disabled={busyOrg === r.id}
                      onClick={() => void requestAccess(r.id)}
                    >
                      {busyOrg === r.id ? 'A enviar…' : 'Pedir acesso'}
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <p className="mt-8 text-center text-sm text-zinc-600 dark:text-zinc-400">
        <Link className="font-medium text-violet-600 hover:underline" to="/orgs">
          Ir para organizações
        </Link>
      </p>
    </div>
  )
}
