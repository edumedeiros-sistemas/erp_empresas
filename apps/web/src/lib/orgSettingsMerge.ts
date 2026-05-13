import { defaultOrgSettings } from '@/lib/defaults'
import type { OrgSettings } from '@/types'

export function mergeOrgSettingsFromFirestore(data: Record<string, unknown> | undefined): OrgSettings {
  const b = defaultOrgSettings()
  if (!data) return b
  const arr = (k: keyof OrgSettings) => {
    const v = data[k as string] as string[] | undefined
    return Array.isArray(v) && v.length > 0 ? v : b[k]
  }
  return {
    paymentMethods: arr('paymentMethods'),
    saleStatuses: arr('saleStatuses'),
    sizes: arr('sizes'),
    financialCategories: arr('financialCategories'),
    suppliers: arr('suppliers'),
    months: arr('months'),
  }
}
