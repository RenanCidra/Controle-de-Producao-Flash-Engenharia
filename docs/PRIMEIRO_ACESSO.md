# Primeiro acesso de administrador

O sistema não possui usuário ou senha padrão. A primeira conta `ADMIN` é criada pelo assistente da página de entrada, sem e-mail obrigatório. O assistente só é habilitado quando o banco não tem administrador ativo com senha configurada e exige uma chave temporária de implantação.

## Preparar o ambiente

1. Configure os segredos do servidor no AI Studio. Mantenha `JWT_SECRET` e `BOOTSTRAP_SECRET` separados; ambos precisam ter pelo menos 32 caracteres. Gere valores aleatórios em um terminal PowerShell confiável com:

   ```powershell
   [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
   ```

   Execute o comando duas vezes. Guarde o primeiro resultado como `JWT_SECRET` e o segundo como `BOOTSTRAP_SECRET`. Não os adicione ao Git nem os envie em mensagens.

2. Confira também os segredos de conexão do servidor: `SQL_HOST`, `SQL_DB_NAME`, `SQL_USER` e `SQL_PASSWORD`. Para aplicar a migração, o executor precisa ainda de `SQL_ADMIN_USER` e `SQL_ADMIN_PASSWORD` com permissão para alterar o schema.

3. A partir de um terminal confiável com acesso ao banco e às variáveis administrativas disponíveis, aplique a migração:

   ```powershell
   npm run db:migrate:access
   ```

   Ela preserva as contas legadas, preenche os identificadores internos e cria as tabelas necessárias para contas e colaboradores. O comando usa uma transação; não é necessário apagar dados.

4. Reinicie/reimplante o servidor para que ele leia `JWT_SECRET` e `BOOTSTRAP_SECRET`. Em desenvolvimento, `npm run dev` inicia o servidor sem modo watch; reinicie o processo após alterações no backend.

## Criar a conta

1. Abra a página do sistema. Se não existir administrador ativo com senha, ela mostrará **Configure a conta administradora**.
2. Cole no campo de chave temporária o valor de `BOOTSTRAP_SECRET` configurado no passo 1.
3. Defina seu nome, um usuário de acesso (3–40 caracteres: letras sem acento, números, ponto, hífen ou sublinhado) e uma senha com pelo menos 12 caracteres e no máximo 72 bytes.
4. O sistema cria a conta como `ADMIN` e inicia a sessão. Depois, remova `BOOTSTRAP_SECRET` dos segredos do AI Studio e reimplante. Mantenha `JWT_SECRET` configurado.

## Se a tela mostrar apenas login

Isso significa que a API encontrou um administrador ativo com senha configurada. Não há senha padrão nem modo de contorno na tela pública. Use as credenciais provisionadas pelo administrador atual. Se a empresa não conhece essas credenciais, será necessário um procedimento de recuperação administrativa; não apague nem recrie tabelas ou contas sem antes conferir o banco correto e preservar os dados.

Se a página disser que não conseguiu verificar a configuração de acesso, confira primeiro se a migração foi aplicada e se o servidor consegue se conectar ao banco. O backend deste repositório expõe `GET /api/auth/setup-status`; uma resposta `404` normalmente indica implantação antiga ou rota base incorreta. Reimplante a versão atual e confirme o prefixo `/api`. O assistente não permite cadastro quando essa verificação falha.

Depois de entrar com uma conta real, cada usuário pode alterar a própria senha em **Meu perfil**, informando a senha atual; a nova senha deve ter pelo menos 12 caracteres e no máximo 72 bytes. Esse fluxo não recupera uma senha esquecida: nesse caso, um administrador deve usar o processo de redefinição de senha da conta. A foto e o idioma escolhidos no perfil ficam somente no navegador atual e não fazem parte do backup da conta.

## Prévia local sem login (temporária)

Para inspecionar as telas internas sem provisionar uma conta real, existe um modo exclusivo de desenvolvimento. Na raiz do projeto, use um `.env` local ignorado pelo Git com:

```dotenv
DEV_PREVIEW_AUTH=true
VITE_DEV_PREVIEW_AUTH=true
```

Reinicie `npm run dev`. A aplicação mostrará uma conta sintética `ADMIN` e uma faixa de aviso; o middleware só aceita esse modo quando `NODE_ENV` não é `production`. As rotas de negócio ficam em **somente leitura** durante a prévia: `POST`, `PUT`, `PATCH` e `DELETE` recebem `403`, então nenhum apontamento, cadastro ou sincronização é gravado.

Para voltar à autenticação normal, remova as duas linhas do `.env` ou altere ambos os valores para `false` e reinicie `npm run dev`. O código da autenticação e a página de login permanecem no projeto; não é necessário removê-los ou reescrevê-los. O build de produção não ativa a identidade sintética porque a interface também exige `import.meta.env.DEV`.

