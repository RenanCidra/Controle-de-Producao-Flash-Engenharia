# Arquitetura de acesso, autenticação e colaboradores

**Estado atual:** identidade interna, schema de colaboradores, permissões iniciais na API, sessões de acesso revogáveis por navegador, página dedicada de autenticação e preferências pessoais implementados no código. A migração incremental de sessões (`auth_sessions`) e dos espelhos Protheus (`protheus_resources`, `protheus_commitments`) foi aplicada e validada no banco de dados operacional. Refresh tokens rotativos, permissões configuráveis e escopo por organização/planta continuam pendentes.

As contas autenticadas podem trocar a própria senha pela tela de perfil informando a senha atual. O servidor confere o hash existente, exige nova senha com pelo menos 12 caracteres e no máximo 72 bytes e registra a alteração na auditoria sem armazenar senhas nos detalhes. O caminho autenticado é `POST /api/auth/change-password`. A credencial de prévia local não representa uma conta persistida e não habilita essa ação.

O menu **Meu perfil** permite escolher/remover uma foto e selecionar o idioma preferido. Foto e idioma ficam no `localStorage` deste navegador, associados ao UID da conta; não são enviados ao servidor nem sincronizados entre dispositivos. A imagem aceita JPG, PNG ou WebP e o limite é 1 MB. Nome e identificador de acesso são administrados pela equipe responsável. A tela de login usa a imagem industrial em `public/assets/login-production.webp`; no layout mobile o formulário aparece antes do painel visual. O subtítulo que anteriormente aparecia sob a marca foi removido.

## Objetivo

Ter autenticação interna sem exigir e-mail, autorização segura no servidor e uma separação clara entre quem pode entrar no sistema e os registros de colaboradores usados pela gestão. O desenho deve permitir várias organizações e plantas no futuro sem obrigar a ativar todos esses recursos agora.

## Conceitos

```text
Organização (tenant)
  ├── Contas de acesso ── associação opcional ── Colaborador
  ├── Associações da conta à organização/planta
  ├── Perfis (roles) ── permissões (permissions)
  └── Sessões revogáveis
```

- **Conta de acesso:** identidade que autentica e recebe permissões. Tem nome de acesso, credencial e estado; pode existir sem cadastro de colaborador. No código atual, a tabela legada `users` ainda armazena essas contas.
- **Colaborador:** registro de gestão de pessoas. Não concede acesso por si só. A tabela independente `employees` já existe e a conta tem vínculo opcional `employee_id`; a interface de gestão de colaboradores fica para uma etapa futura.
- **Organização e planta:** delimitam os dados acessíveis. Toda consulta e operação deve ser limitada ao escopo autorizado no servidor.
- **Perfil e permissão:** o perfil agrupa permissões legíveis para administração. A API verifica permissões e escopo em cada operação; a interface apenas reflete essas regras.
- **Sessão:** autenticação de um dispositivo/navegador, com expiração e revogação individual.

## Recomendações de produto

- Login com **identificador de acesso + senha**, sem e-mail obrigatório. Hoje o identificador é único no banco inteiro, adequado ao uso atual de uma organização; o futuro modelo de associações permitirá identificadores por organização e seleção de organização no login.
- Não usar matrícula/crachá como senha nem como prova de identidade. Pode ser um campo de referência do colaborador.
- Desativar cadastro público. Contas são criadas por um administrador autorizado ou por fluxo interno de convite/código de uso único. Sem e-mail, o administrador entrega a credencial temporária por canal interno; o usuário deve trocá-la no primeiro acesso.
- Recuperação sem e-mail: redefinição por administrador, com credencial temporária de uso único e auditoria. Não revelar se um nome de acesso existe durante tentativas de login.
- E-mail pode ser armazenado como contato opcional, sem participar da autenticação nem ser requisito de cadastro.

## Perfis iniciais sugeridos

As permissões concretas devem ser definidas por módulo e operação. Estes perfis são pontos de partida, não substituem a checagem de permissão:

