import { useState, useRef, useEffect } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import logoSekita from '../assets/logo-sekita-sidebar.png'
import { LayoutDashboard, FilePlus, FileText, User, LogOut, Bell, X, Menu } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ROLE_LABELS } from '../lib/workflow'

export default function Layout() {
  const { profile, isDirector, signOut, notifications, unreadCount, markAllRead } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showNotif, setShowNotif] = useState(false)
  const notifRef = useRef(null)

  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  useEffect(() => {
    function handler(event) {
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setShowNotif(false)
      }
    }

    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const navItems = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    ...(!isDirector ? [{ to: '/nova-solicitacao', icon: FilePlus, label: 'Nova solicitação' }] : []),
    { to: '/solicitacoes', icon: FileText, label: 'Solicitações' },
  ]

  const roleClass = { solicitante: 'badge-solicitante', supervisor: 'badge-supervisor', diretor: 'badge-diretor' }

  function Sidebar() {
    return (
      <aside style={styles.sidebar}>
        <div style={styles.logoWrap}>
          <div style={styles.logoBadge} onClick={() => navigate('/dashboard')}>
            <img src={logoSekita} alt="Sekita Agronegocios" style={styles.sidebarLogo} />
          </div>
          <button onClick={() => setSidebarOpen(false)} style={{ ...styles.closeBtn, display: sidebarOpen ? 'flex' : 'none' }}>
            <X size={18} color="rgba(255,255,255,0.7)" />
          </button>
        </div>

        <div style={styles.navLabel}>Menu</div>

        <nav style={styles.nav}>
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} style={({ isActive }) => ({ ...styles.navItem, ...(isActive ? styles.navItemActive : {}) })}>
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div style={styles.userCard}>
          <div style={styles.avatar}>{profile?.nome?.charAt(0)?.toUpperCase() || 'U'}</div>
          <div style={styles.userInfo}>
            <div style={styles.userName}>{profile?.nome}</div>
            <span className={`badge ${roleClass[profile?.role]}`} style={styles.userBadge}>
              {ROLE_LABELS[profile?.role]}
            </span>
          </div>
          <div style={styles.userActions}>
            <button className="btn btn-ghost btn-sm" style={styles.profileActionBtn} onClick={() => navigate('/perfil')} title="Perfil"><User size={14} /></button>
            <button className="btn btn-ghost btn-sm" style={styles.logoutActionBtn} onClick={signOut} title="Sair"><LogOut size={14} /></button>
          </div>
        </div>
      </aside>
    )
  }

  return (
    <div style={styles.root}>
      <div className="sidebar-only" style={styles.sidebarDesktop}>
        <Sidebar />
      </div>

      {sidebarOpen && (
        <>
          <div style={styles.overlay} onClick={() => setSidebarOpen(false)} />
          <div style={styles.sidebarMobile}>
            <Sidebar />
          </div>
        </>
      )}

      <div style={styles.main}>
        <header style={styles.topbar}>
          <button className="btn btn-ghost btn-sm menu-btn-mobile" style={styles.menuBtn} onClick={() => setSidebarOpen(true)}>
            <Menu size={20} />
          </button>

          <div className="logo-mobile" style={styles.mobileLogoWrap}>
            <img src={logoSekita} alt="Sekita" style={styles.mobileLogo} />
          </div>

          <div style={{ flex: 1 }} />

          <div style={{ position: 'relative' }} ref={notifRef}>
            <button
              className="btn btn-ghost btn-sm"
              style={{ position: 'relative', padding: '7px 9px' }}
              onClick={() => {
                setShowNotif(value => !value)
                if (!showNotif && unreadCount > 0) markAllRead()
              }}
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span style={{ position: 'absolute', top: 5, right: 5, width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-2)', border: '2px solid var(--bg-card)' }} />
              )}
            </button>

            {showNotif && (
              <div style={styles.notifPanel} className="fade-in">
                <div style={styles.notifHeader}>
                  <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>Notificacoes</span>
                  <button className="btn btn-ghost btn-sm" style={{ padding: '3px 5px' }} onClick={() => setShowNotif(false)}><X size={14} /></button>
                </div>
                <div style={styles.notifList}>
                  {notifications.length === 0 ? (
                    <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Nenhuma notificacao</div>
                  ) : notifications.map(notification => (
                    <div
                      key={notification.id}
                      style={{ ...styles.notifItem, background: notification.lida ? 'transparent' : 'var(--green-pale)' }}
                      onClick={() => {
                        if (notification.solicitacao_id) navigate(`/solicitacao/${notification.solicitacao_id}`)
                        setShowNotif(false)
                      }}
                    >
                      <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>{notification.mensagem}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                        {format(new Date(notification.created_at), "dd/MM 'as' HH:mm", { locale: ptBR })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </header>

        <main style={styles.content} className="content-area">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

const styles = {
  root: { display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg)' },
  sidebarDesktop: { display: 'flex', flexShrink: 0 },
  sidebarMobile: { position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 200, width: 240 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 199 },
  sidebar: { width: 224, background: 'linear-gradient(180deg, var(--green-brand), var(--green-dark))', display: 'flex', flexDirection: 'column', padding: '0 0 16px', height: '100vh', overflowY: 'auto', position: 'sticky', top: 0 },
  logoWrap: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, padding: '20px 14px 12px', marginBottom: 10 },
  logoBadge: { display: 'flex', alignItems: 'center', justifyContent: 'flex-start', flex: 1, minHeight: 56, padding: 0, background: 'transparent', border: 'none', borderRadius: 0, boxShadow: 'none', cursor: 'pointer' },
  sidebarLogo: { width: 164, objectFit: 'contain' },
  closeBtn: { background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', flexShrink: 0 },
  navLabel: { fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '6px 18px 4px' },
  nav: { display: 'flex', flexDirection: 'column', gap: 2, padding: '0 10px', flex: 1 },
  navItem: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 'var(--radius-sm)', fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.68)', transition: 'all 0.15s', textDecoration: 'none' },
  navItemActive: { background: 'rgba(255,255,255,0.15)', color: '#fff', fontWeight: 600 },
  userCard: { display: 'flex', alignItems: 'center', gap: 8, margin: '8px 10px 0', padding: '10px 10px', background: 'rgba(0,0,0,0.15)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255,255,255,0.08)' },
  avatar: { width: 34, height: 34, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, color: 'white', flexShrink: 0 },
  userInfo: { flex: 1, minWidth: 0, maxWidth: 92, display: 'flex', flexDirection: 'column', gap: 4 },
  userName: { fontWeight: 600, fontSize: 13, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  userBadge: { fontSize: 8, fontWeight: 700, maxWidth: '100%', height: 18, padding: '0 8px', alignSelf: 'stretch', justifyContent: 'center', lineHeight: 1, textAlign: 'center', letterSpacing: '0.02em', overflow: 'hidden' },
  userActions: { display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto', flexShrink: 0 },
  profileActionBtn: { padding: '5px', minWidth: 26, minHeight: 26, color: 'rgba(255,255,255,0.88)', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' },
  logoutActionBtn: { padding: '5px', minWidth: 26, minHeight: 26, color: 'rgba(255,214,214,0.96)', background: 'rgba(192,57,43,0.16)', border: '1px solid rgba(255,255,255,0.08)' },
  main: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' },
  topbar: { height: 54, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 16px', gap: 8, background: 'var(--bg-card)', position: 'sticky', top: 0, zIndex: 10, boxShadow: '0 1px 3px rgba(26,92,56,0.06)' },
  menuBtn: { padding: '6px 8px' },
  mobileLogoWrap: { display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 112, height: 34, padding: '4px 10px', borderRadius: 999, background: 'linear-gradient(180deg, #ffffff, #f6faf7)', border: '1px solid rgba(26,92,56,0.12)', boxShadow: '0 4px 14px rgba(26,92,56,0.08)' },
  mobileLogo: { height: 21, objectFit: 'contain', filter: 'drop-shadow(0 1px 6px rgba(26,92,56,0.08))' },
  content: { flex: 1, padding: '24px 20px', overflowY: 'auto', maxWidth: 1100, width: '100%', margin: '0 auto', height: '100%' },
  notifPanel: { position: 'fixed', right: 12, top: 62, width: 'min(340px, calc(100vw - 24px))', background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-lg)', zIndex: 300, overflow: 'hidden' },
  notifHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--border)' },
  notifList: { maxHeight: '60vh', overflowY: 'auto' },
  notifItem: { padding: '12px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.15s' },
}
