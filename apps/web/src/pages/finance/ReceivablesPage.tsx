import { Button, Card, Field, Input, PageTitle } from '@/components/Ui'
import { db } from '@/firebase'
import { receivablesCol } from '@/lib/firestorePaths'
import { deleteSale, syncSaleStatusFromReceivables } from '@/lib/saleOps'
import { useOrg } from '@/contexts/OrgContext'
import type { AccountReceivable, ReceivableStatus } from '@/types'
import {
  deleteField,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from 'firebase/firestore'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

type Row = AccountReceivable & { id: string }

type ModalState = { mode: 'edit'; row: Row }

function tsMillis(t: Timestamp | null | undefined): number {
  if (!t || typeof t.toMillis !== 'function') return 0
  return t.toMillis()
}

function formatDate(ts: Timestamp | null | undefined): string {
  if (!ts || typeof ts.toDate !== 'function') return '—'
  try {
    return ts.toDate().toLocaleDateString('pt-BR')
  } catch {
    return '—'
  }
}

function timestampToInputDate(ts: Timestamp | null | undefined): string {
  if (!ts || typeof ts.toDate !== 'function') return ''
  const d = ts.toDate()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function inputDateToTimestamp(iso: string): Timestamp | null {
  const t = iso.trim()
  if (!t || !/^\d{4}-\d{2}-\d{2}$/.test(t)) return null
  const dt = new Date(`${t}T12:00:00`)
  return Number.isNaN(dt.getTime()) ? null : Timestamp.fromDate(dt)
}

function parseAmountBr(s: string): number {
  const x = String(s).trim().replace(/\s/g, '').replace(',', '.')
  const n = parseFloat(x)
  return Number.isFinite(n) ? n : NaN
}

function mapReceivableDoc(id: string, x: Record<string, unknown>): Row {
  const installmentNumber = x.installmentNumber != null ? Number(x.installmentNumber) : null
  const legacyCount = Number(x.installmentCount ?? 1)
  return {
    id,
    saleId: String(x.saleId ?? id),
    clientId: String(x.clientId ?? ''),
    clientName: String(x.clientName ?? ''),
    amount: Number(x.amount ?? 0),
    installmentNumber: installmentNumber ?? 1,
    installmentCount: legacyCount,
    installmentLabel:
      x.installmentLabel != null
        ? String(x.installmentLabel)
        : installmentNumber === 0
          ? 'Recebido na venda'
          : legacyCount > 1
            ? `Parcela ${installmentNumber ?? 1}/${legacyCount}`
            : undefined,
    paymentMethod: String(x.paymentMethod ?? ''),
    status: ((x.status as ReceivableStatus) ?? 'aberto') as ReceivableStatus,
    saleDate: (x.saleDate as Row['saleDate']) ?? null,
    dueDate: (x.dueDate as Row['dueDate']) ?? null,
    saleSubtotal: x.saleSubtotal != null ? Number(x.saleSubtotal) : undefined,
    amountReceivedAtSale: x.amountReceivedAtSale != null ? Number(x.amountReceivedAtSale) : undefined,
    amountPendingAtSale: x.amountPendingAtSale != null ? Number(x.amountPendingAtSale) : undefined,
    createdAt: x.createdAt as Row['createdAt'],
    receivedAt: (x.receivedAt as Row['receivedAt']) ?? null,
  }
}

function groupReceivables(rows: Row[]): { saleId: string; rows: Row[] }[] {
  const m = new Map<string, Row[]>()
  for (const r of rows) {
    const key = r.saleId.trim() || r.id
    if (!m.has(key)) m.set(key, [])
    m.get(key)!.push(r)
  }
  for (const list of m.values()) {
    list.sort((a, b) => (a.installmentNumber ?? 99) - (b.installmentNumber ?? 99))
  }
  return [...m.entries()]
    .map(([saleId, list]) => ({ saleId, rows: list }))
    .sort((a, b) => {
      const ta = Math.max(0, ...a.rows.map((r) => tsMillis(r.saleDate)))
      const tb = Math.max(0, ...b.rows.map((r) => tsMillis(r.saleDate)))
      return tb - ta
    })
}

function groupStatus(rows: Row[]): 'recebido' | 'aberto' | 'parcial' {
  const hasOpen = rows.some((r) => r.status === 'aberto')
  const hasPaid = rows.some((r) => r.status === 'recebido')
  if (hasOpen && hasPaid) return 'parcial'
  if (hasOpen) return 'aberto'
  return 'recebido'
}

function sumAmount(rows: Row[]): number {
  return rows.reduce((s, r) => s + Number(r.amount ?? 0), 0)
}

function receivedAtSale(rows: Row[]): number {
  const entrada = rows.find((r) => r.installmentNumber === 0)
  if (entrada) return entrada.amount
  const fromField = rows.find((r) => r.amountReceivedAtSale != null)?.amountReceivedAtSale
  if (fromField != null) return fromField
  return rows.filter((r) => r.status === 'recebido').reduce((s, r) => s + r.amount, 0)
}

function pendingOpen(rows: Row[]): number {
  return rows.filter((r) => r.status === 'aberto').reduce((s, r) => s + r.amount, 0)
}

function saleTotal(rows: Row[]): number {
  const sub = rows.find((r) => r.saleSubtotal != null)?.saleSubtotal
  if (sub != null && sub > 0) return sub
  return sumAmount(rows)
}

export default function ReceivablesPage() {
  const { orgId } = useOrg()
  const [rows, setRows] = useState<Row[]>([])
  const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalState | null>(null)
  const [formAmount, setFormAmount] = useState('')
  const [formDue, setFormDue] = useState('')
  const [formBusy, setFormBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [deletingSaleId, setDeletingSaleId] = useState<string | null>(null)

  useEffect(() => {
    if (!orgId) return
    const q = query(receivablesCol(db, orgId), orderBy('saleDate', 'desc'))
    return onSnapshot(q, (snap) => {
      setRows(snap.docs.map((d) => mapReceivableDoc(d.id, d.data() as Record<string, unknown>)))
    })
  }, [orgId])

  const groups = useMemo(() => groupReceivables(rows), [rows])

  async function markReceived(id: string, saleId: string) {
    if (!orgId) return
    await updateDoc(doc(receivablesCol(db, orgId), id), {
      status: 'recebido',
      receivedAt: serverTimestamp(),
    })
    if (saleId.trim()) await syncSaleStatusFromReceivables(orgId, saleId.trim())
  }

  function openEdit(row: Row) {
    setModal({ mode: 'edit', row })
    setFormAmount(String(row.amount))
    setFormDue(timestampToInputDate(row.dueDate))
    setFormError(null)
  }

  async function saveEdit() {
    if (!orgId || !modal || modal.mode !== 'edit') return
    const amount = parseAmountBr(formAmount)
    if (!Number.isFinite(amount) || amount < 0) {
      setFormError('Indique um valor válido.')
      return
    }
    setFormBusy(true)
    setFormError(null)
    try {
      const dueTs = inputDateToTimestamp(formDue)
      await updateDoc(doc(receivablesCol(db, orgId), modal.row.id), {
        amount,
        dueDate: dueTs ?? deleteField(),
      })
      setModal(null)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Não foi possível guardar.')
    } finally {
      setFormBusy(false)
    }
  }

  async function onDeleteSale(saleId: string) {
    if (!orgId) return
    if (!confirm('Apagar esta venda e todas as parcelas a receber? O stock e os totais serão revertidos.')) return
    setDeletingSaleId(saleId)
    try {
      await deleteSale(orgId, saleId)
      if (expandedSaleId === saleId) setExpandedSaleId(null)
    } finally {
      setDeletingSaleId(null)
    }
  }

  function statusLabel(s: 'recebido' | 'aberto' | 'parcial'): string {
    if (s === 'recebido') return 'Recebido'
    if (s === 'parcial') return 'Parcial'
    return 'Em aberto'
  }

  function statusClass(s: 'recebido' | 'aberto' | 'parcial'): string {
    if (s === 'recebido') return 'text-emerald-700 dark:text-emerald-400'
    if (s === 'parcial') return 'text-violet-700 dark:text-violet-300'
    return 'text-amber-700 dark:text-amber-400'
  }

  return (
    <div>
      <PageTitle
        title="Contas a receber"
        subtitle="Geradas na venda com crediário, cartão em parcelas ou valor pendente. Mostra o recebido na hora da venda e as parcelas em aberto."
      />
      <Card className="mb-4 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
        Use <strong className="font-medium text-zinc-800 dark:text-zinc-200">Abrir venda</strong> para ver cada parcela.
        Pode <strong className="font-medium text-zinc-800 dark:text-zinc-200">editar</strong> parcelas em aberto ou{' '}
        <strong className="font-medium text-zinc-800 dark:text-zinc-200">apagar a venda</strong> (remove também as contas
        a receber). Vendas antigas com um único registo continuam visíveis; novas vendas criam entrada + parcelas.
      </Card>
      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
            <tr>
              <th className="px-3 py-2">Cliente</th>
              <th className="px-3 py-2">Data venda</th>
              <th className="px-3 py-2 text-right">Total venda</th>
              <th className="px-3 py-2 text-right">Recebido</th>
              <th className="px-3 py-2 text-right">A receber</th>
              <th className="px-3 py-2">Parcelas</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Ações</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(({ saleId, rows: g }) => {
              const head = g[0]!
              const total = saleTotal(g)
              const received = receivedAtSale(g)
              const open = pendingOpen(g)
              const st = groupStatus(g)
              const parcelRows = g.filter((r) => r.installmentNumber > 0)
              const expanded = expandedSaleId === saleId

              return (
                <Fragment key={saleId}>
                  <tr className="border-b border-zinc-100 bg-zinc-50/50 dark:border-zinc-900 dark:bg-zinc-900/30">
                    <td className="px-3 py-2">
                      <div className="font-medium">{head.clientName || '—'}</div>
                      <div className="font-mono text-[10px] text-zinc-500">Venda {saleId.slice(0, 8)}…</div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">{formatDate(head.saleDate)}</td>
                    <td className="px-3 py-2 text-right font-medium">
                      {total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </td>
                    <td className="px-3 py-2 text-right text-emerald-700 dark:text-emerald-400">
                      {received.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </td>
                    <td className="px-3 py-2 text-right text-amber-700 dark:text-amber-400">
                      {open.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {parcelRows.length > 0
                        ? `${parcelRows.length} parcela(s)`
                        : head.installmentCount > 1
                          ? `${head.installmentCount}x`
                          : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <span className={statusClass(st)}>{statusLabel(st)}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <Button
                        type="button"
                        variant="secondary"
                        className="mr-1 text-xs py-1"
                        onClick={() => setExpandedSaleId(expanded ? null : saleId)}
                      >
                        {expanded ? 'Fechar' : 'Abrir venda'}
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        className="text-xs py-1"
                        disabled={deletingSaleId !== null}
                        onClick={() => void onDeleteSale(saleId)}
                      >
                        {deletingSaleId === saleId ? '…' : 'Apagar venda'}
                      </Button>
                    </td>
                  </tr>
                  {expanded ? (
                    <tr className="border-b border-zinc-100 dark:border-zinc-900">
                      <td colSpan={8} className="bg-zinc-50/80 px-3 py-3 dark:bg-zinc-950/50">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
                          <span>{head.paymentMethod || '—'}</span>
                          <Link
                            to={`/app/vendas/${saleId}`}
                            className="mr-2 font-medium text-violet-700 hover:underline dark:text-violet-300"
                          >
                            Editar venda
                          </Link>
                          <Link to="/app/vendas" className="font-medium text-violet-700 hover:underline dark:text-violet-300">
                            Lista de vendas
                          </Link>
                        </div>
                        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                          <table className="min-w-full text-left text-sm">
                            <thead className="border-b border-zinc-200 bg-white text-xs font-semibold uppercase text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                              <tr>
                                <th className="px-3 py-2">Descrição</th>
                                <th className="px-3 py-2">Vencimento</th>
                                <th className="px-3 py-2 text-right">Valor</th>
                                <th className="px-3 py-2">Estado</th>
                                <th className="px-3 py-2">Ações</th>
                              </tr>
                            </thead>
                            <tbody>
                              {g.map((r) => (
                                <tr key={r.id} className="border-b border-zinc-100 bg-white dark:border-zinc-900 dark:bg-zinc-950">
                                  <td className="px-3 py-2">
                                    {r.installmentLabel ||
                                      (r.installmentNumber === 0 ? 'Recebido na venda' : `Parcela ${r.installmentNumber}`)}
                                  </td>
                                  <td className="whitespace-nowrap px-3 py-2">{formatDate(r.dueDate ?? r.saleDate)}</td>
                                  <td className="px-3 py-2 text-right font-medium">
                                    {r.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                  </td>
                                  <td className="px-3 py-2">
                                    <span
                                      className={
                                        r.status === 'recebido'
                                          ? 'text-emerald-700 dark:text-emerald-400'
                                          : 'text-amber-700 dark:text-amber-400'
                                      }
                                    >
                                      {r.status === 'recebido' ? 'Recebido' : 'Aberto'}
                                    </span>
                                  </td>
                                  <td className="whitespace-nowrap px-3 py-2">
                                    {r.status === 'aberto' ? (
                                      <>
                                        <Button
                                          type="button"
                                          variant="secondary"
                                          className="mr-1 text-xs py-1"
                                          onClick={() => openEdit(r)}
                                        >
                                          Editar
                                        </Button>
                                        <Button
                                          type="button"
                                          className="text-xs py-1"
                                          onClick={() => void markReceived(r.id, r.saleId)}
                                        >
                                          Marcar recebido
                                        </Button>
                                      </>
                                    ) : (
                                      <span className="text-xs text-zinc-500">{formatDate(r.receivedAt)}</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              )
            })}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-zinc-500">
            Sem contas a receber. Registe uma venda com Crediário, cartão em parcelas ou valor recebido menor que o total.
          </p>
        ) : null}
      </div>

      {modal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
        >
          <Card className="w-full max-w-md">
            <h2 className="text-lg font-semibold">Editar parcela</h2>
            <p className="mt-1 text-sm text-zinc-500">{modal.row.installmentLabel || modal.row.clientName}</p>
            <div className="mt-4 space-y-3">
              <Field label="Valor (R$)">
                <Input value={formAmount} onChange={(e) => setFormAmount(e.target.value)} />
              </Field>
              <Field label="Vencimento">
                <Input type="date" value={formDue} onChange={(e) => setFormDue(e.target.value)} />
              </Field>
              {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="secondary" disabled={formBusy} onClick={() => setModal(null)}>
                Cancelar
              </Button>
              <Button type="button" disabled={formBusy} onClick={() => void saveEdit()}>
                {formBusy ? 'A guardar…' : 'Guardar'}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  )
}
