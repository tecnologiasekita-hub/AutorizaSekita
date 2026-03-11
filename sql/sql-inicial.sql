-- AutorizaSekita — Banco de dados
-- Cole no Supabase SQL Editor e clique em Run

-- TABELA: perfis dos usuários
CREATE TABLE profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome         TEXT,
  email        TEXT,
  role         TEXT DEFAULT 'solicitante', -- 'solicitante' | 'supervisor' | 'diretor'
  departamento TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- TABELA: solicitações de autorização
CREATE TABLE solicitacoes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo         TEXT,
  descricao      TEXT,
  solicitante_id UUID REFERENCES profiles(id),
  valor          NUMERIC(15,2),
  categoria      TEXT,
  urgencia       TEXT DEFAULT 'normal', -- 'baixa' | 'normal' | 'alta' | 'critica'
  status         TEXT DEFAULT 'pendente', -- 'pendente' | 'aprovado_supervisor' | 'aprovado' | 'rejeitado'

  supervisor_id          UUID REFERENCES profiles(id),
  supervisor_comentario  TEXT,
  supervisor_aprovado_em TIMESTAMPTZ,

  diretor_id          UUID REFERENCES profiles(id),
  diretor_comentario  TEXT,
  diretor_aprovado_em TIMESTAMPTZ,

  motivo_rejeicao TEXT,
  rejeitado_em    TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- TABELA: notificações
CREATE TABLE notificacoes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id     UUID REFERENCES profiles(id),
  solicitacao_id UUID REFERENCES solicitacoes(id) ON DELETE CASCADE,
  mensagem       TEXT,
  lida           BOOLEAN DEFAULT FALSE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger: cria perfil automaticamente ao criar usuário no Auth
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, nome, email)
  VALUES (NEW.id, split_part(NEW.email, '@', 1), NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Sem RLS: acesso livre (sistema interno)
ALTER TABLE profiles     DISABLE ROW LEVEL SECURITY;
ALTER TABLE solicitacoes DISABLE ROW LEVEL SECURITY;
ALTER TABLE notificacoes DISABLE ROW LEVEL SECURITY;

-- Realtime para notificações
ALTER PUBLICATION supabase_realtime ADD TABLE notificacoes;

-- ──────────────────────────────────────────────────────────────
-- GERENCIAR USUÁRIOS (rode após criar o usuário no painel Auth)
-- ──────────────────────────────────────────────────────────────

-- Ver todos os usuários:
-- SELECT id, nome, email, role, departamento FROM profiles;

-- Promover para supervisor:
-- UPDATE profiles SET role = 'supervisor', departamento = 'Financeiro' WHERE email = 'ana@empresa.com';

-- Promover para diretor:
-- UPDATE profiles SET role = 'diretor', departamento = 'Diretoria' WHERE email = 'roberto@empresa.com';

-- TABELA: histórico de ações
CREATE TABLE historico (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id UUID REFERENCES solicitacoes(id) ON DELETE CASCADE,
  usuario_id     UUID REFERENCES profiles(id),
  descricao      TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE historico DISABLE ROW LEVEL SECURITY;
