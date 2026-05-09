import { Button, Card, Field, PageTitle, TextArea } from '@/components/Ui'
import { db } from '@/firebase'
import { settingsDoc } from '@/lib/firestorePaths'
import { defaultOrgSettings } from '@/lib/defaults'
import { useOrg } from '@/contexts/OrgContext'
import { onSnapshot, setDoc } from 'firebase/firestore'
import { useEffect, useState, type FormEvent } from 'react'

function linesToArray(s: string) {
  return s
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean)
}

function arrayToLines(arr: string[]) {
  return arr.join('\n')
}

export default function SettingsPage() {
  const { orgId } = useOrg()
  const [paymentMethods, setPaymentMethods] = useState('')
  const [saleStatuses, setSaleStatuses] = useState('')
  const [sizes, setSizes] = useState('')
  const [financialCategories, setFinancialCategories] = useState('')
  const [suppliers, setSuppliers] = useState('')
  const [months, setMonths] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!orgId) return
    return onSnapshot(settingsDoc(db, orgId), (snap) => {
      const d = snap.exists() ? (snap.data() as Record<string, unknown>) : null
      const base = d
        ? {
            paymentMethods: (d.paymentMethods as string[]) ?? [],
            saleStatuses: (d.saleStatuses as string[]) ?? [],
            sizes: (d.sizes as string[]) ?? [],
            financialCategories: (d.financialCategories as string[]) ?? [],
            suppliers: (d.suppliers as string[]) ?? [],
            months: (d.months as string[]) ?? [],
          }
        : defaultOrgSettings()
      setPaymentMethods(arrayToLines(base.paymentMethods))
      setSaleStatuses(arrayToLines(base.saleStatuses))
      setSizes(arrayToLines(base.sizes))
      setFinancialCategories(arrayToLines(base.financialCategories))
      setSuppliers(arrayToLines(base.suppliers))
      setMonths(arrayToLines(base.months))
    })
  }, [orgId])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!orgId) return
    setBusy(true)
    try {
      await setDoc(settingsDoc(db, orgId), {
        paymentMethods: linesToArray(paymentMethods),
        saleStatuses: linesToArray(saleStatuses),
        sizes: linesToArray(sizes),
        financialCategories: linesToArray(financialCategories),
        suppliers: linesToArray(suppliers),
        months: linesToArray(months),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PageTitle title="Configuração" subtitle="Listas usadas nos formulários (uma opção por linha)." />
      <Card>
        <form onSubmit={onSubmit} className="max-w-2xl space-y-4">
          <Field label="Formas de pagamento">
            <TextArea value={paymentMethods} onChange={(e) => setPaymentMethods(e.target.value)} rows={4} />
          </Field>
          <Field label="Estados de venda">
            <TextArea value={saleStatuses} onChange={(e) => setSaleStatuses(e.target.value)} rows={3} />
          </Field>
          <Field label="Tamanhos">
            <TextArea value={sizes} onChange={(e) => setSizes(e.target.value)} rows={3} />
          </Field>
          <Field label="Categorias financeiras">
            <TextArea value={financialCategories} onChange={(e) => setFinancialCategories(e.target.value)} rows={5} />
          </Field>
          <Field label="Fornecedores">
            <TextArea value={suppliers} onChange={(e) => setSuppliers(e.target.value)} rows={4} />
          </Field>
          <Field label="Meses (referência)">
            <TextArea value={months} onChange={(e) => setMonths(e.target.value)} rows={4} />
          </Field>
          <Button type="submit" disabled={busy}>
            Guardar
          </Button>
        </form>
      </Card>
    </div>
  )
}
