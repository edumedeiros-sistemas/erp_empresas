import { Button, Card, Field, Input, PageTitle } from '@/components/Ui'
import { db } from '@/firebase'
import { deleteProductForOrg } from '@/lib/deleteProductForOrg'
import { productDraftsCol, productsCol } from '@/lib/firestorePaths'
import { useOrg } from '@/contexts/OrgContext'
import { deleteDoc, deleteField, doc, getDoc, setDoc } from 'firebase/firestore'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'

function num(s: string) {
  const n = Number(String(s).replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

export default function ProductFormPage() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const draftId = searchParams.get('draft')
  const isNew = id === 'novo' || !id
  const { orgId } = useOrg()
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [size, setSize] = useState('U')
  const [name, setName] = useState('')
  const [brand, setBrand] = useState('')
  const [cost, setCost] = useState('0')
  const [freight, setFreight] = useState('0')
  const [ipi, setIpi] = useState('0')
  const [salePrice, setSalePrice] = useState('0')
  const [suggestedPrice, setSuggestedPrice] = useState('0')
  const [stock, setStock] = useState('0')
  const [busy, setBusy] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    if (!orgId || isNew || !id) return
    let cancelled = false
    ;(async () => {
      const snap = await getDoc(doc(productsCol(db, orgId), id))
      if (cancelled || !snap.exists()) return
      const x = snap.data() as Record<string, unknown>
      setCode(String(x.code ?? ''))
      setSize(String(x.size ?? ''))
      setName(String(x.name ?? ''))
      setBrand(String(x.brand ?? ''))
      setCost(String(x.cost ?? 0))
      setFreight(String(x.freight ?? 0))
      setIpi(String(x.ipi ?? 0))
      const sp = Number(x.salePrice ?? 0)
      const sug = Number(x.suggestedPrice ?? 0)
      setSalePrice(String(sp > 0 ? sp : sug))
      setSuggestedPrice(String(sug))
      setStock(String(x.stock ?? 0))
    })()
    return () => {
      cancelled = true
    }
  }, [orgId, id, isNew])

  useEffect(() => {
    if (!orgId || !isNew || !draftId) return
    let cancelled = false
    ;(async () => {
      const snap = await getDoc(doc(productDraftsCol(db, orgId), draftId))
      if (cancelled || !snap.exists()) return
      const x = snap.data() as Record<string, unknown>
      setCode(String(x.code ?? ''))
      setName(String(x.name ?? ''))
      setSize(String(x.size ?? 'U'))
      const uc = Number(x.lastUnitCost ?? 0)
      setCost(String(uc))
      const fNfe = Number(x.nfeFreightPerUnit ?? 0)
      setFreight(fNfe > 0 ? String(fNfe) : '0')
      const ipiNfe = Number(x.nfeIpiPerUnit ?? 0)
      setIpi(ipiNfe > 0 ? String(ipiNfe) : '0')
      const sug = uc > 0 ? Math.round(uc * 1.8 * 100) / 100 : 0
      setSuggestedPrice(String(sug))
      setSalePrice(String(sug))
      setStock(String(Math.round(Number(x.lastQty ?? 0))))
    })()
    return () => {
      cancelled = true
    }
  }, [orgId, isNew, draftId])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!orgId) return
    setBusy(true)
    try {
      const c = num(cost)
      const fr = num(freight)
      const ip = num(ipi)
      const totalCost = c + fr + ip
      const ref = isNew ? doc(productsCol(db, orgId)) : doc(productsCol(db, orgId), id!)
      await setDoc(
        ref,
        {
          code: code.trim(),
          name: name.trim(),
          size: size.trim(),
          brand: brand.trim(),
          cost: c,
          freight: fr,
          ipi: ip,
          totalCost,
          salePrice: num(salePrice),
          suggestedPrice: num(suggestedPrice),
          stock: Math.round(num(stock)),
          category: deleteField(),
          packaging: deleteField(),
          marginPct: deleteField(),
          minPrice: deleteField(),
          fee3x: deleteField(),
          price3x: deleteField(),
          fee12x: deleteField(),
          price12x: deleteField(),
          nfeFreightPerUnit: deleteField(),
        },
        { merge: true },
      )
      if (orgId && draftId) {
        await deleteDoc(doc(productDraftsCol(db, orgId), draftId))
      }
      navigate('/app/cadastros/produtos')
    } finally {
      setBusy(false)
    }
  }

  async function onDeleteProduct() {
    if (!orgId || !id || isNew) return
    const label = `${code.trim() || '?'} · ${name.trim() || 'sem nome'}`
    if (
      !confirm(
        `Excluir o produto "${label}"? Os movimentos de stock deste produto serão apagados. Linhas de venda antigas podem continuar a referenciar este produto (dados órfãos). Esta ação não pode ser desfeita.`,
      )
    )
      return
    if (!confirm('Confirme novamente: excluir definitivamente este produto?')) return
    setDeleteBusy(true)
    setDeleteError(null)
    try {
      await deleteProductForOrg(db, orgId, id)
      navigate('/app/cadastros/produtos')
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Não foi possível excluir.')
    } finally {
      setDeleteBusy(false)
    }
  }

  return (
    <div>
      <PageTitle
        title={isNew ? (draftId ? 'Completar cadastro (NF-e)' : 'Novo produto') : 'Editar produto'}
        subtitle="Marca será ligada a um cadastro próprio numa próxima versão; por agora escreva o nome da marca."
        actions={
          <Link to="/app/cadastros/produtos">
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
          <div className="sm:col-span-2">
            <Field label="Marca">
              <Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Ex.: Dicorpo" />
            </Field>
          </div>
          <Field label="Custo">
            <Input value={cost} onChange={(e) => setCost(e.target.value)} />
          </Field>
          <Field label="Frete">
            <Input value={freight} onChange={(e) => setFreight(e.target.value)} />
          </Field>
          <Field label="IPI">
            <Input value={ipi} onChange={(e) => setIpi(e.target.value)} />
          </Field>
          <Field label="Preço de venda">
            <Input value={salePrice} onChange={(e) => setSalePrice(e.target.value)} />
          </Field>
          <Field label="Preço sugerido">
            <Input value={suggestedPrice} onChange={(e) => setSuggestedPrice(e.target.value)} />
          </Field>
          <Field label="Stock atual">
            <Input type="number" value={stock} onChange={(e) => setStock(e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={busy || deleteBusy}>
              Guardar
            </Button>
          </div>
        </form>
      </Card>

      {!isNew && id ? (
        <Card className="mt-6 max-w-3xl border-red-200 bg-red-50/30 dark:border-red-900 dark:bg-red-950/20">
          <h2 className="text-sm font-semibold text-red-900 dark:text-red-200">Excluir produto</h2>
          <p className="mt-1 text-sm text-red-900/90 dark:text-red-200/90">
            Remove este cadastro e apaga os movimentos de stock associados a este produto. Não remove vendas nem utilizadores.
          </p>
          {deleteError ? <p className="mt-2 text-sm text-red-700 dark:text-red-300">{deleteError}</p> : null}
          <Button
            type="button"
            variant="danger"
            className="mt-3"
            disabled={busy || deleteBusy}
            onClick={() => void onDeleteProduct()}
          >
            {deleteBusy ? 'A excluir…' : 'Excluir produto'}
          </Button>
        </Card>
      ) : null}
    </div>
  )
}
