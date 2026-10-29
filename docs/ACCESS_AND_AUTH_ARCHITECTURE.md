# Arquitetura proposta: acesso, autenticação e colaboradores

**Estado:** identidade interna, schema de colaboradores, primeira camada centralizada de permissões e página dedicada de autenticação implementados no código. A migração de banco ainda precisa ser aplicada ao ambiente; sessões revogáveis e escopo por organização/planta continuam pendentes.

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
- `auth_sessions`: hash do refresh token, conta, criação, expiração, revogação e metadados mínimos do dispositivo.
- `audit_logs`: autor referenciado pela conta e detalhes sanitizados, sem senhas, tokens ou hashes.

O schema atual conserva a tabela legada `users` para preservar compatibilidade, acrescenta `login_name` e `employee_id`, permite `email` nulo e cria `employees`. Ainda não existem `organization_memberships`, tabelas de permissões ou `auth_sessions`.

A migração `src/db/migrations/20261029_access_accounts.sql` cria `organizations` caso ainda não exista, preenche logins legados como `conta-<id>`, mantém login por e-mail como compatibilidade, torna o e-mail opcional, cria colaboradores e converte perfis antigos. Execute com `npm run db:migrate:access` usando `SQL_ADMIN_USER` e `SQL_ADMIN_PASSWORD` do banco escolhido. O comando é transacional e pode ser repetido.

## Estado da implementação (atualizado em 2026-10-29)

- **Aplicado — proteção básica:** todos os endpoints de negócio, incluindo estatísticas, sincronização Protheus e rastreabilidade, exigem token autenticado; `/health` permanece público.
- **Aplicado — elevação de privilégio removida:** cadastro público e login Firebase sem provisionamento foram retirados. O middleware aceita apenas JWT nativo e recarrega conta, estado e perfil do banco em cada requisição. Conta inativa ou removida perde acesso imediatamente.
- **Aplicado — perfis coerentes:** `UserRole` é a fonte única com `ADMIN`, `SUPERVISOR`, `OPERATOR` e `AUDITOR`. O perfil Inspetor de Qualidade foi removido; perfis legados `QUALITY_INSPECTOR` e desconhecidos são tratados temporariamente como `OPERATOR` (menor privilégio). `MANAGER` e `VIEWER` são normalizados para `SUPERVISOR` e `AUDITOR`.
- **Aplicado — gestão de contas:** interface chama o cadastro de contas de acesso, visível apenas para administradores. A API também exige `ADMIN` para consultar/criar/alterar/excluir contas; criação exige senha de pelo menos 12 caracteres e não aceita perfil fora da lista. Não é possível remover a própria conta em uso nem a última conta administradora ativa.
- **Aplicado — login sem e-mail:** formulário e API usam `loginName` + senha. E-mail é opcional no cadastro de contas; o login também aceita e-mail antigo durante a migração. Novos logins aceitam 3–40 caracteres ASCII normalizados para minúsculas.
- **Aplicado — primeiro administrador:** `/auth/setup-status` verifica se existe administrador ativo com senha configurada. `/auth/bootstrap-admin` cria um administrador sob `BOOTSTRAP_SECRET` de pelo menos 32 caracteres, em transação e com lock; isso também permite provisionar o acesso em bancos com contas legadas sem senha, sem abrir cadastro público. Remova o segredo de bootstrap do ambiente depois de configurar a conta.
- **Aplicado — página de entrada:** usuários sem sessão veem uma página dedicada, com login, configuração protegida do primeiro administrador e explicação dos fluxos resolvidos pelo sistema (rastreabilidade, visibilidade da operação, dados Protheus e auditoria). O idioma escolhido também é respeitado nessa página. Falha ao consultar o estado de setup não libera nem presume acesso: mostra erro e permite tentar novamente.
- **Aplicado — orientação para o primeiro acesso:** o passo a passo de secrets, migração, criação do administrador e remoção de `BOOTSTRAP_SECRET` está em `docs/PRIMEIRO_ACESSO.md`. Não há credencial padrão no código.
- **Aplicado — prévia local protegida:** há um toggle de desenvolvimento documentado para mostrar o sistema com uma identidade `ADMIN` sintética. A API só aceita o bypass fora de `NODE_ENV=production` e bloqueia todas as mutações enquanto o modo estiver ativo. O toggle fica desligado no repositório e a autenticação normal permanece intacta.
- **Aplicado — separação de domínio:** existe `employees` sem credenciais e `users.employee_id` opcional. A área de Configurações chama o cadastro de contas de **Contas de acesso**, visível apenas para `ADMIN`; o cadastro/controle de colaboradores continua fora do escopo atual.
- **Aplicado — senha:** novas contas criadas pelo administrador exigem 12 caracteres e são hashadas com bcrypt custo 12. Senhas legadas continuam aceitas durante a transição; Argon2id, troca obrigatória no primeiro acesso e recuperação administrativa ainda são melhorias futuras.
- **Aplicado — contrato do login:** a API e o cliente concordam em `{ accessToken, user }`; login retorna erros genéricos para credenciais inválidas e registra tentativas sem registrar senha/chave de bootstrap.
- **Aplicado — segredo de assinatura:** não há segredo padrão no código. `JWT_SECRET` é obrigatório, validado antes de assinar/verificar e deve ter pelo menos 32 caracteres. O carregamento de `.env` ocorre antes dos módulos que inicializam o JWT.
- **Aplicado — permissões centralizadas (etapa inicial):** `src/middleware/access-control.ts` define permissões por recurso/ação e a matriz dos quatro perfis atuais. Rotas de auditoria, integrações, organização, contas, linhas, estoque, ordens e qualidade consultam essas permissões; respostas de negação são genéricas. A matriz preserva os acessos existentes e ainda não aplica escopo por organização/planta.
- **Migração pendente de execução:** este checkout não tem `.env` nem conexão de banco configurada. O código e o runner da migração estão prontos, mas a migração ainda não foi aplicada ao Cloud SQL/AI Studio. Execute-a no banco correto antes de habilitar autenticação nesse ambiente.
- **Revisão da migração:** a migração agora cria `organizations` quando ausente, porque instalações anteriores podem não ter essa tabela. A criação é idempotente e ocorre antes da tabela `employees`, que possui a chave estrangeira para organização.
- **Pendente — multiorganização:** `login_name` ainda é único globalmente e as contas não têm associação a organizações/plantas. Implementar `organization_memberships` antes de operar várias empresas no mesmo banco.
- **Pendente — sessões:** o access token continua guardado em `sessionStorage`; logout limpa o navegador, mas não revoga o JWT no servidor antes de sua expiração de 8 horas. Refresh token rotativo, sessões persistidas e recuperação de senha ainda não foram implementados.
- **Pendente — hardening adicional:** limitação de tentativas, redefinição de senha pelo administrador, troca obrigatória de senha inicial e autorização granular por permissões/escopo de planta.

