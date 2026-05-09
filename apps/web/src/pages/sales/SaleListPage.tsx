import { Button, PageTitle } from '@/components/Ui'
import { db } from '@/firebase'
import { salesCol } from '@/lib/firestorePaths'
import { deleteSale } from '@/lib/saleOps'
import { useOrg } from '@/contexts/OrgContext'
import type { Sale } from '@/types'
import { onSnapshot, orderBy, query } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

export default function SaleListPage() {
  const { orgId } = useOrg()
  const [rows, setRows] = useState<(Sale & { id: string })[]>([])
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    if (!orgId) return
    const q = query(salesCol(db, orgId), orderBy('date', 'desc'))
    return onSnapshot(q, (snap) => {
      setRows(
        snap.docs.map((d) => {
          const x = d.data() as Record<string, unknown>
          return {
            id: d.id,
            clientId: String(x.clientId ?? ''),
            clientName: String(x.clientName ?? ''),
            date: x.date as Sale['date'],
            paymentMethod: String(x.paymentMethod ?? ''),
            status: String(x.status ?? ''),
            amountReceived: Number(x.amountReceived ?? 0),
            amountPending: Number(x.amountPending ?? 0),
            subtotal: Number(x.subtotal ?? 0),
            totalProfit: Number(x.totalProfit ?? 0),
          }
        }),
      )
    })
  }, [orgId])

  async function onDelete(saleId: string) {
    if (!orgId) return
    if (!confirm('Apagar esta venda? Stock e totais serão revertidos.')) return
    setDeleting(saleId)
    try {
      await deleteSale(orgId, saleId)
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div>
      <PageTitle
        title="Vendas"
        subtitle="Pedidos com linhas de produto."
        actions={
          <Link to="/app/vendas/nova">
            <Button>Nova venda</Button>
          </Link>
        }
      />
      <div className="space-y-2">
        {rows.map((s) => (
          <div
            key={s.id}
            className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <div className="font-medium">{s.clientName}</div>
              <div className="text-xs text-zinc-500">
                {s.date?.toDate?.().toLocaleDateString('pt-BR') ?? '—'} · {s.paymentMethod} · {s.status}
              </div>
              <div className="mt-1 text-sm">
                Total{' '}
                <span className="font-semibold">
                  {s.subtotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="danger" type="button" disabled={deleting === s.id} onClick={() => void onDelete(s.id)}>
                {deleting === s.id ? '…' : 'Apagar'}
              </Button>
            </div>
          </div>
        ))}
        {rows.length === 0 ? <p className="text-sm text-zinc-500">Sem vendas.</p> : null}
      </div>
    </div>
  )
}
