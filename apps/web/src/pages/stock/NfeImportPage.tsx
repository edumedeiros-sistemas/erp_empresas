import { Button, Card, Field, PageTitle } from '@/components/Ui'
import { db } from '@/firebase'
import { clearImportTestData } from '@/lib/clearImportTestData'
import { productDraftsCol, supplierDraftsCol } from '@/lib/firestorePaths'
import { importNFeXmlToOrg } from '@/lib/nfeImport'
import { emitTradeNameFromNfe, parseNFeXml } from '@/lib/nfeXml'
import { formatBrazilTaxIdForDisplay } from '@/lib/taxIdBr'
import { useOrg } from '@/contexts/OrgContext'
import type { ProductDraft, SupplierDraft } from '@/types'
import { deleteDoc, doc, onSnapshot, query, type Timestamp } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

export default function NfeImportPage() {
  const { orgId, organization } = useOrg()
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [clearBusy, setClearBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<string | null>(null)
  const [pendingDrafts, setPendingDrafts] = useState<ProductDraft[]>([])
  const [pendingSupplierDrafts, setPendingSupplierDrafts] = useState<SupplierDraft[]>([])

  useEffect(() => {
    if (!orgId) return
    const q = query(productDraftsCol(db, orgId))
    return onSnapshot(q, (snap) => {
      const list: ProductDraft[] = []
      for (const d of snap.docs) {
        const x = d.data() as Record<string, unknown>
        if (x.needsCompletion !== true) continue
        list.push({
          id: d.id,
          code: String(x.code ?? ''),
          name: String(x.name ?? ''),
          size: String(x.size ?? ''),
          unit: String(x.unit ?? ''),
          lastQty: Number(x.lastQty ?? 0),
          lastUnitCost: Number(x.lastUnitCost ?? 0),
          lastLineTotal: Number(x.lastLineTotal ?? 0),
          nfeChave: x.nfeChave as string | null | undefined,
          nfeNNF: x.nfeNNF as string | null | undefined,
          nfeSerie: x.nfeSerie as string | null | undefined,
          nfeItem: x.nfeItem as number | undefined,
          needsCompletion: true,
          matchNote: String(x.matchNote ?? ''),
          createdAt: x.createdAt as ProductDraft['createdAt'],
        })
      }
      list.sort((a, b) => {
        const ta = (a.createdAt as Timestamp | undefined)?.seconds ?? 0
        const tb = (b.createdAt as Timestamp | undefined)?.seconds ?? 0
        return tb - ta
      })
      setPendingDrafts(list)
    })
  }, [orgId])

  useEffect(() => {
    if (!orgId) return
    const q = query(supplierDraftsCol(db, orgId))
    return onSnapshot(q, (snap) => {
      const list: SupplierDraft[] = []
      for (const d of snap.docs) {
        const x = d.data() as Record<string, unknown>
        if (x.needsCompletion !== true) continue
        list.push({
          id: d.id,
          cnpj: String(x.cnpj ?? ''),
          tradeName: String(x.tradeName ?? ''),
          legalName: String(x.legalName ?? ''),
          stateRegistration: String(x.stateRegistration ?? ''),
          nfeChave: x.nfeChave as string | null | undefined,
          nfeNNF: x.nfeNNF as string | null | undefined,
          nfeSerie: x.nfeSerie as string | null | undefined,
          needsCompletion: true,
          createdAt: x.createdAt as SupplierDraft['createdAt'],
        })
      }
      list.sort((a, b) => {
        const ta = (a.createdAt as Timestamp | undefined)?.seconds ?? 0
        const tb = (b.createdAt as Timestamp | undefined)?.seconds ?? 0
        return tb - ta
      })
      setPendingSupplierDrafts(list)
    })
  }, [orgId])

  async function copyOrgId() {
    if (!orgId) return
    try {
      await navigator.clipboard.writeText(orgId)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !orgId) return
    if (!file.name.toLowerCase().endsWith('.xml')) {
      setMessage('Use um ficheiro .xml da NF-e (Danfe em XML / XML autorizado).')
      return
    }
    setBusy(true)
    setMessage(null)
    setLastResult(null)
    try {
      const text = await file.text()
      const parsed = parseNFeXml(text)
      const emitTrade = emitTradeNameFromNfe(parsed)
      const itemsWithIpi = parsed.items.filter((i) => i.vIPI > 0)
      const totalIpi = itemsWithIpi.reduce((s, i) => s + i.vIPI, 0)
      const res = await importNFeXmlToOrg(orgId, parsed)
      const ipiSummary =
        itemsWithIpi.length > 0
          ? ` · IPI lido em ${itemsWithIpi.length} item(ns) (total R$ ${totalIpi.toFixed(2)} na nota)` +
            (res.productsIpiUpdated > 0
              ? ` · IPI gravado em ${res.productsIpiUpdated} produto(s) cadastrado(s)`
              : res.draftsCreated > 0
                ? ' · IPI sugerido nos pré-cadastros (complete em Produtos)'
                : '')
          : ''
      const brandSummary = emitTrade
        ? ` · Marca/fornecedor (xFant): ${emitTrade}`
        : ' · Aviso: nome fantasia do emitente não encontrado no XML'
      setLastResult(
        `Nota ${res.nNF ?? '?'} série ${res.serie ?? '?'} · ${res.stockLines} linha(s) deram entrada em stock · ` +
          `${res.draftsCreated} pré-cadastro(s) de produto` +
          brandSummary +
          ipiSummary +
          ' · ' +
          (res.supplierDraftCreated ? '1 pré-cadastro de fornecedor criado.' : 'Fornecedor já cadastrado ou pré-cadastro já existente para esta nota.'),
      )
      if (res.draftsCreated === 0 && !res.supplierDraftCreated) {
        setMessage('Importação concluída. Produtos associados; fornecedor já existia ou não há dados de emitente para pré-cadastro.')
      } else if (res.draftsCreated === 0) {
        setMessage('Importação concluída. Todos os códigos bateram com produtos cadastrados. Complete o fornecedor em Marcas se aparecer abaixo.')
      } else {
        setMessage('Importação concluída. Veja abaixo produtos e/ou fornecedor a completar.')
      }
      if (res.errors.length > 0) {
        setMessage((prev) => [prev, ...res.errors].filter(Boolean).join(' '))
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Erro ao processar a NF-e.')
    } finally {
      setBusy(false)
    }
  }

  async function dismissDraft(id: string) {
    if (!orgId) return
    if (!confirm('Remover este pré-cadastro? (Não apaga o produto se já existir.)')) return
    await deleteDoc(doc(productDraftsCol(db, orgId), id))
  }

  async function dismissSupplierDraft(id: string) {
    if (!orgId) return
    if (!confirm('Remover este pré-cadastro de fornecedor?')) return
    await deleteDoc(doc(supplierDraftsCol(db, orgId), id))
  }

  async function runClearImportTest() {
    if (!orgId) return
    if (
      !confirm(
        'Isto apaga nesta empresa: movimentos de stock NF-e (tipo nfe_in, revertendo quantidades no stock), todas as contas a pagar, pré-cadastros de produto e pré-cadastros de fornecedor. Não apaga organizações, utilizadores, membros, clientes nem vendas. Continuar?',
      )
    )
      return
    if (!confirm('Confirme novamente para executar a limpeza.')) return
    setClearBusy(true)
    setMessage(null)
    setLastResult(null)
    try {
      const r = await clearImportTestData(db, orgId)
      setLastResult(
        `Limpeza concluída: ${r.nfeMovementsRemoved} movimento(s) NF-e removido(s), stock revertido em ${r.productsStockAdjusted} produto(s), ${r.payablesRemoved} conta(s) a pagar, ${r.draftsRemoved} pré-cadastro(s) de produto, ${r.supplierDraftsRemoved} pré-cadastro(s) de fornecedor.`,
      )
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Erro ao limpar.')
    } finally {
      setClearBusy(false)
    }
  }

  return (
    <div>
      <PageTitle
        title="Entrada por NF-e (XML)"
        subtitle="Envie o XML da nota fiscal para dar entrada automática no stock. Códigos iguais ao cadastro de produtos são associados; os restantes geram pré-cadastro."
      />

      {orgId ? (
        <Card className="mb-4 max-w-2xl">
          <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">Empresa</div>
          <div className="mt-1 text-sm font-semibold">{organization?.name ?? '—'}</div>
          <div className="mt-2 text-xs text-zinc-500">Org ID</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 break-all font-mono text-xs text-zinc-800 dark:text-zinc-200">
            {orgId}
            <Button type="button" variant="secondary" className="shrink-0 px-2 py-1 text-xs" onClick={() => void copyOrgId()}>
              {copied ? 'Copiado' : 'Copiar'}
            </Button>
          </div>
        </Card>
      ) : null}

      {orgId ? (
        <Card className="mb-6 max-w-2xl border-amber-200 bg-amber-50/40 dark:border-amber-900 dark:bg-amber-950/20">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Limpeza para novo teste de NF-e</h2>
          <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
            Remove nesta empresa: entradas de stock geradas por NF-e (reverte o stock dos produtos), todas as contas a pagar, pré-cadastros de produto e pré-cadastros de fornecedor. Não altera organizações, utilizadores, membros, clientes nem vendas.
          </p>
          <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
            Campos de custo ou frete nos produtos não são revertidos automaticamente.
          </p>
          <Button
            type="button"
            variant="danger"
            className="mt-3"
            disabled={busy || clearBusy}
            onClick={() => void runClearImportTest()}
          >
            {clearBusy ? 'A limpar…' : 'Limpar dados de teste da NF-e'}
          </Button>
        </Card>
      ) : null}

      <Card className="mb-6 max-w-2xl">
        <h2 className="mb-2 text-sm font-semibold text-zinc-800 dark:text-zinc-200">Como funciona</h2>
        <ul className="list-inside list-disc space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
          <li>
            Formato aceite: <strong className="text-zinc-800 dark:text-zinc-200">XML</strong> da NF-e (ex.: ficheiro recebido da contabilidade ou portal da SEFAZ).
          </li>
          <li>
            O sistema lê o <strong className="text-zinc-800 dark:text-zinc-200">código do produto (cProd)</strong> e compara com o campo{' '}
            <strong className="text-zinc-800 dark:text-zinc-200">Código</strong> no cadastro.
          </li>
          <li>
            Se existir um único produto com esse código: <strong className="text-zinc-800 dark:text-zinc-200">entrada de stock</strong> + movimento tipo NF-e.
          </li>
          <li>
            Se houver vários tamanhos para o mesmo código: tenta deduzir o tamanho na descrição da nota (G, M, GG…). Se não der, cria{' '}
            <strong className="text-zinc-800 dark:text-zinc-200">pré-cadastro</strong>.
          </li>
          <li>
            Se não existir: cria <strong className="text-zinc-800 dark:text-zinc-200">pré-cadastro</strong> com quantidade e custo da nota para concluir em Produtos.
          </li>
          <li>
            O <strong className="text-zinc-800 dark:text-zinc-200">frete</strong> usa o valor por linha em <strong className="text-zinc-800 dark:text-zinc-200">prod/vFrete</strong> quando existir; caso contrário, divide o total <strong className="text-zinc-800 dark:text-zinc-200">ICMSTot/vFrete</strong> entre as linhas. O campo <strong className="text-zinc-800 dark:text-zinc-200">Frete</strong> do produto fica em R$/unidade (e o custo total é recalculado).
          </li>
          <li>
            O <strong className="text-zinc-800 dark:text-zinc-200">IPI de cada item</strong> (det/imposto/IPI) é lido por linha e gravado no campo{' '}
            <strong className="text-zinc-800 dark:text-zinc-200">IPI</strong> do produto (valor por unidade = vIPI ÷ quantidade). Nos pré-cadastros, o IPI sugerido também é guardado.
          </li>
          <li>
            A <strong className="text-zinc-800 dark:text-zinc-200">marca</strong> do produto é preenchida com o{' '}
            <strong className="text-zinc-800 dark:text-zinc-200">nome fantasia do emitente</strong> (emit/xFant), o mesmo valor do campo nome fantasia no cadastro de fornecedor.
          </li>
          <li>
            O <strong className="text-zinc-800 dark:text-zinc-200">emitente</strong> da nota (CNPJ, nome fantasia, razão social, IE) gera um{' '}
            <strong className="text-zinc-800 dark:text-zinc-200">pré-cadastro de fornecedor</strong> em Marcas, se ainda não existir fornecedor com o mesmo CNPJ/CPF; complete telefone e demais dados à mão.
          </li>
          <li>
            Se existir <strong className="text-zinc-800 dark:text-zinc-200">cobrança com duplicatas</strong> (grupo <strong className="text-zinc-800 dark:text-zinc-200">cobr/dup</strong> no XML), em <strong className="text-zinc-800 dark:text-zinc-200">Contas a pagar</strong> são criadas{' '}
            <strong className="text-zinc-800 dark:text-zinc-200">várias parcelas</strong> com valor e vencimento de cada duplicata; caso contrário, gera-se um único lançamento com o total da nota.
          </li>
        </ul>
      </Card>

      <Card className="mb-6 max-w-xl">
        <Field label="Ficheiro XML da NF-e">
          <input
            type="file"
            accept=".xml,application/xml,text/xml"
            disabled={busy}
            onChange={(e) => void onFileChange(e)}
            className="block w-full text-sm text-zinc-600 file:mr-4 file:rounded-lg file:border-0 file:bg-violet-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-violet-700 dark:text-zinc-400"
          />
        </Field>
        {busy ? <p className="text-sm text-zinc-500">A processar…</p> : null}
        {message ? <p className="mt-2 text-sm text-amber-800 dark:text-amber-200">{message}</p> : null}
        {lastResult ? <p className="mt-2 text-sm font-medium text-emerald-800 dark:text-emerald-200">{lastResult}</p> : null}
      </Card>

      <Card>
        <h2 className="mb-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Produtos a completar cadastro</h2>
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          Após cada importação, os itens que não puderam associar a um produto existente aparecem aqui. Use &quot;Completar&quot; para abrir o formulário já preenchido com dados da nota.
        </p>
        {pendingDrafts.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhum pré-cadastro pendente.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                <tr>
                  <th className="px-3 py-2">Código</th>
                  <th className="px-3 py-2">Descrição (NF-e)</th>
                  <th className="px-3 py-2">Tam.</th>
                  <th className="px-3 py-2 text-right">Qtd NF</th>
                  <th className="px-3 py-2 text-right">Custo unit.</th>
                  <th className="px-3 py-2">Nota</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {pendingDrafts.map((d) => (
                  <tr key={d.id} className="border-b border-zinc-100 dark:border-zinc-900">
                    <td className="px-3 py-2 font-mono text-xs">{d.code}</td>
                    <td className="max-w-[200px] truncate px-3 py-2" title={d.name}>
                      {d.name}
                    </td>
                    <td className="px-3 py-2">{d.size}</td>
                    <td className="px-3 py-2 text-right">{d.lastQty}</td>
                    <td className="px-3 py-2 text-right">
                      {d.lastUnitCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-500">
                      {d.nfeNNF ? `NF ${d.nfeNNF}` : ''} {d.matchNote ? `· ${d.matchNote}` : ''}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <Link to={`/app/cadastros/produtos/novo?draft=${d.id}`}>
                        <Button type="button" className="mr-2 text-xs py-1">
                          Completar
                        </Button>
                      </Link>
                      <Button type="button" variant="ghost" className="text-xs py-1 text-red-600" onClick={() => void dismissDraft(d.id)}>
                        Descartar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="mb-6">
        <h2 className="mb-1 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Fornecedor (emitente) a completar</h2>
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          Dados fiscais vindos da NF-e; use &quot;Completar&quot; para abrir o cadastro em Marcas e preencher telefone e o que faltar.
        </p>
        {pendingSupplierDrafts.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhum pré-cadastro de fornecedor pendente.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                <tr>
                  <th className="px-3 py-2">CNPJ/CPF</th>
                  <th className="px-3 py-2">Fantasia</th>
                  <th className="px-3 py-2">Razão social</th>
                  <th className="px-3 py-2">IE</th>
                  <th className="px-3 py-2">Nota</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {pendingSupplierDrafts.map((d) => (
                  <tr key={d.id} className="border-b border-zinc-100 dark:border-zinc-900">
                    <td className="px-3 py-2 font-mono text-xs">{d.cnpj ? formatBrazilTaxIdForDisplay(d.cnpj) : '—'}</td>
                    <td className="max-w-[140px] truncate px-3 py-2" title={d.tradeName}>
                      {d.tradeName || '—'}
                    </td>
                    <td className="max-w-[160px] truncate px-3 py-2" title={d.legalName}>
                      {d.legalName || '—'}
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-600">{d.stateRegistration || '—'}</td>
                    <td className="px-3 py-2 text-xs text-zinc-500">
                      {d.nfeNNF ? `NF ${d.nfeNNF}` : ''}
                      {d.nfeSerie ? ` s. ${d.nfeSerie}` : ''}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <Link to={`/app/cadastros/marcas/novo?draft=${d.id}`}>
                        <Button type="button" className="mr-2 text-xs py-1">
                          Completar
                        </Button>
                      </Link>
                      <Button
                        type="button"
                        variant="ghost"
                        className="text-xs py-1 text-red-600"
                        onClick={() => void dismissSupplierDraft(d.id)}
                      >
                        Descartar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
