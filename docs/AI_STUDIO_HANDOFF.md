# Continuidade do projeto — Controle de Produção Flash Engenharia

**Estado revisado em 2026-10-29.** O código do repositório inclui autenticação interna e bootstrap protegido, alteração da própria senha, preferências de perfil armazenadas no navegador, auditoria paginada, consultas operacionais sem valores demonstrativos e uma API Protheus simulada localmente. Isso não significa que a instalação ativa esteja conectada ao Protheus real ou que a migração de banco tenha sido aplicada no ambiente de destino. Consulte os documentos de arquitetura e primeiro acesso antes de operar.

Este documento passa o contexto funcional e técnico para outra IA (incluindo Google AI Studio). Leia junto com `AGENTS.md`, `docs/ACCESS_AND_AUTH_ARCHITECTURE.md` e `docs/PRIMEIRO_ACESSO.md`. O conteúdo registra decisões humanas e estado do repositório; não é especificação de dados reais do Protheus além dos exemplos já analisados.

## Objetivo do sistema

O sistema deve funcionar principalmente como **espelho operacional do TOTVS Protheus**, que continua sendo a fonte oficial. O objetivo inicial é tornar visível e controlável o percurso de cada OP: em que etapa está segundo os apontamentos recebidos, que etapas do roteiro deveriam existir, quais operações anteriores estão faltando e para onde o pedido precisa seguir. O painel não deve inventar indicadores nem permitir que uma leitura local seja apresentada como dado confirmado pelo ERP.

O produto pode crescer para priorização de pedidos, gestão de ocorrências e folhas de verificação/indicadores, evitando a redigitação dos mesmos fatos em diversas planilhas. Esses módulos futuros devem reaproveitar os identificadores de PV, OP, produto, operação, recurso e evento já espelhados.

## Regras de negócio confirmadas

- Não existe um fluxo universal por setor. Cada produto/OP pode seguir roteiro e recursos diferentes; não inferir um caminho fixo para toda a fábrica.
- A OP pode herdar do produto o roteiro vigente no Protheus ao ser criada. A tabela de ordens não é suficiente para descobrir as operações esperadas: é necessário importar a tabela dedicada de roteiros/processos.
- O apontamento registra somente a operação executada. A ausência de uma operação na tabela de apontamentos não significa que ela não exista; comparar eventos observados com o roteiro aplicável à OP.
- Quando houver uma operação posterior apontada sem a anterior, sinalizar a lacuna. Exibir separadamente o último apontamento conhecido e a inconsistência; não tratar o maior número da sequência como prova de conclusão.
- Existem apontamentos simples em setores sem operações numeradas. Eles podem não conter horário e não permitem deduzir uma sequência ou etapa detalhada que a origem não fornece. Classificá-los à parte, sem gerar falsos alertas de operação faltante.
- Recursos/postos de trabalho podem mapear para setores ou subsetores de Sinalização. A relação completa de recursos/setores ainda será fornecida.
- A estrutura/BOM relaciona produto pai e componente/produto filho. Ela descreve composição de produto, mas não confirma qual OP filha está vinculada à OP pai.
- O empenho relaciona OP pai e OP filha e é a fonte necessária para dependência concreta entre ordens. A amostra dessa tabela ainda não foi recebida.
- OPs são criadas diariamente e vários apontamentos podem ocorrer na mesma hora. Atualização com atraso tolerado de 5–10 minutos foi considerada adequada; recomendação implementada no painel: consulta automática a cada 5 minutos e botão de atualização manual.
- O primeiro escopo é espelhamento/leitura. Não tratar as tabelas locais legadas de estoque, qualidade e ordens locais como fatos do Protheus nem alterar o ERP a partir deste app.
- O perfil “Inspetor de Qualidade” foi explicitamente excluído dos perfis de acesso planejados.

## Relatórios fornecidos e limites de interpretação

