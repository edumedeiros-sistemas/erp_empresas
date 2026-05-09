import type { DashboardStats, OrgSettings } from '@/types'

export const defaultOrgSettings = (): OrgSettings => ({
  paymentMethods: ['Pix', 'Dinheiro', 'Boleto', 'Cartão 1x', 'Cartão 3x', 'Cartão 12x'],
  saleStatuses: ['Pago', 'Pendente'],
  sizes: ['PP', 'P', 'M', 'G', 'GG', 'U'],
  financialCategories: [
    'Fornecedor',
    'Embalagem',
    'Marketing',
    'Transporte',
    'Saída',
    'Venda',
    'Entrada',
  ],
  suppliers: ['Di Corpo', 'Via Aroma', 'Perfumes'],
  months: [
    'janeiro',
    'fevereiro',
    'março',
    'abril',
    'maio',
    'junho',
    'julho',
    'agosto',
    'setembro',
    'outubro',
    'novembro',
    'dezembro',
  ],
})

export const emptyDashboardStats = (): DashboardStats => ({
  revenueTotal: 0,
  profitTotal: 0,
  saleCount: 0,
  avgTicket: 0,
  paymentMix: {},
  financialIn: 0,
  financialOut: 0,
})
