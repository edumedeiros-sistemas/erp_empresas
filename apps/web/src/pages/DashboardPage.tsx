import { Card, PageTitle } from '@/components/Ui'
import { db } from '@/firebase'
import { dashboardDoc } from '@/lib/firestorePaths'
import { useOrg } from '@/contexts/OrgContext'
import type { DashboardStats } from '@/types'
import { onSnapshot } from 'firebase/firestore'
import { useEffect, useState } from 'react'

function money(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function DashboardPage() {
  const { orgId } = useOrg()
  const [stats, setStats] = useState<DashboardStats | null>(null)

  useEffect(() => {
    if (!orgId) return
    return onSnapshot(dashboardDoc(db, orgId), (snap) => {
      if (!snap.exists()) {
        setStats(null)
        return
      }
      const d = snap.data() as Record<string, unknown>
      setStats({
        revenueTotal: Number(d.revenueTotal ?? 0),
        profitTotal: Number(d.profitTotal ?? 0),
        saleCount: Number(d.saleCount ?? 0),
        avgTicket: Number(d.avgTicket ?? 0),
        paymentMix: (d.paymentMix as Record<string, number>) ?? {},
        financialIn: Number(d.financialIn ?? 0),
        financialOut: Number(d.financialOut ?? 0),
      })
    })
  }, [orgId])

  const saldo = (stats?.financialIn ?? 0) - (stats?.financialOut ?? 0)

  return (
    <div>
      <PageTitle title="Resumo" subtitle="Indicadores da empresa (atualizados com vendas e financeiro)." />
      {!stats ? (
        <p className="text-sm text-zinc-500">Sem dados ainda.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <div className="text-xs font-medium uppercase text-zinc-500">Faturamento</div>
            <div className="mt-1 text-2xl font-semibold">{money(stats.revenueTotal)}</div>
          </Card>
          <Card>
            <div className="text-xs font-medium uppercase text-zinc-500">Lucro (vendas)</div>
            <div className="mt-1 text-2xl font-semibold">{money(stats.profitTotal)}</div>
          </Card>
          <Card>
            <div className="text-xs font-medium uppercase text-zinc-500">Vendas</div>
            <div className="mt-1 text-2xl font-semibold">{stats.saleCount}</div>
          </Card>
          <Card>
            <div className="text-xs font-medium uppercase text-zinc-500">Ticket médio</div>
            <div className="mt-1 text-2xl font-semibold">{money(stats.avgTicket)}</div>
          </Card>
          <Card>
            <div className="text-xs font-medium uppercase text-zinc-500">Total entradas (fin.)</div>
            <div className="mt-1 text-2xl font-semibold text-emerald-700 dark:text-emerald-400">
              {money(stats.financialIn)}
            </div>
          </Card>
          <Card>
            <div className="text-xs font-medium uppercase text-zinc-500">Total saídas (fin.)</div>
            <div className="mt-1 text-2xl font-semibold text-red-700 dark:text-red-400">
              {money(stats.financialOut)}
            </div>
          </Card>
          <Card className="sm:col-span-2 lg:col-span-3">
            <div className="text-xs font-medium uppercase text-zinc-500">Saldo (entradas − saídas)</div>
            <div className="mt-1 text-2xl font-semibold">{money(saldo)}</div>
          </Card>
          <Card className="sm:col-span-2 lg:col-span-3">
            <div className="mb-2 text-xs font-medium uppercase text-zinc-500">Faturamento por forma de pagamento</div>
            {Object.keys(stats.paymentMix).length === 0 ? (
              <p className="text-sm text-zinc-500">Sem vendas registadas.</p>
            ) : (
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {Object.entries(stats.paymentMix).map(([k, v]) => (
                  <li key={k} className="flex justify-between py-2 text-sm">
                    <span>{k}</span>
                    <span className="font-medium">{money(v)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}
