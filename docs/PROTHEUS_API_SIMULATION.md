# Simulação local da API Protheus

**Revisado em 2026-10-29.** Esta API continua sendo uma simulação local baseada nos relatórios Excel fornecidos; a instalação não está conectada ao Protheus real. A validação de fluxo é sob demanda e seus resultados podem mudar conforme os arquivos disponibilizados no computador. Não trate o último status registrado em documentação ou tela como confirmação de integração real.

## Objetivo e limites

`tools/protheus_mock_api.py` expõe uma API HTTP local somente para leitura, alimentada diretamente pelos relatórios Excel selecionados. Os arquivos permanecem na pasta indicada pelo operador: o mock não copia os arquivos, não conecta ao banco da aplicação, não chama o Protheus real e não possui rotas de gravação.

O contrato `/v1` é um contrato provisório de teste, criado a partir das colunas encontradas nos relatórios. Ele não afirma compatibilidade com endpoints, autenticação, campos ou regras da API TOTVS. A integração real só deve ser ajustada após o TI fornecer documentação e credenciais de leitura.

Os endpoints disponíveis são:

- `GET /v1/products`
- `GET /v1/product-groups`
- `GET /v1/resources` expõe o cadastro SH1 de recursos, preservando filial, código, nome, centro de custo, linha de produção e centro de trabalho nos respectivos campos de origem.
- `GET /v1/structures`
- `GET /v1/routings`
- `GET /v1/routings-basic`
- `GET /v1/production-orders`
- `GET /v1/commitments`
- `GET /v1/sales-order-headers` oferece os cabeçalhos SC5; os campos de item ficam nulos nesse conjunto.
- `GET /v1/sales-order-lines` oferece as linhas disponíveis no SC6: item, produto, unidade, quantidade, entrega e campos auxiliares como bloqueio e pedido do cliente.
- `GET /v1/appointments` oferece os dados do arquivo `apontamento de produção.xlsx` como fonte simulada de apontamentos, sem afirmar compatibilidade do relatório com o contrato oficial SH6.
- A consulta preserva OP, produto, operação, datas/horas, quantidade, tempo e observações em campos separados. OP e operação permanecem vazios quando não vieram nas colunas; o conteúdo de observações não é convertido em chave.
- `GET /v1/sales-orders` responde `501 SOURCE_LINK_KEY_MISSING`: o arquivo SC6 recebido não tem a coluna `C6_NUM` (número do pedido de venda), necessária para ligar cada linha ao cabeçalho SC5. `Numero SC` e `Ped Cliente` são expostos como campos auxiliares e não são usados como substitutos dessa chave.
- `GET /v1/health` identifica explicitamente `simulation: true`, `readOnly: true`, `connectsToProtheus: false` e `writesToApplication: false`.

As respostas de dados incluem paginação, nome do arquivo, aba, quantidade de linhas e os campos efetivamente disponíveis. Campos ausentes no relatório, como saldo e refugo da OP, são `null`; o mock não os calcula nem os completa. Datas e tempos são expostos com nomes terminados em `Raw` quando a unidade ou interpretação ainda precisa de confirmação.

## Executar no Windows

Use Python 3 com `openpyxl` disponível. Informe a pasta original dos arquivos, sem copiá-los para o repositório:

```powershell
$env:PROTHEUS_MOCK_DATA_DIR = 'C:\caminho\para\Dados Estruturais'
python tools/protheus_mock_api.py --data-dir $env:PROTHEUS_MOCK_DATA_DIR --port 4100
```

O serviço vincula somente `127.0.0.1`. Exemplo de leitura:

```powershell
Invoke-RestMethod 'http://127.0.0.1:4100/v1/products?page=1&pageSize=5'
```

Paginação aceita `page` a partir de 1 e `pageSize` entre 1 e 500. Para percorrer arquivos grandes sem reler as linhas anteriores a cada página, use `?stream=true&pageSize=500` e siga o `nextCursor` retornado. O cursor expira após 10 minutos e é de uso sequencial. POST, PUT, PATCH e DELETE respondem `405`.

