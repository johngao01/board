import { lazy, Suspense } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import './App.css'
import { AppShell } from './components/AppShell'
import { isGateUnlocked } from './lib/gate'

const GatePage = lazy(() => import('./pages/Gate').then((module) => ({ default: module.GatePage })))
const DashboardPage = lazy(() =>
  import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })),
)
const JuhePage = lazy(() => import('./pages/JuhePage').then((module) => ({ default: module.JuhePage })))
const MessageManagePage = lazy(() =>
  import('./pages/MessageManagePage').then((module) => ({ default: module.MessageManagePage })),
)
const TikTokPage = lazy(() => import('./pages/TikTokPage').then((module) => ({ default: module.TikTokPage })))
const UserManagePage = lazy(() =>
  import('./pages/UserManagePage').then((module) => ({ default: module.UserManagePage })),
)
const UserReportPage = lazy(() =>
  import('./pages/UserReportPage').then((module) => ({ default: module.UserReportPage })),
)

function RouteFallback() {
  return (
    <div className="route-fallback" role="status" aria-live="polite">
      <div className="route-fallback__spinner" aria-hidden="true" />
      <p>页面加载中...</p>
    </div>
  )
}

function ProtectedRoute() {
  const location = useLocation()

  if (!isGateUnlocked()) {
    const next = `${location.pathname}${location.search}${location.hash}`
    return <Navigate to={`/gate?next=${encodeURIComponent(next)}`} replace />
  }

  return <Outlet />
}

function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/gate" element={<GatePage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="/tiktok" element={<TikTokPage />} />
            <Route path="/users" element={<UserManagePage />} />
            <Route path="/message-manage" element={<MessageManagePage />} />
            <Route path="/message-delete" element={<Navigate to="/message-manage" replace />} />
            <Route path="/juhe" element={<JuhePage />} />
            <Route path="/user/:identity" element={<UserReportPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  )
}

export default App