| Perfil | Acesso inicial sugerido |
| --- | --- |
| Administrador da organização | Configuração, contas, perfis, integrações e acesso amplo aos dados da organização |
| Supervisor de produção | Ordens, linhas, apontamentos e relatórios operacionais dentro das plantas atribuídas |
| Operador | Consultar ordens atribuídas e registrar apontamentos permitidos |
| Consulta/Auditoria | Leitura e consulta de eventos, sem alterar dados |

Separar no futuro a administração de segurança (contas e perfis) da administração operacional, caso a empresa precise delegar essas tarefas. Não permitir que alguém se eleve a administrador alterando dados enviados pelo navegador.

## Segurança técnica recomendada

- Validar conta ativa e permissões no servidor; não confiar em um perfil guardado no cliente ou exclusivamente no JWT.
- Nunca atribuir `ADMIN` automaticamente durante cadastro ou login federado. Autenticação Google/Firebase, se mantida, deve localizar uma conta previamente provisionada e usar as permissões dela.
- Remover a senha pública de cadastro e não aceitar `role` privilegiado do corpo da requisição.
- Armazenar senhas com hash resistente (preferencialmente Argon2id; migrar hashes existentes com validação no login ou redefinição segura).
- Usar segredo JWT obrigatório vindo do ambiente. Não manter segredo padrão no código.
- Usar access token de curta duração e refresh token rotativo, armazenado no servidor apenas como hash. Permitir revogar sessão por dispositivo e em logout. Se usar cookies HttpOnly/Secure/SameSite, incluir proteção CSRF apropriada.
- Aplicar limite progressivo de tentativas de login e respostas genéricas para credenciais inválidas. Auditar sucesso, falha, criação/desativação de conta, alteração de perfil e encerramento/revogação de sessão.
- Guardar identificador da conta como autor de auditoria; não depender de e-mail para identificar quem executou uma ação.

## Modelo de dados alvo (a detalhar com migrações)

- `organizations`: entidade de organização já existente.
- `accounts`: credencial/identidade de acesso, nome, identificador de login, hash de senha, estado, troca obrigatória de senha e timestamps de segurança.
- `organization_memberships`: associação da conta à organização, estado, perfil e escopos de planta. Unicidade do identificador de login por organização.
- `roles`, `permissions`, `role_permissions`: perfis e permissões sem regras espalhadas por strings em endpoints. Pode começar com perfis padrão protegidos e permissões predefinidas.
- `employees`: cadastro independente de colaboradores, com vínculo opcional de uma conta quando houver necessidade de acesso.
- `auth_sessions`: implementação inicial guarda o hash do identificador aleatório do access token, conta, criação, expiração e revogação individual; refresh tokens rotativos ainda não existem.
- `audit_logs`: autor referenciado pela conta e detalhes sanitizados, sem senhas, tokens ou hashes.

O schema atual conserva a tabela legada `users` para preservar compatibilidade, acrescenta `login_name` e `employee_id`, permite `email` nulo, cria `employees` e inclui `auth_sessions`. Ainda não existem `organization_memberships` nem tabelas de permissões configuráveis.

A migração `src/db/migrations/20261029_access_accounts.sql` cria `organizations` caso ainda não exista, preenche logins legados como `conta-<id>`, mantém login por e-mail como compatibilidade, torna o e-mail opcional, cria colaboradores e converte perfis antigos. Execute com `npm run db:migrate:access` usando `SQL_ADMIN_USER` e `SQL_ADMIN_PASSWORD` do banco escolhido. O comando é transacional e pode ser repetido. A existência do arquivo e do script não confirma que a migração foi aplicada ao banco usado pelo sistema; confirme o estado no ambiente antes da implantação.

## Estado da implementação (atualizado em 2026-10-29)

