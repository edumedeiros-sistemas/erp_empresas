import { ListFilterBar } from '@/components/ListFilterBar'
import { Button, Input, Label, PageTitle } from '@/components/Ui'
import { db } from '@/firebase'
import { deleteProductForOrg } from '@/lib/deleteProductForOrg'
import { productsCol } from '@/lib/firestorePaths'
import { normalizeSearch, textMatches } from '@/lib/listSearch'
import { useOrg } from '@/contexts/OrgContext'
import type { Product } from '@/types'
import { onSnapshot, orderBy, query } from 'firebase/firestore'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

function mapProductDoc(id: string, x: Record<string, unknown>): Product {
  const cost = Number(x.cost ?? 0)
  const freight = Number(x.freight ?? 0)
  const ipi = Number(x.ipi ?? 0)
  const totalStored = Number(x.totalCost ?? 0)
  const totalCost =
    totalStored > 0 ? totalStored : cost + freight + ipi + Number(x.packaging ?? 0)
  const sug = Number(x.suggestedPrice ?? 0)
  const sale = Number(x.salePrice ?? 0)
  return {
    id,
    code: String(x.code ?? ''),
    name: String(x.name ?? ''),
    size: String(x.size ?? ''),
    brand: String(x.brand ?? ''),
    cost,
    freight,
    ipi,
    totalCost,
    salePrice: sale > 0 ? sale : sug,
    suggestedPrice: sug,
    stock: Number(x.stock ?? 0),
  }
}

