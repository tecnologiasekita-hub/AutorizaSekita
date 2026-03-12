import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user,          setUser]          = useState(null)
  const [profile,       setProfile]       = useState(null)
  const [loading,       setLoading]       = useState(true)
  const [notifications, setNotifications] = useState([])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        loadProfile(session.user.id)
        loadNotifications(session.user.id)
      }
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        loadProfile(session.user.id)
        loadNotifications(session.user.id)
      } else {
        setProfile(null)
        setNotifications([])
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // Realtime: notificações instantâneas
  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel('notif-' + user.id)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notificacoes', filter: `usuario_id=eq.${user.id}` },
        (payload) => setNotifications(prev => [payload.new, ...prev])
      )
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [user])

  async function loadProfile(uid) {
    const { data } = await supabase.from('profiles').select('*').eq('id', uid).single()
    if (data) setProfile(data)
  }

  async function loadNotifications(uid) {
    const { data } = await supabase
      .from('notificacoes')
      .select('*')
      .eq('usuario_id', uid)
      .order('created_at', { ascending: false })
      .limit(30)
    setNotifications(data || [])
  }

  const signIn = (email, password) => supabase.auth.signInWithPassword({ email, password })

  const signOut = async () => {
    await supabase.auth.signOut()
    setProfile(null)
    setNotifications([])
  }

  const updateProfile = async (updates) => {
    const { error } = await supabase.from('profiles').update(updates).eq('id', user.id)
    if (!error) setProfile(prev => ({ ...prev, ...updates }))
    return { error }
  }

  const markAllRead = async () => {
    await supabase.from('notificacoes').update({ lida: true }).eq('usuario_id', user.id).eq('lida', false)
    setNotifications(prev => prev.map(n => ({ ...n, lida: true })))
  }

  return (
    <AuthContext.Provider value={{
      user, profile, loading,
      notifications,
      unreadCount:  notifications.filter(n => !n.lida).length,
      isSupervisor: profile?.role === 'supervisor',
      isDirector:   profile?.role === 'diretor',
      canApprove:   profile?.role === 'supervisor' || profile?.role === 'diretor',
      signIn, signOut, updateProfile, markAllRead,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
