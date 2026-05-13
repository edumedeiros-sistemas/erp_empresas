import { Button, PageTitle } from '@/components/Ui'
import { db } from '@/firebase'
import { deleteProductForOrg } from '@/lib/deleteProductForOrg'
import { productsCol } from '@/lib/firestorePaths'
import { useOrg } from '@/contexts/OrgContext'
import type { Product } from '@/types'
import { onSnapshot, orderBy, query } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
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
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [listError, setListError] = useState<string | null>(null)

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

  const sorted = useMemo(() => [...rows], [rows])

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
            {sorted.map((p) => (
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
        {rows.length === 0 ? <p className="p-4 text-sm text-zinc-500">Sem produtos.</p> : null}
      </div>
    </div>
  )
}
