# Controle de Produção — Flash Engenharia

Aplicação web para acompanhar ordens de produção, rastreabilidade e auditoria operacional, com dados organizados para futura integração ao TOTVS Protheus.

> **Estado da integração:** o sistema ainda não consulta o Protheus real. Os painéis operacionais leem o banco da aplicação, que pode receber dados por importação ou pela rota de ingestão. Há uma API simulada local, somente leitura, para validar relatórios Excel e contratos provisórios. Ela não grava dados no sistema nem confirma compatibilidade com a API oficial.

## O que o sistema oferece

- Painel e rastreabilidade de pedidos e ordens de produção a partir dos dados presentes no banco da aplicação.
- Visualização de dados Protheus normalizados, com busca e paginação, e ferramentas para validar a simulação local.
- Consulta somente leitura de empenhos e recursos SH1 pela API simulada; esses dados de teste não são persistidos no espelho operacional.
- Autenticação interna, perfis de acesso e trilha de auditoria.
- Perfil pessoal com alteração de senha, foto e idioma. Foto e idioma ficam somente no navegador utilizado.
- Interface responsiva, em português, inglês e espanhol.

Dados ausentes não devem ser interpretados como zero ou como etapa concluída. A aplicação sinaliza campos desconhecidos e erros de consulta; a origem e a atualização dos dados devem ser conferidas antes de decisões no chão de fábrica.

## Requisitos

- Node.js e npm.
- PostgreSQL acessível pelo servidor da aplicação.
- Para a API simulada: Python 3, `openpyxl` e os relatórios Excel fornecidos pelo usuário.

## Executar localmente

1. Instale as dependências:

   ```powershell
   npm install
   ```

2. Crie um arquivo `.env` local (não o versione) com as variáveis do servidor:

   ```dotenv
   SQL_HOST=localhost
   SQL_DB_NAME=flash_pcp
   SQL_USER=usuario_local
   SQL_PASSWORD=senha_local
   JWT_SECRET=gere_um_segredo_aleatorio_com_pelo_menos_32_caracteres
   # Opcional: origens web externas autorizadas, separadas por vírgula
   # CORS_ALLOWED_ORIGINS=https://sistema.exemplo.com
   # Configure somente se houver proxy reverso confiável na frente do servidor
   # TRUST_PROXY_HOPS=1
   # Em produção, hosts exatos que o teste de integração pode acessar
   # INTEGRATION_ALLOWED_HOSTS=erp.exemplo.interno
   ```

   Use os valores do PostgreSQL autorizado para o ambiente. `JWT_SECRET` precisa ter pelo menos 32 caracteres. Não coloque credenciais reais no Git, neste README ou em mensagens.

3. Se o banco ainda não tiver o schema de acesso, revise o banco de destino e aplique a migração com uma conta que possa alterar o schema:

   ```powershell
   $env:SQL_ADMIN_USER = 'usuario_administrador'
   $env:SQL_ADMIN_PASSWORD = 'senha_administrativa'
   npm run db:migrate:access
   ```

   Configure `BOOTSTRAP_SECRET` como segredo temporário de implantação (mínimo de 32 caracteres) somente para provisionar a primeira conta `ADMIN`. Depois de criar a conta, remova esse segredo do ambiente. O primeiro acesso e a migração estão detalhados em [`docs/PRIMEIRO_ACESSO.md`](docs/PRIMEIRO_ACESSO.md).

4. Inicie a aplicação:

   ```powershell
   npm run dev
   ```

   Abra `http://localhost:3000`. O servidor atende pela porta 3000 por padrão; use `PORT` para configurar outra porta. A API usa o prefixo `/api`.

## API simulada do Protheus

A simulação lê os arquivos Excel diretamente de uma pasta local e só vincula o serviço a `127.0.0.1`:

```powershell
python -m pip install openpyxl
$env:PROTHEUS_MOCK_DATA_DIR = 'C:\caminho\para\Dados Estruturais'
python tools/protheus_mock_api.py --data-dir $env:PROTHEUS_MOCK_DATA_DIR --port 4100
```

Para validar o serviço, abra `http://127.0.0.1:4100/v1/health`. Para habilitar a verificação local na aplicação, defina `PROTHEUS_MOCK_API_URL=http://127.0.0.1:4100` no ambiente do servidor. A tela **Teste da API simulada** valida as fontes sem importar os registros para o banco. Os arquivos Excel não devem ser copiados para o repositório.

O contrato e os bloqueios conhecidos (por exemplo, vínculo SC5/SC6 incompleto e campos de OP/operação ausentes) estão descritos em [`docs/PROTHEUS_API_SIMULATION.md`](docs/PROTHEUS_API_SIMULATION.md). Um resultado `READY` refere-se somente à simulação; não indica conexão ao Protheus real.

## Verificações disponíveis

```powershell
npm run build
npm run lint
```

O projeto também contém testes Python da API simulada; instruções estão na documentação da simulação. Não execute esses testes contra dados de produção sem revisar a origem configurada.

## Documentação

- [Primeiro acesso e configuração de ambiente](docs/PRIMEIRO_ACESSO.md)
- [Arquitetura de acesso, autenticação e colaboradores](docs/ACCESS_AND_AUTH_ARCHITECTURE.md)
- [Simulação local da API Protheus](docs/PROTHEUS_API_SIMULATION.md)
- [Continuidade do projeto e próximos passos](docs/AI_STUDIO_HANDOFF.md)

## Segurança e uso operacional

- Não use uma conta compartilhada nem credenciais padrão; o primeiro administrador é provisionado por uma chave temporária.
- Mantenha `.env`, tokens e credenciais fora do Git. Não habilite `DEV_PREVIEW_AUTH` em produção; a identidade sintética existe somente para prévia local e tem escrita bloqueada.
- O Protheus permanece a fonte oficial. A aplicação não deve ser tratada como conectada ao ERP até que o TI valide e disponibilize uma integração de leitura suportada.
- Antes de usar dados para decisões de produção, confirme que a carga é atual, que as chaves e relacionamentos foram validados e que os valores vêm da origem.
