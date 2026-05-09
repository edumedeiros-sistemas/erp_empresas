import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'
import { Navigate, Outlet } from 'react-router-dom'

export function RequireAuth() {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-zinc-50 text-zinc-600 dark:bg-zinc-950 dark:text-zinc-400">
        A carregar…
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  return <Outlet />
}

export function RequireOrg() {
  const { orgId, loadingList } = useOrg()
  if (loadingList) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-zinc-50 text-zinc-600 dark:bg-zinc-950 dark:text-zinc-400">
        A carregar empresas…
      </div>
    )
  }
  if (!orgId) return <Navigate to="/orgs" replace />
  return <Outlet />
}
