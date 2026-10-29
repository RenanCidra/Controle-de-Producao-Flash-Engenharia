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
3. Defina seu nome, um usuário de acesso (3–40 caracteres: letras sem acento, números, ponto, hífen ou sublinhado) e uma senha com pelo menos 12 caracteres.
4. O sistema cria a conta como `ADMIN` e inicia a sessão. Depois, remova `BOOTSTRAP_SECRET` dos segredos do AI Studio e reimplante. Mantenha `JWT_SECRET` configurado.

## Se a tela mostrar apenas login

Isso significa que a API encontrou um administrador ativo com senha configurada. Não há senha padrão nem modo de contorno na tela pública. Use as credenciais provisionadas pelo administrador atual. Se a empresa não conhece essas credenciais, será necessário um procedimento de recuperação administrativa; não apague nem recrie tabelas ou contas sem antes conferir o banco correto e preservar os dados.

Se a página disser que não conseguiu verificar a configuração de acesso, confira primeiro se a migração foi aplicada e se o servidor consegue se conectar ao banco. Se mostrar `404`, reinicie/reimplante o backend na versão atual: esse servidor ainda não expõe a rota `/api/auth/setup-status`. O assistente não permite cadastro quando essa verificação falha.
