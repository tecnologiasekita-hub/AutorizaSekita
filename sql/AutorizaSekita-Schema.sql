-- ============================================================
-- AutorizaSekita — Schema completo do banco de dados
-- Sekita Agronegócios · Versão 3.0 · Março 2026
-- ============================================================
-- Execute este arquivo no Supabase → SQL Editor
-- ATENÇÃO: Este script cria as tabelas do zero.
-- Se já existirem, use os ALTER TABLE no final.
-- ============================================================


-- ============================================================
-- 1. PROFILES
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome          text NOT NULL,
  email         text,
  role          text NOT NULL CHECK (role IN ('solicitante', 'supervisor', 'diretor')),
  departamento  text,
  supervisor_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  diretor_id    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    timestamptz DEFAULT now()
);

-- Trigger para criar perfil automaticamente ao registrar usuário
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO profiles (id, nome, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'solicitante')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- ============================================================
-- 2. DEPARTAMENTOS
-- ============================================================
CREATE TABLE IF NOT EXISTS departamentos (
  id     uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nome   text NOT NULL UNIQUE,
  ativo  boolean DEFAULT true
);

INSERT INTO departamentos (nome) VALUES
  ('TI'),
  ('Controladoria'),
  ('Tesouraria'),
  ('Ambiental'),
  ('Contas a Pagar'),
  ('Compras'),
  ('Assinatura Digital'),
  ('Jurídico'),
  ('Financeiro'),
  ('Comercial')
ON CONFLICT (nome) DO NOTHING;


-- ============================================================
-- 3. SOLICITACOES
-- ============================================================
CREATE TABLE IF NOT EXISTS solicitacoes (
  id                       uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  numero                   serial UNIQUE,
  titulo                   text NOT NULL,
  descricao                text,
  valor                    numeric CHECK (valor >= 0),
  categoria                text,
  formulario_tipo          text,
  dados_formulario         jsonb DEFAULT '{}'::jsonb,
  setor_origem             text,
  urgencia                 text DEFAULT 'normal',
  status                   text NOT NULL DEFAULT 'pendente',

  -- Solicitante
  solicitante_id           uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Supervisor
  supervisor_id            uuid REFERENCES profiles(id) ON DELETE SET NULL,
  supervisor_comentario    text,
  supervisor_aprovado_em   timestamptz,

  -- Rejeição
  rejeitado_por_id         uuid REFERENCES profiles(id) ON DELETE SET NULL,
  rejeitado_por_role       text,
  motivo_rejeicao          text,
  rejeitado_em             timestamptz,

  -- Tesouraria (exclusivo Renegociação de Venda)
  requer_tesouraria        boolean DEFAULT false,
  tesouraria_status        text,
  tesouraria_autorizado_por uuid REFERENCES profiles(id) ON DELETE SET NULL,
  tesouraria_autorizado_em  timestamptz,
  tesouraria_comentario    text,

  created_at               timestamptz DEFAULT now(),
  updated_at               timestamptz DEFAULT now()
);


-- ============================================================
-- 4. SOLICITACAO_DIRETORES
-- ============================================================
CREATE TABLE IF NOT EXISTS solicitacao_diretores (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  solicitacao_id uuid NOT NULL REFERENCES solicitacoes(id) ON DELETE CASCADE,
  diretor_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status         text NOT NULL DEFAULT 'pendente',
  comentario     text,
  decidido_em    timestamptz,
  created_at     timestamptz DEFAULT now(),
  UNIQUE(solicitacao_id, diretor_id)
);


-- ============================================================
-- 5. ANEXOS
-- ============================================================
CREATE TABLE IF NOT EXISTS anexos (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  solicitacao_id uuid NOT NULL REFERENCES solicitacoes(id) ON DELETE CASCADE,
  nome_arquivo   text NOT NULL,
  storage_path   text NOT NULL,
  mime_type      text,
  tamanho_bytes  bigint,
  uploaded_by    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at     timestamptz DEFAULT now()
);