- **Aplicado — proteção básica:** todos os endpoints de negócio, incluindo estatísticas, sincronização Protheus e rastreabilidade, exigem token autenticado; `/health` permanece público.
- **Aplicado — elevação de privilégio removida:** cadastro público e login Firebase sem provisionamento foram retirados. O middleware aceita apenas JWT nativo e recarrega conta, estado e perfil do banco em cada requisição. Conta inativa ou removida perde acesso imediatamente.
- **Aplicado — perfis coerentes:** `UserRole` é a fonte única com `ADMIN`, `SUPERVISOR`, `OPERATOR` e `AUDITOR`. O perfil Inspetor de Qualidade foi removido; perfis legados `QUALITY_INSPECTOR` e desconhecidos são tratados temporariamente como `OPERATOR` (menor privilégio). `MANAGER` e `VIEWER` são normalizados para `SUPERVISOR` e `AUDITOR`.
- **Aplicado — gestão de contas:** interface chama o cadastro de contas de acesso, visível apenas para administradores. A API também exige `ADMIN` para consultar/criar/alterar/excluir contas; criação exige senha de pelo menos 12 caracteres e não aceita perfil fora da lista. Não é possível remover a própria conta em uso nem a última conta administradora ativa.
- **Aplicado — autenticação flexível por identificador (usuário, ID, UID ou e-mail):** o login na API (`/api/auth/login`) e no cliente aceita o nome de usuário (`login_name`), o ID numérico da conta (`id`, ex.: `1` ou `#1`), o identificador único institucional/sistema (`uid`, ex.: `MAT-1042` ou `usr_...`), o nome próprio cadastrado ou o e-mail de contato para retrocompatibilidade. A verificação criptográfica com bcrypt é realizada sobre o usuário ativo localizado, mantendo respostas seguras contra enumeração.
- **Aplicado — primeiro administrador:** `/auth/setup-status` verifica se existe administrador ativo com senha configurada. `/auth/bootstrap-admin` cria um administrador sob `BOOTSTRAP_SECRET` de pelo menos 32 caracteres, em transação e com lock; isso também permite provisionar o acesso em bancos com contas legadas sem senha, sem abrir cadastro público. Remova o segredo de bootstrap do ambiente depois de configurar a conta.
- **Aplicado — página de entrada responsiva:** usuários sem sessão veem uma página dedicada, com login, configuração protegida do primeiro administrador e imagem industrial sutil à esquerda. No celular o formulário precede o painel visual e os blocos se ajustam à largura disponível. O idioma escolhido também é respeitado. O subtítulo abaixo da marca foi removido. Falha ao consultar o estado de setup não libera nem presume acesso: mostra erro e permite tentar novamente.
- **Aplicado — perfil pessoal:** o usuário pode trocar a própria senha após informar a senha atual. Pode também salvar foto (JPG, PNG ou WebP, até 1 MB) e idioma preferido. Foto e idioma são armazenados no navegador atual por UID e não são sincronizados com servidor/dispositivos; nome e login continuam sob gestão administrativa.
- **Aplicado — orientação para o primeiro acesso:** o passo a passo de secrets, migração, criação do administrador e remoção de `BOOTSTRAP_SECRET` está em `docs/PRIMEIRO_ACESSO.md`. Não há credencial padrão no código.
- **Aplicado — prévia local protegida:** há um toggle de desenvolvimento documentado para mostrar o sistema com uma identidade `ADMIN` sintética. A API só aceita o bypass fora de `NODE_ENV=production` e bloqueia todas as mutações enquanto o modo estiver ativo. O toggle fica desligado no repositório e a autenticação normal permanece intacta.
- **Aplicado — separação de domínio:** existe `employees` sem credenciais e `users.employee_id` opcional. A área de Configurações chama o cadastro de contas de **Contas de acesso**, visível apenas para `ADMIN`; o cadastro/controle de colaboradores continua fora do escopo atual.
- **Aplicado — senha e redefinição administrativa:** novas contas criadas pelo administrador exigem no mínimo 12 caracteres e são armazenadas com hash bcrypt (custo 12). O endpoint `POST /api/users/:id/reset-password` permite que administradores autorizados (`accounts:manage`) redefinam senhas com segurança, aplicando registro na trilha de auditoria.
- **Aplicado — salvaguardas e controle de contas:** a API impede a exclusão da própria conta em uso, impede o auto-rebaixamento/desativação da própria conta de administrador e bloqueia a exclusão ou rebaixamento da última conta administradora ativa do sistema.
- **Aplicado — identificador de usuário (ID / UID):** o sistema associa cada conta a um `uid` único no banco desde o cadastro (podendo receber um código institucional/matrícula opcional de 3 a 36 caracteres alfanuméricos ou gerar o UID padrão do sistema), além do ID numérico sequencial.
- **Aplicado — padronização de dados:** nomes e setores são formatados em Title Case (primeira letra maiúscula e preposições em minúsculas); nomes de login são higienizados sem acentos nem espaços (minúsculas com pontuação permitida); e e-mails são normalizados para minúsculas.
- **Aplicado — contrato do login:** a API e o cliente concordam em `{ accessToken, user }`; login retorna erros genéricos para credenciais inválidas e registra tentativas sem registrar senha/chave de bootstrap.
- **Aplicado — segredo de assinatura:** não há segredo padrão no código. `JWT_SECRET` é obrigatório, validado antes de assinar/verificar e deve ter pelo menos 32 caracteres. O carregamento de `.env` ocorre antes dos módulos que inicializam o JWT.
- **Aplicado — permissões centralizadas (etapa inicial):** `src/middleware/access-control.ts` define permissões por recurso/ação e a matriz dos quatro perfis atuais. Rotas de auditoria, integrações, organização, contas, linhas, estoque, ordens e qualidade consultam essas permissões; respostas de negação são genéricas. A matriz preserva os acessos existentes e ainda não aplica escopo por organização/planta.
- **Aplicado — interface e indicadores de ocorrências:** navegação logo abaixo do cabeçalho abre páginas dedicadas para análise de dados, registros e novo lançamento. A área analítica usa cartões com paleta neutra e poucos acentos semânticos; a consulta concentra busca/filtros, consolidação OP/PV e tabela; o formulário de entrada não é modal. A superfície do módulo é opaca para legibilidade sobre o fundo geral. Contadores, evolução semanal e distribuição por assunto são calculados pelo banco a partir dos registros atuais, sob os filtros ativos. Setor, quantidade afetada e tempo de parada não são exibidos como indicadores até que seus campos sejam mapeados e validados. A importação do histórico Excel está pendente; qualquer carga deve passar por prévia, validação de OP, detecção de duplicidade e confirmação antes da gravação.
- **Aplicado — gestão de ocorrências:** permissões `occurrences:read`, `occurrences:create`, `occurrences:comment` e `occurrences:manage` são verificadas na API. ADMIN/SUPERVISOR podem consultar, registrar, comentar e alterar situação; OPERATOR pode consultar, registrar e acrescentar atualizações; AUDITOR tem leitura. A ocorrência é um registro local ligado por FK à OP no espelho, sem escrita no Protheus. Descrições iniciais não são editáveis/excluíveis; eventos e transições são acrescentados à linha do tempo. O vínculo a planta/organização não está implementado, então o módulo pressupõe uma instalação isolada de fábrica.
- **Migração incremental de ocorrências:** `src/db/migrations/20261029_production_occurrences.sql` cria `production_occurrences` e `production_occurrence_events` e índices, preservando tabelas existentes. A FK impede apagar uma OP do espelho enquanto houver ocorrências ligadas. O script `npm run db:migrate:occurrences` usa `SQL_ADMIN_USER`/`SQL_ADMIN_PASSWORD`; aplicar apenas depois de confirmar o banco e a existência de `protheus_production_orders`. A migração precisa ser executada e validada no ambiente de destino antes de usar o módulo.
- **Aplicado — consulta privilegiada do espelho Protheus:** a leitura paginada e pesquisável das entidades normalizadas exige `protheus-data:read` na API (ADMIN, SUPERVISOR e AUDITOR; OPERATOR não tem a permissão). Ingestão manual Protheus exige `integrations:write`. A interface deixa módulos locais de estoque/qualidade fora da navegação principal e move conectores/APIs e linhas legadas para configurações restritas; nenhum dado ou tabela local foi apagado.
- **Aplicado no código — espelho normalizado de SH1 e empenhos:** `protheus_resources` mantém cadastro SH1 por filial+código; `protheus_commitments` mantém os campos disponíveis de empenho com identidade de origem e vínculo textual à OP. Ambos são pesquisáveis/paginados em Configurações → Conectores Protheus e podem ser recebidos no endpoint de sincronização/importação sob `integrations:write`. Campos cujo significado/unidade não foi confirmado são preservados como texto bruto; nenhuma linha/centro de trabalho é inferido. A migração incremental `src/db/migrations/20261030_protheus_resources_commitments.sql` e o comando `npm run db:migrate:protheus-mirrors` criam somente as tabelas novas e não removem dados. Execute no banco de destino antes de consultar/importar essas entidades. A prévia simulada continua read-only e não alimenta automaticamente o banco operacional.
- **Aplicado — trilha de auditoria completa e paginação:** todos os eventos e mutações significativas do sistema (criação/edição/exclusão de ordens, linhas, estoque, qualidade, contas, permissões, redefinição de senhas, integrações, autenticação e ingestões Protheus) são registrados de forma imutável com ator (ID institucional, UID ou nome de login), IP, agente e detalhes higienizados. A consulta de auditoria (`GET /api/audit-logs`) conta com paginação no banco de dados (`page`, `pageSize`, `total`, `totalPages`), busca textual abrangente e filtros multidimensionais, garantindo desempenho e escalabilidade com grandes volumes de registros.
- **Aplicado — Assistente Flash ("Mago do PCP"):** copiloto operacional de inteligência artificial industrial integrado ao sistema em `/api/copilot/chat` e `/api/copilot/briefing`. O acesso é estritamente autenticado pelo JWT nativo, herdando o perfil de segurança e o contexto do usuário (`ADMIN`, `SUPERVISOR`, `OPERATOR`, `AUDITOR`). As chamadas do modelo utilizam a biblioteca oficial `@google/genai` (`gemini-3.8-flash`) exclusivamente no backend Node.js, com injeção segura de dados em tempo real (espelho de OPs Protheus, ocorrências ativas, itens críticos de estoque, linhas e lotes de sincronização), garantindo zero exposição de credenciais no navegador e proteção contra alucinações via fallback determinístico industrial de alta precisão.
- **Pendente — multiorganização:** `login_name` ainda é único globalmente e as contas não têm associação a organizações/plantas. Implementar `organization_memberships` antes de operar várias empresas no mesmo banco.
- **Aplicado — sessões revogáveis:** access tokens JWT carregam um identificador aleatório de sessão; o servidor guarda apenas seu hash. Logout revoga a sessão do navegador atual, troca de senha revoga as demais sessões e redefinição administrativa revoga todas. Execute `npm run db:migrate:auth-sessions` antes de implantar esta versão. Contas existentes são preservadas; tokens anteriores sem identificador de sessão exigirão novo login. Refresh token rotativo continua pendente.
- **Pendente — autorização granular:** escopo por organização/planta e administração configurável de permissões.

