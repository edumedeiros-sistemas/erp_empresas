import { Button, PageTitle } from '@/components/Ui'
import { db } from '@/firebase'
import { productsCol } from '@/lib/firestorePaths'
import { useOrg } from '@/contexts/OrgContext'
import type { Product } from '@/types'
import { onSnapshot, orderBy, query } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

export default function ProductListPage() {
  const { orgId } = useOrg()
  const [rows, setRows] = useState<Product[]>([])

  useEffect(() => {
    if (!orgId) return
    const q = query(productsCol(db, orgId), orderBy('code'))
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => {
          const x = d.data() as Record<string, unknown>
          return {
            id: d.id,
            code: String(x.code ?? ''),
            name: String(x.name ?? ''),
            size: String(x.size ?? ''),
            category: String(x.category ?? ''),
            cost: Number(x.cost ?? 0),
            freight: Number(x.freight ?? 0),
            ipi: Number(x.ipi ?? 0),
            packaging: Number(x.packaging ?? 0),
            totalCost: Number(x.totalCost ?? 0),
            marginPct: Number(x.marginPct ?? 0),
            suggestedPrice: Number(x.suggestedPrice ?? 0),
            minPrice: Number(x.minPrice ?? 0),
            fee3x: Number(x.fee3x ?? 0),
            price3x: Number(x.price3x ?? 0),
            fee12x: Number(x.fee12x ?? 0),
            price12x: Number(x.price12x ?? 0),
            stock: Number(x.stock ?? 0),
          }
      })
      list.sort((a, b) => a.code.localeCompare(b.code) || a.size.localeCompare(b.size))
      setRows(list)
    })
  }, [orgId])

  const sorted = useMemo(() => [...rows], [rows])

  return (
    <div>
      <PageTitle
        title="Produtos"
        subtitle="Por código e tamanho (SKU)."
        actions={
          <Link to="/app/produtos/novo">
            <Button>Novo produto</Button>
          </Link>
        }
      />
      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
            <tr>
              <th className="px-3 py-2">Código</th>
              <th className="px-3 py-2">Produto</th>
              <th className="px-3 py-2">Tam.</th>
              <th className="px-3 py-2 text-right">Stock</th>
              <th className="hidden px-3 py-2 text-right md:table-cell">Custo total</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.id} className="border-b border-zinc-100 dark:border-zinc-900">
                <td className="px-3 py-2 font-mono text-xs">{p.code}</td>
                <td className="px-3 py-2">
                  <Link className="font-medium text-violet-700 hover:underline dark:text-violet-300" to={`/app/produtos/${p.id}`}>
                    {p.name}
                  </Link>
                </td>
                <td className="px-3 py-2">{p.size}</td>
                <td className="px-3 py-2 text-right">{p.stock}</td>
                <td className="hidden px-3 py-2 text-right md:table-cell">
                  {p.totalCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
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
