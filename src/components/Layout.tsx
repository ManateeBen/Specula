import { Link, Outlet, useLocation } from 'react-router-dom'
import { BookOpen, Settings, Library } from 'lucide-react'

const navItems = [
  { to: '/', label: '书库', icon: Library },
  { to: '/settings', label: '设置', icon: Settings },
]

export default function Layout() {
  const location = useLocation()

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2 font-semibold text-specula-700 dark:text-specula-400">
            <BookOpen className="h-6 w-6" />
            Specula
          </Link>
          <nav className="flex gap-1">
            {navItems.map(({ to, label, icon: Icon }) => {
              const active = location.pathname === to
              return (
                <Link
                  key={to}
                  to={to}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition ${
                    active
                      ? 'bg-specula-50 text-specula-700 dark:bg-specula-900/30 dark:text-specula-400'
                      : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              )
            })}
          </nav>
        </div>
      </header>
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  )
}
