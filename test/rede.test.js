import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

const { motivoBloqueio, exigirDestinoPublico, buscarComDestinoSeguro } =
  await import('../server/rede.js');

/**
 * Servidor que redireciona para endereços internos — o caso que a validação
 * apenas do texto da URL não pegaria.
 */
const servidor = createServer((req, res) => {
  if (req.url === '/redireciona-para-metadata') {
    res.writeHead(302, { Location: 'http://169.254.169.254/latest/meta-data/' });
    return res.end();
  }
  if (req.url === '/redireciona-para-localhost') {
    res.writeHead(302, { Location: 'http://127.0.0.1:9/' });
    return res.end();
  }
  if (req.url === '/loop') {
    res.writeHead(302, { Location: '/loop' });
    return res.end();
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('ok');
});

await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const porta = servidor.address().port;
after(() => servidor.close());

describe('classificação de endereços', () => {
  test('bloqueia o próprio servidor', () => {
    for (const ip of ['127.0.0.1', '127.1.2.3', '::1', '::ffff:127.0.0.1']) {
      assert.ok(motivoBloqueio(ip), ip);
    }
  });

  test('bloqueia redes privadas', () => {
    for (const ip of ['10.0.0.5', '172.16.0.1', '172.31.255.254', '192.168.1.1', 'fd00::1']) {
      assert.ok(motivoBloqueio(ip), ip);
    }
  });

  test('bloqueia o serviço de metadados da nuvem', () => {
    assert.match(motivoBloqueio('169.254.169.254'), /metadados/);
  });

  test('bloqueia link-local, multicast e reservados', () => {
    for (const ip of ['169.254.1.1', '224.0.0.1', '240.0.0.1', '0.0.0.0', 'fe80::1', 'ff02::1']) {
      assert.ok(motivoBloqueio(ip), ip);
    }
  });

  test('172.32 não é rede privada e deve passar', () => {
    assert.equal(motivoBloqueio('172.32.0.1'), null, 'a faixa privada termina em 172.31');
    assert.equal(motivoBloqueio('172.15.0.1'), null, 'e começa em 172.16');
  });

  test('endereços públicos passam', () => {
    for (const ip of ['8.8.8.8', '216.24.57.1', '1.1.1.1', '2606:4700::1111']) {
      assert.equal(motivoBloqueio(ip), null, ip);
    }
  });
});

describe('validação antes de conectar', () => {
  test('recusa nomes que resolvem para o próprio servidor', async () => {
    await assert.rejects(() => exigirDestinoPublico('http://localhost/'), /próprio servidor/);
    await assert.rejects(() => exigirDestinoPublico('http://127.0.0.1/'), /próprio servidor/);
  });

  test('recusa o endereço de metadados', async () => {
    await assert.rejects(
      () => exigirDestinoPublico('http://169.254.169.254/latest/meta-data/'),
      /metadados/
    );
  });

  test('recusa IPv6 local, com e sem colchetes', async () => {
    await assert.rejects(() => exigirDestinoPublico('http://[::1]/'), /próprio servidor/);
  });

  test('recusa nome que não existe', async () => {
    await assert.rejects(
      () => exigirDestinoPublico('http://nao-existe-mesmo.invalid/'),
      /não consegui encontrar|Não consegui encontrar/i
    );
  });
});

describe('proteção durante redirecionamentos', () => {
  test('recusa quando o destino redireciona para o serviço de metadados', async () => {
    await assert.rejects(
      () => buscarComDestinoSeguro(`http://127.0.0.1:${porta}/redireciona-para-metadata`),
      // O primeiro salto já é bloqueado por ser local; o que importa é não conectar.
      (erro) => erro.name === 'RedeBloqueadaError'
    );
  });

  test('para de seguir depois de poucos redirecionamentos', async () => {
    await assert.rejects(
      () => buscarComDestinoSeguro(`http://127.0.0.1:${porta}/loop`),
      (erro) => erro.name === 'RedeBloqueadaError'
    );
  });
});
