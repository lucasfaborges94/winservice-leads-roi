# Winservice Leads & ROI

Aplicativo de cadastro e acompanhamento de leads, campanhas, orçamentos e resultados de vendas. Feito com Next.js, Supabase Auth/Postgres e Google AI Studio (Gemini).

## O que acompanha

- Cadastro de campanhas com plataforma, identificador externo, página de destino, região, período, orçamento, investimento, cliques, impressões e conversões reportadas pela plataforma.
- Cadastro de leads com campanha e origem de aquisição separados do canal de contato. Exemplo: origem **Google Ads**, campanha **Geladeiras Porto Alegre**, canal **WhatsApp**, identificador **+55...**. Também aceita Telegram, e-mail, ligação, Instagram, site e outros.
- Atribuição UTM, termo de busca, landing page, GCLID, WBRAID e GBRAID.
- Funil comercial, qualificação, histórico de atendimento, próximos retornos, emissão e acompanhamento de orçamentos, pagamentos e receita realizada.
- Painel de custo por lead/cliente, conversões do funil, faturamento e ROI; análise agregada com Gemini, sem enviar dados pessoais dos leads.
- Login, convite de equipe e perfis de proprietário, administrador, vendas, marketing e analista. As permissões são aplicadas no banco por RLS.

## Requisitos

- Node.js 20.9 ou superior.
- Projeto Supabase com Auth por e-mail habilitado.
- Chave de API do Google AI Studio para usar a análise inteligente.

## Configuração local

1. Copie `.env.example` para `.env.local`.
2. Preencha `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` com os dados do projeto Supabase.
3. Para convites à equipe, configure `SUPABASE_SECRET_KEY` no servidor. Essa chave nunca deve usar o prefixo `NEXT_PUBLIC_` nem ser publicada no navegador.
4. Para as análises, configure `GEMINI_API_KEY` obtida no Google AI Studio. A chave é usada apenas no servidor.
5. Instale dependências e inicie o app:

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`, crie o primeiro usuário e confirme o e-mail caso a confirmação esteja habilitada no Supabase. O primeiro acesso cria a equipe Winservice e atribui o perfil de proprietário.

## Banco de dados

A migração versionada em `supabase/migrations/202611130001_marketing_leads_crm.sql` cria as tabelas `marketing_*`, índices, políticas RLS e funções de leitura agregada. A estrutura usa organização como limite de isolamento. Só perfis autorizados consultam os contatos; o perfil de analista recebe indicadores sem dados pessoais.

Para um projeto Supabase novo, aplique a migração antes de abrir o app. O projeto Winservice usado durante o desenvolvimento já recebeu essa migração.

## Perfis

| Perfil | Acesso |
| --- | --- |
| Proprietário | Acesso completo e controle da equipe |
| Administrador | Leads, campanhas, orçamentos, resultados e equipe |
| Vendas | Contatos, funil e orçamentos |
| Marketing | Campanhas e resultados agregados |
| Analista | Consulta de campanhas, funil e ROI sem dados pessoais |

## Publicação

Configure as variáveis de `.env.example` no ambiente de hospedagem. `NEXT_PUBLIC_APP_URL` deve apontar para o endereço publicado para direcionar convites da equipe. No Supabase, ajuste os endereços permitidos de autenticação para incluir o endereço do app. Nunca coloque chaves secretas do Supabase ou do Gemini no Git.

## Privacidade

As tabelas públicas deste app exigem sessão autenticada e políticas de acesso por organização e perfil. A chave administrativa do Supabase e a chave Gemini são usadas exclusivamente em rotas do servidor. A análise com IA recebe somente métricas agregadas.

