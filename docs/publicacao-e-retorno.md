# Histórico de publicação e retorno de versão

A cada push na branch `main`, a automação **Relatório de publicação** gera um documento Markdown. Abra **Actions → Relatório de publicação → execução do push**. O resumo mostra a revisão anterior e a nova, os commits e os arquivos alterados. O arquivo `relatorio-publicacao.md` também fica disponível no artefato da execução por 90 dias.

O relatório descreve o código recebido pelo GitHub. Confirme em **Easypanel → evolution → leads-roi → Deployments** qual revisão foi publicada com sucesso. A revisão anterior ao push pode também ter falhado no deploy.

## Voltar o aplicativo

1. Identifique no Easypanel a última revisão que funcionou e localize o SHA no GitHub. Se houver mudanças no Supabase, faça a checagem abaixo antes de voltar.
2. Se o problema estiver em um commit isolado, abra um PR que reverta esse commit e valide antes de mesclar. O push na `main` aciona o deploy automático.
3. Para publicar uma revisão anterior inteira sem reescrever o histórico, crie uma branch a partir do SHA conhecido. No Easypanel, em **Source → GitHub**, selecione essa branch, salve e clique em **Deploy**. Confirme **Success** e verifique o aplicativo. Volte a apontar para `main` apenas depois de corrigir e validar essa branch.
4. Registre a revisão restaurada e o resultado nas notas do incidente.

## Supabase e integrações

- **Migrações:** voltar o app não desfaz alterações no banco. Verifique se a versão anterior aceita o esquema atual. Se necessário, prepare uma migração de correção que preserve os leads. Restaurar um backup pode perder registros posteriores ao backup.
- **Edge Functions:** voltam separadamente. Use o código da revisão estável e confira a compatibilidade com banco, segredos e URL do Chatwoot.
- **Configuração:** valide variáveis de ambiente e integrações separadamente. Registre nomes e mudanças de configuração sem incluir valores secretos.
- **Verificação após retorno:** abra o Leads ROI, faça login e confira campanhas e leads. Se o incidente envolveu o Chatwoot, teste novamente a entrada e a deduplicação na inbox 17.

Mudanças feitas diretamente no Easypanel, Supabase ou Chatwoot só aparecem no relatório se também forem documentadas em um commit.
