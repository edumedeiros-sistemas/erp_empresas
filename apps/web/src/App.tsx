import { AuthProvider } from '@/contexts/AuthContext'
import { OrgProvider } from '@/contexts/OrgContext'
import AppLayout from '@/layouts/AppLayout'
import DashboardPage from '@/pages/DashboardPage'
import FinancePage from '@/pages/finance/FinancePage'
import LoginPage from '@/pages/LoginPage'
import OrgSelectPage from '@/pages/OrgSelectPage'
import RegisterPage from '@/pages/RegisterPage'
import ClientFormPage from '@/pages/clients/ClientFormPage'
import ClientListPage from '@/pages/clients/ClientListPage'
import ProductFormPage from '@/pages/products/ProductFormPage'
import ProductListPage from '@/pages/products/ProductListPage'
import SaleListPage from '@/pages/sales/SaleListPage'
import SaleNewPage from '@/pages/sales/SaleNewPage'
import SettingsPage from '@/pages/settings/SettingsPage'
import StockEntriesPage from '@/pages/stock/StockEntriesPage'
import { RequireAuth, RequireOrg } from '@/routes/Guards'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

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
              <Route element={<RequireOrg />}>
                <Route path="/app" element={<AppLayout />}>
                  <Route index element={<DashboardPage />} />
                  <Route path="clientes" element={<ClientListPage />} />
                  <Route path="clientes/:id" element={<ClientFormPage />} />
                  <Route path="produtos" element={<ProductListPage />} />
                  <Route path="produtos/:id" element={<ProductFormPage />} />
                  <Route path="vendas" element={<SaleListPage />} />
                  <Route path="vendas/nova" element={<SaleNewPage />} />
                  <Route path="entradas" element={<StockEntriesPage />} />
                  <Route path="financeiro" element={<FinancePage />} />
                  <Route path="config" element={<SettingsPage />} />
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
