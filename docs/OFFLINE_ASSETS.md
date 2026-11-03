# Cache offline de imagens

O service worker em `public/service-worker.js` pré-carrega as imagens fixas da interface (marca Flash, símbolo, favicon e fundos do login e da página inicial) e usa cache-first para os demais arquivos de imagem servidos em `/assets/`. Assim, depois da primeira ativação online, essas imagens continuam visíveis quando a rede cair ou a API ficar indisponível.

O registro acontece no carregamento da aplicação em navegadores com suporte a service workers. É necessário abrir o sistema pelo menos uma vez com a rede disponível para instalar o worker e preencher o cache inicial. Ao atualizar a lista de imagens, incremente a versão `flash-connect-static-images-vN` no worker para substituir o cache anterior.

As fotos de perfil escolhidas pelo usuário já são armazenadas como data URLs nas preferências locais do navegador e não dependem de requisição a um servidor.

Este recurso mantém imagens disponíveis offline; não torna o sistema ou seus dados operacionais offline. Consultas, autenticação e gravações ainda dependem da API e do banco. Fontes externas carregadas do Google também continuam dependendo da conexão; o navegador usa as fontes alternativas declaradas no CSS quando estiver sem internet.
