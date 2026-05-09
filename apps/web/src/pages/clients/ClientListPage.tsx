import { Button, PageTitle } from '@/components/Ui'
import { db } from '@/firebase'
import { clientsCol } from '@/lib/firestorePaths'
import { useOrg } from '@/contexts/OrgContext'
import type { Client } from '@/types'
import { onSnapshot, orderBy, query } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

export default function ClientListPage() {
  const { orgId } = useOrg()
  const [rows, setRows] = useState<Client[]>([])

  useEffect(() => {
    if (!orgId) return
    const q = query(clientsCol(db, orgId), orderBy('code'))
    return onSnapshot(q, (snap) => {
      setRows(
        snap.docs.map((d) => {
          const x = d.data() as Record<string, unknown>
          return {
            id: d.id,
            code: String(x.code ?? ''),
            name: String(x.name ?? ''),
            phone: String(x.phone ?? ''),
            city: String(x.city ?? ''),
            instagram: String(x.instagram ?? ''),
            registeredAt: (x.registeredAt as Client['registeredAt']) ?? null,
            lastPurchaseAt: (x.lastPurchaseAt as Client['lastPurchaseAt']) ?? null,
            totalPurchased: Number(x.totalPurchased ?? 0),
            purchaseCount: Number(x.purchaseCount ?? 0),
            avgTicket: Number(x.avgTicket ?? 0),
            notes: String(x.notes ?? ''),
          }
        }),
      )
    })
  }, [orgId])

  return (
    <div>
      <PageTitle
        title="Clientes"
        subtitle="Cadastro e histórico agregado."
        actions={
          <Link to="/app/clientes/novo">
            <Button>Novo cliente</Button>
          </Link>
        }
      />
      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
            <tr>
              <th className="px-3 py-2">Código</th>
              <th className="px-3 py-2">Nome</th>
              <th className="hidden px-3 py-2 sm:table-cell">Cidade</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2 text-right">Qtd</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-b border-zinc-100 dark:border-zinc-900">
                <td className="px-3 py-2 font-mono text-xs">{c.code}</td>
                <td className="px-3 py-2">
                  <Link className="font-medium text-violet-700 hover:underline dark:text-violet-300" to={`/app/clientes/${c.id}`}>
                    {c.name}
                  </Link>
                </td>
                <td className="hidden px-3 py-2 sm:table-cell">{c.city}</td>
                <td className="px-3 py-2 text-right">
                  {c.totalPurchased.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </td>
                <td className="px-3 py-2 text-right">{c.purchaseCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <p className="p-4 text-sm text-zinc-500">Sem clientes. Adicione o primeiro.</p> : null}
      </div>
    </div>
  )
}
