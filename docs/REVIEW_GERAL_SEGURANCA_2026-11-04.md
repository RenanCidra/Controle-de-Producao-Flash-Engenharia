# Revisão geral do NexusPCP — 04/11/2026

## Escopo e limites

Revisão do código-fonte atual, arquitetura, navegação, dependências, autenticação/autorização, API, experiência da Central de Comunicação e artefatos de produção. Tentativas dinâmicas foram limitadas ao servidor local `localhost:3000`, em modo de prévia; nenhum endereço público, banco de produção ou API de terceiro foi alvo.

O banco do ambiente local respondeu como offline durante esta revisão. Portanto, não foi possível confirmar comportamento com dados reais, aplicar migrações neste banco, verificar isolamento organizacional com múltiplos usuários reais nem simular sincronização com o Protheus. Strix não está instalado e Docker não está disponível nesta máquina; a etapa dinâmica é uma verificação manual dirigida, não um pentest automatizado ou certificação.

## Resumo executivo

O projeto tem boas bases para um espelho operacional interno: autenticação nativa, autorização no servidor, sessões revogáveis, auditoria, API organizada por módulos, migrações incrementais e separação entre contas e colaboradores. A aplicação ainda não é um conector de leitura do Protheus: recebe arquivos/cargas e a API simulada ajuda a validar relatórios. Não tratar os dados locais como estado atual do ERP até existir integração suportada e indicador de atualização confiável.

Esta revisão corrigiu o posicionamento do bloqueio de escrita da prévia local, a validação de segredo JWT no início em produção, a política de mídia CSP, a descoberta da Central na navegação, a divisão de módulos em pacotes sob demanda, o tratamento de falha de renderização de módulo e o inventário de dependências. A auditoria npm concluiu com zero vulnerabilidades conhecidas no lockfile atualizado.

## SWOT

### Forças

- O Protheus continua definido como origem oficial, com alertas documentados para valores desconhecidos e dados demonstrativos.
- Permissões de negócio são verificadas pelo backend; o JWT é associado a conta ativa e sessão revogável.
- O modelo separa identidade de acesso de cadastro de colaborador e permite conta sem e-mail.
- Ações relevantes têm auditoria, e a integração não deve escrever de volta no ERP.
- O código é organizado por módulos de domínio e usa migrações incrementais.
- A Central de Comunicação tem tela dedicada, grupos/conversas, histórico paginado, áudio privado e controles por associação.

### Fraquezas

- Não existe ainda sincronizador de leitura recorrente do Protheus, contrato de origem ou checkpoint incremental; a carga pode ficar desatualizada sem monitoramento.
- Roteiro, apontamentos e empenhos ainda não têm chaves/relacionamentos suficientes validados para reconstruir todos os fluxos reais.
- Perfis e permissões são uma matriz fixa de código; não há escopo de autorização por organização/planta nas consultas.
- A interface principal não tem roteamento profundo; a navegação é estado de sessão e exige preservar caminhos de retorno manualmente.
- Limitação de requisições e lock de comunicação são locais ao processo; múltiplas réplicas não compartilham esses contadores/estados.
- O token permanece em `sessionStorage`, o que reduz persistência entre sessões, mas o torna acessível a JavaScript da mesma origem se houver XSS.

### Oportunidades

- Criar uma fila de exceções operacionais com próxima operação esperada, operação ausente, fonte e horário da última sincronização, depois de validar o roteiro e a chave imutável dos apontamentos.
- A partir dessa base, montar visão de prioridade com prazo/demanda, etapa atual, dependências OP pai/filha e evidência da origem; não calcular prioridade como verdade até a Flash confirmar regra.
- Conectar mensagens a OPs e, após fechar o processo, converter contexto em ocorrência sem duplicar digitação.
- Adicionar escopo por planta/organização, papéis configuráveis, armazenamento compartilhado de rate-limit e alertas de frescor antes de escalar para mais unidades.
- Usar navegação compartilhada para produção, comunicação e ocorrências, mantendo configurações privilegiadas no menu do perfil.

