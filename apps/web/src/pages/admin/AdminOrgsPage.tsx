import { Card, Field, Input, PageTitle } from '@/components/Ui'
import { db } from '@/firebase'
import { organizationsCol } from '@/lib/firestorePaths'
import { Link } from 'react-router-dom'
import { getDocs } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'

type Row = { id: string; name: string }

export default function AdminOrgsPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const snap = await getDocs(organizationsCol(db))
        if (cancelled) return
        const list: Row[] = snap.docs.map((d) => ({
          id: d.id,
          name: String((d.data() as { name?: string }).name ?? d.id),
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

  const filtered = useMemo(() => {
    const t = filter.trim().toLowerCase()
    if (!t) return rows
    return rows.filter((r) => r.name.toLowerCase().includes(t) || r.id.toLowerCase().includes(t))
  }, [rows, filter])

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle
        title="Administrador — Empresas"
        subtitle="Lista de todas as organizações no Firestore."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              to="/app/admin/utilizadores"
              className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              Utilizadores
            </Link>
            <Link
              to="/app"
              className="inline-flex items-center justify-center rounded-lg px-3 py-2 text-xs font-medium text-violet-700 hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-violet-950/40"
            >
              Voltar à app
            </Link>
          </div>
        }
      />

      <Card className="mb-4">
        <Field label="Filtrar">
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Nome ou ID…" />
        </Field>
      </Card>

      {loading ? (
        <p className="text-sm text-zinc-500">A carregar…</p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((r) => (
            <li
              key={r.id}
              className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{r.name}</p>
                <p className="text-xs text-zinc-500">{r.id}</p>
              </div>
            <Link
              to={`/app/admin/empresa/${r.id}`}
              className="inline-flex items-center justify-center rounded-lg bg-violet-600 px-3 py-2 text-xs font-medium text-white hover:bg-violet-700"
            >
              Gerir
            </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