export default function ProductListPage() {
  const { orgId } = useOrg()
  const [rows, setRows] = useState<Product[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [codeQuery, setCodeQuery] = useState('')
  const [brandQuery, setBrandQuery] = useState('')
  const [brandFilter, setBrandFilter] = useState('')
  const [brandOpen, setBrandOpen] = useState(false)
  const brandBoxRef = useRef<HTMLDivElement>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [listError, setListError] = useState<string | null>(null)

  const uniqueBrands = useMemo(() => {
    const set = new Set<string>()
    for (const p of rows) {
      const b = p.brand.trim()
      if (b) set.add(b)
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'pt', { sensitivity: 'base' }))
  }, [rows])

  const brandSuggestions = useMemo(() => {
    const q = normalizeSearch(brandQuery)
    if (!q) return uniqueBrands.slice(0, 20)
    return uniqueBrands.filter((b) => normalizeSearch(b).includes(q)).slice(0, 20)
  }, [uniqueBrands, brandQuery])

  const filtered = useMemo(() => {
    return rows.filter((p) => {
      if (brandFilter) {
        if (normalizeSearch(p.brand) !== normalizeSearch(brandFilter)) return false
      } else if (brandQuery.trim() && !textMatches(brandQuery, p.brand)) {
        return false
      }
      if (codeQuery.trim() && !textMatches(codeQuery, p.code)) return false
      if (searchQuery.trim() && !textMatches(searchQuery, p.name, p.size)) return false
      return true
    })
  }, [rows, brandFilter, brandQuery, codeQuery, searchQuery])

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!brandBoxRef.current?.contains(e.target as Node)) setBrandOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [])

  function pickBrand(brand: string) {
    setBrandFilter(brand)
    setBrandQuery(brand)
    setBrandOpen(false)
  }

  function onBrandInputChange(value: string) {
    setBrandQuery(value)
    if (brandFilter && normalizeSearch(value) !== normalizeSearch(brandFilter)) {
      setBrandFilter('')
    }
    setBrandOpen(true)
  }

  function clearBrandFilter() {
    setBrandFilter('')
    setBrandQuery('')
    setBrandOpen(false)
  }

  async function handleDeleteRow(p: Product, e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!orgId) return
    const label = `${p.code || '?'} · ${p.name || 'sem nome'}`
    if (
      !confirm(
        `Excluir o produto "${label}"? Os movimentos de stock deste produto serão apagados. Vendas antigas podem continuar a referenciar este produto.`,
      )
    )
      return
    if (!confirm('Confirme novamente: excluir definitivamente?')) return
    setListError(null)
    setDeletingId(p.id)
    try {
      await deleteProductForOrg(db, orgId, p.id)
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Não foi possível excluir.')
    } finally {
      setDeletingId(null)
    }
  }

  useEffect(() => {
    if (!orgId) return
    const q = query(productsCol(db, orgId), orderBy('code'))
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => mapProductDoc(d.id, d.data() as Record<string, unknown>))
      list.sort((a, b) => a.code.localeCompare(b.code) || a.size.localeCompare(b.size))
      setRows(list)
    })
  }, [orgId])

  return (
    <div>
      <PageTitle
        title="Produtos"
        subtitle="Código, tamanho, nome, marca, custos e preços."
        actions={
          <Link to="/app/cadastros/produtos/novo">
            <Button>Novo produto</Button>
          </Link>
        }
      />
      {listError ? (
        <p className="mb-3 text-sm text-red-700 dark:text-red-300" role="alert">
          {listError}
        </p>
      ) : null}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <ListFilterBar
          label="Buscar produto"
          placeholder="Nome ou tamanho…"
          value={searchQuery}
          onChange={setSearchQuery}
        />
        <ListFilterBar
          label="Código"
          placeholder="Digite o código…"
          value={codeQuery}
          onChange={setCodeQuery}
        />
        <div ref={brandBoxRef}>
          <Label>Marca</Label>
          <div className="relative flex gap-1">
            <Input
              autoComplete="off"
              className="flex-1"
              value={brandQuery}
              placeholder="Digite a marca…"
              onChange={(e) => onBrandInputChange(e.target.value)}
              onFocus={() => setBrandOpen(true)}
            />
            {brandFilter ? (
              <Button type="button" variant="secondary" className="shrink-0 px-2" onClick={clearBrandFilter}>
                Limpar
              </Button>
            ) : null}
          </div>
          {brandOpen && brandSuggestions.length > 0 ? (
            <ul
              className="absolute z-30 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-zinc-200 bg-white py-1 text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
              role="listbox"
            >
              {brandSuggestions.map((b) => (
                <li key={b}>
                  <button
                    type="button"
                    className="flex w-full px-3 py-2 text-left hover:bg-violet-50 dark:hover:bg-violet-950/40"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pickBrand(b)}
                  >
                    {b}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {brandOpen && brandQuery.trim() && brandSuggestions.length === 0 ? (
            <p className="absolute z-30 mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-500 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
              Nenhuma marca encontrada.
            </p>
          ) : null}
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
            <tr>
              <th className="px-3 py-2">Código</th>
              <th className="px-3 py-2">Produto</th>
              <th className="px-3 py-2">Tam.</th>
              <th className="hidden px-3 py-2 md:table-cell">Marca</th>
              <th className="px-3 py-2 text-right">Stock</th>
              <th className="hidden px-3 py-2 text-right lg:table-cell">P. venda</th>
              <th className="hidden px-3 py-2 text-right lg:table-cell">Sugerido</th>
              <th className="px-3 py-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-b border-zinc-100 dark:border-zinc-900">
                <td className="px-3 py-2 font-mono text-xs">{p.code}</td>
                <td className="px-3 py-2">
                  <Link className="font-medium text-violet-700 hover:underline dark:text-violet-300" to={`/app/cadastros/produtos/${p.id}`}>
                    {p.name}
                  </Link>
                  {p.brand ? <div className="text-xs text-zinc-500 md:hidden">{p.brand}</div> : null}
                </td>
                <td className="px-3 py-2">{p.size}</td>
                <td className="hidden px-3 py-2 md:table-cell">{p.brand || '—'}</td>
                <td className="px-3 py-2 text-right">{p.stock}</td>
                <td className="hidden px-3 py-2 text-right lg:table-cell">
                  {p.salePrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </td>
                <td className="hidden px-3 py-2 text-right lg:table-cell">
                  {p.suggestedPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <Link
                    to={`/app/cadastros/produtos/${p.id}`}
                    className="mr-1 inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                  >
                    Editar
                  </Link>
                  <Button
                    type="button"
                    variant="ghost"
                    className="px-2 py-1 text-xs text-red-600 hover:text-red-700 dark:text-red-400"
                    disabled={deletingId !== null}
                    onClick={(e) => void handleDeleteRow(p, e)}
                  >
                    {deletingId === p.id ? '…' : 'Excluir'}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-zinc-500">Sem produtos.</p>
        ) : filtered.length === 0 ? (
          <p className="p-4 text-sm text-zinc-500">Nenhum produto encontrado para os filtros aplicados.</p>
        ) : null}
      </div>
    </div>
  )
}
