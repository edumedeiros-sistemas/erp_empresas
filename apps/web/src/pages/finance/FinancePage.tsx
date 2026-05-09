import { Button, Card, Field, Input, PageTitle, Select, TextArea } from '@/components/Ui'
import { db } from '@/firebase'
import { financialCol, settingsDoc } from '@/lib/firestorePaths'
import { applyFinancialDelta } from '@/lib/financialOps'
import { useOrg } from '@/contexts/OrgContext'
import type { FinancialType, OrgSettings } from '@/types'
import {
  Timestamp,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'
import { useEffect, useState, type FormEvent } from 'react'

type Row = {
  id: string
  date: { toDate: () => Date } | null
  type: FinancialType
  category: string
  description: string
  amount: number
  paymentMethod: string
  status: string
}

export default function FinancePage() {
  const { orgId } = useOrg()
  const [rows, setRows] = useState<Row[]>([])
  const [settings, setSettings] = useState<OrgSettings | null>(null)
  const [dateStr, setDateStr] = useState(() => new Date().toISOString().slice(0, 10))
  const [type, setType] = useState<FinancialType>('saida')
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('0')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!orgId) return
    const unsub = onSnapshot(settingsDoc(db, orgId), (snap) => {
      if (!snap.exists()) {
        setSettings(null)
        return
      }
      const d = snap.data() as Record<string, unknown>
      setSettings({
        paymentMethods: (d.paymentMethods as string[]) ?? [],
        saleStatuses: (d.saleStatuses as string[]) ?? [],
        sizes: (d.sizes as string[]) ?? [],
        financialCategories: (d.financialCategories as string[]) ?? [],
        suppliers: (d.suppliers as string[]) ?? [],
        months: (d.months as string[]) ?? [],
      })
    })
    return unsub
  }, [orgId])

  useEffect(() => {
    if (!orgId) return
    const q = query(financialCol(db, orgId), orderBy('date', 'desc'))
    return onSnapshot(q, (snap) => {
      setRows(
        snap.docs.map((d) => {
          const x = d.data() as Record<string, unknown>
          return {
            id: d.id,
            date: x.date as Row['date'],
            type: (x.type as FinancialType) ?? 'saida',
            category: String(x.category ?? ''),
            description: String(x.description ?? ''),
            amount: Number(x.amount ?? 0),
            paymentMethod: String(x.paymentMethod ?? ''),
            status: String(x.status ?? ''),
          }
        }),
      )
    })
  }, [orgId])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!orgId) return
    setError(null)
    const amt = Math.abs(Number(String(amount).replace(',', '.')))
    if (!amt) {
      setError('Indique um valor.')
      return
    }
    setBusy(true)
    try {
      const ref = doc(financialCol(db, orgId))
      await setDoc(ref, {
        date: Timestamp.fromDate(new Date(`${dateStr}T12:00:00`)),
        type,
        category: category.trim(),
        description: description.trim(),
        amount: amt,
        paymentMethod: paymentMethod.trim(),
        status: status.trim(),
        createdAt: serverTimestamp(),
      })
      await applyFinancialDelta(orgId, type, amt, 1)
      setDescription('')
      setAmount('0')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao guardar.')
    } finally {
      setBusy(false)
    }
  }

  async function onDelete(r: Row) {
    if (!orgId) return
    if (!confirm('Apagar este lançamento?')) return
    await deleteDoc(doc(financialCol(db, orgId), r.id))
    await applyFinancialDelta(orgId, r.type, r.amount, -1)
  }

  const cats = settings?.financialCategories ?? []

  return (
    <div>
      <PageTitle title="Financeiro" subtitle="Entradas e saídas (fora das vendas)." />
      <Card className="mb-6">
        <form onSubmit={onSubmit} className="max-w-2xl space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Data">
              <Input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} required />
            </Field>
            <Field label="Tipo">
              <Select value={type} onChange={(e) => setType(e.target.value as FinancialType)}>
                <option value="entrada">Entrada</option>
                <option value="saida">Saída</option>
              </Select>
            </Field>
          </div>
          <Field label="Categoria">
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">—</option>
              {cats.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Descrição">
            <TextArea value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <Field label="Valor">
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Forma de pagamento (opcional)">
              <Input value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} />
            </Field>
            <Field label="Status (opcional)">
              <Input value={status} onChange={(e) => setStatus(e.target.value)} />
            </Field>
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button type="submit" disabled={busy}>
            Adicionar
          </Button>
        </form>
      </Card>
      <div className="space-y-2">
        {rows.map((r) => (
          <div
            key={r.id}
            className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <div className="text-xs uppercase text-zinc-500">
                {r.date?.toDate?.().toLocaleDateString('pt-BR') ?? '—'} · {r.type}
              </div>
              <div className="font-medium">{r.description || r.category || '—'}</div>
              <div className="text-sm text-zinc-600 dark:text-zinc-400">{r.category}</div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-lg font-semibold ${r.type === 'entrada' ? 'text-emerald-600' : 'text-red-600'}`}>
                {r.type === 'entrada' ? '+' : '−'}
                {r.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </span>
              <Button variant="danger" type="button" onClick={() => void onDelete(r)}>
                Apagar
              </Button>
            </div>
          </div>
        ))}
        {rows.length === 0 ? <p className="text-sm text-zinc-500">Sem lançamentos.</p> : null}
      </div>
    </div>
  )
}
