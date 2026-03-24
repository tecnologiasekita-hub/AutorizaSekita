# Android e Push Nativo

## Estado atual do projeto

Ja existe no projeto:

- `capacitor.config.json`
- pasta `android/`
- plugin `@capacitor/push-notifications`
- bootstrap de push em `src/lib/mobilePush.js`
- registro automatico do dispositivo em `src/contexts/AuthContext.jsx`

## O que falta para concluir

1. Executar o SQL `sql/2026-03-24-device-push-tokens.sql`
2. Criar o projeto Android no Firebase
3. Baixar `google-services.json`
4. Colocar o arquivo em `android/app/google-services.json`
5. Rodar `npx cap sync android`
6. Abrir `npx cap open android`
7. Ajustar a edge function `send-push` para usar FCM e `device_push_tokens`
8. Gerar o APK no Android Studio

## Fluxo esperado

1. Usuario faz login no app Android
2. O app solicita permissao de notificacao
3. O plugin registra o dispositivo
4. O token FCM e salvo em `device_push_tokens`
5. O backend envia push para esse token
6. Ao tocar na notificacao, o app abre a solicitacao correspondente

## Arquivos principais

- `src/lib/mobilePush.js`
- `src/contexts/AuthContext.jsx`
- `src/lib/notificar.js`
- `sql/2026-03-24-device-push-tokens.sql`
