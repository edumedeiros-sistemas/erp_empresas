import { Button, PageTitle } from '@/components/Ui'
import { db } from '@/firebase'
import { clientsCol } from '@/lib/firestorePaths'
import { useOrg } from '@/contexts/OrgContext'
import type { Client } from '@/types'
import { deleteDoc, doc, onSnapshot, query } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

export default function ClientListPage() {
  const { orgId } = useOrg()
  const [rows, setRows] = useState<Client[]>([])
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [listError, setListError] = useState<string | null>(null)

  async function handleDeleteRow(c: Client, e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!orgId) return
    const label = c.name || 'cliente'
    if (!confirm(`Excluir o cliente «${label}»? Esta ação não pode ser desfeita.`)) return
    setListError(null)
    setDeletingId(c.id)
    try {
      await deleteDoc(doc(clientsCol(db, orgId), c.id))
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Não foi possível excluir.')
    } finally {
      setDeletingId(null)
    }
  }

  useEffect(() => {
    if (!orgId) return
    const q = query(clientsCol(db, orgId))
    return onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => {
        const x = d.data() as Record<string, unknown>
        return {
          id: d.id,
          name: String(x.name ?? ''),
          phone: String(x.phone ?? ''),
          notes: String(x.notes ?? ''),
          registeredAt: (x.registeredAt as Client['registeredAt']) ?? null,
          lastPurchaseAt: (x.lastPurchaseAt as Client['lastPurchaseAt']) ?? null,
          totalPurchased: Number(x.totalPurchased ?? 0),
          purchaseCount: Number(x.purchaseCount ?? 0),
          avgTicket: Number(x.avgTicket ?? 0),
        }
      })
      list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt', { sensitivity: 'base' }))
      setRows(list)
    })
  }, [orgId])

  return (
    <div>
      <PageTitle
        title="Clientes"
        subtitle="Identificador automático. Nome, telefone e observações."
        actions={
          <Link to="/app/cadastros/clientes/novo">
            <Button>Novo cliente</Button>
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
              <th className="px-3 py-2">Nome</th>
              <th className="hidden px-3 py-2 sm:table-cell">Telefone</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2 text-right">Qtd</th>
              <th className="px-3 py-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-b border-zinc-100 dark:border-zinc-900">
                <td className="px-3 py-2">
                  <Link className="font-medium text-violet-700 hover:underline dark:text-violet-300" to={`/app/cadastros/clientes/${c.id}`}>
                    {c.name || '—'}
                  </Link>
                  <div className="mt-0.5 text-xs text-zinc-500 sm:hidden">{c.phone || '—'}</div>
                </td>
                <td className="hidden px-3 py-2 sm:table-cell">{c.phone || '—'}</td>
                <td className="px-3 py-2 text-right">
                  {c.totalPurchased.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </td>
                <td className="px-3 py-2 text-right">{c.purchaseCount}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  <Link
                    to={`/app/cadastros/clientes/${c.id}`}
                    className="mr-1 inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                  >
                    Editar
                  </Link>
                  <Button
                    type="button"
                    variant="ghost"
                    className="px-2 py-1 text-xs text-red-600 hover:text-red-700 dark:text-red-400"
                    disabled={deletingId !== null}
                    onClick={(e) => void handleDeleteRow(c, e)}
                  >
                    {deletingId === c.id ? '…' : 'Excluir'}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <p className="p-4 text-sm text-zinc-500">Sem clientes. Adicione o primeiro.</p> : null}
      </div>
    </div>
  )
}
