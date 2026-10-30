# Planejamento — Controle de operadores

## Objetivo

Criar um módulo para manter a relação operacional de operadores, setores/postos e competências, permitindo que supervisão e administração consultem e organizem a equipe sem transformar cada operador em uma conta de acesso ao sistema.

O módulo será uma ferramenta de organização da produção. Não deve avaliar pessoas nem inferir produtividade individual a partir de apontamentos incompletos.

## Base existente

- `employees` já representa colaboradores sem credenciais de login.
- `users.employee_id` permite vincular uma conta de acesso a um colaborador quando isso for necessário.
- O espelho de apontamentos Protheus pode trazer nome/código de operador; a integração oficial ainda depende de confirmação dos campos e identificadores pelo TI.
- Setores e postos existem no sistema, mas a relação oficial com colaboradores precisa ser confirmada.

O módulo deve estender o cadastro existente de forma incremental. Não duplicar colaboradores em `users` e não substituir registros existentes.

## Perfis e escopo de acesso

### Primeira entrega

- **ADMIN:** consulta e administra cadastros, vínculos, setores/postos e parâmetros do módulo.
- **SUPERVISOR:** consulta e mantém a equipe dentro do escopo de fábrica definido para sua conta. Até existir escopo por setor na autorização da API, restringir a gestão ao escopo único da instalação e não simular uma separação que o backend não garante.
- **OPERATOR:** sem acesso ao cadastro administrativo de operadores; poderá ser incluído futuramente em uma visão pessoal simplificada se houver necessidade aprovada.
- **AUDITOR:** leitura e histórico de alterações, sem edição.

### Perfil de líder — fase futura

Adicionar `LEADER` somente após definir responsabilidades e escopo com a fábrica. A proposta inicial é permitir consulta da equipe e manutenção de alocações do turno/setor designado, sem acesso a contas, credenciais, dados administrativos ou alterações globais. A autorização deve ser aplicada nas rotas da API; esconder ações na interface não é suficiente.

## Escopo funcional proposto

1. **Lista da equipe:** busca por nome ou código, filtros por situação, setor/posto e turno quando houver fonte confiável desses dados.
2. **Ficha do operador:** nome, código institucional, situação ativa/inativa, setor/posto principal, turno e competências autorizadas. Exibir apenas dados pessoais necessários à operação.
3. **Alocação operacional:** registrar setor/posto e vigência da alocação, com histórico de quem alterou e quando. Não sobrescrever o histórico ao trocar uma alocação.
4. **Competências:** matriz simples de operador × operação/posto, com nível ou validade somente se a empresa fornecer critérios formais. Não inventar certificações.
5. **Relação com apontamentos:** conciliar apontamentos do Protheus com colaboradores por código estável. Enquanto houver apenas nomes livres, mostrar correspondências pendentes para revisão; não unir homônimos automaticamente.
6. **Indicadores de equipe:** totais de operadores ativos, distribuição por setor/turno e alocações sem setor definido. Métricas de produção por operador só entram depois de validar cobertura, regras de apontamento e interpretação com a área responsável.
7. **Auditoria:** registrar criação, alteração, inativação, mudança de setor/turno/competência e vínculo/desvínculo de conta. Preferir inativação a exclusão física.

## Dados e integrações

- Confirmar com RH/TI a origem oficial de código, nome, status, setor, turno e competências; esclarecer se cada campo vem do Protheus, de outro sistema ou será mantido manualmente.
- Até existir integração autorizada, manter cadastro local explicitamente identificado como local, sem afirmar sincronização com Protheus.
- Se o Protheus se tornar fonte mestre, sincronizar por identificador estável, manter a origem e a data da última atualização, e definir quais campos são somente leitura e quais continuam sob gestão local.
- Não armazenar dados médicos, disciplinares, documentos pessoais ou contatos particulares sem necessidade operacional e aprovação específica.

## Modelo de dados a detalhar antes da implementação

- Evoluir `employees` com campos validados e restrições incrementais, preservando registros existentes.
- Criar histórico de alocações com colaborador, setor/posto, turno, início/fim de vigência, origem e ator da alteração.
- Criar relações normalizadas de competências apenas após receber catálogo e regras oficiais.
- Manter `users.employee_id` opcional; colaboradores que só precisam constar na escala não recebem senha nem conta automaticamente.
- Definir índices e unicidade para códigos segundo a regra real de organização/planta; não presumir unicidade global antes de confirmar o cenário multiunidade.

## Etapas sugeridas

1. **Descoberta:** confirmar responsáveis, campos, origem dos dados, identificador do operador e regras de setor/turno.
2. **Fundação:** desenhar migração incremental, permissões de API, histórico e importação inicial revisável.
3. **MVP de consulta e cadastro:** lista, busca, ficha, ativação/inativação e vínculo a setor/posto com auditoria.
4. **Alocações e turnos:** histórico de equipe por vigência, após confirmação da regra de turnos.
5. **Conciliação Protheus:** associar apontamentos usando código estável e apresentar exceções sem correspondência.
6. **Liderança e indicadores:** definir o perfil `LEADER` e métricas somente depois de validar escopo de acesso e semântica operacional.

## Critérios de aceite

- Nenhum operador precisa ter conta de login para aparecer no módulo.
- Alterações são autorizadas no backend e auditadas.
- Trocas de setor/posto preservam histórico e data de vigência.
- Dados sem origem confirmada são marcados como pendentes, nunca preenchidos por suposição.
- Importações mostram prévia, conflitos e linhas rejeitadas antes de gravar.
- A tela distingue claramente cadastro local de dados sincronizados do Protheus.
- Nenhum indicador individual é apresentado como desempenho sem regra validada pela área responsável.