O usuário forneceu relatórios de empenhos, estrutura, grupos de produtos, ordens de produção, processos produtivos (incluindo tempos), produtos, pedidos SC5/SC6, recursos SH1 e apontamentos de produção. Eles alimentam a simulação local descrita em `docs/PROTHEUS_API_SIMULATION.md`; não são usados como fonte de produção do sistema nem representam acesso automático ao Protheus.

Os relatórios confirmam a disponibilidade de cadastros e relações para validação estrutural, mas ainda têm lacunas para afirmar o fluxo de cada ordem: o arquivo SH1 não confirma setor/centro de trabalho nos campos disponíveis; o SC6 fornecido não contém `C6_NUM` para vincular itens ao cabeçalho SC5; alguns campos necessários para identificar OP/operação nos apontamentos não estão preenchidos nas colunas próprias; e o espelho da aplicação ainda não modela todas as relações de empenho. Não inferir chaves a partir de observações ou nomes, e não transformar essas lacunas em indicadores operacionais.

## Cadência e integração

O código atual recebe cargas por importação de arquivo e possui rota REST para ingestão no módulo Protheus. **Não existe ainda um conector que consulte o Protheus automaticamente**: não há endpoint de origem, autenticação, contrato, política de paginação nem credenciais configurados. O polling de cinco minutos recém-adicionado reconsulta as tabelas locais do espelho; o botão atualiza esse painel. Nenhum dos dois dispara uma extração do ERP.

Quando o acesso à origem for definido, implementar sincronização incremental com checkpoint/cursor por entidade, paginação, timeout/retry controlado, métricas de última tentativa/sucesso e alerta quando ultrapassar o SLA acordado (idealmente máximo de 10 min). Importação repetida deve ser idempotente. Para apontamentos, não deduplicar usando apenas OP + operação + horário: vários eventos reais podem ocorrer no mesmo intervalo. Antes da sincronização automática, identificar a chave imutável do evento no Protheus (por exemplo, empresa/filial e identificadores/chaves nativas da SH6) e persistir essa origem na tabela local, com restrição única e migração incremental.

## Implementação concluída nesta etapa

- Auditoria apresenta evento, registro, autor e resultado em uma tabela mais compacta; a consulta acompanha a página selecionada, mantém ordenação estável em empates e mostra erros de carregamento sem confundi-los com lista vazia. Detalhes legados ocultam campos que aparentam conter senhas, tokens, credenciais ou hashes.
- Importações Protheus validam todos os registros antes de criar o lote. Datas, quantidades, status, unidades, clientes e sequências ausentes deixam de receber valores substitutos; o lote é rejeitado com entidade e número do registro para correção. Campos de saldo devem vir da fonte, pois divergências entre saldo e cálculo local precisam continuar visíveis.
- A gravação de todas as entidades do lote usa uma transação: se qualquer persistência falhar, nenhuma entidade fica parcialmente atualizada. Apontamentos importados não sobrescrevem as quantidades e o saldo oficial da OP; o espelho preserva os valores recebidos da SC2.
- CSV preserva colunas vazias nas extremidades da linha. Entidade não identificada exige seleção explícita, evitando classificar silenciosamente dados desconhecidos como produtos.
- Rastreabilidade mostra “—” quando ainda não há resposta ou quando não existe base para calcular percentual; falha de consulta limpa dados antigos e apresenta opção de nova tentativa. Etapas ausentes aparecem como “Etapa não informada”.
- A taxa “Entrega no Prazo” considera apenas OPs concluídas com datas previstas e reais válidas; OPs em andamento ou sem datas não entram no cálculo.
- Foi adicionado um mock REST de desenvolvimento somente para leitura, alimentado por relatórios Excel locais e separado do banco da aplicação. O contrato é provisório e não representa a API real do Protheus; detalhes e testes estão em `docs/PROTHEUS_API_SIMULATION.md`.
- O mock expõe SC5 como cabeçalho e as linhas disponíveis do SC6 separadamente. O SC6 recebido não contém C6_NUM, então a linha não pode ser vinculada ao cabeçalho e `/v1/sales-orders` permanece bloqueado. A pré-validação percorre os cursores e compara contagens e vínculos sem enviar dados à rota de gravação nem ao banco.
- O SH1 foi incluído como cadastro de recursos e é comparado com roteiros por filial + código. Campos de linha de produção/centro de trabalho estão vazios no arquivo recebido, então o nome do recurso não é apresentado como setor confirmado; o mock tampouco afirma a posição atual da OP sem SH6.
- A aba **Teste da API simulada** consulta `GET /api/protheus/mock/validate`, protegida por `protheus-data:read`. A rota verifica saúde, amostras e cursores da API mock em loopback; não chama ingestão nem persiste dados operacionais. O relatório de apontamentos é servido em modo bruto somente leitura, mas campos de OP/operação vazios não são extraídos de observações.
- A mesma aba oferece uma verificação completa sob demanda (`GET /api/protheus/mock/flow-check`), que percorre os relatórios em memória e mostra os bloqueios sem gravar registros. A última execução registrada nesta etapa retornou `BLOCKED`, com 7 bloqueios e 1 observação; esse número é um registro histórico, não um status em tempo real. Os bloqueios identificados incluem revisão SG1 incompatível com o modelo atual, código/unidade de operação ainda indefinidos, relacionamento de setor em SH1 não confirmado, campos ausentes na OP, falta de entidade de empenhos no espelho persistente, SC6 sem `C6_NUM` e campos OP/operação ausentes em apontamentos. Reexecute para obter o resultado dos arquivos disponíveis no momento. O resultado é da simulação e não atesta compatibilidade com a API real.

