import { useAuth } from '@/contexts/AuthContext'
import { useOrg } from '@/contexts/OrgContext'
import type { OrgListNavState } from '@/lib/orgNav'
import { isSuperAdminUser } from '@/lib/superAdmin'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useMemo } from 'react'

type NavItem = {
  to: string
  end?: boolean
  activePrefix?: string
  label: string
  icon: string
}

const baseNav: NavItem[] = [
  { to: '/app', end: true, label: 'Resumo', icon: '◆' },
  { to: '/app/cadastros/clientes', activePrefix: '/app/cadastros', label: 'Cadastros', icon: '▤' },
  { to: '/app/vendas', label: 'Vendas', icon: '☰' },
  { to: '/app/entradas', activePrefix: '/app/entradas', label: 'Entradas', icon: '↓' },
  { to: '/app/financeiro', activePrefix: '/app/financeiro', label: 'Financeiro', icon: '¤' },
]

function NavItems({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const location = useLocation()
  return (
    <>
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={'end' in item ? item.end : false}
          onClick={onNavigate}
          className={({ isActive }) => {
            const active =
              'activePrefix' in item && item.activePrefix
                ? location.pathname.startsWith(item.activePrefix)
                : isActive
            return `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
              active
                ? 'bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-100'
                : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900'
            }`
          }}
        >
          <span className="w-5 text-center opacity-70" aria-hidden>
            {item.icon}
          </span>
          {item.label}
        </NavLink>
      ))}
    </>
  )
}

export default function AppLayout() {
  const { logout, user } = useAuth()
  const { organization, orgIds, orgId, setOrgId } = useOrg()
  const navigate = useNavigate()
  const location = useLocation()

  const showAdminNav = isSuperAdminUser(user)

  const navItems = useMemo(() => {
    const list = [...baseNav]
    if (showAdminNav) {
      list.push({
        to: '/app/admin/empresas',
        activePrefix: '/app/admin',
        label: 'Administrador',
        icon: '⚙',
      })
    }
    return list
  }, [showAdminNav])

  function goToOrgList(extra?: Pick<OrgListNavState, 'previousOrgId'>) {
    const state: OrgListNavState = {
      from: `${location.pathname}${location.search}`,
      ...extra,
    }
    navigate('/orgs', { state })
  }

  return (
    <div className="flex min-h-dvh flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50 md:flex-row">
      <aside className="hidden w-56 shrink-0 border-r border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950 md:block">
        <div className="mb-6">
          <div className="text-xs font-semibold uppercase tracking-wide text-violet-600">Aura Casa</div>
          <div className="truncate text-sm font-semibold">{organization?.name ?? '—'}</div>
          {orgIds.length > 1 ? (
            <button
              type="button"
              className="mt-2 text-xs text-violet-600 hover:underline"
              onClick={() => {
                const previousOrgId = orgId
                setOrgId(null)
                goToOrgList({ previousOrgId })
              }}
            >
              Trocar empresa
            </button>
          ) : null}
        </div>
        <nav className="flex flex-col gap-1">
          <NavItems items={navItems} />
        </nav>
        <div className="mt-8 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <button
            type="button"
            className="w-full rounded-lg px-3 py-2 text-left text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
            onClick={() => goToOrgList()}
          >
            Organizações
          </button>
          <button
            type="button"
            className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
            onClick={() => void logout().then(() => navigate('/login'))}
          >
            Sair
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col pb-16 md:pb-0">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90 md:hidden">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{organization?.name ?? 'Aura Casa'}</div>
            <div className="text-xs text-zinc-500">ERP</div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {showAdminNav ? (
              <button
                type="button"
                className="text-xs font-medium text-violet-600"
                onClick={() => navigate('/app/admin/empresas')}
              >
                Admin
              </button>
            ) : null}
            <button type="button" className="text-xs text-violet-600" onClick={() => goToOrgList()}>
              Empresas
            </button>
          </div>
        </header>
        <main className="flex-1 px-4 py-6">
          <Outlet />
        </main>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-20 border-t border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95 md:hidden">
        <div className="flex max-w-full gap-1 overflow-x-auto px-2 py-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={'end' in item ? item.end : false}
              className={() => {
                const active =
                  'activePrefix' in item && item.activePrefix
                    ? location.pathname.startsWith(item.activePrefix)
                    : location.pathname === item.to ||
                      (!('end' in item && item.end) && location.pathname.startsWith(`${item.to}/`))
                return `flex min-w-[4.5rem] shrink-0 flex-col items-center justify-center rounded-lg py-2 text-[10px] font-medium ${
                  active ? 'text-violet-700 dark:text-violet-300' : 'text-zinc-500'
                }`
              }}
            >
              <span className="text-sm" aria-hidden>
                {item.icon}
              </span>
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
