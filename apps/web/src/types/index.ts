import type { Timestamp } from 'firebase/firestore'

export type MemberRole = 'owner' | 'admin' | 'staff'

export interface Organization {
  id: string
  name: string
  createdAt?: Timestamp
}

export interface OrgMember {
  role: MemberRole
  email: string | null
  joinedAt?: Timestamp
}

export interface UserProfile {
  email: string | null
  orgIds: string[]
}

export interface Client {
  id: string
  code: string
  name: string
  phone: string
  city: string
  instagram: string
  registeredAt: Timestamp | null
  lastPurchaseAt: Timestamp | null
  totalPurchased: number
  purchaseCount: number
  avgTicket: number
  notes: string
}

export interface Product {
  id: string
  code: string
  name: string
  size: string
  category: string
  cost: number
  freight: number
  ipi: number
  packaging: number
  totalCost: number
  marginPct: number
  suggestedPrice: number
  minPrice: number
  fee3x: number
  price3x: number
  fee12x: number
  price12x: number
  stock: number
}

export interface SaleItem {
  id: string
  productId: string
  productCode: string
  productName: string
  size: string
  quantity: number
  unitPrice: number
  unitCost: number
  lineTotal: number
  lineProfit: number
}

export interface Sale {
  id: string
  clientId: string
  clientName: string
  date: Timestamp
  paymentMethod: string
  status: string
  amountReceived: number
  amountPending: number
  subtotal: number
  totalProfit: number
  createdAt?: Timestamp
}

export interface StockMovement {
  id: string
  date: Timestamp
  productId: string
  productCode: string
  productName: string
  size: string
  quantity: number
  unitCost: number
  total: number
  type: 'purchase_in'
  createdAt?: Timestamp
}

export type FinancialType = 'entrada' | 'saida'

export interface FinancialTransaction {
  id: string
  date: Timestamp
  type: FinancialType
  category: string
  description: string
  amount: number
  paymentMethod: string
  status: string
  createdAt?: Timestamp
}

export interface OrgSettings {
  paymentMethods: string[]
  saleStatuses: string[]
  sizes: string[]
  financialCategories: string[]
  suppliers: string[]
  months: string[]
}

export interface DashboardStats {
  revenueTotal: number
  profitTotal: number
  saleCount: number
  avgTicket: number
  paymentMix: Record<string, number>
  financialIn: number
  financialOut: number
  updatedAt?: Timestamp
}