-- ============================================================
-- 6. HISTORICO
-- ============================================================
CREATE TABLE IF NOT EXISTS historico (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  solicitacao_id uuid NOT NULL REFERENCES solicitacoes(id) ON DELETE CASCADE,
  usuario_id     uuid REFERENCES profiles(id) ON DELETE CASCADE,
  descricao      text NOT NULL,
  created_at     timestamptz DEFAULT now()
);


-- ============================================================
-- 7. NOTIFICACOES
-- ============================================================
CREATE TABLE IF NOT EXISTS notificacoes (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  usuario_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  solicitacao_id uuid REFERENCES solicitacoes(id) ON DELETE CASCADE,
  mensagem       text NOT NULL,
  lida           boolean DEFAULT false,
  created_at     timestamptz DEFAULT now()
);


-- ============================================================
-- 8. PUSH_SUBSCRIPTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint     text NOT NULL,
  subscription jsonb NOT NULL,
  created_at   timestamptz DEFAULT now(),
  UNIQUE(user_id, endpoint)
);


-- ============================================================
-- 9. RLS (Row Level Security)
-- ============================================================

-- profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Usuários veem todos os perfis" ON profiles;
CREATE POLICY "Usuários veem todos os perfis"
  ON profiles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Usuário atualiza próprio perfil" ON profiles;
CREATE POLICY "Usuário atualiza próprio perfil"
  ON profiles FOR UPDATE TO authenticated USING (id = auth.uid());

-- solicitacoes
ALTER TABLE solicitacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Autenticados veem solicitacoes" ON solicitacoes;
CREATE POLICY "Autenticados veem solicitacoes"
  ON solicitacoes FOR ALL TO authenticated USING (true);

-- solicitacao_diretores
ALTER TABLE solicitacao_diretores DISABLE ROW LEVEL SECURITY;

-- anexos
ALTER TABLE anexos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Autenticados gerenciam anexos" ON anexos;
CREATE POLICY "Autenticados gerenciam anexos"
  ON anexos FOR ALL TO authenticated USING (true);

-- historico
ALTER TABLE historico ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Autenticados veem historico" ON historico;
CREATE POLICY "Autenticados veem historico"
  ON historico FOR ALL TO authenticated USING (true);

-- notificacoes
ALTER TABLE notificacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Usuário vê próprias notificações" ON notificacoes;
CREATE POLICY "Usuário vê próprias notificações"
  ON notificacoes FOR ALL TO authenticated USING (usuario_id = auth.uid());

-- push_subscriptions
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Usuário gerencia suas próprias subscriptions" ON push_subscriptions;
CREATE POLICY "Usuário gerencia suas próprias subscriptions"
  ON push_subscriptions FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());