### Validação do código atual

- `npm run build`: concluído.
- `npm run lint` (`tsc --noEmit`): concluído. Foram removidas propriedades duplicadas dos objetos de tradução mantendo o último valor efetivo, e os novos textos da página de autenticação foram adicionados em inglês e espanhol.

## Sequência de implementação recomendada

1. **Concluídas — segurança e identidade:** removido cadastro aberto e privilégio automático; implementados login interno, bootstrap e separação de contas/colaboradores no schema.
2. **Pendente operacional — banco e primeiro acesso:** revisar o ambiente e executar `npm run db:migrate:access` com as credenciais administrativas do banco correto; depois configurar `JWT_SECRET` e `BOOTSTRAP_SECRET` (pelo menos 32 caracteres), abrir a página de entrada, criar o administrador e remover `BOOTSTRAP_SECRET`.
3. **Em andamento — permissões:** matriz inicial centralizada por recurso/ação já protege as rotas; próxima parte é persistir perfis/permissões configuráveis e aplicar escopo por organização/planta.
4. **Próxima — sessões:** reduzir a duração do access token, persistir sessões, rotacionar refresh token e permitir revogar logout/dispositivos; considerar cookie HttpOnly e proteção CSRF.
5. **Futura — gestão de colaboradores:** construir telas e regras de gestão separadas, com vínculo opcional a conta.

O procedimento operacional completo para criar a primeira conta `ADMIN` está em [`docs/PRIMEIRO_ACESSO.md`](./PRIMEIRO_ACESSO.md). Não existe usuário/senha padrão; o bootstrap protegido é o caminho de primeiro acesso.

## Critérios pendentes para considerar a autenticação completa

- Cadastro público não cria contas nem permite escolher perfil.
- Conta desativada não autentica; falhas não revelam se o login existe.
- Login, renovação, `/auth/me` e logout têm contratos coerentes e sessão revogável. (Renovação e revogação ainda estão pendentes no código atual.)
- Nenhum token ou credencial é tratado como autorização por si só; a API verifica conta, permissão e escopo.
- Nenhum caminho Firebase ou de desenvolvimento concede privilégios automaticamente.
- Migrações e bootstrap administrativo são documentados, repetíveis e não expõem senhas em commits/logs.