### Ameaças

- Usuários podem tomar decisões com dados simulados ou espelhados antigos se conexão e “última atualização” não forem explícitas.
- Falta de isolamento por planta/organização é impeditiva para compartilhar uma mesma base entre empresas ou unidades.
- Configuração incorreta de proxy/limites em implantação multi-instância pode produzir bloqueios desiguais ou limitar usuários legítimos.
- XSS, dependências comprometidas e segredos expostos poderiam afetar sessões de usuários internos; CSP, auditoria e revisão de dependências reduzem risco, mas não o eliminam.
- Criar módulos baseados em nomes/observações sem as tabelas de roteiro, apontamentos e empenhos pode produzir um fluxo incorreto com aparência confiável.

## Melhorias feitas

### Segurança e robustez

- O modo `DEV_PREVIEW_AUTH` agora bloqueia mutações antes de montar qualquer rota, inclusive login, bootstrap, logout e troca de senha; o bloqueio antecede também a auditoria HTTP para não gravar efeitos laterais de uma requisição de prévia.
- Em produção, o servidor valida `JWT_SECRET` durante a inicialização e falha fechado se o segredo obrigatório estiver ausente. O modo de prévia continua proibido em produção.
- A política CSP declara `media-src 'self' blob:` para áudio servido pelo backend e prévia local, mantendo a política de fontes restrita.
- A trilha HTTP categoriza mutações da Central, ocorrências e feedback em entidades próprias, facilitando filtrar auditoria por domínio.
- Dependências ganharam `package-lock.json` para instalação reproduzível com npm. Foi removido o SDK Firebase de cliente não utilizado, `drizzle-kit` passou para dependências de desenvolvimento e foram atualizadas transitivas afetadas por avisos do npm. `npm audit` reportou zero vulnerabilidades conhecidas após a mudança.

### Navegação, desempenho e comportamento

- A Central de Comunicação aparece como módulo na barra lateral para ADMIN, SUPERVISOR e OPERATOR, mantendo o botão de telefone flutuante como atalho; AUDITOR não recebe esse acesso, em alinhamento à permissão do backend.
- Telas de módulos passam a ser carregadas sob demanda, reduzindo o pacote inicial e transferindo custo para o módulo selecionado.
- Falhas de renderização de um módulo apresentam uma recuperação localizada e um caminho de volta ao painel, em vez de deixar a aplicação toda em branco.
- Textos do novo estado de falha e dos carregamentos têm traduções pt-BR/en-US/es-ES.
- Não foi criado módulo novo de planejamento/PMP ou fluxo de produção: sem roteiro, empenhos e apontamentos validados, a prioridade é não materializar regras hipotéticas.

## Verificação de segurança e tentativas locais

- Revisão manual de ordem dos middlewares e rotas públicas de autenticação identificou que o antigo bloqueio da prévia era aplicado depois de `authRoutes`; corrigido para acontecer antes das rotas e da trilha de auditoria.
- Após reiniciar o processo com o código atualizado e `DEV_PREVIEW_AUTH=true`, `POST /api/auth/bootstrap-admin`, `POST /api/auth/login` e `POST /api/communications/groups` responderam `403`; as requisições não chegaram aos handlers de gravação.
- Em um processo com preview de autenticação desativado e sem sessão, `GET /api/users`, `/api/stats` e `/api/communications/groups` responderam `401`, mesmo com cabeçalho `X-User-Role: ADMIN` forjado. Um `Origin` externo não recebeu permissão CORS.
- Os cabeçalhos incluíram `X-Content-Type-Options: nosniff` e CSP com `media-src 'self' blob:`.
- Sem Strix/Docker, conta de teste privilegiada e banco disponível, não foram executados testes de IDOR entre usuários, escalada de privilégios com contas de perfis diferentes, abuso de uploads contra o Storage ou testes no deploy Cloud Run.
- O resultado de `npm audit` é inventário de avisos publicados de dependências, não substitui análise de código, pentest autenticado ou revisão do ambiente de produção.

