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
  /** Igual ao UID do utilizador; usado em collection group `members`. */
  memberUid?: string
  joinedAt?: Timestamp
}

export interface UserProfile {
  email: string | null
  /** Igual a `normalizeEmail(email)` quando definido. */
  emailLower?: string
  orgIds: string[]
}

export type OrgInviteStatus = 'pending' | 'used' | 'declined' | 'cancelled'

/** Convite para entrar numa organização (subcoleção `invites`). */
export interface OrgInvite {
  orgId: string
  orgName: string
  email: string
  emailLower: string
  role: MemberRole
  status: OrgInviteStatus
  invitedByUid: string
  createdAt?: Timestamp
}

export type OrgAccessRequestStatus = 'pending' | 'approved' | 'rejected'

/** Pedido de acesso a uma empresa (subcoleção `accessRequests`). */
export interface OrgAccessRequest {
  requesterUid: string
  requesterEmail: string
  status: OrgAccessRequestStatus
  createdAt?: Timestamp
  resolvedAt?: Timestamp | null
  resolvedByUid?: string | null
}

/** Lista pública de empresas para pedido de acesso (nome). */
export interface OrgDirectoryEntry {
  name: string
  updatedAt?: Timestamp
}

export interface Client {
  id: string
  name: string
  phone: string
  notes: string
  registeredAt: Timestamp | null
  lastPurchaseAt: Timestamp | null
  totalPurchased: number
  purchaseCount: number
  avgTicket: number
}

/** Marca / fornecedor (cadastro usado na coluna marca do produto). */
export interface Supplier {
  id: string
  /** Nome para listas (fantasia, razão ou legado). */
  name: string
  /** CNPJ ou CPF, apenas dígitos. */
  cnpj?: string
  tradeName?: string
  legalName?: string
  stateRegistration?: string
  phone: string
  notes: string
  createdAt?: Timestamp
}

/** Pré-cadastro de fornecedor a partir da NF-e; completar em Marcas / Fornecedores. */
export interface SupplierDraft {
  id: string
  cnpj: string
  tradeName: string
  legalName: string
  stateRegistration: string
  nfeChave?: string | null
  nfeNNF?: string | null
  nfeSerie?: string | null
  needsCompletion: boolean
  createdAt?: Timestamp
}

export interface Product {
  id: string
  code: string
  name: string
  size: string
  /** Marca; futuro: ligar a cadastro de marcas. */
  brand: string
  cost: number
  freight: number
  ipi: number
  /** custo + frete + IPI */
  totalCost: number
  /** Preço de venda ao público */
  salePrice: number
  suggestedPrice: number
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

export type StockMovementType = 'purchase_in' | 'nfe_in'

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
  type: StockMovementType
  nfeChave?: string | null
  nfeNNF?: string | null
  nfeItem?: number
  createdAt?: Timestamp
}

/** Pré-cadastro a partir da NF-e; completar em Produtos. */
export interface ProductDraft {
  id: string
  code: string
  name: string
  size: string
  unit: string
  lastQty: number
  lastUnitCost: number
  lastLineTotal: number
  nfeChave?: string | null
  nfeNNF?: string | null
  nfeSerie?: string | null
  nfeItem?: number
  needsCompletion: boolean
  matchNote?: string
  /** Frete por unidade rateado nesta linha (NF-e), para pré-preencher ao completar cadastro. */
  nfeFreightPerUnit?: number | null
  /** IPI por unidade da linha (NF-e), para pré-preencher ao completar cadastro. */
  nfeIpiPerUnit?: number | null
  /** Marca sugerida (nome fantasia do emitente), igual ao fornecedor da nota. */
  nfeBrand?: string | null
  /** Nome fantasia do emitente (emit/xFant) — mesmo valor que tradeName do fornecedor. */
  nfeEmitFantasia?: string | null
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

export type PayableStatus = 'aberto' | 'pago'

/** Conta a pagar gerada na importação da NF-e (fornecedor). */
export interface AccountPayable {
  id: string
  nfeChave: string
  nNF: string
  serie: string
  /** Pedido (xPed no XML). */
  orderRef: string
  supplierName: string
  amount: number
  dhEmi: Timestamp | null
  /** Número da duplicata (parcela na NF-e). */
  dupNumber?: string
  /** Data de vencimento da parcela (dup/dVenc). */
  dueDate?: Timestamp | null
  status: PayableStatus
  createdAt?: Timestamp
  paidAt?: Timestamp | null
}

export type ReceivableStatus = 'aberto' | 'recebido'

/** Conta a receber gerada em venda a crediário. */
export interface AccountReceivable {
  id: string
  saleId: string
  clientId: string
  clientName: string
  amount: number
  installmentCount: number
  paymentMethod: string
  status: ReceivableStatus
  saleDate: Timestamp | null
  createdAt?: Timestamp
  receivedAt?: Timestamp | null
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
