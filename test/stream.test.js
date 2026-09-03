import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const pasta = mkdtempSync(join(tmpdir(), 'lavrasfm-stream-'));
process.env.DB_PATH = join(pasta, 'teste.db');

const { extractFromPlaylist, isDirectoryPage, isPlaylist, resolveStreamUrl, probeStream } =
  await import('../server/stream.js');
const { parseYoutubeId } = await import('../server/youtube.js');

// Servidor local que imita um Icecast e os arquivos que os diretórios entregam.
const servidor = createServer((req, res) => {
  if (req.url === '/lista.pls') {
    res.writeHead(200, { 'Content-Type': 'audio/x-scpls' });
    return res.end(`[playlist]\nNumberOfEntries=1\nFile1=http://127.0.0.1:${porta}/live\n`);
  }
  if (req.url === '/lista.m3u') {
    res.writeHead(200, { 'Content-Type': 'audio/x-mpegurl' });
    return res.end(`#EXTM3U\n#EXTINF:-1,Radio\nhttp://127.0.0.1:${porta}/live\n`);
  }
  if (req.url === '/vazia.m3u') {
    res.writeHead(200, { 'Content-Type': 'audio/x-mpegurl' });
    return res.end('#EXTM3U\n# sem nenhuma url\n');
  }
  if (req.url === '/pagina') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end('<html><body>player</body></html>');
  }
  res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'icy-name': 'Radio Lavras 99.3' });
  res.write(Buffer.alloc(256));
});

let porta;
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
porta = servidor.address().port;

after(() => {
  servidor.close();
  rmSync(pasta, { recursive: true, force: true });
});

describe('leitura de playlists', () => {
  test('extrai de .pls', () => {
    assert.equal(
      extractFromPlaylist('[playlist]\nNumberOfEntries=1\nFile1=http://ex.com:8000/s\nTitle1=R'),
      'http://ex.com:8000/s'
    );
  });

  test('extrai de .m3u ignorando comentários', () => {
    assert.equal(
      extractFromPlaylist('#EXTM3U\n#EXTINF:-1,Radio\nhttp://ex.com:8000/live'),
      'http://ex.com:8000/live'
    );
  });

  test('extrai de .asx e de .xspf', () => {
    assert.equal(extractFromPlaylist('<ASX><REF href="http://ex.com/a"/></ASX>'), 'http://ex.com/a');
    assert.equal(
      extractFromPlaylist('<track><location>http://ex.com/b</location></track>'),
      'http://ex.com/b'
    );
  });

  test('extrai de arquivo que é só a URL, como o .asx da Rádio Lavras', () => {
    assert.equal(
      extractFromPlaylist('https://stream.jmhost.com.br/radio/8380/stream'),
      'https://stream.jmhost.com.br/radio/8380/stream'
    );
  });

  test('devolve nulo quando não há URL', () => {
    assert.equal(extractFromPlaylist('nada aqui'), null);
  });
});

describe('classificação de endereços', () => {
  test('reconhece páginas de diretórios de rádio', () => {
    for (const u of [
      'https://www.radios.com.br/aovivo/radio-lavras-993-fm/31920',
      'https://tudoradio.com/player/radio/1',
      'https://onlineradiobox.com/br/x/'
    ]) {
      assert.equal(isDirectoryPage(new URL(u)), true, u);
    }
  });

  test('a transmissão real da rádio não é confundida com página', () => {
    const u = new URL('https://stream.jmhost.com.br/radio/8380/stream');
    assert.equal(isDirectoryPage(u), false);
    assert.equal(isPlaylist(u), false);
  });
});

describe('resolução do endereço', () => {
  test('recusa a página do diretório explicando o motivo', async () => {
    await assert.rejects(
      () => resolveStreamUrl('https://www.radios.com.br/aovivo/radio-lavras-993-fm/31920'),
      (e) => e.name === 'StreamError' && /não o áudio em si/.test(e.message) && e.hint.length > 0
    );
  });

  test('recusa endereço sem protocolo', async () => {
    await assert.rejects(() => resolveStreamUrl('servidor.com:8000/x'), /http/);
    await assert.rejects(() => resolveStreamUrl(''), /Informe/);
  });

  test('URL direta passa sem alteração', async () => {
    const r = await resolveStreamUrl(`http://127.0.0.1:${porta}/live`);
    assert.equal(r.url, `http://127.0.0.1:${porta}/live`);
    assert.equal(r.resolvedFrom, null);
  });

  test('abre .pls e .m3u e devolve o endereço de dentro', async () => {
    for (const arquivo of ['lista.pls', 'lista.m3u']) {
      const r = await resolveStreamUrl(`http://127.0.0.1:${porta}/${arquivo}`);
      assert.equal(r.url, `http://127.0.0.1:${porta}/live`, arquivo);
      assert.ok(r.resolvedFrom.endsWith(arquivo));
    }
  });

  test('avisa quando a playlist não tem áudio dentro', async () => {
    await assert.rejects(
      () => resolveStreamUrl(`http://127.0.0.1:${porta}/vazia.m3u`),
      /não achei nenhuma URL de áudio/
    );
  });
});

describe('verificação da transmissão', () => {
  test('reconhece áudio e lê o nome da estação', async () => {
    const r = await probeStream(`http://127.0.0.1:${porta}/live`);
    assert.equal(r.ok, true);
    assert.equal(r.stationName, 'Radio Lavras 99.3');
    assert.equal(r.insecure, true, 'http deve ser marcado como inseguro');
  });

  test('recusa endereço que devolve HTML', async () => {
    const r = await probeStream(`http://127.0.0.1:${porta}/pagina`);
    assert.equal(r.ok, false);
    assert.match(r.message, /HTML/);
  });

  test('não quebra com servidor inexistente', async () => {
    const r = await probeStream('http://127.0.0.1:1/nada');
    assert.equal(r.ok, false);
    assert.ok(r.message.length > 0);
  });
});

describe('links do YouTube', () => {
  test('reconhece watch, youtu.be, live, embed, shorts e id puro', () => {
    const casos = {
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ': 'dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ?t=5': 'dQw4w9WgXcQ',
      'https://www.youtube.com/live/jNQXAC9IVRw': 'jNQXAC9IVRw',
      'https://youtube.com/embed/dQw4w9WgXcQ': 'dQw4w9WgXcQ',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ': 'dQw4w9WgXcQ',
      dQw4w9WgXcQ: 'dQw4w9WgXcQ'
    };
    for (const [url, id] of Object.entries(casos)) {
      assert.equal(parseYoutubeId(url), id, url);
    }
  });

  test('recusa o que não é do YouTube', () => {
    for (const u of ['https://vimeo.com/123', 'lixo', '', 'https://youtube.com.golpe.com/watch?v=aaaaaaaaaaa']) {
      assert.equal(parseYoutubeId(u), null, u);
    }
  });
});
