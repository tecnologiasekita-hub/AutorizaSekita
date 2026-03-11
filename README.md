# ⚡ AutorizaSekita

Sistema interno de autorizações: Solicitante → Supervisor → Diretor.

---

## 1. Supabase

1. Crie um projeto em [supabase.com](https://supabase.com)
2. Vá em **SQL Editor → New Query**, cole `sql/sql-inicial.sql` e clique em **Run**
3. Crie usuários em **Authentication → Users → Add User** (marque "Auto Confirm")
4. Para definir supervisor/diretor, rode no SQL Editor:
   ```sql
   UPDATE profiles SET role = 'supervisor' WHERE email = 'ana@empresa.com';
   UPDATE profiles SET role = 'diretor'    WHERE email = 'roberto@empresa.com';
   ```
5. Copie em **Project Settings → API**:
   - `Project URL` → `VITE_SUPABASE_URL`
   - `anon public` → `VITE_SUPABASE_ANON_KEY`

---

## 2. Vercel

1. Suba o projeto no GitHub
2. Importe no [vercel.com](https://vercel.com)
3. Adicione as variáveis de ambiente:
   ```
   VITE_SUPABASE_URL      = https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY = eyJ...
   ```
4. Deploy ✅

---

## 3. Local

```bash
npm install
cp .env.example .env   # edite com suas chaves
npm run dev
```

---

## Banco de dados (3 tabelas)

| Tabela | O que guarda |
|---|---|
| `profiles` | Usuários e seus papéis |
| `solicitacoes` | Pedidos de autorização |
| `notificacoes` | Notificações em tempo real |

## Papéis

| Role | Cria | Aprova |
|---|---|---|
| `solicitante` | ✅ | ❌ |
| `supervisor` | ✅ | ✅ 1ª etapa |
| `diretor` | ✅ | ✅ Decisão final |
