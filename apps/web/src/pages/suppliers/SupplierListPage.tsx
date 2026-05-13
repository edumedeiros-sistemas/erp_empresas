import { Button, PageTitle } from '@/components/Ui'
import { db } from '@/firebase'
import { suppliersCol } from '@/lib/firestorePaths'
import { formatBrazilTaxIdForDisplay } from '@/lib/taxIdBr'
import { useOrg } from '@/contexts/OrgContext'
import type { Supplier } from '@/types'
import { onSnapshot, query } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

export default function SupplierListPage() {
  const { orgId } = useOrg()
  const [rows, setRows] = useState<Supplier[]>([])

  useEffect(() => {
    if (!orgId) return
    const q = query(suppliersCol(db, orgId))
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => {
        const x = d.data() as Record<string, unknown>
        const cnpjRaw = String(x.cnpj ?? '')
        return {
          id: d.id,
          name: String(x.name ?? ''),
          cnpj: cnpjRaw || undefined,
          tradeName: x.tradeName != null ? String(x.tradeName) : undefined,
          legalName: x.legalName != null ? String(x.legalName) : undefined,
          stateRegistration: x.stateRegistration != null ? String(x.stateRegistration) : undefined,
          phone: String(x.phone ?? ''),
          notes: String(x.notes ?? ''),
          createdAt: x.createdAt as Supplier['createdAt'],
        }
      })
      list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt', { sensitivity: 'base' }))
      setRows(list)
    })
  }, [orgId])

  function rowTitle(s: Supplier): string {
    const parts = [s.tradeName, s.legalName].filter(Boolean)
    return parts.length > 0 ? parts.join(' · ') : s.name
  }

  return (
    <div>
      <PageTitle
        title="Marcas / Fornecedores"
        subtitle="Dados fiscais do fornecedor (CNPJ, fantasia, razão social, IE) e uso como referência de marca nos produtos."
        actions={
          <Link to="/app/cadastros/marcas/novo">
            <Button>Novo fornecedor</Button>
          </Link>
        }
      />
      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
            <tr>
              <th className="px-3 py-2">Nome / fantasia</th>
              <th className="hidden px-3 py-2 md:table-cell">CNPJ/CPF</th>
              <th className="hidden px-3 py-2 lg:table-cell">IE</th>
              <th className="hidden px-3 py-2 sm:table-cell">Telefone</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className="border-b border-zinc-100 dark:border-zinc-900">
                <td className="px-3 py-2">
                  <Link
                    className="font-medium text-violet-700 hover:underline dark:text-violet-300"
                    to={`/app/cadastros/marcas/${s.id}`}
                    title={rowTitle(s)}
                  >
                    {s.tradeName || s.name || '—'}
                  </Link>
                  {s.legalName && s.legalName !== s.tradeName ? (
                    <div className="mt-0.5 text-xs text-zinc-500">{s.legalName}</div>
                  ) : null}
                  <div className="mt-0.5 font-mono text-xs text-zinc-500 md:hidden">
                    {s.cnpj ? formatBrazilTaxIdForDisplay(s.cnpj) : '—'}
                  </div>
                </td>
                <td className="hidden px-3 py-2 font-mono text-xs md:table-cell">
                  {s.cnpj ? formatBrazilTaxIdForDisplay(s.cnpj) : '—'}
                </td>
                <td className="hidden px-3 py-2 text-xs text-zinc-600 dark:text-zinc-400 lg:table-cell">
                  {s.stateRegistration || '—'}
                </td>
                <td className="hidden px-3 py-2 sm:table-cell">{s.phone || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-zinc-500">Sem fornecedores. Adicione o primeiro ou importe uma NF-e.</p>
        ) : null}
      </div>
    </div>
  )
}
