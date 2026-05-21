import { Button, Card, Field, Input, PageTitle, Select } from '@/components/Ui'
import { db } from '@/firebase'
import { clientsCol, productsCol } from '@/lib/firestorePaths'
import { createSale } from '@/lib/saleOps'
import { useOrg } from '@/contexts/OrgContext'
import { getDocs, orderBy, query } from 'firebase/firestore'
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

type ClientOpt = { id: string; name: string; phone: string }
type ProductOpt = {
  id: string
  code: string
  name: string
  size: string
  stock: number
  salePrice: number
  suggestedPrice: number
}

type Line = { productId: string; productQuery: string; quantity: string; unitPrice: string }

const PAYMENT_OPTIONS = ['PIX', 'Cartão de Débito', 'Cartão de Crédito', 'Crediário'] as const
type PaymentOption = (typeof PAYMENT_OPTIONS)[number]

function needsInstallments(method: PaymentOption) {
  return method === 'Cartão de Crédito' || method === 'Crediário'
}

function formatPaymentMethod(base: PaymentOption, installments: number): string {
  if (needsInstallments(base)) return `${base} · ${installments}x`
  return base
}

function normalize(s: string) {
  return s.trim().toLowerCase()
}

function productLabel(p: ProductOpt) {
  const code = p.code.trim()
  const name = p.name.trim()
  const size = p.size.trim()
  const head = [code, name].filter(Boolean).join(' · ')
  return `${head}${size ? ` (${size})` : ''} — stock ${p.stock}`
}