- Dashboard deixou de usar valores, percentuais de variação e comparações temporais fixas de demonstração.
- Indicadores usam apenas consultas do espelho: pedidos de venda, OPs, apontamentos, produtos, estruturas e operações de roteiro. Valores desconhecidos/inicializando aparecem como “—”; zero aparece apenas quando a API respondeu zero.
- API `/api/stats` também retorna contagens de apontamentos, estruturas e roteiros e metadados da carga recebida mais recente.
- Painel consulta automaticamente as estatísticas a cada cinco minutos enquanto estiver aberto e oferece botão **Atualizar painel**.
- Painel mostra o horário da última consulta, data/tipo/entidade/quantidade da carga mais recente e erro de atualização. A interface deixa explícito que atualizar painel não equivale a buscar dados no Protheus.
- Nenhuma chave de apontamento foi presumida ou adicionada sem amostra da tabela de origem.
- Navegação principal enxugada: painel, pedidos/OPs (rastreabilidade Protheus) e configurações. Estoque e qualidade deixam de aparecer como módulos operacionais nesta fase; seus módulos e dados locais são preservados no código/banco para evitar exclusão destrutiva.
- Sensores/APIs, conectores e cadastros legados de linhas de produção passam para configurações e ficam restritos a perfis privilegiados na interface. As linhas locais são identificadas como legado, pois ainda não representam o mapeamento oficial de recursos/subsetores do Protheus.
- Em Configurações → Conectores Protheus, as tabelas normalizadas disponíveis são clicáveis e abrem uma grade paginada com busca: pedidos (SC5/SC6), OPs (SC2), produtos (SB1), estruturas (SG1), roteiros (SG2) e apontamentos (SH6). SC5 e SC6 estão consolidadas no mesmo armazenamento de pedidos/itens; a tela mostra explicitamente que é dado normalizado local, não dump bruto da tabela física.
- A navegação de dados usa `protheus-data:read` no servidor (ADMIN, SUPERVISOR e AUDITOR; OPERATOR sem acesso). Ingestão manual requer `integrations:write`. Em Configurações → Conectores Protheus, empenhos e o cadastro SH1 agora têm consulta paginada à API simulada em modo somente leitura; esses registros não são persistidos no espelho operacional. SH1 não confirma setor/centro de trabalho nos campos recebidos, e a tabela persistente de empenhos ainda não foi modelada.
- Configurações devem ser abertas somente pelo menu do perfil do usuário. Remover/evitar atalhos para configurações no menu principal, cabeçalho, dashboard e telas operacionais. A barra lateral principal deve crescer com funções de produção; atualmente reserva entradas visíveis, desabilitadas e marcadas “Planejado” para Gestão de Ocorrências e PMP.
- A experiência responsiva usa barra lateral principal recolhível no desktop (ícones e marca Flash compacta) e gaveta no celular; o botão de menu no cabeçalho recolhe/expande no desktop e abre a gaveta em telas menores. A navegação interna de Configurações também vira gaveta em telas pequenas. Conteúdo usa `100dvh`, larguras mínimas flexíveis, tabelas com rolagem horizontal e espaçamentos responsivos.
- Em **Configurações → Conexões e Saúde do Sistema** (ADMIN), `/api/health` verifica o backend e executa uma consulta simples ao PostgreSQL ao abrir a tela e a cada 30 segundos. Estados são exibidos separadamente: backend, banco online/offline/timeout e integração de leitura Protheus não configurada. O painel de conexões não aparece no dashboard, barra lateral ou menu de perfil.
- A tela de conexão trata respostas de um backend local antigo sem `databaseStatus`: nesse caso mantém a página aberta, informa que o banco não foi reportado e orienta reiniciar o backend. Não assumir que o status do backend prova conexão ao Protheus.
- O estado técnico foi removido da navegação e do menu do perfil; o acesso fica somente em Configurações. A área de conexão é administrativa.
- A navegação principal é responsiva: recolhe para ícones em desktop, vira gaveta em celular e usa conteúdo/grades flexíveis; a navegação de Configurações também vira gaveta em telas estreitas. Build e typecheck passaram após os últimos ajustes.
- Identidade visual Flash atualizada usando a arte enviada pelo usuário: `public/assets/flash-brand.svg` compõe o letreiro em camadas, com a linha “ENGENHARIA” refeita como texto vetorial mais nítido; `public/assets/flash-wordmark.png` e `public/assets/flash-symbol.png` são as camadas de alta resolução usadas pelo SVG; o PNG original `public/assets/flash-brand.png` foi preservado. O símbolo compacto é usado na barra recolhida, e a marca SVG na barra expandida (em tamanho menor) e na tela dedicada de login. `public/assets/flash-favicon.png` é a versão quadrada para a aba do navegador. Não recriar a logo com texto/ícone genérico.
- Login: a imagem `public/assets/login-production.webp` ocupa o painel visual à esquerda em desktop e acompanha o empilhamento responsivo em mobile; os cards do formulário usam fundo opaco. O subtítulo antigo sob a marca foi removido.
- Perfil pessoal: troca de senha exige senha atual e mínimo de 12 caracteres. Foto (JPG/PNG/WebP, até 1 MB) e idioma preferido são salvos localmente por UID no navegador; não são sincronizados para o servidor. Nome e login continuam sob gestão administrativa.

