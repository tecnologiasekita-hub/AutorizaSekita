# AutorizaSekita

Sistema interno de autorizações da Sekita, construído com React + Vite e Supabase.

Hoje o projeto já está organizado em um modelo mais genérico de solicitações, pensado para suportar vários formulários sem precisar remodelar o banco a cada novo tipo.

## Stack

- React + Vite
- Supabase Auth
- Supabase Database
- Supabase Storage
- Supabase Realtime
- Vercel

## Fluxo atual

O sistema deixou de depender de um fluxo rígido dentro da tabela `solicitacoes`.

Agora a arquitetura é dividida assim:

- `solicitacoes`
  - núcleo universal da solicitação
- `dados_formulario`
  - JSON com os campos específicos de cada formulário
- `solicitacao_aprovadores`
  - quem precisa aprovar, em qual etapa e com qual status
- `solicitacao_pareceres`
  - decisões formais tomadas no fluxo
- `historico`
  - linha do tempo textual da solicitação

### Status gerais da solicitação

- `pendente`
- `em_aprovacao`
- `aprovado`
- `rejeitado`
- `cancelado`

### Status do aprovador

- `pendente`
- `aprovado`
- `rejeitado`
- `cancelado`

### Papéis de aprovação

- `supervisor`
- `diretor`
- `tesouraria`
- `aprovador`

## Formulários

Atualmente o sistema já trabalha com:

- `renegociacao_venda`

Também existe um formulário genérico em:

- `src/pages/NovaSolicitacao.jsx`

Mesmo não sendo o fluxo principal hoje, ele já foi adaptado para o novo modelo e pode servir de base para próximos formulários.

## Como adicionar um novo formulário

### 1. Criar a página do formulário

Adicionar um novo arquivo em:

- `src/pages/MeuFormulario.jsx`

O submit deve gravar em `solicitacoes` apenas:

- `solicitante_id`
- `formulario_tipo`
- `titulo`
- `descricao`
- `status`
- `dados_formulario`

Tudo que for específico do formulário deve ir para `dados_formulario`.

### 2. Registrar na tela de seleção

Arquivo:

- `src/pages/SelecionarFormulario.jsx`

Adicionar um item em `FORMULARIOS` com:

- `id`
- `titulo`
- `descricao`
- `rota`
- `categoria`
- `cor`

### 3. Criar a rota

Arquivo:

- `src/App.jsx`

Exemplo:

```jsx
<Route
  path="/nova-solicitacao/meu-formulario"
  element={<NonDirectorRoute><MeuFormulario /></NonDirectorRoute>}
/>
```

### 4. Montar o fluxo de aprovação

Depois de criar a solicitação, o formulário deve:

- inserir aprovadores em `solicitacao_aprovadores`
- inserir eventos em `historico`
- inserir notificações em `notificacoes`
- opcionalmente inserir `solicitacao_pareceres` quando a solicitação já nascer aprovada em alguma etapa

### 5. Exibir o formulário nos detalhes

Arquivo:

- `src/pages/DetalhesSolicitacao.jsx`

Se quiser visualização estruturada, adicionar uma renderização específica por `formulario_tipo`.

Hoje já existe esse padrão para:

- `renegociacao_venda`

## Estrutura do frontend

### Páginas principais

- `src/pages/Login.jsx`
- `src/pages/Dashboard.jsx`
- `src/pages/SelecionarFormulario.jsx`
- `src/pages/RenegociacaoVenda.jsx`
- `src/pages/NovaSolicitacao.jsx`
- `src/pages/Solicitacoes.jsx`
- `src/pages/Aprovacoes.jsx`
- `src/pages/DetalhesSolicitacao.jsx`
- `src/pages/Perfil.jsx`

### Utilitários principais

- `src/lib/supabase.js`
- `src/lib/workflow.js`
- `src/lib/notificar.js`

### Layout e navegação

- `src/components/Layout.jsx`
- `src/contexts/AuthContext.jsx`

## Estrutura de banco esperada

O schema de referência do projeto está em:

- `sql/AutorizaSekita-Schema.sql`

As tabelas principais hoje são:

- `profiles`
- `solicitacoes`
- `solicitacao_aprovadores`
- `solicitacao_pareceres`
- `historico`
- `anexos`
- `notificacoes`
- `push_subscriptions`

## Exemplo do modelo de solicitação

### Tabela `solicitacoes`

Campos centrais esperados:

- `id`
- `numero`
- `solicitante_id`
- `formulario_tipo`
- `titulo`
- `descricao`
- `status`
- `dados_formulario`
- `created_at`
- `updated_at`

### Exemplo de `dados_formulario`

```json
{
  "empresa_origem": "13-AFAL",
  "cliente": "Cliente XPTO",
  "valor": 1000,
  "setor_origem": "Comercial",
  "requer_tesouraria": true
}
```

## Ambiente

Crie um `.env` com:

```bash
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-publica
```

## Rodando localmente

```bash
npm install
npm run dev
```

## Observações importantes

- O projeto passou por uma migração do fluxo antigo para o modelo genérico.
- O frontend principal já está apontando para `solicitacao_aprovadores` e `solicitacao_pareceres`.
- O campo `dados_formulario` é a base para os formulários novos.
- Se o banco ainda estiver com colunas legadas em `solicitacoes`, o sistema atual pode continuar funcionando, mas a direção do projeto agora é manter a tabela principal o mais genérica possível.

## Próximos passos recomendados

- revisar o schema definitivo no Supabase para garantir aderência total ao frontend
- adicionar novos formulários reaproveitando o padrão de `RenegociacaoVenda`
- revisar textos e acentuação em telas antigas conforme necessário