-- ============================================================
-- 10. STORAGE — Bucket anexos
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('anexos', 'anexos', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Autenticados podem ler anexos" ON storage.objects;
CREATE POLICY "Autenticados podem ler anexos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'anexos');

DROP POLICY IF EXISTS "Autenticados podem fazer upload" ON storage.objects;
CREATE POLICY "Autenticados podem fazer upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'anexos');

DROP POLICY IF EXISTS "Autenticados podem deletar anexos" ON storage.objects;
CREATE POLICY "Autenticados podem deletar anexos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'anexos');


-- ============================================================
-- 11. FOREIGN KEYS — ON DELETE automático
-- (Execute se as FKs antigas não têm CASCADE/SET NULL)
-- ============================================================

-- solicitacoes
ALTER TABLE solicitacoes DROP CONSTRAINT IF EXISTS solicitacoes_solicitante_id_fkey;
ALTER TABLE solicitacoes ADD CONSTRAINT solicitacoes_solicitante_id_fkey
  FOREIGN KEY (solicitante_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE solicitacoes DROP CONSTRAINT IF EXISTS solicitacoes_supervisor_id_fkey;
ALTER TABLE solicitacoes ADD CONSTRAINT solicitacoes_supervisor_id_fkey
  FOREIGN KEY (supervisor_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE solicitacoes DROP CONSTRAINT IF EXISTS solicitacoes_rejeitado_por_id_fkey;
ALTER TABLE solicitacoes ADD CONSTRAINT solicitacoes_rejeitado_por_id_fkey
  FOREIGN KEY (rejeitado_por_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE solicitacoes DROP CONSTRAINT IF EXISTS solicitacoes_tesouraria_autorizado_por_fkey;
ALTER TABLE solicitacoes ADD CONSTRAINT solicitacoes_tesouraria_autorizado_por_fkey
  FOREIGN KEY (tesouraria_autorizado_por) REFERENCES profiles(id) ON DELETE SET NULL;

-- profiles
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_supervisor_id_fkey;
ALTER TABLE profiles ADD CONSTRAINT profiles_supervisor_id_fkey
  FOREIGN KEY (supervisor_id) REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_diretor_id_fkey;
ALTER TABLE profiles ADD CONSTRAINT profiles_diretor_id_fkey
  FOREIGN KEY (diretor_id) REFERENCES profiles(id) ON DELETE SET NULL;

-- solicitacao_diretores
ALTER TABLE solicitacao_diretores DROP CONSTRAINT IF EXISTS solicitacao_diretores_solicitacao_id_fkey;
ALTER TABLE solicitacao_diretores ADD CONSTRAINT solicitacao_diretores_solicitacao_id_fkey
  FOREIGN KEY (solicitacao_id) REFERENCES solicitacoes(id) ON DELETE CASCADE;

ALTER TABLE solicitacao_diretores DROP CONSTRAINT IF EXISTS solicitacao_diretores_diretor_id_fkey;
ALTER TABLE solicitacao_diretores ADD CONSTRAINT solicitacao_diretores_diretor_id_fkey
  FOREIGN KEY (diretor_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- anexos
ALTER TABLE anexos DROP CONSTRAINT IF EXISTS anexos_solicitacao_id_fkey;
ALTER TABLE anexos ADD CONSTRAINT anexos_solicitacao_id_fkey
  FOREIGN KEY (solicitacao_id) REFERENCES solicitacoes(id) ON DELETE CASCADE;

-- historico
ALTER TABLE historico DROP CONSTRAINT IF EXISTS historico_solicitacao_id_fkey;
ALTER TABLE historico ADD CONSTRAINT historico_solicitacao_id_fkey
  FOREIGN KEY (solicitacao_id) REFERENCES solicitacoes(id) ON DELETE CASCADE;

ALTER TABLE historico DROP CONSTRAINT IF EXISTS historico_usuario_id_fkey;
ALTER TABLE historico ADD CONSTRAINT historico_usuario_id_fkey
  FOREIGN KEY (usuario_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- notificacoes
ALTER TABLE notificacoes DROP CONSTRAINT IF EXISTS notificacoes_solicitacao_id_fkey;
ALTER TABLE notificacoes ADD CONSTRAINT notificacoes_solicitacao_id_fkey
  FOREIGN KEY (solicitacao_id) REFERENCES solicitacoes(id) ON DELETE CASCADE;

ALTER TABLE notificacoes DROP CONSTRAINT IF EXISTS notificacoes_usuario_id_fkey;
ALTER TABLE notificacoes ADD CONSTRAINT notificacoes_usuario_id_fkey
  FOREIGN KEY (usuario_id) REFERENCES profiles(id) ON DELETE CASCADE;


-- ============================================================
-- 12. CAMPOS GENERICOS PARA MULTIPLOS FORMULARIOS
-- (Execute em bancos ja existentes)
-- ============================================================
ALTER TABLE solicitacoes
  ADD COLUMN IF NOT EXISTS formulario_tipo text;

ALTER TABLE solicitacoes
  ADD COLUMN IF NOT EXISTS dados_formulario jsonb DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_solicitacoes_formulario_tipo
  ON solicitacoes (formulario_tipo);

CREATE INDEX IF NOT EXISTS idx_solicitacoes_dados_formulario
  ON solicitacoes
  USING gin (dados_formulario);


-- ============================================================
-- FIM DO SCRIPT
-- ============================================================