export default function SaleNewPage() {
  const { orgId } = useOrg()
  const navigate = useNavigate()
  const [clients, setClients] = useState<ClientOpt[]>([])
  const [products, setProducts] = useState<ProductOpt[]>([])
  const [clientId, setClientId] = useState('')
  const [clientQuery, setClientQuery] = useState('')
  const [clientListOpen, setClientListOpen] = useState(false)
  const clientBoxRef = useRef<HTMLDivElement>(null)
  const [dateStr, setDateStr] = useState(() => new Date().toISOString().slice(0, 10))
  const [paymentBase, setPaymentBase] = useState<PaymentOption>('PIX')
  const [installments, setInstallments] = useState('2')
  const [amountReceived, setAmountReceived] = useState('0')
  const [lines, setLines] = useState<Line[]>([{ productId: '', productQuery: '', quantity: '1', unitPrice: '0' }])
  const [openProductLine, setOpenProductLine] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!orgId) return
    let cancelled = false
    ;(async () => {
      const [cSnap, pSnap] = await Promise.all([
        getDocs(query(clientsCol(db, orgId))),
        getDocs(query(productsCol(db, orgId), orderBy('code'))),
      ])
      if (cancelled) return
      setClients(
        cSnap.docs
          .map((d) => {
            const x = d.data() as Record<string, unknown>
            return {
              id: d.id,
              name: String(x.name ?? ''),
              phone: String(x.phone ?? ''),
            }
          })
          .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt', { sensitivity: 'base' })),
      )
      setProducts(
        pSnap.docs.map((d) => {
          const x = d.data() as Record<string, unknown>
          const sug = Number(x.suggestedPrice ?? 0)
          const sale = Number(x.salePrice ?? 0)
          return {
            id: d.id,
            code: String(x.code ?? ''),
            name: String(x.name ?? ''),
            size: String(x.size ?? ''),
            stock: Number(x.stock ?? 0),
            salePrice: sale > 0 ? sale : sug,
            suggestedPrice: sug,
          }
        }),
      )
    })()
    return () => {
      cancelled = true
    }
  }, [orgId])

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      const t = e.target as Node
      if (!clientBoxRef.current?.contains(t)) setClientListOpen(false)
      const picker = (t as HTMLElement).closest?.('[data-product-picker]')
      if (!picker) setOpenProductLine(null)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [])

  function filterProducts(query: string) {
    const q = normalize(query)
    if (!q) return products.slice(0, 15)
    return products
      .filter((p) => {
        const code = normalize(p.code)
        const name = normalize(p.name)
        const size = normalize(p.size)
        const blob = `${code} ${name} ${size}`
        return code.includes(q) || name.includes(q) || size.includes(q) || blob.includes(q)
      })
      .slice(0, 15)
  }

  const selectedClient = useMemo(() => clients.find((c) => c.id === clientId), [clients, clientId])

  const filteredClients = useMemo(() => {
    const q = normalize(clientQuery)
    if (!q) return clients.slice(0, 12)
    return clients
      .filter((c) => {
        const n = normalize(c.name)
        const ph = normalize(c.phone)
        return n.includes(q) || ph.includes(q)
      })
      .slice(0, 12)
  }, [clients, clientQuery])

  const lineSubtotal = useMemo(() => {
    let sum = 0
    for (const l of lines) {
      const q = Number(String(l.quantity).replace(',', '.'))
      const p = Number(String(l.unitPrice).replace(',', '.'))
      if (l.productId && Number.isFinite(q) && Number.isFinite(p) && q > 0) sum += q * p
    }
    return sum
  }, [lines])

  function pickClient(c: ClientOpt) {
    setClientId(c.id)
    setClientQuery(`${c.name || '—'}${c.phone ? ` · ${c.phone}` : ''}`)
    setClientListOpen(false)
  }

  function onClientInputChange(value: string) {
    setClientQuery(value)
    setClientListOpen(true)
    if (selectedClient) {
      const label = `${selectedClient.name || '—'}${selectedClient.phone ? ` · ${selectedClient.phone}` : ''}`
      if (value !== label) setClientId('')
    }
  }

  function setLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((row, j) => (j === i ? { ...row, ...patch } : row)))
  }

  function pickProduct(i: number, p: ProductOpt) {
    setLine(i, {
      productId: p.id,
      productQuery: productLabel(p),
      unitPrice: String(p.salePrice > 0 ? p.salePrice : p.suggestedPrice),
    })
    setOpenProductLine(null)
  }

  function onProductInputChange(i: number, value: string) {
    setLines((prev) =>
      prev.map((row, j) => {
        if (j !== i) return row
        const selected = products.find((x) => x.id === row.productId)
        const next = { ...row, productQuery: value }
        if (selected && value !== productLabel(selected)) next.productId = ''
        return next
      }),
    )
    setOpenProductLine(i)
  }

  function addLine() {
    setLines((prev) => [...prev, { productId: '', productQuery: '', quantity: '1', unitPrice: '0' }])
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
      setError('Escolha um cliente na lista (escreva o nome e clique num resultado).')
      return
    }
    const inst = Math.max(1, Math.min(48, Math.floor(Number(String(installments).replace(',', '.')) || 1)))
    const paymentMethod = formatPaymentMethod(paymentBase, inst)
    const parsedLines = lines
      .map((l) => ({
        productId: l.productId,
        quantity: Number(String(l.quantity).replace(',', '.')),
        unitPrice: Number(String(l.unitPrice).replace(',', '.')),
      }))
      .filter((l) => l.productId && l.quantity > 0 && l.unitPrice >= 0)
    if (!parsedLines.length) {
      setError('Adicione pelo menos uma linha com produto (escolha na lista ao escrever) e quantidade.')
      return
    }
    const received = Math.max(0, Number(String(amountReceived).replace(',', '.')) || 0)
    const subtotal = parsedLines.reduce((s, l) => s + l.quantity * l.unitPrice, 0)
    const pending = Math.max(0, Math.round((subtotal - received) * 100) / 100)

    setBusy(true)
    try {
      await createSale({
        orgId,
        clientId: client.id,
        clientName: client.name,
        date: new Date(`${dateStr}T12:00:00`),
        paymentMethod,
        status: pending > 0.01 ? 'Pendente' : 'Pago',
        amountReceived: received,
        amountPending: pending,
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
            <div ref={clientBoxRef} className="relative">
              <Input
                autoComplete="off"
                value={clientQuery}
                placeholder="Escreva o nome ou telefone…"
                onChange={(e) => onClientInputChange(e.target.value)}
                onFocus={() => setClientListOpen(true)}
                required
              />
              {clientListOpen && filteredClients.length > 0 ? (
                <ul
                  className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-zinc-200 bg-white py-1 text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
                  role="listbox"
                >
                  {filteredClients.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-violet-50 dark:hover:bg-violet-950/40"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => pickClient(c)}
                      >
                        <span className="font-medium text-zinc-900 dark:text-zinc-50">{c.name || '—'}</span>
                        {c.phone ? <span className="text-xs text-zinc-500">{c.phone}</span> : null}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {clientListOpen && clientQuery.trim() && filteredClients.length === 0 ? (
                <p className="absolute z-30 mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-500 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                  Nenhum cliente encontrado.
                </p>
              ) : null}
            </div>
          </Field>
          <Field label="Data">
            <Input type="date" value={dateStr} onChange={(e) => setDateStr(e.target.value)} required />
          </Field>
          <Field label="Forma de pagamento">
            <Select value={paymentBase} onChange={(e) => setPaymentBase(e.target.value as PaymentOption)}>
              {PAYMENT_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </Field>
          {needsInstallments(paymentBase) ? (
            <Field label="Quantidade de parcelas">
              <Input
                type="number"
                min={1}
                max={48}
                value={installments}
                onChange={(e) => setInstallments(e.target.value)}
              />
            </Field>
          ) : null}
          <Field label="Valor recebido">
            <Input value={amountReceived} onChange={(e) => setAmountReceived(e.target.value)} />
          </Field>

          <div className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold">Itens</span>
              <div className="text-right">
                <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Total da venda</div>
                <div className="text-lg font-semibold text-violet-700 dark:text-violet-300">
                  {lineSubtotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </div>
              </div>
            </div>
            <div className="mb-3 flex justify-end">
              <Button variant="secondary" type="button" onClick={addLine}>
                + Linha
              </Button>
            </div>
            <div className="space-y-3">
              {lines.map((line, i) => {
                const q = Number(String(line.quantity).replace(',', '.'))
                const p = Number(String(line.unitPrice).replace(',', '.'))
                const lineTot =
                  line.productId && Number.isFinite(q) && Number.isFinite(p) && q > 0 ? q * p : 0
                const filteredProducts = filterProducts(line.productQuery)
                return (
                  <div key={i} className="grid gap-2 rounded-lg border border-zinc-100 p-3 dark:border-zinc-800 sm:grid-cols-12">
                    <div className="sm:col-span-5" data-product-picker={i}>
                      <LabelMini>Produto</LabelMini>
                      <div className="relative">
                        <Input
                          autoComplete="off"
                          value={line.productQuery}
                          placeholder="Código ou nome do produto…"
                          onChange={(e) => onProductInputChange(i, e.target.value)}
                          onFocus={() => setOpenProductLine(i)}
                        />
                        {openProductLine === i && filteredProducts.length > 0 ? (
                          <ul
                            className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-zinc-200 bg-white py-1 text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
                            role="listbox"
                          >
                            {filteredProducts.map((pr) => (
                              <li key={pr.id}>
                                <button
                                  type="button"
                                  className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-violet-50 dark:hover:bg-violet-950/40"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => pickProduct(i, pr)}
                                >
                                  <span className="font-medium text-zinc-900 dark:text-zinc-50">
                                    {[pr.code, pr.name].filter(Boolean).join(' · ') || '—'}
                                  </span>
                                  <span className="text-xs text-zinc-500">
                                    {pr.size ? `Tam. ${pr.size}` : ''}
                                    {pr.size ? ' · ' : ''}
                                    Stock {pr.stock}
                                    {' · '}
                                    {(pr.salePrice > 0 ? pr.salePrice : pr.suggestedPrice).toLocaleString('pt-BR', {
                                      style: 'currency',
                                      currency: 'BRL',
                                    })}
                                  </span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {openProductLine === i && line.productQuery.trim() && filteredProducts.length === 0 ? (
                          <p className="absolute z-30 mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-500 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                            Nenhum produto encontrado.
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="sm:col-span-2">
                      <LabelMini>Qtd</LabelMini>
                      <Input value={line.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
                    </div>
                    <div className="sm:col-span-2">
                      <LabelMini>Preço unit.</LabelMini>
                      <Input value={line.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} />
                    </div>
                    <div className="sm:col-span-1 flex flex-col justify-end text-right text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      {lineTot > 0
                        ? lineTot.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 })
                        : '—'}
                    </div>
                    <div className="flex items-end sm:col-span-2">
                      <Button variant="ghost" type="button" onClick={() => removeLine(i)} disabled={lines.length <= 1}>
                        Remover
                      </Button>
                    </div>
                  </div>
                )
              })}
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