## Estado operacional e como retomar

- O script `npm run dev` executa `tsx server.ts`; o backend da API faz parte do processo local do projeto. Quando o código de rotas/backend muda, reinicie o servidor de desenvolvimento se ele não estiver recarregando o backend. A tela de conexões continua segura se receber uma resposta de health de versão anterior.
- O estado atual **não** inclui conector que consulte Protheus. `POST /api/protheus/sync/rest` e a importação de arquivo recebem cargas; não são uma conexão de leitura automática do ERP. Não exibir “Protheus conectado” só porque `/api/health` responde.
- A revisão do layout/health não alterou o modelo de domínio de produção e não criou migrações de banco.
- O relatório geral para a próxima IA pode ser retomado lendo este arquivo, `AGENTS.md`, `docs/ACCESS_AND_AUTH_ARCHITECTURE.md` e `docs/PRIMEIRO_ACESSO.md`. Não colocar `.env` nem segredos em commits.

## Direção conceitual para módulos futuros

- **PMP — Mestre da Produção:** transformar a planilha mestre em uma visão operacional consolidada, não em uma cópia editável de planilha. Como hipótese inicial, relacionar demanda/PVs priorizados às OPs e quantidades, prazos, roteiro esperado, apontamentos já recebidos, próxima etapa/lacunas e dependências de OP filha. O MVP deve refletir dados Protheus e indicar origem/atualização. Não assumir que o sistema emitirá ou reprogramará OPs, criará um calendário/capacidade finita ou escreverá de volta no ERP sem decisão explícita da Flash.
- **Gestão de ocorrências:** futuro módulo para registrar e acompanhar desvios/ocorrências associados a PV, OP, produto, operação, data e recurso/setor quando conhecido; manter status e ações de contenção/correção para evitar redigitação em planilhas/folhas de verificação. Categorias, responsáveis, aprovações, indicadores e formulários ainda precisam ser levantados com a empresa.
- Antes de desenvolver esses módulos, pedir ao usuário exemplo da planilha mestre atual e descrição de como priorizam pedidos e decidem sequência; para ocorrências, pedir a folha de verificação e campos/indicadores atuais. Usar exemplos anonimizados.

