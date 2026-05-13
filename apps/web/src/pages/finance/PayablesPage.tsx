import { Button, Card, Field, Input, PageTitle } from '@/components/Ui'
import { db } from '@/firebase'
import { payablesCol } from '@/lib/firestorePaths'
import { useOrg } from '@/contexts/OrgContext'
import type { AccountPayable, PayableStatus } from '@/types'
import {
  addDoc,
  deleteField,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from 'firebase/firestore'
import { useEffect, useMemo, useState, Fragment } from 'react'

type Row = AccountPayable & { id: string }

type ModalState = { mode: 'edit'; row: Row } | { mode: 'add'; template: Row; groupRows: Row[] }

function tsMillis(t: Timestamp | null | undefined): number {
  if (!t) return 0
  if (typeof t.toMillis === 'function') return t.toMillis()
  return 0
}

function createdMillis(t: Row['createdAt']): number {
  if (!t) return 0
  if (typeof (t as Timestamp).toMillis === 'function') return (t as Timestamp).toMillis()
  return 0
}

function groupPayables(rows: Row[]): { key: string; rows: Row[] }[] {
  const m = new Map<string, Row[]>()
  for (const r of rows) {
    const key = r.nfeChave.trim() || `_sem_chave_${r.id}`
    if (!m.has(key)) m.set(key, [])
    m.get(key)!.push(r)
  }
  for (const list of m.values()) {
    list.sort((a, b) => {
      const da = a.dupNumber || ''
      const db = b.dupNumber || ''
      const c = da.localeCompare(db, undefined, { numeric: true })
      if (c !== 0) return c
      return tsMillis(a.dueDate) - tsMillis(b.dueDate)
    })
  }
  return [...m.entries()]
    .map(([key, list]) => ({ key, rows: list }))
    .sort((a, b) => {
      const ca = Math.max(0, ...a.rows.map((r) => createdMillis(r.createdAt)))
      const cb = Math.max(0, ...b.rows.map((r) => createdMillis(r.createdAt)))
      return cb - ca
    })
}

function groupStatus(rows: Row[]): 'pago' | 'aberto' | 'parcial' {
  const hasOpen = rows.some((r) => r.status === 'aberto')
  const hasPaid = rows.some((r) => r.status === 'pago')
  if (hasOpen && hasPaid) return 'parcial'
  if (hasOpen) return 'aberto'
  return 'pago'
}

function sumAmount(rows: Row[]): number {
  return rows.reduce((s, r) => s + Number(r.amount ?? 0), 0)
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

function nextDupSuggestion(rows: Row[]): string {
  let max = 0
  for (const r of rows) {
    const raw = String(r.dupNumber || '').replace(/\D/g, '')
    const n = parseInt(raw, 10)
    if (Number.isFinite(n) && n > max) max = n
  }
  if (max > 0) return String(max + 1).padStart(3, '0')
  return String(rows.length + 1).padStart(3, '0')
}

export default function PayablesPage() {
  const { orgId } = useOrg()
  const [rows, setRows] = useState<Row[]>([])
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalState | null>(null)
  const [formDup, setFormDup] = useState('')
  const [formAmount, setFormAmount] = useState('')
  const [formDue, setFormDue] = useState('')
  const [formBusy, setFormBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (!orgId) return
    const q = query(payablesCol(db, orgId), orderBy('createdAt', 'desc'))
    return onSnapshot(q, (snap) => {
      setRows(
        snap.docs.map((d) => {
          const x = d.data() as Record<string, unknown>
          return {
            id: d.id,
            nfeChave: String(x.nfeChave ?? ''),
            nNF: String(x.nNF ?? ''),
            serie: String(x.serie ?? ''),
            orderRef: String(x.orderRef ?? ''),
            supplierName: String(x.supplierName ?? ''),
            amount: Number(x.amount ?? 0),
            dhEmi: (x.dhEmi as Row['dhEmi']) ?? null,
            dupNumber: String(x.dupNumber ?? ''),
            dueDate: (x.dueDate as Row['dueDate']) ?? null,
            status: ((x.status as PayableStatus) ?? 'aberto') as PayableStatus,
            createdAt: x.createdAt as Row['createdAt'],
            paidAt: (x.paidAt as Row['paidAt']) ?? null,
          }
        }),
      )
    })
  }, [orgId])

  const groups = useMemo(() => groupPayables(rows), [rows])

  function closeModal() {
    setModal(null)
    setFormError(null)
    setFormDup('')
    setFormAmount('')
    setFormDue('')
  }

  function openEdit(r: Row) {
    if (r.status !== 'aberto') return
    setFormError(null)
    setModal({ mode: 'edit', row: r })
    setFormDup(r.dupNumber || '')
    setFormAmount(String(r.amount))
    setFormDue(timestampToInputDate(r.dueDate))
  }

  function openAdd(template: Row, groupRows: Row[]) {
    setFormError(null)
    setModal({ mode: 'add', template, groupRows })
    setFormDup(nextDupSuggestion(groupRows))
    setFormAmount('')
    setFormDue('')
  }

  async function submitModal() {
    if (!orgId || !modal) return
    const amount = parseAmountBr(formAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError('Indique um valor válido maior que zero.')
      return
    }
    const dueTs = formDue.trim() ? inputDateToTimestamp(formDue) : null
    const dupTrim = formDup.trim()
    setFormBusy(true)
    setFormError(null)
    try {
      if (modal.mode === 'edit') {
        const payload: Record<string, unknown> = {
          amount: Math.round(amount * 100) / 100,
        }
        payload.dupNumber = dupTrim || deleteField()
        payload.dueDate = dueTs ?? deleteField()
        await updateDoc(doc(payablesCol(db, orgId), modal.row.id), payload)
      } else {
        const t = modal.template
        await addDoc(payablesCol(db, orgId), {
          nfeChave: t.nfeChave || '',
          nNF: t.nNF,
          serie: t.serie,
          orderRef: t.orderRef,
          supplierName: t.supplierName,
          amount: Math.round(amount * 100) / 100,
          dupNumber: dupTrim || nextDupSuggestion(modal.groupRows),
          dueDate: dueTs,
          dhEmi: t.dhEmi ?? serverTimestamp(),
          status: 'aberto',
          createdAt: serverTimestamp(),
        })
      }
      closeModal()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Não foi possível guardar.')
    } finally {
      setFormBusy(false)
    }
  }

  async function markPaid(id: string) {
    if (!orgId) return
    await updateDoc(doc(payablesCol(db, orgId), id), {
      status: 'pago',
      paidAt: serverTimestamp(),
    })
  }

  function toggleExpand(key: string) {
    setExpandedKey((prev) => (prev === key ? null : key))
  }

  function statusLabel(s: 'pago' | 'aberto' | 'parcial'): string {
    if (s === 'pago') return 'Pago'
    if (s === 'parcial') return 'Parcial'
    return 'Aberto'
  }

  function statusClass(s: 'pago' | 'aberto' | 'parcial'): string {
    if (s === 'pago') return 'text-emerald-700 dark:text-emerald-400'
    if (s === 'parcial') return 'text-violet-700 dark:text-violet-300'
    return 'text-amber-700 dark:text-amber-400'
  }

  return (
    <div>
      <PageTitle
        title="Contas a pagar"
        subtitle="Agrupadas por nota fiscal (chave). Edite parcelas abertas ou acrescente parcelas quando o XML não trouxe duplicatas."
      />
      <Card className="mb-4 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
        Cada parcela é um registo à parte. Use <strong className="font-medium text-zinc-800 dark:text-zinc-200">Abrir conta</strong> para ver
        as linhas; em parcelas em aberto pode <strong className="font-medium text-zinc-800 dark:text-zinc-200">Editar</strong> ou{' '}
        <strong className="font-medium text-zinc-800 dark:text-zinc-200">Adicionar parcela</strong> à mesma nota (mesma chave, fornecedor e
        dados da NF).
      </Card>
      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
            <tr>
              <th className="px-3 py-2">Pedido</th>
              <th className="px-3 py-2">NF</th>
              <th className="px-3 py-2">Parcelas</th>
              <th className="px-3 py-2">Vencimento</th>
              <th className="px-3 py-2">Fornecedor</th>
              <th className="px-3 py-2">Emissão NF</th>
              <th className="px-3 py-2 text-right">Valor total</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Conta</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(({ key, rows: g }) => {
              const head = g[0]!
              const n = g.length
              const total = sumAmount(g)
              const st = groupStatus(g)
              const anyDetail = g.some((r) => r.dupNumber || r.dueDate)
              const parcelSummary =
                n > 1 ? `${n} parcelas` : head.dupNumber ? head.dupNumber : anyDetail ? '1 parcela' : '—'
              const dueSummary =
                n === 1
                  ? formatDate(head.dueDate)
                  : g.every((r) => r.dueDate)
                    ? `${formatDate(g[0]!.dueDate)} … ${formatDate(g[g.length - 1]!.dueDate)}`
                    : '—'
              const expanded = expandedKey === key

              return (
                <Fragment key={key}>
                  <tr className="border-b border-zinc-100 bg-zinc-50/50 dark:border-zinc-900 dark:bg-zinc-900/30">
                    <td className="px-3 py-2 font-mono text-xs">{head.orderRef || '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {head.nNF ? `${head.nNF}${head.serie ? ` / s. ${head.serie}` : ''}` : '—'}
                    </td>
                    <td className="px-3 py-2 text-xs">{parcelSummary}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-zinc-600 dark:text-zinc-400">{dueSummary}</td>
                    <td className="max-w-[140px] truncate px-3 py-2" title={head.supplierName}>
                      {head.supplierName || '—'}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatDate(head.dhEmi)}</td>
                    <td className="px-3 py-2 text-right font-medium">
                      {total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </td>
                    <td className="px-3 py-2">
                      <span className={statusClass(st)}>{statusLabel(st)}</span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <Button type="button" variant="secondary" className="text-xs py-1" onClick={() => toggleExpand(key)}>
                        {expanded ? 'Fechar conta' : 'Abrir conta'}
                      </Button>
                    </td>
                  </tr>
                  {expanded ? (
                    <tr className="border-b border-zinc-100 dark:border-zinc-900">
                      <td colSpan={9} className="bg-zinc-50/80 px-3 py-3 dark:bg-zinc-950/50">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Detalhe das parcelas</div>
                          <Button type="button" className="text-xs py-1" onClick={() => openAdd(head, g)}>
                            Adicionar parcela
                          </Button>
                        </div>
                        <div className="mt-2 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                          <table className="min-w-full text-left text-sm">
                            <thead className="border-b border-zinc-200 bg-white text-xs font-semibold uppercase text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                              <tr>
                                <th className="px-3 py-2">Parcela</th>
                                <th className="px-3 py-2">Vencimento</th>
                                <th className="px-3 py-2 text-right">Valor</th>
                                <th className="px-3 py-2">Estado</th>
                                <th className="px-3 py-2">Ações</th>
                              </tr>
                            </thead>
                            <tbody>
                              {g.map((r) => (
                                <tr key={r.id} className="border-b border-zinc-100 bg-white dark:border-zinc-900 dark:bg-zinc-950">
                                  <td className="px-3 py-2 font-mono text-xs">{r.dupNumber || '—'}</td>
                                  <td className="px-3 py-2 whitespace-nowrap">{formatDate(r.dueDate)}</td>
                                  <td className="px-3 py-2 text-right font-medium">
                                    {r.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                  </td>
                                  <td className="px-3 py-2">
                                    <span
                                      className={
                                        r.status === 'pago'
                                          ? 'text-emerald-700 dark:text-emerald-400'
                                          : 'text-amber-700 dark:text-amber-400'
                                      }
                                    >
                                      {r.status === 'pago' ? 'Pago' : 'Aberto'}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 whitespace-nowrap">
                                    {r.status === 'aberto' ? (
                                      <>
                                        <Button type="button" variant="secondary" className="mr-1 text-xs py-1" onClick={() => openEdit(r)}>
                                          Editar
                                        </Button>
                                        <Button type="button" className="text-xs py-1" onClick={() => void markPaid(r.id)}>
                                          Marcar pago
                                        </Button>
                                      </>
                                    ) : (
                                      <span className="text-xs text-zinc-500">{formatDate(r.paidAt)}</span>
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
          <p className="p-4 text-sm text-zinc-500">Sem contas a pagar. Importe uma NF-e em Entradas → Importar NF-e.</p>
        ) : null}
      </div>

      {modal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="payable-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal()
          }}
        >
          <Card className="relative max-h-[90vh] w-full max-w-md overflow-y-auto shadow-lg">
            <h2 id="payable-modal-title" className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
              {modal.mode === 'edit' ? 'Editar parcela' : 'Nova parcela nesta nota'}
            </h2>
            {modal.mode === 'add' ? (
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                NF {modal.template.nNF || '—'}
                {modal.template.serie ? ` · série ${modal.template.serie}` : ''} · {modal.template.supplierName || '—'}
              </p>
            ) : null}
            <div className="mt-4 space-y-1">
              <Field label="Nº parcela / duplicata">
                <Input value={formDup} onChange={(e) => setFormDup(e.target.value)} placeholder="Ex.: 001" />
              </Field>
              <Field label="Valor (R$)">
                <Input value={formAmount} onChange={(e) => setFormAmount(e.target.value)} placeholder="0,00" inputMode="decimal" />
              </Field>
              <Field label="Vencimento">
                <Input type="date" value={formDue} onChange={(e) => setFormDue(e.target.value)} />
              </Field>
              {formError ? <p className="text-sm text-red-600 dark:text-red-400">{formError}</p> : null}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" disabled={formBusy} onClick={() => void submitModal()}>
                {formBusy ? 'A guardar…' : 'Guardar'}
              </Button>
              <Button type="button" variant="secondary" disabled={formBusy} onClick={closeModal}>
                Cancelar
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  )
}
