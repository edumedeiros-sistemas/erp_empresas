import { Button, Field, Input, PageTitle, Select } from '@/components/Ui'
import { db } from '@/firebase'
import { salesCol } from '@/lib/firestorePaths'
import { deleteSale } from '@/lib/saleOps'
import { useOrg } from '@/contexts/OrgContext'
import type { Sale } from '@/types'
import { onSnapshot, orderBy, query } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

type PeriodMode = 'day' | 'month' | 'year'

function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function currentMonthIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function saleInPeriod(date: Sale['date'], mode: PeriodMode, day: string, month: string, year: string): boolean {
  if (!date?.toDate) return false
  const d = date.toDate()
  if (mode === 'day') {
    if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false
    const f = new Date(`${day}T12:00:00`)
    return (
      d.getFullYear() === f.getFullYear() && d.getMonth() === f.getMonth() && d.getDate() === f.getDate()
    )
  }
  if (mode === 'month') {
    if (!month || !/^\d{4}-\d{2}$/.test(month)) return false
    const [y, m] = month.split('-').map(Number)
    return d.getFullYear() === y && d.getMonth() + 1 === m
  }
  const y = Number(year)
  if (!Number.isFinite(y) || y < 2000) return false
  return d.getFullYear() === y
}

export default function SaleListPage() {
  const { orgId } = useOrg()
  const [rows, setRows] = useState<(Sale & { id: string })[]>([])
  const [periodMode, setPeriodMode] = useState<PeriodMode>('month')
  const [filterDay, setFilterDay] = useState(todayIso)
  const [filterMonth, setFilterMonth] = useState(currentMonthIso)
  const [filterYear, setFilterYear] = useState(() => String(new Date().getFullYear()))
  const [deleting, setDeleting] = useState<string | null>(null)

  const filtered = useMemo(
    () => rows.filter((s) => saleInPeriod(s.date, periodMode, filterDay, filterMonth, filterYear)),
    [rows, periodMode, filterDay, filterMonth, filterYear],
  )

  const filteredTotal = useMemo(() => filtered.reduce((sum, s) => sum + s.subtotal, 0), [filtered])

  useEffect(() => {
    if (!orgId) return
    const q = query(salesCol(db, orgId), orderBy('date', 'desc'))
    return onSnapshot(q, (snap) => {
      setRows(
        snap.docs.map((d) => {
          const x = d.data() as Record<string, unknown>
          return {
            id: d.id,
            clientId: String(x.clientId ?? ''),
            clientName: String(x.clientName ?? ''),
            date: x.date as Sale['date'],
            paymentMethod: String(x.paymentMethod ?? ''),
            status: String(x.status ?? ''),
            amountReceived: Number(x.amountReceived ?? 0),
            amountPending: Number(x.amountPending ?? 0),
            subtotal: Number(x.subtotal ?? 0),
            totalProfit: Number(x.totalProfit ?? 0),
          }
        }),
      )
    })
  }, [orgId])

  async function onDelete(saleId: string) {
    if (!orgId) return
    if (!confirm('Apagar esta venda? Stock e totais serão revertidos.')) return
    setDeleting(saleId)
    try {
      await deleteSale(orgId, saleId)
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div>
      <PageTitle
        title="Vendas"
        subtitle="Filtre por dia, mês ou ano. Por defeito mostra o mês atual."
        actions={
          <Link to="/app/vendas/nova">
            <Button>Nova venda</Button>
          </Link>
        }
      />
      <div className="mb-4 grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Ver por">
          <Select
            value={periodMode}
            onChange={(e) => setPeriodMode(e.target.value as PeriodMode)}
          >
            <option value="day">Dia</option>
            <option value="month">Mês</option>
            <option value="year">Ano</option>
          </Select>
        </Field>
        {periodMode === 'day' ? (
          <Field label="Data">
            <Input type="date" value={filterDay} onChange={(e) => setFilterDay(e.target.value)} />
          </Field>
        ) : null}
        {periodMode === 'month' ? (
          <Field label="Mês">
            <Input type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} />
          </Field>
        ) : null}
        {periodMode === 'year' ? (
          <Field label="Ano">
            <Input
              type="number"
              min={2000}
              max={2100}
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
            />
          </Field>
        ) : null}
        <div className="flex flex-col justify-end sm:col-span-2 lg:col-span-1">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Resumo do período</p>
          <p className="mt-1 text-sm font-semibold text-violet-700 dark:text-violet-300">
            {filtered.length} venda{filtered.length === 1 ? '' : 's'} ·{' '}
            {filteredTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </p>
        </div>
      </div>
      <div className="space-y-2">
        {filtered.map((s) => (
          <div
            key={s.id}
            className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <div className="font-medium">{s.clientName}</div>
              <div className="text-xs text-zinc-500">
                {s.date?.toDate?.().toLocaleDateString('pt-BR') ?? '—'} · {s.paymentMethod} · {s.status}
              </div>
              <div className="mt-1 text-sm">
                Total{' '}
                <span className="font-semibold">
                  {s.subtotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <Link
                to={`/app/vendas/${s.id}`}
                className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                Editar
              </Link>
              <Button variant="danger" type="button" disabled={deleting === s.id} onClick={() => void onDelete(s.id)}>
                {deleting === s.id ? '…' : 'Apagar'}
              </Button>
            </div>
          </div>
        ))}
        {rows.length === 0 ? (
          <p className="text-sm text-zinc-500">Sem vendas registadas.</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhuma venda neste período. Altere o filtro acima.</p>
        ) : null}
      </div>
    </div>
  )
}
