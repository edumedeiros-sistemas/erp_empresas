import { Card, Field, Input, PageTitle } from '@/components/Ui'
import { db } from '@/firebase'
import { userDoc, userPublicLookupCol } from '@/lib/firestorePaths'
import { getDoc, getDocs, limit, query } from 'firebase/firestore'
import { Link } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'

type Row = { uid: string; email: string; emailLower: string; orgCount: number }

const MAX = 400

export default function AdminUsersPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const snap = await getDocs(query(userPublicLookupCol(db), limit(MAX)))
        if (cancelled) return
        const base: Row[] = snap.docs.map((d) => {
          const x = d.data() as Record<string, unknown>
          return {
            uid: d.id,
            email: String(x.email ?? ''),
            emailLower: String(x.emailLower ?? ''),
            orgCount: 0,
          }
        })
        base.sort((a, b) => a.emailLower.localeCompare(b.emailLower, 'pt-BR'))
        const enriched: Row[] = []
        for (const r of base) {
          const uref = await getDoc(userDoc(db, r.uid))
          const orgCount = uref.exists() ? ((uref.data() as { orgIds?: string[] }).orgIds ?? []).length : 0
          enriched.push({ ...r, orgCount })
        }
        if (!cancelled) setRows(enriched)
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
    return rows.filter(
      (r) =>
        r.emailLower.includes(t) ||
        r.email.toLowerCase().includes(t) ||
        r.uid.toLowerCase().includes(t),
    )
  }, [rows, filter])

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle
        title="Administrador — Utilizadores"
        subtitle={`Até ${MAX} contas com perfil público (quem já entrou na app).`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              to="/app/admin/empresas"
              className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              Empresas
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
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Email ou UID…" />
        </Field>
      </Card>

      {loading ? (
        <p className="text-sm text-zinc-500">A carregar…</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
              <tr>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">UID</th>
                <th className="px-3 py-2">Orgs (doc users)</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.uid} className="border-b border-zinc-100 dark:border-zinc-800">
                  <td className="px-3 py-2 text-zinc-900 dark:text-zinc-100">{r.email}</td>
                  <td className="px-3 py-2 font-mono text-xs text-zinc-500">{r.uid}</td>
                  <td className="px-3 py-2">{r.orgCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
