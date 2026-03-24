import { createClient } from 'jsr:@supabase/supabase-js@2'

type PushPayload = {
  user_id?: string
  solicitacao_id?: string
  tipo?: string
  title?: string
  body?: string
  url?: string
}

function base64UrlEncode(input: string) {
  const bytes = new TextEncoder().encode(input)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function createGoogleAccessToken() {
  const clientEmail = Deno.env.get('FIREBASE_CLIENT_EMAIL')
  const privateKeyRaw = Deno.env.get('FIREBASE_PRIVATE_KEY')
  const tokenUri = Deno.env.get('FIREBASE_TOKEN_URI') || 'https://oauth2.googleapis.com/token'

  if (!clientEmail || !privateKeyRaw) {
    throw new Error('Firebase service account nao configurada nas variaveis de ambiente.')
  }

  const privateKey = privateKeyRaw.replace(/\\n/g, '\n')
  const now = Math.floor(Date.now() / 1000)

  const header = {
    alg: 'RS256',
    typ: 'JWT',
  }

  const payload = {
    iss: clientEmail,
    sub: clientEmail,
    aud: tokenUri,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    iat: now,
    exp: now + 3600,
  }

  const unsignedToken = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`

  const pemContents = privateKey
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s+/g, '')

  const keyBuffer = Uint8Array.from(atob(pemContents), char => char.charCodeAt(0))

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBuffer.buffer,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['sign'],
  )

  const signatureBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(unsignedToken),
  )

  const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  const assertion = `${unsignedToken}.${signature}`

  const response = await fetch(tokenUri, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Nao foi possivel obter access token do Google: ${errorText}`)
  }

  const data = await response.json()
  return data.access_token as string
}

async function sendFcmMessage(token: string, payload: Required<PushPayload>) {
  const projectId = Deno.env.get('FIREBASE_PROJECT_ID')
  if (!projectId) {
    throw new Error('FIREBASE_PROJECT_ID nao configurado.')
  }

  const accessToken = await createGoogleAccessToken()

  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        token,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: {
          url: payload.url,
          solicitacao_id: payload.url.replace('/solicitacao/', ''),
        },
        android: {
          priority: 'high',
          notification: {
            channel_id: 'autorizasekita',
            click_action: 'FCM_PLUGIN_ACTIVITY',
          },
        },
      },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Erro ao enviar push FCM: ${errorText}`)
  }
}

Deno.serve(async req => {
  try {
    const payload = await req.json() as PushPayload
    const userId = payload.user_id
    const solicitacaoId = payload.solicitacao_id
    const tipo = payload.tipo || 'sistema'
    const title = payload.title || 'AutorizaSekita'
    const body = payload.body || 'Nova notificação'
    const url = payload.url || '/dashboard'

    if (!userId) {
      return new Response(JSON.stringify({ error: 'user_id é obrigatório.' }), { status: 400 })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

    const { error: notificationError } = await supabase
      .from('notificacoes')
      .insert({
        usuario_id: userId,
        solicitacao_id: solicitacaoId || null,
        tipo,
        mensagem: body,
        lida: false,
      })

    if (notificationError) {
      throw notificationError
    }

    const { data: tokens, error } = await supabase
      .from('device_push_tokens')
      .select('token')
      .eq('user_id', userId)

    if (error) {
      throw error
    }

    const tokenList = (tokens || []).map(item => item.token).filter(Boolean)

    for (const token of tokenList) {
      try {
        await sendFcmMessage(token, {
          user_id: userId,
          title,
          body,
          url,
        })
      } catch (sendError) {
        console.error('Falha ao enviar push para token:', token, sendError)
      }
    }

    return new Response(JSON.stringify({ success: true, sent: tokenList.length }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
