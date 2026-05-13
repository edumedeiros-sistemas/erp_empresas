import { Button, Card, PageTitle } from '@/components/Ui'
import { db } from '@/firebase'
import { receivablesCol } from '@/lib/firestorePaths'
import { useOrg } from '@/contexts/OrgContext'
import type { AccountReceivable, ReceivableStatus } from '@/types'
import { doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore'
import { useEffect, useState } from 'react'

type Row = AccountReceivable & { id: string }

export default function ReceivablesPage() {
  const { orgId } = useOrg()
  const [rows, setRows] = useState<Row[]>([])

  useEffect(() => {
    if (!orgId) return
    const q = query(receivablesCol(db, orgId), orderBy('saleDate', 'desc'))
    return onSnapshot(q, (snap) => {
      setRows(
        snap.docs.map((d) => {
          const x = d.data() as Record<string, unknown>
          return {
            id: d.id,
            saleId: String(x.saleId ?? d.id),
            clientId: String(x.clientId ?? ''),
            clientName: String(x.clientName ?? ''),
            amount: Number(x.amount ?? 0),
            installmentCount: Number(x.installmentCount ?? 1),
            paymentMethod: String(x.paymentMethod ?? ''),
            status: ((x.status as ReceivableStatus) ?? 'aberto') as ReceivableStatus,
            saleDate: (x.saleDate as Row['saleDate']) ?? null,
            createdAt: x.createdAt as Row['createdAt'],
            receivedAt: (x.receivedAt as Row['receivedAt']) ?? null,
          }
        }),
      )
    })
  }, [orgId])

  async function markReceived(id: string) {
    if (!orgId) return
    await updateDoc(doc(receivablesCol(db, orgId), id), {
      status: 'recebido',
      receivedAt: serverTimestamp(),
    })
  }

  return (
    <div>
      <PageTitle
        title="Contas a receber"
        subtitle="Criadas automaticamente quando a venda é guardada com forma de pagamento Crediário (valor total da venda e número de parcelas)."
      />
      <Card className="mb-4 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
        O identificador da linha coincide com o ID da venda. Apagar a venda remove também esta conta.
      </Card>
      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
            <tr>
              <th className="px-3 py-2">Cliente</th>
              <th className="px-3 py-2">Data venda</th>
              <th className="px-3 py-2">Parcelas</th>
              <th className="px-3 py-2 text-right">Valor</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-zinc-100 dark:border-zinc-900">
                <td className="px-3 py-2">
                  <div className="font-medium">{r.clientName || '—'}</div>
                  <div className="font-mono text-[10px] text-zinc-500">Venda {r.saleId.slice(0, 8)}…</div>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {r.saleDate?.toDate?.().toLocaleDateString('pt-BR') ?? '—'}
                </td>
                <td className="px-3 py-2">{r.installmentCount}x</td>
                <td className="px-3 py-2 text-right font-medium">
                  {r.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={
                      r.status === 'recebido'
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-amber-700 dark:text-amber-400'
                    }
                  >
                    {r.status === 'recebido' ? 'Recebido' : 'Aberto'}
                  </span>
                </td>
                <td className="px-3 py-2">
                  {r.status === 'aberto' ? (
                    <Button type="button" className="text-xs py-1" onClick={() => void markReceived(r.id)}>
                      Marcar recebido
                    </Button>
                  ) : (
                    <span className="text-xs text-zinc-500">
                      {r.receivedAt?.toDate?.().toLocaleDateString('pt-BR') ?? ''}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-zinc-500">Sem contas a receber. Use Crediário ao registar uma nova venda.</p>
        ) : null}
      </div>
    </div>
  )
}
