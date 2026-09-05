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
npm run build:css         # compila o CSS do Tailwind
npm start
```

O `npm run build:css` só precisa rodar de novo quando alguma classe do Tailwind
mudar no HTML ou no JavaScript. Durante o desenvolvimento, `npm run watch:css`
recompila sozinho.

Para rodar os testes:

```bash
npm test
```

O site sobe em <http://localhost:3000> e o painel em <http://localhost:3000/admin>.

Para ver o layout preenchido com conteúdo de exemplo:

```bash
npm run seed
```

### Esqueci a senha do painel

As senhas são guardadas como hash scrypt e não há como recuperá-las — só
redefinir:

```bash
npm run senha                      # sorteia uma senha e mostra na tela
npm run senha -- minha-senha-123   # define a que você escolher
```

O comando encerra as sessões abertas do usuário. Rode com o servidor parado ou
reinicie depois.

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
  backup.js     cópias de segurança rotativas do banco
  log.js        registro de erros em arquivo
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

## Operação

**Backups.** O banco é copiado automaticamente para `data/backups/` na
inicialização e a cada 24 horas, mantendo as 7 cópias mais recentes. As cópias
são feitas com `VACUUM INTO`, que gera um arquivo íntegro mesmo com o site em
uso. Para restaurar, pare o servidor e substitua `data/lavrasfm.db` pela cópia.

**Erros.** Ficam registrados em `data/logs/erros.log`, com rotação aos 5 MB.

**Limite de ouvintes.** A retransmissão aceita 50 ouvintes simultâneos por
padrão (`MAX_RELAY_LISTENERS`). Acima disso, novos ouvintes recebem 503 em vez
de derrubar o servidor. Se a transmissão tocar direto, mantenha a retransmissão
desligada e esse limite deixa de importar.

**Reinícios.** O servidor trata `SIGTERM` e `SIGINT`: para de aceitar conexões,
encerra as retransmissões e fecha o banco antes de sair.

## Deploy

O site precisa de um servidor que fique ligado o tempo todo, aguente conexões
de áudio longas e tenha um disco que sobreviva aos deploys. Isso descarta
plataformas sem estado, como Vercel e Netlify.

### Render (configuração pronta)

O `render.yaml` na raiz descreve o serviço inteiro. No Render, crie um
*Blueprint* apontando para este repositório: ele lê o arquivo e monta tudo,
inclusive o disco de 1 GB montado em `/var/dados`, onde ficam banco, backups e
logs.

Duas variáveis precisam ser preenchidas à mão no painel, porque são segredos e
não vão para o Git:

| Variável | O que colocar |
| --- | --- |
| `ADMIN_PASSWORD` | a senha do painel, longa e só sua |
| `SITE_URL` | o endereço final, ex. `https://lavrasfm.com.br` |

### Qualquer outro servidor

Serve qualquer host com Node 22.5+:

```bash
NODE_ENV=production TRUST_PROXY=1 ADMIN_PASSWORD='...' \
  DB_PATH=/caminho/persistente/lavrasfm.db npm start
```

`NODE_ENV=production` faz o cookie de sessão ser marcado como `secure`, e
`TRUST_PROXY=1` é necessário atrás de nginx, Caddy ou Cloudflare para que o
limite de tentativas de login enxergue o IP real do visitante. Aponte `DB_PATH`
para fora da pasta do código, senão um deploy novo apaga o banco.

O endereço `/api/health` responde com um sinal de vida, para a hospedagem saber
se precisa reiniciar o serviço.

## Notas técnicas

- **Tailwind compilado**: o CSS sai de `src/tailwind.css` para
  `public/css/tailwind.css` (16 KB, contra ~400 KB do CDN). O tema — cores,
  tipografia, espaçamentos — vive em `public/js/theme.js`, que o
  `tailwind.config.cjs` lê, para não haver duas listas de cores.
- **Política de segurança de conteúdo**: estrita, sem script nem estilo inline.
  Ao editar as páginas, não use atributos `style=` nem `onclick=` — o navegador
  os bloqueia. Use classes e `addEventListener`.
- **Sessões**: cookie `httpOnly` + `SameSite=Lax`, válido por 7 dias. Trocar a
  senha encerra as demais sessões.
- **Segurança dos formulários**: só links `http`/`https` são aceitos e todo
  conteúdo é escapado antes de ir para a tela.
