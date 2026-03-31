import { NavLink, Outlet } from 'react-router-dom'
import { useEffect, useState } from 'react'

const navItems = [
  { to: '/', label: '主页', hint: 'NiceBot / TikTok 总览', end: true },
  { to: '/users', label: 'User 管理', hint: '用户表编辑与检索' },
  { to: '/juhe', label: 'Juhe', hint: '聚合数据专项面板' },
]

export function AppShell() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('board-theme')
    return saved === 'light' ? 'light' : 'dark'
  })

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('board-theme', theme)
  }, [theme])

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <p className="brand-kicker">Board Rebuild</p>
          <h1>Data Console</h1>
          <p className="brand-copy">
            先统一入口和体验，再逐页迁移接口、图表和编辑能力。
          </p>
        </div>

        <nav className="nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                isActive ? 'nav-item is-active' : 'nav-item'
              }
            >
              <span className="nav-label">{item.label}</span>
              <span className="nav-hint">{item.hint}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-card">
          <p className="sidebar-card-title">重构策略</p>
          <p className="sidebar-card-copy">
            Flask 暂时只保留 API。React 统一路由、主题、布局和组件系统。
          </p>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div>
            <p className="topbar-eyebrow">Unified Admin</p>
            <h2>一个入口，三块业务，同一套设计语言</h2>
          </div>

          <div className="topbar-actions">
            <button
              type="button"
              className="ghost-button"
              onClick={() =>
                setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
              }
            >
              {theme === 'dark' ? '切到浅色' : '切到深色'}
            </button>
          </div>
        </header>

        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
