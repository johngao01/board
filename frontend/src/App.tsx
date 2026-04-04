import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import './App.css'
import { AppShell } from './components/AppShell'
import { GatePage, isGateUnlocked } from './pages/Gate'
import { DashboardPage } from './pages/DashboardPage'
import { JuhePage } from './pages/JuhePage'
import { MessageManagePage } from './pages/MessageManagePage'
import { TikTokPage } from './pages/TikTokPage'
import { UserManagePage } from './pages/UserManagePage'
import { UserReportPage } from './pages/UserReportPage'

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
  )
}

export default App
