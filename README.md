# AutorizaSekita

Sistema interno de autorizacoes com fluxo por papel:
solicitante -> supervisor -> diretor.

## Stack

- React + Vite
- Supabase Auth
- Supabase Database + Realtime
- Vercel para deploy

## Fluxo atual

- Solicitante cria uma solicitacao com status `pendente`
- Supervisor aprova e move para `aprovado_supervisor`
- Diretor aprova e finaliza como `aprovado`
- Supervisor ou diretor podem rejeitar como `rejeitado`

## Banco de dados real

O arquivo [sql/sql-inicial.sql](./sql/sql-inicial.sql) foi alinhado com o schema que voce informou usar no Supabase:

- `profiles`
- `solicitacoes`
- `notificacoes`
- `historico`
- trigger para criar profile ao criar usuario
- realtime habilitado para `notificacoes`
- RLS desligado, como no ambiente atual

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

## Observacao importante

Hoje o projeto esta coerente com o banco real que voce descreveu, mas a seguranca ainda depende muito do frontend porque o Supabase esta sem RLS. Para uso interno controlado isso pode funcionar, mas para endurecer o sistema o ideal e mover as regras criticas para policies ou RPCs.

## Pendencia do briefing compartilhado

Voce pediu para estruturar o projeto tambem com base no prompt compartilhado em `https://chatgpt.com/share/69b1b04d-48ac-8004-be95-acf5a026591a`, mas esse conteudo nao abriu daqui. Assim que voce colar esse briefing aqui, eu consigo ajustar a estrutura final com fidelidade ao que voce definiu la.
