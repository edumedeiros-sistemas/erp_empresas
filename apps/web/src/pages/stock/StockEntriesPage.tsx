import { Button, Card, Field, Input, PageTitle, Select } from '@/components/Ui'
import { db } from '@/firebase'
import { productsCol, stockMovementsCol } from '@/lib/firestorePaths'
import { addStockEntry } from '@/lib/stockOps'
import { useOrg } from '@/contexts/OrgContext'
import { getDocs, onSnapshot, orderBy, query } from 'firebase/firestore'
import { useEffect, useState, type FormEvent } from 'react'

type ProductOpt = { id: string; label: string; code: string; name: string; size: string }

type Row = {
  id: string
  date: { toDate: () => Date } | null
  productName: string
  size: string
  quantity: number
  total: number
  type?: string
}

export default function StockEntriesPage() {
  const { orgId } = useOrg()
  const [products, setProducts] = useState<ProductOpt[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [productId, setProductId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [unitCost, setUnitCost] = useState('0')
  const [dateStr, setDateStr] = useState(() => new Date().toISOString().slice(0, 10))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!orgId) return
    let cancelled = false
    ;(async () => {
      const pSnap = await getDocs(query(productsCol(db, orgId), orderBy('code')))
      if (cancelled) return
      setProducts(
        pSnap.docs.map((d) => {
          const x = d.data() as Record<string, unknown>
          const code = String(x.code ?? '')
          const name = String(x.name ?? '')
          const size = String(x.size ?? '')
          return {
            id: d.id,
            code,
            name,
            size,
            label: `${code} ${name} (${size})`,
          }
        }),
      )
    })()
    return () => {
      cancelled = true
    }
  }, [orgId])

  useEffect(() => {
    if (!orgId) return
    const q = query(stockMovementsCol(db, orgId), orderBy('date', 'desc'))
    return onSnapshot(q, (snap) => {
      setRows(
        snap.docs.map((d) => {
          const x = d.data() as Record<string, unknown>
          return {
            id: d.id,
            date: x.date as Row['date'],
            productName: String(x.productName ?? ''),
            size: String(x.size ?? ''),
            quantity: Number(x.quantity ?? 0),
            total: Number(x.total ?? 0),
            type: String(x.type ?? 'purchase_in'),
          }
        }),
      )
    })
  }, [orgId])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!orgId) return
    setError(null)
    const p = products.find((x) => x.id === productId)
    if (!p) {
      setError('Selecione um produto.')
      return
    }
    setBusy(true)
    try {
      await addStockEntry({
        orgId,
        productId: p.id,
        productCode: p.code,
        productName: p.name,
        size: p.size,
        quantity: Number(String(quantity).replace(',', '.')),
        unitCost: Number(String(unitCost).replace(',', '.')),
        date: new Date(`${dateStr}T12:00:00`),
      })
      setQuantity('1')
      setUnitCost('0')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao registar entrada.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageTitle title="Entrada manual" subtitle="Registe uma compra produto a produto; o movimento aparece na lista abaixo como origem Manual." />
      <Card className="mb-6">
        <form onSubmit={onSubmit} className="max-w-xl space-y-3">
          <Field label="Produto">
            <Select value={productId} onChange={(e) => setProductId(e.target.value)} required>
              <option value="">— selecionar —</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Data">
            <Input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} required />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Quantidade">
              <Input value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </Field>
            <Field label="Custo unitário">
              <Input value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
            </Field>
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button type="submit" disabled={busy}>
            Registar entrada
          </Button>
        </form>
      </Card>
      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
            <tr>
              <th className="px-3 py-2">Data</th>
              <th className="px-3 py-2">Produto</th>
              <th className="px-3 py-2">Tam.</th>
              <th className="hidden px-3 py-2 sm:table-cell">Origem</th>
              <th className="px-3 py-2 text-right">Qtd</th>
              <th className="px-3 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-zinc-100 dark:border-zinc-900">
                <td className="px-3 py-2 whitespace-nowrap">
                  {r.date?.toDate?.().toLocaleDateString('pt-BR') ?? '—'}
                </td>
                <td className="px-3 py-2">{r.productName}</td>
                <td className="px-3 py-2">{r.size}</td>
                <td className="hidden px-3 py-2 text-xs text-zinc-500 sm:table-cell">
                  {r.type === 'nfe_in' ? 'NF-e' : 'Manual'}
                </td>
                <td className="px-3 py-2 text-right">{r.quantity}</td>
                <td className="px-3 py-2 text-right">
                  {r.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <p className="p-4 text-sm text-zinc-500">Sem movimentos.</p> : null}
      </div>
    </div>
  )
}