### Proteções de requisição e formulários (2026-10-29 e 2026-10-30)

- **Aplicado — proteção contra tentativas automatizadas:** limites por IP e identificador no login (20 por IP e 30 por identificador em 15 minutos), bootstrap inicial (3 por IP em 30 minutos), troca de senha (20 por IP e 5 por conta em uma hora) e mutações autenticadas (120 por IP em 15 minutos). Há ainda limite geral da API (900 por IP em 15 minutos). As respostas usam HTTP 429 e `Retry-After`.
- **Aplicado — validação de formulários:** limite do corpo HTTP, profundidade, quantidade de campos/listas e tamanho de texto; rejeição de estruturas inválidas e chaves perigosas de protótipo. Rotas de autenticação, contas, estoque, ordens, linhas, qualidade, organização, integrações e importação de arquivo aceitam somente campos previstos. O login valida formato/tamanho antes de executar bcrypt; senhas novas mantêm mínimo de 12 caracteres e máximo de 72 bytes, compatível com bcrypt.
- **Aplicado — SQL injection:** consultas de aplicação usam Drizzle ORM e parâmetros vinculados; valores de formulário não são concatenados como SQL. A única execução SQL textual de migração lê um arquivo SQL estático versionado, e os usos de `sql` nas consultas são templates parametrizados ou expressões constantes. Identificadores/colunas dinâmicos vêm de mapeamentos fixos.
- **Aplicado — cabeçalhos e origem:** desativado `X-Powered-By`, cabeçalhos de segurança e allowlist de CORS por `CORS_ALLOWED_ORIGINS`. `TRUST_PROXY_HOPS` deve refletir exatamente a topologia do proxy reverso; não habilite confiança genérica em cabeçalhos enviados pelo cliente.
- **Aplicado — limite antes do parser:** o limite geral por IP é aplicado antes da leitura e decodificação do corpo HTTP, reduzindo o custo de requisições grandes não autenticadas.
- **Aplicado — CSP restritiva:** além de bloquear objetos e restringir `base-uri`, `form-action` e `frame-ancestors`, o cabeçalho define origens para scripts, estilos, imagens, fontes, conexões e workers. A própria origem e Google Fonts ficam permitidas; a incorporação pelo AI Studio continua limitada a `https://aistudio.google.com`. `X-Frame-Options` não é enviado para manter essa incorporação. Origens HTTPS adicionais podem ser informadas em `CSP_FRAME_ANCESTORS`.
- **Aplicado — dados sensíveis na auditoria:** eventos HTTP genéricos guardam somente rota e status, nunca o corpo da requisição. Assim, perguntas/histórico do Assistente e conteúdo de cargas não são copiados para a tabela de auditoria. Registros históricos anteriores permanecem preservados e devem ser tratados conforme a política de retenção da empresa.
- **Aplicado — endpoints de produção e indicadores:** `/api/traceability/*` verifica `protheus-data:read`; `/api/stats` verifica leitura de ordens e retorna apenas contagens operacionais e status da última carga, sem devolver o cadastro completo da organização ou contagens administrativas.
- **Aplicado — teste de integração:** destinos externos precisam estar em `INTEGRATION_ALLOWED_HOSTS` também fora de produção; sem allowlist, somente loopback é permitido em ambiente local. Em produção exige HTTPS e host permitido, rejeita redirecionamentos, valida nomes de cabeçalho, não lê o corpo da resposta e mantém timeout de 8 segundos. A lista deve conter somente serviços confiáveis e a rede de saída deve ser restrita no proxy/firewall.
- **Aplicado — exportação CSV:** valores textuais iniciados por caracteres interpretáveis como fórmula são prefixados antes de gerar CSV, reduzindo risco de formula injection ao abrir exportações em planilhas.
- **Aplicado — prévia local:** `DEV_PREVIEW_AUTH=true` faz o servidor falhar se `NODE_ENV=production` e limita o bind a `127.0.0.1`; em implantação publicada a variável deve ficar ausente ou `false`.
- **Aplicado — login por nome:** a busca por nome exige correspondência exata e limita o conjunto de candidatas a 10, evitando pesquisa por prefixo e sequência de comparações bcrypt sem limite.
- **Aplicado — dados do Assistente:** a chave Gemini é usada somente no servidor. Em produção, a integração externa fica desativada até a configuração explícita `COPILOT_EXTERNAL_DATA_ENABLED=true`; nesse caso, perguntas e o snapshot operacional são enviados ao Gemini. O padrão é manter desativado até aprovação do tratamento de dados pela empresa.
- **Limitação operacional — rate limit:** contadores ficam em memória por processo e reiniciam com o servidor; em múltiplas instâncias não são compartilhados. Antes de escalar horizontalmente, mover os limites para armazenamento compartilhado (por exemplo Redis) ou gateway equivalente. Configurar limites do proxy/WAF também é recomendado.
- **Pendente — validação semântica por campo:** importação REST do Protheus aceita esquemas de dados variáveis e ainda precisa de validação específica por entidade/campo antes de conectar a fonte oficial. A validação no servidor continua sendo obrigatória; filtros da interface são apenas conveniência.

