import { Outlet, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { getDocumentTitle, sidebarNavItems } from '../config/page-info'

export function AppShell() {
  const location = useLocation()
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('board-theme')
    return saved === 'light' ? 'light' : 'dark'
  })
  const [sidebarPinned, setSidebarPinned] = useState(() => localStorage.getItem('board-sidebar-pinned') === 'true')

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('board-theme', theme)
  }, [theme])

  useEffect(() => {
    localStorage.setItem('board-sidebar-pinned', String(sidebarPinned))
  }, [sidebarPinned])

  useEffect(() => {
    document.title = getDocumentTitle(location.pathname)
  }, [location.pathname])

  return (
    <div className={`shell${sidebarPinned ? ' is-sidebar-pinned' : ''}`}>
      <aside className={`sidebar${sidebarPinned ? ' is-pinned' : ''}`}>
        <div className="sidebar-brand">
          <div className="sidebar-logo" aria-hidden="true">
            🚀
          </div>
          <div className="sidebar-brand-copy">
            <p className="brand-kicker">DataCenter</p>
            <h1>Board</h1>
          </div>
        </div>

        <nav className="nav" aria-label="主导航">
          {sidebarNavItems.map((item) => (
            <a
              key={item.to}
              href={item.to}
              target="_blank"
              rel="noreferrer"
              className={
                (item.end ? location.pathname === item.to : location.pathname.startsWith(item.to))
                  ? 'nav-item is-active'
                  : 'nav-item'
              }
              title={item.label}
            >
              <span className="nav-badge" aria-hidden="true">
                {item.short}
              </span>
              <span className="nav-copy">
                <span className="nav-label">{item.label}</span>
                <span className="nav-hint">{item.hint}</span>
              </span>
            </a>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button
            type="button"
            className={`sidebar-pin-toggle${sidebarPinned ? ' is-active' : ''}`}
            onClick={() => setSidebarPinned((current) => !current)}
            title={sidebarPinned ? '取消固定侧边栏' : '固定侧边栏'}
          >
            <span className="nav-badge" aria-hidden="true">
              {sidebarPinned ? '◧' : '◨'}
            </span>
            <span className="nav-copy">
              <span className="nav-label">{sidebarPinned ? '取消固定' : '固定侧栏'}</span>
            </span>
          </button>

          <button
            type="button"
            className="sidebar-theme-toggle"
            onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
            title={theme === 'dark' ? '切换浅色' : '切换深色'}
          >
            <span className="nav-badge" aria-hidden="true">
              ◐
            </span>
            <span className="nav-copy">
              <span className="nav-label">{theme === 'dark' ? '切换浅色' : '切换深色'}</span>
            </span>
          </button>
        </div>
      </aside>

      <div className="workspace">
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
