# Instruções para agentes de código

- Leia `docs/ACCESS_AND_AUTH_ARCHITECTURE.md` antes de alterar autenticação, contas, permissões ou colaboradores.
- Preserve dados existentes. Mudanças de banco devem usar migrações incrementais e documentar como tratar contas atuais.
- Não inclua credenciais, tokens ou segredos em código, documentação ou commits.
- A autorização deve ser aplicada na API; esconder controles na interface não é controle de segurança.
- Mantenha os idiomas suportados pela aplicação ao adicionar ou alterar textos visíveis.
- Ao concluir mudanças estruturais, atualize a documentação de arquitetura com o que foi implementado e o que continua pendente.
