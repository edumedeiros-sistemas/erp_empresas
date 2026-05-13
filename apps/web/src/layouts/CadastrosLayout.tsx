import { NavLink, Outlet } from 'react-router-dom'

const sub = [
  { to: '/app/cadastros/clientes', label: 'Clientes' },
  { to: '/app/cadastros/produtos', label: 'Produtos' },
  { to: '/app/cadastros/marcas', label: 'Marcas / Fornecedores' },
]

export default function CadastrosLayout() {
  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Cadastros</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Clientes, produtos e marcas/fornecedores (dados fiscais e NF-e).
        </p>
      </div>
      <nav className="mb-6 flex flex-wrap gap-2 border-b border-zinc-200 pb-3 dark:border-zinc-800">
        {sub.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `rounded-lg px-3 py-2 text-sm font-medium transition ${
                isActive
                  ? 'bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-100'
                  : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  )
}
