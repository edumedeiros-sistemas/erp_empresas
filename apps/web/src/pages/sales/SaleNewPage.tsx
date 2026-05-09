import { Button, Card, Field, Input, PageTitle, Select } from '@/components/Ui'
import { db } from '@/firebase'
import { clientsCol, productsCol, settingsDoc } from '@/lib/firestorePaths'
import { createSale } from '@/lib/saleOps'
import { useOrg } from '@/contexts/OrgContext'
import type { OrgSettings } from '@/types'
import { getDocs, onSnapshot, orderBy, query } from 'firebase/firestore'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

type ClientOpt = { id: string; code: string; name: string }
type ProductOpt = { id: string; code: string; name: string; size: string; stock: number; suggestedPrice: number }

type Line = { productId: string; quantity: string; unitPrice: string }

export default function SaleNewPage() {
  const { orgId } = useOrg()
  const navigate = useNavigate()
  const [clients, setClients] = useState<ClientOpt[]>([])
  const [products, setProducts] = useState<ProductOpt[]>([])
  const [settings, setSettings] = useState<OrgSettings | null>(null)
  const [clientId, setClientId] = useState('')
  const [dateStr, setDateStr] = useState(() => new Date().toISOString().slice(0, 10))
  const [paymentMethod, setPaymentMethod] = useState('Pix')
  const [status, setStatus] = useState('Pendente')
  const [amountReceived, setAmountReceived] = useState('0')
  const [amountPending, setAmountPending] = useState('0')
  const [lines, setLines] = useState<Line[]>([{ productId: '', quantity: '1', unitPrice: '0' }])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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
    let cancelled = false
    ;(async () => {
      const [cSnap, pSnap] = await Promise.all([
        getDocs(query(clientsCol(db, orgId), orderBy('code'))),
        getDocs(query(productsCol(db, orgId), orderBy('code'))),
      ])
      if (cancelled) return
      setClients(
        cSnap.docs.map((d) => {
          const x = d.data() as Record<string, unknown>
          return { id: d.id, code: String(x.code ?? ''), name: String(x.name ?? '') }
        }),
      )
      setProducts(
        pSnap.docs.map((d) => {
          const x = d.data() as Record<string, unknown>
          return {
            id: d.id,
            code: String(x.code ?? ''),
            name: String(x.name ?? ''),
            size: String(x.size ?? ''),
            stock: Number(x.stock ?? 0),
            suggestedPrice: Number(x.suggestedPrice ?? 0),
          }
        }),
      )
    })()
    return () => {
      cancelled = true
    }
  }, [orgId])

  useEffect(() => {
    if (!settings) return
    if (settings.paymentMethods.length && !settings.paymentMethods.includes(paymentMethod)) {
      setPaymentMethod(settings.paymentMethods[0]!)
    }
    if (settings.saleStatuses.length && !settings.saleStatuses.includes(status)) {
      setStatus(settings.saleStatuses[0]!)
    }
  }, [settings, paymentMethod, status])

  function setLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((row, j) => (j === i ? { ...row, ...patch } : row)))
  }

  function addLine() {
    setLines((prev) => [...prev, { productId: '', quantity: '1', unitPrice: '0' }])
  }

  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, j) => j !== i))
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!orgId) return
    setError(null)
    const client = clients.find((c) => c.id === clientId)
    if (!client) {
      setError('Selecione um cliente.')
      return
    }
    const parsedLines = lines
      .map((l) => ({
        productId: l.productId,
        quantity: Number(String(l.quantity).replace(',', '.')),
        unitPrice: Number(String(l.unitPrice).replace(',', '.')),
      }))
      .filter((l) => l.productId && l.quantity > 0 && l.unitPrice >= 0)
    if (!parsedLines.length) {
      setError('Adicione pelo menos uma linha com produto e quantidade.')
      return
    }
    setBusy(true)
    try {
      await createSale({
        orgId,
        clientId: client.id,
        clientName: client.name,
        date: new Date(`${dateStr}T12:00:00`),
        paymentMethod,
        status,
        amountReceived: Number(String(amountReceived).replace(',', '.')),
        amountPending: Number(String(amountPending).replace(',', '.')),
        lines: parsedLines,
      })
      navigate('/app/vendas')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao guardar venda.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageTitle
        title="Nova venda"
        actions={
          <Link to="/app/vendas">
            <Button variant="secondary" type="button">
              Voltar
            </Button>
          </Link>
        }
      />
      <Card>
        <form onSubmit={onSubmit} className="max-w-2xl space-y-4">
          <Field label="Cliente">
            <Select value={clientId} onChange={(e) => setClientId(e.target.value)} required>
              <option value="">— selecionar —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Data">
            <Input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} required />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Forma de pagamento">
              <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                {(settings?.paymentMethods ?? ['Pix', 'Dinheiro']).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Status">
              <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                {(settings?.saleStatuses ?? ['Pago', 'Pendente']).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Valor recebido">
              <Input value={amountReceived} onChange={(e) => setAmountReceived(e.target.value)} />
            </Field>
            <Field label="Valor pendente">
              <Input value={amountPending} onChange={(e) => setAmountPending(e.target.value)} />
            </Field>
          </div>

          <div className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold">Itens</span>
              <Button variant="secondary" type="button" onClick={addLine}>
                + Linha
              </Button>
            </div>
            <div className="space-y-3">
              {lines.map((line, i) => (
                <div key={i} className="grid gap-2 rounded-lg border border-zinc-100 p-3 dark:border-zinc-800 sm:grid-cols-12">
                  <div className="sm:col-span-5">
                    <LabelMini>Produto</LabelMini>
                    <Select
                      value={line.productId}
                      onChange={(e) => {
                        const pid = e.target.value
                        const p = products.find((x) => x.id === pid)
                        setLine(i, {
                          productId: pid,
                          unitPrice: p ? String(p.suggestedPrice) : line.unitPrice,
                        })
                      }}
                    >
                      <option value="">—</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.code} {p.name} ({p.size}) stock {p.stock}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="sm:col-span-2">
                    <LabelMini>Qtd</LabelMini>
                    <Input value={line.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
                  </div>
                  <div className="sm:col-span-3">
                    <LabelMini>Preço unit.</LabelMini>
                    <Input value={line.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} />
                  </div>
                  <div className="flex items-end sm:col-span-2">
                    <Button variant="ghost" type="button" onClick={() => removeLine(i)} disabled={lines.length <= 1}>
                      Remover
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button type="submit" disabled={busy}>
            {busy ? 'A guardar…' : 'Guardar venda'}
          </Button>
        </form>
      </Card>
    </div>
  )
}

function LabelMini({ children }: { children: string }) {
  return <div className="mb-1 text-xs font-medium text-zinc-500">{children}</div>
}
