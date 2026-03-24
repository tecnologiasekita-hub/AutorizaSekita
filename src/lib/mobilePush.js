import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { PushNotifications } from '@capacitor/push-notifications'
import { supabase } from './supabase'

let listenersReady = false
let currentPushUserId = null

function isNativeApp() {
  return Capacitor.isNativePlatform()
}

async function saveDeviceToken(userId, token) {
  if (!userId || !token) return

  const payload = {
    user_id: userId,
    token,
    platform: Capacitor.getPlatform(),
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from('device_push_tokens')
    .upsert(payload, { onConflict: 'token' })

  if (error) {
    console.warn('Nao foi possivel salvar o token do dispositivo:', error)
  }
}

function resolveNotificationUrl(notification) {
  const directUrl = notification?.notification?.data?.url
  if (directUrl) return directUrl

  const solicitacaoId =
    notification?.notification?.data?.solicitacao_id ||
    notification?.notification?.data?.solicitacaoId

  if (solicitacaoId) {
    return `/solicitacao/${solicitacaoId}`
  }

  return '/dashboard'
}

function ensureListeners() {
  if (listenersReady || !isNativeApp()) return

  listenersReady = true

  PushNotifications.addListener('registration', async ({ value }) => {
    await saveDeviceToken(currentPushUserId, value)
  })

  PushNotifications.addListener('registrationError', error => {
    console.warn('Erro ao registrar push no dispositivo:', error)
  })

  PushNotifications.addListener('pushNotificationReceived', notification => {
    console.log('Push recebido no app:', notification)

    LocalNotifications.schedule({
      notifications: [
        {
          id: Date.now(),
          title: notification.title || 'AutorizaSekita',
          body: notification.body || 'Nova notificacao',
          schedule: { at: new Date(Date.now() + 200) },
          channelId: 'autorizasekita',
          extra: notification.data || {},
        },
      ],
    }).catch(error => {
      console.warn('Nao foi possivel exibir notificacao local:', error)
    })
  })

  PushNotifications.addListener('pushNotificationActionPerformed', notification => {
    const url = resolveNotificationUrl(notification)
    window.location.href = url
  })
}

export async function registerNativePush(userId) {
  if (!userId || !isNativeApp()) return

  currentPushUserId = userId
  ensureListeners()

  let permission = await PushNotifications.checkPermissions()
  if (permission.receive === 'prompt') {
    permission = await PushNotifications.requestPermissions()
  }

  if (permission.receive !== 'granted') {
    console.warn('Permissao de notificacao nao concedida no dispositivo.')
    return
  }

  await LocalNotifications.requestPermissions()

  if (Capacitor.getPlatform() === 'android') {
    await PushNotifications.createChannel({
      id: 'autorizasekita',
      name: 'AutorizaSekita',
      description: 'Notificacoes do fluxo de autorizacoes',
      importance: 5,
      visibility: 1,
      vibration: true,
    })
  }

  await PushNotifications.register()
}

export function clearNativePushUser() {
  currentPushUserId = null
}

export { isNativeApp }
