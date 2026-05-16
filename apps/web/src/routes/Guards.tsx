import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'
import { readStoredActiveOrgId } from '@/lib/activeOrgStorage'
import { isSuperAdminUser } from '@/lib/superAdmin'
import { Navigate, Outlet, useLocation } from 'react-router-dom'

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
  const { loading: authLoading } = useAuth()
  const { orgId, loadingList, restoringOrg } = useOrg()
  const location = useLocation()
  const storedOrgId = readStoredActiveOrgId()
  const waitingRestore = !orgId && !!storedOrgId

  if (authLoading || loadingList || restoringOrg || waitingRestore) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-zinc-50 text-zinc-600 dark:bg-zinc-950 dark:text-zinc-400">
        A carregar empresas…
      </div>
    )
  }
  if (!orgId) {
    return <Navigate to="/orgs" replace state={{ from: `${location.pathname}${location.search}` }} />
  }
  return <Outlet />
}

export function RequireSuperAdmin() {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-zinc-50 text-zinc-600 dark:bg-zinc-950 dark:text-zinc-400">
        A carregar…
      </div>
    )
  }
  if (!user || !isSuperAdminUser(user)) {
    return <Navigate to="/app" replace />
  }
  return <Outlet />
}