## Verificação pelo sistema

No módulo Protheus, a aba **Teste da API simulada** chama `GET /api/protheus/mock/validate`. A rota exige `protheus-data:read`, consulta somente `127.0.0.1`/`::1` pelo backend e testa a saúde, uma amostra de cada conjunto e duas páginas por cursor quando há mais de uma linha. A mesma aba permite visualizar as linhas da origem via `GET /api/protheus/mock/data?entity=production-orders&pageSize=10`, selecionar qualquer conjunto validado e carregar páginas seguintes pelo cursor. Essa prévia usa uma lista fixa de conjuntos, limita páginas a 25 linhas e consulta apenas a API local; o navegador não recebe a URL do mock. Em **Configurações → Conectores Protheus**, Empenhos e Recursos SH1 também podem ser consultados em páginas, diretamente por essa rota de prévia. O navegador mostra arquivo/aba de origem e avisa que esses registros são simulados; não os grava em tabelas operacionais. Os outros conjuntos listados nas configurações continuam lendo o banco da aplicação.

O botão **Executar verificação completa** chama `GET /api/protheus/mock/flow-check`, que percorre todas as páginas pela API local e executa as verificações semânticas de `tools/protheus_mock_flow.py`: campos, chaves, referências e bloqueios conhecidos. É uma consulta potencialmente demorada para os relatórios grandes e retorna somente contagens, observações e bloqueios; nunca envia registros à aplicação nem grava no banco. O resultado `READY` valida apenas a amostra simulada e não confirma que uma API real esteja conectada ou seja compatível.

Em desenvolvimento, o endereço padrão é `http://127.0.0.1:4100`. Pode-se definir `PROTHEUS_MOCK_API_URL` com outro endereço loopback. Em produção, a verificação fica desativada sem essa configuração e recusa hosts que não sejam loopback. O teste da tela não substitui a pré-validação completa feita por `tools/protheus_mock_flow.py`.

## Testes

Com `PROTHEUS_MOCK_DATA_DIR` apontando para a pasta dos arquivos:

```powershell
python -m unittest discover -s tools -p 'test_protheus_mock*.py' -v
```

Os testes sobem um servidor temporário em loopback, consultam páginas e cursores dos relatórios, validam os campos ausentes, conferem as respostas para fontes incompletas e inexistentes, verificam o bloqueio de origem externa e confirmam que tentativas de escrita são recusadas. Não chamam `/api/protheus/sync/rest` e não alteram o banco do sistema.

## Pré-validação completa

Com o mock ativo, execute:

```powershell
python tools/protheus_mock_flow.py --base-url 'http://127.0.0.1:4100' --pretty
```

O fluxo percorre os cursores em ordem, valida a quantidade recebida por conjunto, conta campos e datas ausentes/inválidos e confere referências entre produtos, grupos, recursos SH1, estruturas, roteiros, OPs, empenhos, linhas SC6 e apontamentos. Para SH1/roteiros, exige correspondência composta por filial e código do recurso; correspondência apenas pelo código com filial divergente não é considerada validada. O arquivo SH1 atual tem campos de linha de produção/centro de trabalho vazios, então o nome do recurso não é apresentado como um setor confirmado. No relatório de apontamentos, OP e operação precisam estar nas colunas próprias; observações não são interpretadas como chaves. Para o SC6, valida produto, item, unidade, quantidade e entrega, mas não declara itens como pertencentes a um cabeçalho SC5 porque `C6_NUM` não veio no relatório. O resultado é um relatório somente de contagens e bloqueios; não contém registros individuais e não chama a aplicação. `status: BLOCKED` indica que o contrato ou os dados ainda não estão prontos para integração real.

## O que ainda precisa do TI

Para substituir o mock por integração real, o TI precisa confirmar endpoints somente leitura, autenticação, filial/empresa, filtros e paginação, limites de chamadas, semântica das datas e quantidades, códigos de status, tratamento de cancelamentos/estornos e identificadores estáveis dos apontamentos. Não se deve reutilizar um mapeamento do mock como contrato de produção sem essa validação.

