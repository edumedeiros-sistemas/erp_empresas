import { Button, Card, Field, Input, PageTitle } from '@/components/Ui'
import { db } from '@/firebase'
import { productsCol } from '@/lib/firestorePaths'
import { useOrg } from '@/contexts/OrgContext'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

function num(s: string) {
  const n = Number(String(s).replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

export default function ProductFormPage() {
  const { id } = useParams()
  const isNew = id === 'novo' || !id
  const { orgId } = useOrg()
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [size, setSize] = useState('U')
  const [category, setCategory] = useState('')
  const [cost, setCost] = useState('0')
  const [freight, setFreight] = useState('0')
  const [ipi, setIpi] = useState('0')
  const [packaging, setPackaging] = useState('0')
  const [marginPct, setMarginPct] = useState('0.8')
  const [suggestedPrice, setSuggestedPrice] = useState('0')
  const [minPrice, setMinPrice] = useState('0')
  const [fee3x, setFee3x] = useState('0')
  const [price3x, setPrice3x] = useState('0')
  const [fee12x, setFee12x] = useState('0')
  const [price12x, setPrice12x] = useState('0')
  const [stock, setStock] = useState('0')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!orgId || isNew || !id) return
    let cancelled = false
    ;(async () => {
      const snap = await getDoc(doc(productsCol(db, orgId), id))
      if (cancelled || !snap.exists()) return
      const x = snap.data() as Record<string, unknown>
      setCode(String(x.code ?? ''))
      setName(String(x.name ?? ''))
      setSize(String(x.size ?? ''))
      setCategory(String(x.category ?? ''))
      setCost(String(x.cost ?? 0))
      setFreight(String(x.freight ?? 0))
      setIpi(String(x.ipi ?? 0))
      setPackaging(String(x.packaging ?? 0))
      setMarginPct(String(x.marginPct ?? 0))
      setSuggestedPrice(String(x.suggestedPrice ?? 0))
      setMinPrice(String(x.minPrice ?? 0))
      setFee3x(String(x.fee3x ?? 0))
      setPrice3x(String(x.price3x ?? 0))
      setFee12x(String(x.fee12x ?? 0))
      setPrice12x(String(x.price12x ?? 0))
      setStock(String(x.stock ?? 0))
    })()
    return () => {
      cancelled = true
    }
  }, [orgId, id, isNew])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!orgId) return
    setBusy(true)
    try {
      const c = num(cost)
      const fr = num(freight)
      const ip = num(ipi)
      const pk = num(packaging)
      const totalCost = c + fr + ip + pk
      const ref = isNew ? doc(productsCol(db, orgId)) : doc(productsCol(db, orgId), id!)
      await setDoc(
        ref,
        {
          code: code.trim(),
          name: name.trim(),
          size: size.trim(),
          category: category.trim(),
          cost: c,
          freight: fr,
          ipi: ip,
          packaging: pk,
          totalCost,
          marginPct: num(marginPct),
          suggestedPrice: num(suggestedPrice),
          minPrice: num(minPrice),
          fee3x: num(fee3x),
          price3x: num(price3x),
          fee12x: num(fee12x),
          price12x: num(price12x),
          stock: Math.round(num(stock)),
        },
        { merge: true },
      )
      navigate('/app/produtos')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageTitle
        title={isNew ? 'Novo produto' : 'Editar produto'}
        actions={
          <Link to="/app/produtos">
            <Button variant="secondary" type="button">
              Voltar
            </Button>
          </Link>
        }
      />
      <Card>
        <form onSubmit={onSubmit} className="grid max-w-3xl gap-3 sm:grid-cols-2">
          <Field label="Código">
            <Input value={code} onChange={(e) => setCode(e.target.value)} required />
          </Field>
          <Field label="Tamanho">
            <Input value={size} onChange={(e) => setSize(e.target.value)} required />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Nome do produto">
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>
          </div>
          <Field label="Categoria">
            <Input value={category} onChange={(e) => setCategory(e.target.value)} />
          </Field>
          <Field label="Stock atual">
            <Input type="number" value={stock} onChange={(e) => setStock(e.target.value)} />
          </Field>
          <Field label="Custo">
            <Input value={cost} onChange={(e) => setCost(e.target.value)} />
          </Field>
          <Field label="Frete">
            <Input value={freight} onChange={(e) => setFreight(e.target.value)} />
          </Field>
          <Field label="IPI">
            <Input value={ipi} onChange={(e) => setIpi(e.target.value)} />
          </Field>
          <Field label="Embalagem">
            <Input value={packaging} onChange={(e) => setPackaging(e.target.value)} />
          </Field>
          <Field label="Margem % (ex.: 0.8)">
            <Input value={marginPct} onChange={(e) => setMarginPct(e.target.value)} />
          </Field>
          <Field label="Preço sugerido">
            <Input value={suggestedPrice} onChange={(e) => setSuggestedPrice(e.target.value)} />
          </Field>
          <Field label="Preço mínimo">
            <Input value={minPrice} onChange={(e) => setMinPrice(e.target.value)} />
          </Field>
          <Field label="Taxa 3x">
            <Input value={fee3x} onChange={(e) => setFee3x(e.target.value)} />
          </Field>
          <Field label="3x sem juros (preço)">
            <Input value={price3x} onChange={(e) => setPrice3x(e.target.value)} />
          </Field>
          <Field label="Taxa 12x">
            <Input value={fee12x} onChange={(e) => setFee12x(e.target.value)} />
          </Field>
          <Field label="12x sem juros (preço)">
            <Input value={price12x} onChange={(e) => setPrice12x(e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={busy}>
              Guardar
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
