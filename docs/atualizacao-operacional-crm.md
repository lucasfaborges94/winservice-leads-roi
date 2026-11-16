# Atualização operacional do CRM

- Leads: equipamento opcional e lista revisada, origem e campanha como filtros, Kanban e exclusão pelo proprietário. A exclusão remove os contatos, atividades e orçamentos do lead.
- WhatsApp: o webhook usa o equipamento da campanha reconhecida e salva o número como contato do lead. Sem campanha ou equipamento configurado, salva como Não informado.
- Campanhas: IDs externos de conta e campanha, filtros e relatórios manuais no histórico diário. Cada campanha tem um relatório por dia. A importação automática pode atualizar as métricas e a origem de um relatório daquele dia. O campo investimento dos relatórios não altera os totais do ROI, calculados pelo histórico de pagamentos.
- Orçamentos: busca, Kanban por status e link HTTP/HTTPS para o orçamento detalhado.
- Análise e ROI: filtro por campanha, com os indicadores disponíveis no resumo de campanha. A análise por IA usa a visão geral.
- Layout: ajustes para mobile e para a opção de tema escuro da conta.

## Retorno

Volte o aplicativo para a revisão anterior no Easypanel conforme o guia de publicação. As migrações são aditivas, exceto a restrição de exclusão do lead, que passa a permitir apenas o proprietário. Mantenha colunas e relatórios gravados. Se for necessário voltar o webhook, publique a versão anterior da Edge Function separadamente. O comportamento antigo voltará a depender do default de equipamento do banco e os novos registros perderão a marcação automática até que a correção seja republicada.
