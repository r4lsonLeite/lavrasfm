# LavrasFM

Site da rádio LavrasFM: player ao vivo, notícias com destaques configuráveis,
vídeos e lives do YouTube — tudo gerenciado por um painel administrativo.

O layout segue o rascunho feito no Stitch (mesmas cores, tipografia e grade).

## O que já funciona

- **Player ao vivo** fixo no rodapé, presente em todas as páginas. Play/pause,
  volume e mudo (com preferência salva no navegador), atalho de teclado
  (espaço ou `K`) e reconexão automática com backoff quando o streaming cai.
- **Painel administrativo** em `/admin`, protegido por login.
  - **Notícias**: o responsável cola o link da matéria, escreve título/resumo e
    escolhe como destacar — **manchete** (chamada grande com foto larga),
    **destaque lateral** (coluna de três ao lado da manchete) ou **grade**
    (cards menores abaixo) —, com ordem manual e publicar/despublicar.
  - **Vídeos & Lives**: cola o link do YouTube (aceita `watch?v=`, `youtu.be`,
    `/live/`, `/embed/` e shorts), marca se é live ou vídeo gravado e escolhe
    qual fica em destaque na home.
  - **Rádio & Site**: URL do streaming (com botão para testar antes de salvar),
    o que está no ar agora, nome, slogan, redes sociais e rodapé.
  - **Conta**: troca de senha.
- **Home** com capa no formato de portal de notícias: uma manchete grande, três
  destaques na coluna lateral e uma grade abaixo, montada a partir do que está
  cadastrado — sem tocar em código.

## Como rodar

```bash
npm install
cp .env.example .env      # ajuste ADMIN_PASSWORD
npm start
```

O site sobe em <http://localhost:3000> e o painel em <http://localhost:3000/admin>.

Para ver o layout preenchido com conteúdo de exemplo:

```bash
npm run seed
```

### Primeiro acesso

O usuário `admin` é criado automaticamente. Se `ADMIN_PASSWORD` não estiver
definida no `.env`, uma senha é sorteada e **impressa no console** na primeira
execução — anote, ela não é mostrada de novo. Troque depois na aba *Conta*.

## Configurando a transmissão

No painel, aba **Rádio & Site**, cole o endereço no campo *URL do streaming* e
clique em **Verificar endereço**. O servidor identifica o que você colou e
responde o que fazer.

### O erro mais comum

O link da página onde a rádio toca **não é** o endereço da transmissão. Um
endereço como `https://www.radios.com.br/aovivo/radio-lavras-993-fm/31920` é
uma página HTML — o player do navegador não tem como tocar isso. O painel
detecta e avisa quando esse tipo de link é colado.

O endereço certo é o do áudio em si, algo como
`https://servidor.com.br:8000/stream`.

### Como achar o endereço certo

Nos diretórios de rádio (radios.com.br, tudoradio, RadiosNet), procure a opção
de **ouvir em outro player** — ela oferece um arquivo `.m3u`, `.pls` ou `.asx`.
Cole esse link no painel: o servidor abre o arquivo, extrai a URL real de dentro
dele e já preenche o campo. Quem hospeda a transmissão também pode informar o
endereço direto.

### Se mesmo assim não tocar

Dois bloqueios do navegador costumam ser a causa:

- **Transmissão em `http` num site `https`.** O navegador recusa conteúdo não
  seguro dentro de uma página segura.
- **Servidor sem CORS.** Alguns Icecast/Shoutcast recusam requisições vindas de
  outro domínio.

Para os dois casos, marque **Retransmitir pelo servidor** na mesma aba. O áudio
passa a ser servido por `/api/stream`, no mesmo domínio e protocolo do site,
o que contorna as duas restrições. Em troca, o tráfego dos ouvintes passa a
consumir a banda do seu servidor — deixe desligado se a transmissão já tocar
direto.

## Estrutura

```
server/
  index.js      servidor Express, rotas de página e arquivos estáticos
  db.js         SQLite (node:sqlite), esquema e configurações do site
  auth.js       senhas com scrypt, sessões em cookie, limite de tentativas
  content.js    regras e validação de notícias e vídeos
  youtube.js    extração do ID do YouTube a partir da URL
  stream.js     resolve playlists .m3u/.pls/.asx e verifica a transmissão
  routes/api.js API pública e API do painel
  seed.js       conteúdo de exemplo
public/
  index.html    home
  admin.html    painel administrativo
  login.html    login
  js/player.js  player da rádio ao vivo
  js/home.js    montagem da home
  js/admin.js   painel
  js/theme.js   tema (cores/tipografia do rascunho)
  css/styles.css
```

O banco fica em `data/lavrasfm.db` (fora do Git). Para fazer backup, basta
copiar essa pasta.

## Deploy

Qualquer host que rode Node 22.5+ serve. Em produção:

```bash
NODE_ENV=production TRUST_PROXY=1 ADMIN_PASSWORD='...' npm start
```

`NODE_ENV=production` faz o cookie de sessão ser marcado como `secure`, e
`TRUST_PROXY=1` é necessário atrás de nginx, Caddy ou Cloudflare para que o
limite de tentativas de login enxergue o IP real do visitante.

## Notas técnicas

- **Tailwind via CDN**: mantido como no rascunho, para editar o visual sem
  build. Se quiser um site mais leve e independente de rede, compile o CSS com
  o Tailwind CLI e troque o `<script>` do CDN por um `<link>` para o arquivo
  gerado.
- **Sessões**: cookie `httpOnly` + `SameSite=Lax`, válido por 7 dias. Trocar a
  senha encerra as demais sessões.
- **Segurança dos formulários**: só links `http`/`https` são aceitos e todo
  conteúdo é escapado antes de ir para a tela.