## Arquitetura de acesso já existente

- Conta do sistema e cadastro de colaborador são entidades distintas. `users` guarda identidades de acesso; `employees` é cadastro de gestão separado e a ligação é opcional.
- Autenticação interna usa identificador e senha; e-mail não é requisito. Existe fluxo protegido de bootstrap para primeira conta administradora, sem usuário/senha padrão. Siga `docs/PRIMEIRO_ACESSO.md` para configurar o ambiente real.
- Permissões iniciais são centralizadas no servidor; a interface não é barreira de autorização. Não conceder privilégio a partir de dados enviados pelo cliente.
- Eventos de auditoria devem ficar em Configurações → Auditoria e Segurança, não nos acessos rápidos.
- A página dedicada de login permanece implementada.
- Para a prévia local existe bypass sintético somente em desenvolvimento, descrito no documento de primeiro acesso. O ambiente local ignorado pelo Git pode conter configuração de preview; não copiar essa configuração ao deploy nem commitar `.env`.
- A migração de acesso está no repositório, mas sua aplicação no banco de destino deve ser verificada diretamente no ambiente. Sessões revogáveis, refresh token rotativo, escopo por organização/planta e permissões configuráveis continuam no roadmap.

## Próximas etapas recomendadas

1. Com o TI, validar os dicionários e chaves nativas dos relatórios já recebidos — incluindo empresa/filial, revisão do roteiro, identificador do apontamento, recurso/setor, empenho e vínculo SC5/SC6 — e obter apenas amostras adicionais anonimizadas quando faltar campo ou caso de borda.
2. Confirmar como a OP identifica o roteiro/revisão no Protheus e como distinguir apontamento simples de apontamento por operação.
3. Só após confirmar a chave imutável do apontamento, modelar/migrar sua persistência e a sincronização incremental idempotente, sem descartar eventos legítimos.
4. Implementar a visão de OP comparando roteiro esperado com apontamentos, notificando lacunas e exibindo a etapa/local conhecido com grau de confiança explícito.
5. Integrar empenhos para construir dependências OP pai → OP filha e mostrar bloqueio/necessidade de componente; não usar somente a BOM para declarar vínculo entre ordens concretas.
6. Integrar recurso → subsetor/setor para apresentar destino/fluxo. Não inferir setor quando o dado não existir.
7. Definir origem/API Protheus, credenciais em secret manager, frequência/checkpoint e observabilidade; respeitar o SLA de sincronização de até 10 minutos.
8. Só depois planejar priorização de pedidos e módulos futuros de ocorrência/verificação, consumindo dados espelhados para não duplicar digitação.

## Informações necessárias para continuar

Os relatórios já foram fornecidos para a simulação. A próxima solicitação ao TI deve priorizar dicionário de dados e confirmação das chaves/relacionamentos de SC5/SC6, OP/roteiro/revisão, empenhos, recursos/centros de trabalho e apontamentos/estornos, além de uma forma suportada de consulta somente leitura, autenticação, paginação e limites. Não solicitar nem armazenar senhas ou tokens em planilhas/documentos; quando houver acesso, mantê-los no mecanismo de segredos aprovado pela empresa.
