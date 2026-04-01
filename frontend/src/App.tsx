import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { DashboardPage } from './pages/DashboardPage'
import { JuhePage } from './pages/JuhePage'
import { TikTokPage } from './pages/TikTokPage'
import { UserManagePage } from './pages/UserManagePage'
import { UserReportPage } from './pages/UserReportPage'

function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="/tiktok" element={<TikTokPage />} />
        <Route path="/users" element={<UserManagePage />} />
        <Route path="/juhe" element={<JuhePage />} />
        <Route path="/user/:identity" element={<UserReportPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default App