### Validação do código atual

- `node node_modules/typescript/bin/tsc --noEmit`: concluído em 2026-10-30.
- `node node_modules/vite/bin/vite.js build`: concluído em 2026-10-30; Vite reportou apenas o aviso de chunk acima de 500 kB.
- Testes automatizados e validação dinâmica de segurança não foram executados nesta revisão estática.

## Sequência de implementação recomendada

1. **Concluídas — segurança e identidade:** removido cadastro aberto e privilégio automático; implementados login interno, bootstrap e separação de contas/colaboradores no schema.
2. **Pendente operacional — banco e primeiro acesso:** revisar o ambiente e executar `npm run db:migrate:access` com as credenciais administrativas do banco correto; depois configurar `JWT_SECRET` e `BOOTSTRAP_SECRET` (pelo menos 32 caracteres), abrir a página de entrada, criar o administrador e remover `BOOTSTRAP_SECRET`.
3. **Em andamento — permissões:** matriz inicial centralizada por recurso/ação já protege as rotas; próxima parte é persistir perfis/permissões configuráveis e aplicar escopo por organização/planta.
4. **Em andamento — sessões:** reduzir a duração do access token, implementar refresh token rotativo e avaliar cookie HttpOnly com proteção CSRF. As sessões atuais já podem ser revogadas individualmente.
5. **Planejada — controle de operadores:** evoluir o cadastro de colaboradores sem credenciais para gestão de equipe, alocações com histórico, conciliação segura com apontamentos e autorização no backend. A primeira fase considera `ADMIN` e `SUPERVISOR`; perfil `LEADER` depende de definição de escopo. Ver [`PLANEJAMENTO_CONTROLE_OPERADORES.md`](./PLANEJAMENTO_CONTROLE_OPERADORES.md).

