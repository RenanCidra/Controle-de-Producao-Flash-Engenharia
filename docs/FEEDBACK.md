# Ajuda e feedback interno

## Menu da conta

O menu reutilizável `UserAccountMenu` é usado na barra lateral do sistema, na Central de Comunicação e no Assistente em tela cheia. No desktop, o cartão da conta e Ajuda abrem ao passar o mouse; clique por teclado continua acessível. Em dispositivos compactos, toque/clique abre o cartão. O menu mede o cartão de origem e recalcula posição/tamanho conforme viewport, rolagem e redimensionamento; o conteúdo fica limitado à área visível e pode rolar. No mobile, a lista de Ajuda navega dentro do próprio menu. O painel oferece Central de Ajuda, Central de Privacidade, Notas de versão, atalhos, documentos legais, Sobre a Flash e relato de bug. A tela de Configurações continua sem esse menu.

Os atalhos `Ctrl+/` (ou `Cmd+/` no Mac) abrem a lista de comandos; `Ctrl+K`/`Cmd+K` alterna o Assistente Flash; `Esc` fecha diálogos e menus que estão abertos. Atalhos não são capturados enquanto o foco está em campos de texto.

## Feedback

Qualquer conta autenticada pode registrar uma sugestão, dúvida ou problema em **Ajuda → Enviar feedback**. O formulário limita título (120 caracteres), descrição (3.000) e tela de origem (120), e a API deriva o autor da sessão autenticada. O feedback é salvo em `feedback_submissions`, distinto de ocorrências de produção. O endpoint não envia e-mail nem cria notificações externas.

`ADMIN` e `SUPERVISOR` podem abrir **Ajuda → Feedback recebido**, consultar os 100 envios mais recentes e alterar a situação entre `NEW`, `IN_REVIEW`, `PLANNED`, `COMPLETED` e `DECLINED`. A API verifica `feedback:read` e `feedback:manage`; a visibilidade no menu é apenas uma conveniência. Inclusões e mudanças de situação geram eventos na auditoria.

### Banco e implantação

A migração incremental `src/db/migrations/20261103_feedback.sql` cria tabela, restrições de categoria/tamanho/situação e índices. Aplique no banco-alvo com credenciais administrativas configuradas no ambiente:

```powershell
npm run db:migrate:feedback
```

A migração é transacional e não altera dados de contas ou colaboradores. O código por si só não significa que o banco de produção recebeu essa migração. Enquanto ela não for executada, as rotas do feedback persistente não funcionarão no banco.

### Prévia local

Com `DEV_PREVIEW_AUTH` ativo, o backend continua bloqueando mutações. Para permitir que a interface seja explorada, o formulário guarda o envio no `localStorage` deste navegador, por UID sintético. A mensagem explica que a sugestão não foi enviada ao servidor. Esse armazenamento é somente demonstrativo e não deve ser considerado uma caixa de feedback operacional.

Anexos, notificações, respostas ao autor, prazos/SLA e integração com gestão de ocorrências ficam fora desta primeira versão.
