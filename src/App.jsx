import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import NovaSolicitacao from './pages/NovaSolicitacao'
import MinhasSolicitacoes from './pages/MinhasSolicitacoes'
import Aprovacoes from './pages/Aprovacoes'
import DetalhesSolicitacao from './pages/DetalhesSolicitacao'
import Perfil from './pages/Perfil'

function PrivateRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)' }}>
      <div className="spinner" style={{ width: 32, height: 32 }} />
    </div>
  )
  return user ? children : <Navigate to="/login" replace />
}

function ApproverRoute({ children }) {
  const { canApprove, loading } = useAuth()
  if (loading) return null
  return canApprove ? children : <Navigate to="/dashboard" replace />
}

export default function App() {
  const { user, loading } = useAuth()

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0c0c10' }}>
      <div className="spinner" style={{ width: 36, height: 36 }} />
    </div>
  )

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login />} />
      <Route path="/"      element={<Navigate to="/dashboard" replace />} />
      <Route element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route path="/dashboard"             element={<Dashboard />} />
        <Route path="/nova-solicitacao"      element={<NovaSolicitacao />} />
        <Route path="/minhas-solicitacoes"   element={<MinhasSolicitacoes />} />
        <Route path="/aprovacoes"            element={<ApproverRoute><Aprovacoes /></ApproverRoute>} />
        <Route path="/solicitacao/:id"       element={<DetalhesSolicitacao />} />
        <Route path="/perfil"                element={<Perfil />} />
      </Route>
    </Routes>
  )
}