O procedimento operacional completo para criar a primeira conta `ADMIN` está em [`docs/PRIMEIRO_ACESSO.md`](./PRIMEIRO_ACESSO.md). Não existe usuário/senha padrão; o bootstrap protegido é o caminho de primeiro acesso.

## Central de comunicação

- **Primeira etapa implementada:** página dedicada em tela inteira, separada da sidebar/header globais, com conversas diretas, grupos por setor, histórico de mensagens e envio de texto, usando atualização periódica de 10 segundos e a paleta Nexus/Flash. O botão `+` no canto superior direito do cabeçalho da lista **Conversas** busca contas ativas elegíveis; o rascunho individual só é salvo com a primeira mensagem e conversas existentes do mesmo par são reutilizadas. O atalho usa ícone de telefone imediatamente acima do Assistente Flash; há retorno ao sistema e navegação adaptada para telas móveis.
- **Persistência:** grupos, membros e mensagens usam tabelas próprias (`communication_groups`, `communication_group_members`, `communication_messages`), separadas dos registros de ocorrências. A migração incremental é `src/db/migrations/20261031_communications.sql`; aplique com `npm run db:migrate:communications` antes de usar a central.
- **Permissões na API:** `ADMIN`, `SUPERVISOR` e `OPERATOR` podem consultar e enviar mensagens. `ADMIN` e `SUPERVISOR` podem criar grupos. Auditor não recebe as permissões de comunicação.
- **Limites atuais:** grupos têm membros escolhidos na criação e a API verifica essa associação para listar grupos, ler mensagens e enviar mensagens; os participantes de conversas diretas também são verificados em toda leitura e envio. Gestão posterior dos membros, notificações, presença, confirmação de leitura, anexos e criação de ocorrência a partir da conversa ficam para etapas posteriores. A gestão de ocorrências segue independente.

## Assistente Flash — Otimizações de Latência e Performance

- **Cache operacional em memória (TTL 25s):** A agregação dos dados de OPs, ocorrências ativas, saldo de estoque e linhas de produção é armazenada em cache por 25 segundos, eliminando múltiplos roundtrips SQL repetitivos e reduzindo o tempo de consulta de banco de ~800ms para menos de 5ms em turnos subsequentes.
- **Fast-path para consultas operacionais:** Consultas diretas de botões rápidos ("Resumo do Turno", "OPs atrasadas", "Ocorrências abertas", "Estoque crítico", "OP <número>") são atendidas instantaneamente (< 30ms) diretamente a partir do snapshot operacional local, com botões de navegação interativos.
- **Prompt compacto e modelo de baixa latência:** A ingestão para o modelo de IA foi sintetizada em um snapshot leve (< 150 tokens), evitando o envio de lotes inteiros de registros brutos. O tempo de resposta para perguntas abertas e conceituais caiu de dezenas de segundos para ~1,5s, com proteção de timeout estrito (3,5s) e fallback gracioso.