## Riscos mitigados e pendentes

| Tema | Estado | Ação antes de produção/escala |
| --- | --- | --- |
| Escritas acidentais na prévia | Corrigido e verificado localmente | Manter bloqueio ligado em prévias e revisar antes de qualquer modo autenticado de demonstração |
| Segredo JWT ausente em produção | Corrigido no código | Configurar segredo aleatório de pelo menos 32 caracteres no secret manager |
| Dependências vulneráveis conhecidas | `npm audit` limpo no lockfile atual | Reauditar em cada atualização e usar `npm ci` |
| Token acessível a JavaScript | Risco residual | Avaliar cookie HttpOnly/Secure/SameSite com proteção CSRF, sem migrar antes de alinhar login, preview e deploy |
| Rate-limit por processo | Risco de escala | Usar serviço compartilhado (por exemplo, Redis/limiter gerenciado) e chaves por identidade+IP no deploy multi-instância |
| Isolamento de organização/planta | Ainda não implementado | Não compartilhar a base entre organizações/unidades até todas as consultas receberem escopo validado no servidor |
| Auditoria de mutações | Existe, mas não é garantia transacional uniforme | Em ações críticas, persistir o evento junto da transação de negócio e alertar falha de auditoria |
| Migração de reações da Central | Arquivo incluído em `db:migrate:communications` | Aplicar e validar no banco de destino; o banco local desta revisão estava offline |
| Sincronização com Protheus | Não implementada | Definir acesso read-only, autenticação, paginação, checkpoint, métricas e alerta de SLA com TI |
| Fluxo de fabricação | Dados ainda incompletos | Validar roteiro/revisão, apontamentos, empenhos, recurso-setor e OP pai/filha antes de gerar indicadores |

## Referências de produto e segurança

- Sistemas de execução de produção tratam ordem, operações/etapas e confirmações como entidades distintas. Referências: [SAP — confirmação de operações da ordem](https://help.sap.com/docs/SAP_S4HANA_CLOUD_BEST_PRACTICES/2d331e7b035519f1698379a1bdf3d44a/60bcab8998f44eb69854cbe6fc001727.html?locale=en-US&state=PRODUCTION&version=2608), [Odoo — ordens e tarefas de trabalho / Shop Floor](https://www.odoo.com/documentation/master/applications/inventory_and_mrp/manufacturing/basic_setup/manufacturing_work_orders.html) e [Microsoft Dynamics 365 — interface de execução no chão de fábrica](https://learn.microsoft.com/en-us/dynamics365/supply-chain/production-control/production-floor-execution-configure).
- Para segurança, a avaliação é alinhada como guia ao [OWASP ASVS 5.0](https://asvs.owasp.org/) e ao [OWASP Web Security Testing Guide](https://owasp.org/www-project-web-security-testing-guide/), sem afirmar conformidade formal.

## Validação executada e commit

Resultados desta revisão: `npm ci`, `npm run lint`, `npm test` (6/6), `npm run build` concluídos; `npm audit` informou zero vulnerabilidades conhecidas. A compilação ainda avisa que o chunk compartilhado principal supera 500 KB (cerca de 622 KB minificado); a divisão sob demanda reduziu o pacote inicial comparado à build anterior (~915 KB), mas a extração de bibliotecas comuns fica como otimização futura. A interface foi atualizada no preview local e a navegação lateral foi confirmada. As rotas de prévia retornaram 403 para mutações e rotas autenticadas sem sessão retornaram 401 nos probes descritos. Banco local offline. Strix e Docker indisponíveis, portanto sem pentest automatizado/autenticado. Esta revisão foi commitada e sincronizada em `main`; consulte o histórico Git para o identificador.
