import { useState, useRef, useEffect } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { LayoutDashboard, FilePlus, FileText, CheckSquare, User, LogOut, Bell, X, ChevronRight } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export default function Layout() {
  const { profile, canApprove, signOut, notifications, unreadCount, markAllRead } = useAuth()
  const navigate = useNavigate()
  const [showNotif, setShowNotif] = useState(false)
  const notifRef = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotif(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const navItems = [
    { to: '/dashboard',           icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/nova-solicitacao',    icon: FilePlus,        label: 'Nova Solicitação' },
    { to: '/minhas-solicitacoes', icon: FileText,        label: 'Minhas Solicitações' },
    ...(canApprove ? [{ to: '/aprovacoes', icon: CheckSquare, label: 'Aprovações' }] : []),
  ]

  const roleLabel = { solicitante: 'Solicitante', supervisor: 'Supervisor', diretor: 'Diretor' }
  const roleClass = { solicitante: 'badge-solicitante', supervisor: 'badge-supervisor', diretor: 'badge-diretor' }

  return (
    <div style={styles.root}>
      {/* Sidebar */}
      <aside style={styles.sidebar}>
        {/* Logo */}
        <div style={styles.logoWrap}>
          <img src="/logo-sekita.png" alt="Sekita Agronegócios" style={{ width: 130, objectFit: 'contain' }} />
        </div>

        {/* Divider label */}
        <div style={styles.navLabel}>Menu</div>

        {/* Nav */}
        <nav style={styles.nav}>
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} style={({ isActive }) => ({ ...styles.navItem, ...(isActive ? styles.navItemActive : {}) })}>
              <Icon size={16} />
              {label}
              {({ isActive }) => isActive && <ChevronRight size={12} style={{ marginLeft: 'auto', opacity: 0.5 }} />}
            </NavLink>
          ))}
        </nav>

        {/* User card */}
        <div style={styles.userCard}>
          <div style={styles.avatar}>{profile?.nome?.charAt(0)?.toUpperCase() || 'U'}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {profile?.nome}
            </div>
            <span className={`badge ${roleClass[profile?.role]}`} style={{ fontSize: 10, padding: '1px 7px', marginTop: 3 }}>
              {roleLabel[profile?.role]}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 2 }}>
            <button className="btn btn-ghost btn-sm" style={{ padding: '5px 7px' }} onClick={() => navigate('/perfil')} title="Perfil"><User size={14} /></button>
            <button className="btn btn-ghost btn-sm" style={{ padding: '5px 7px', color: 'var(--red)' }} onClick={signOut} title="Sair"><LogOut size={14} /></button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div style={styles.main}>
        {/* Topbar */}
        <header style={styles.topbar}>
          {/* Breadcrumb area */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 500 }}>
              Sekita Agronegócios
            </span>
            <span style={{ color: 'var(--border-light)', fontSize: 14 }}>/</span>
            <span style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 600 }}>
              AutorizaSekita
            </span>
          </div>

          <div style={{ flex: 1 }} />

          {/* Notifications */}
          <div style={{ position: 'relative' }} ref={notifRef}>
            <button
              className="btn btn-ghost btn-sm"
              style={{ position: 'relative', padding: '7px 9px' }}
              onClick={() => { setShowNotif(v => !v); if (!showNotif && unreadCount > 0) markAllRead() }}
            >
              <Bell size={17} />
              {unreadCount > 0 && (
                <span style={{ position: 'absolute', top: 5, right: 5, width: 7, height: 7, borderRadius: '50%', background: 'var(--accent-2)', border: '2px solid var(--bg-card)' }} />
              )}
            </button>

            {showNotif && (
              <div style={styles.notifPanel} className="fade-in">
                <div style={styles.notifHeader}>
                  <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>Notificações</span>
                  <button className="btn btn-ghost btn-sm" style={{ padding: '3px 5px' }} onClick={() => setShowNotif(false)}><X size={14} /></button>
                </div>
                <div style={styles.notifList}>
                  {notifications.length === 0 ? (
                    <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Nenhuma notificação</div>
                  ) : notifications.map(n => (
                    <div key={n.id}
                      style={{ ...styles.notifItem, background: n.lida ? 'transparent' : 'var(--green-pale)' }}
                      onClick={() => { if (n.solicitacao_id) navigate(`/solicitacao/${n.solicitacao_id}`); setShowNotif(false) }}
                    >
                      <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>{n.mensagem}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                        {format(new Date(n.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Content */}
        <main style={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}

const styles = {
  root: { display: 'flex', minHeight: '100vh', background: 'var(--bg)' },
  sidebar: {
    width: 224,
    flexShrink: 0,
    background: 'var(--green-brand)',
    display: 'flex',
    flexDirection: 'column',
    padding: '0 0 16px',
    position: 'sticky',
    top: 0,
    height: '100vh',
    overflowY: 'auto',
  },
  logoWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '20px 18px 18px',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
    marginBottom: 8,
  },
  logoLeaf: {
    width: 32, height: 32,
    background: 'rgba(255,255,255,0.15)',
    borderRadius: 8,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  logoName: {
    fontFamily: 'var(--font-display)',
    fontStyle: 'italic',
    fontSize: 20,
    fontWeight: 400,
    color: '#fff',
    letterSpacing: '-0.01em',
    lineHeight: 1,
  },
  logoSub: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    marginTop: 2,
  },
  navLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    padding: '6px 18px 4px',
  },
  nav: { display: 'flex', flexDirection: 'column', gap: 2, padding: '0 10px', flex: 1 },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '9px 12px',
    borderRadius: 'var(--radius-sm)',
    fontSize: 14,
    fontWeight: 500,
    color: 'rgba(255,255,255,0.65)',
    transition: 'all 0.15s',
    textDecoration: 'none',
  },
  navItemActive: {
    background: 'rgba(255,255,255,0.15)',
    color: '#fff',
    fontWeight: 600,
  },
  userCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    margin: '8px 10px 0',
    padding: '10px 10px',
    background: 'rgba(0,0,0,0.15)',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid rgba(255,255,255,0.08)',
  },
  avatar: {
    width: 32, height: 32,
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.2)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 700, fontSize: 14, color: 'white',
    flexShrink: 0,
  },
  main: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 },
  topbar: {
    height: 52,
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    padding: '0 28px',
    gap: 12,
    background: 'var(--bg-card)',
    position: 'sticky',
    top: 0,
    zIndex: 10,
    boxShadow: '0 1px 3px rgba(26,92,56,0.06)',
  },
  content: {
    flex: 1,
    padding: '28px',
    overflowY: 'auto',
    maxWidth: 1100,
    width: '100%',
    margin: '0 auto',
  },
  notifPanel: {
    position: 'absolute',
    right: 0,
    top: 'calc(100% + 8px)',
    width: 340,
    background: 'var(--bg-card)',
    border: '1px solid var(--border-light)',
    borderRadius: 'var(--radius)',
    boxShadow: 'var(--shadow-lg)',
    zIndex: 200,
    overflow: 'hidden',
  },
  notifHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 16px', borderBottom: '1px solid var(--border)',
  },
  notifList: { maxHeight: 360, overflowY: 'auto' },
  notifItem: {
    padding: '12px 16px', borderBottom: '1px solid var(--border)',
    cursor: 'pointer', transition: 'background 0.15s',
  },
}
