import { AuthProvider } from '@/contexts/AuthContext'
import { OrgProvider } from '@/contexts/OrgContext'
import AdminLayout from '@/layouts/AdminLayout'
import AppLayout from '@/layouts/AppLayout'
import CadastrosLayout from '@/layouts/CadastrosLayout'
import DashboardPage from '@/pages/DashboardPage'
import FinanceLayout from '@/layouts/FinanceLayout'
import FinanceLancamentosPage from '@/pages/finance/FinanceLancamentosPage'
import PayablesPage from '@/pages/finance/PayablesPage'
import ReceivablesPage from '@/pages/finance/ReceivablesPage'
import LoginPage from '@/pages/LoginPage'
import OrgSelectPage from '@/pages/OrgSelectPage'
import RequestOrgAccessPage from '@/pages/RequestOrgAccessPage'
import RegisterPage from '@/pages/RegisterPage'
import ClientFormPage from '@/pages/clients/ClientFormPage'
import ClientListPage from '@/pages/clients/ClientListPage'
import ProductFormPage from '@/pages/products/ProductFormPage'
import ProductListPage from '@/pages/products/ProductListPage'
import SupplierFormPage from '@/pages/suppliers/SupplierFormPage'
import SupplierListPage from '@/pages/suppliers/SupplierListPage'
import SaleListPage from '@/pages/sales/SaleListPage'
import SaleNewPage from '@/pages/sales/SaleNewPage'
import EntradasLayout from '@/layouts/EntradasLayout'
import NfeImportPage from '@/pages/stock/NfeImportPage'
import StockEntriesPage from '@/pages/stock/StockEntriesPage'
import AdminOrgDetailPage from '@/pages/admin/AdminOrgDetailPage'
import AdminOrgsPage from '@/pages/admin/AdminOrgsPage'
import AdminUsersPage from '@/pages/admin/AdminUsersPage'
import { RequireAuth, RequireOrg, RequireSuperAdmin } from '@/routes/Guards'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'

function LegacyClientesIdRedirect() {
  const { id } = useParams<{ id: string }>()
  return <Navigate to={`/app/cadastros/clientes/${id}`} replace />
}

function LegacyProdutosRootRedirect() {
  const { search } = useLocation()
  return <Navigate to={`/app/cadastros/produtos${search}`} replace />
}

function LegacyProdutosIdRedirect() {
  const { id } = useParams<{ id: string }>()
  const { search } = useLocation()
  return <Navigate to={`/app/cadastros/produtos/${id}${search}`} replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <OrgProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route element={<RequireAuth />}>
              <Route path="/orgs" element={<OrgSelectPage />} />
              <Route path="/orgs/pedir-acesso" element={<RequestOrgAccessPage />} />
              <Route element={<RequireSuperAdmin />}>
                <Route path="/app/admin" element={<AdminLayout />}>
                  <Route index element={<Navigate to="empresas" replace />} />
                  <Route path="empresas" element={<AdminOrgsPage />} />
                  <Route path="utilizadores" element={<AdminUsersPage />} />
                  <Route path="empresa/:orgId" element={<AdminOrgDetailPage />} />
                </Route>
              </Route>
              <Route element={<RequireOrg />}>
                <Route path="/app" element={<AppLayout />}>
                  <Route index element={<DashboardPage />} />
                  <Route path="cadastros" element={<CadastrosLayout />}>
                    <Route index element={<Navigate to="clientes" replace />} />
                    <Route path="clientes" element={<ClientListPage />} />
                    <Route path="clientes/:id" element={<ClientFormPage />} />
                    <Route path="produtos" element={<ProductListPage />} />
                    <Route path="produtos/:id" element={<ProductFormPage />} />
                    <Route path="marcas" element={<SupplierListPage />} />
                    <Route path="marcas/:id" element={<SupplierFormPage />} />
                  </Route>
                  <Route path="clientes" element={<Navigate to="/app/cadastros/clientes" replace />} />
                  <Route path="clientes/:id" element={<LegacyClientesIdRedirect />} />
                  <Route path="produtos" element={<LegacyProdutosRootRedirect />} />
                  <Route path="produtos/:id" element={<LegacyProdutosIdRedirect />} />
                  <Route path="vendas" element={<SaleListPage />} />
                  <Route path="vendas/nova" element={<SaleNewPage />} />
                  <Route path="entradas" element={<EntradasLayout />}>
                    <Route index element={<StockEntriesPage />} />
                    <Route path="nfe" element={<NfeImportPage />} />
                  </Route>
                  <Route path="financeiro" element={<FinanceLayout />}>
                    <Route index element={<FinanceLancamentosPage />} />
                    <Route path="pagar" element={<PayablesPage />} />
                    <Route path="receber" element={<ReceivablesPage />} />
                  </Route>
                  <Route path="config" element={<Navigate to="/app/entradas/nfe" replace />} />
                </Route>
              </Route>
            </Route>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </OrgProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
