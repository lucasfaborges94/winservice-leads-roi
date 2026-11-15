# Integração Chatwoot com o Leads ROI

## MVP em produção

O webhook **Leads ROI — Chatwoot Inbox 17** da conta Winservice está inscrito em **Mensagem criada** e aponta para a função `chatwoot-leads-inbox17` no Supabase. A configuração do Chatwoot envia eventos de todas as caixas da conta. A função valida a assinatura HMAC sobre o corpo bruto, rejeita timestamps fora da janela de cinco minutos e só grava mensagens recebidas da inbox 17 com telefone válido. O fluxo anterior do n8n fica inativo.

| Variável | Uso |
| --- | --- |
| `CHATWOOT_LEADS_WEBHOOK_SECRET` | Segredo do webhook para validar a assinatura. |
| `LEADS_ROI_ORGANIZATION_ID` | Equipe Winservice que recebe os leads. |
| `LEADS_ROI_CREATED_BY` | Usuário do Leads ROI ao qual o cadastro automático é atribuído. Hoje é o proprietário da equipe. |

As três variáveis ficam em **Supabase → Edge Functions → Secrets**. Os dois IDs são configurações de encaminhamento e auditoria. O segredo é a credencial. Ao rotacioná-lo no Chatwoot, atualize o valor correspondente no Supabase.

A função grava em `marketing_leads` com canal WhatsApp e origem **Desconhecido**. O ID do lead deriva da conversa e o conflito na chave primária é ignorado, preservando o primeiro registro. No teste de 15/11/2026, havia zero leads automáticos antes do envio e um após duas mensagens na mesma conversa. Uma requisição sem assinatura retornou HTTP 401.

## Antes de conectar outra empresa

1. Criar um cadastro de integrações por organização. Cada integração deve ter um identificador próprio, o endereço da instância do Chatwoot, o ID da conta, a inbox permitida, um segredo exclusivo, status e responsável pelo cadastro. Vincular o responsável à mesma organização e preferir uma identidade de automação para auditoria.
2. Emitir uma URL por integração. Usar seu identificador para carregar a configuração e o segredo do lado do servidor. Validar a assinatura e a conta/inbox definidas no cadastro antes de gravar. A organização de destino vem do cadastro, nunca do evento recebido.
3. Restringir a gestão das integrações aos administradores da própria organização. Manter segredos fora do código, do navegador, das respostas da API e dos logs. Permitir rotação e desativação por integração.
4. Garantir deduplicação atômica com uma restrição única para `(integration_id, conversation_id)`. Atribuir campanhas apenas quando a correspondência for confiável e pertencer à mesma organização.
5. Migrar a Winservice primeiro. Associar os leads já importados às respectivas conversas para preservar a deduplicação na troca do endpoint. Verificar o novo fluxo antes de desativar a rota do MVP.
6. Validar com duas organizações e IDs de conversa coincidentes. Testar assinatura inválida, integração desativada, conta ou inbox divergente, reenvio simultâneo, rotação de segredo e isolamento entre empresas. Conferir também quais caixas o Chatwoot envia para cada integração, pois o filtro atual atua depois do recebimento.
