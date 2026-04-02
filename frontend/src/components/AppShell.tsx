import { NavLink, Outlet } from 'react-router-dom'
import { useEffect, useState } from 'react'

const navItems = [
  { to: '/', label: '主页', short: '主', hint: '数据总览', end: true },
  { to: '/tiktok', label: 'TikTok', short: 'T', hint: 'TikTok 统计' },
  { to: '/users', label: 'User 管理', short: '用', hint: '用户表编辑' },
  { to: '/juhe', label: 'Juhe', short: '聚', hint: '聚合面板' },
]

export function AppShell() {
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
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => (isActive ? 'nav-item is-active' : 'nav-item')}
              title={item.label}
            >
              <span className="nav-badge" aria-hidden="true">
                {item.short}
              </span>
              <span className="nav-copy">
                <span className="nav-label">{item.label}</span>
                <span className="nav-hint">{item.hint}</span>
              </span>
            </NavLink>
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
              <span className="nav-hint">{sidebarPinned ? '点击恢复悬停展开' : '点击后保持展开显示'}</span>
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
              <span className="nav-hint">主题开关仅保留在侧栏</span>
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
