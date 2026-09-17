/*
 * Gera a arte de ondas da identidade da Lavras FM.
 *
 * O desenho tem duas partes, como no material da rádio:
 *
 * 1. Os campos de cor — azul profundo ao fundo, uma folha de azul mais claro
 *    cruzando o meio e um campo laranja/vermelho vindo da direita.
 * 2. Os feixes de linhas finas. Cada feixe interpola duas senoides de
 *    frequências diferentes: onde as duas se cruzam todas as linhas se
 *    encontram e o feixe "estrangula"; entre um nó e outro ele abre. É esse
 *    encontro que cria as pontas e os losangos da arte original.
 */
// Uso: node ferramentas/gerar-ondas.mjs public/img/ondas.svg
import { writeFileSync } from 'node:fs';

const L = 2400;
const A = 900;

const fmt = (n) => Math.round(n);

/** Uma senoide composta, avaliada em x. */
function onda(x, { cy, amp, freq, fase, amp2 = 0, freq2 = 0, fase2 = 0 }) {
  const t = x / L;
  return (
    cy +
    amp * Math.sin(t * Math.PI * 2 * freq + fase) +
    amp2 * Math.sin(t * Math.PI * 2 * freq2 + fase2)
  );
}

/**
 * Feixe de linhas entre duas senoides. `k` vai de 0 a 1 de uma para a outra;
 * onde as duas coincidem, o feixe fecha.
 */
function feixe({ a, b, n, x0 = -100, x1 = L + 100, passos = 70, cores, largura = 1, opacidade = 0.9 }) {
  const linhas = [];
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1);
    const pts = [];
    for (let s = 0; s <= passos; s++) {
      const x = x0 + ((x1 - x0) * s) / passos;
      const y = onda(x, a) * (1 - k) + onda(x, b) * k;
      pts.push(`${fmt(x)} ${fmt(y)}`);
    }
    // A cor caminha de uma ponta à outra do feixe, como no original.
    const cor = cores[Math.min(cores.length - 1, Math.floor(k * cores.length))];
    linhas.push(
      `<path d="M${pts.join(' L')}" fill="none" stroke="${cor}" stroke-width="${largura}" opacity="${opacidade}"/>`
    );
  }
  return linhas.join('');
}

const QUENTE = ['#ffd24a', '#ffc12e', '#fba91a', '#f7941b', '#f2761a', '#ea5a1b', '#e0431c', '#d6351f'];
const QUENTE_INV = [...QUENTE].reverse();

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L} ${A}" width="${L}" height="${A}">
<defs>
  <linearGradient id="fundo" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#132e6e"/>
    <stop offset="50%" stop-color="#173a86"/>
    <stop offset="100%" stop-color="#102a63"/>
  </linearGradient>
  <linearGradient id="azulFolha" x1="0" y1="0" x2="1" y2="0.6">
    <stop offset="0%" stop-color="#1a4d9e"/>
    <stop offset="55%" stop-color="#1268bd"/>
    <stop offset="100%" stop-color="#0f5fae"/>
  </linearGradient>
  <linearGradient id="quenteFolha" x1="0" y1="0" x2="0.6" y2="1">
    <stop offset="0%" stop-color="#e8531e"/>
    <stop offset="100%" stop-color="#d33a1e"/>
  </linearGradient>
</defs>

<rect width="${L}" height="${A}" fill="url(#fundo)"/>

<!-- folha de azul claro cruzando o meio, como no material da rádio -->
<path d="M-140 900 C260 400 1020 190 2020 250 C1460 430 860 690 600 900 Z" fill="url(#azulFolha)"/>

<!-- campos quentes: canto inferior direito e entrada pelo topo -->
<path d="M2400 330 C2120 430 1960 640 1880 900 L2400 900 Z" fill="url(#quenteFolha)"/>
<path d="M1620 0 C1900 80 2120 150 2400 110 L2400 0 Z" fill="#e8531e" opacity="0.9"/>

<!-- feixe do topo -->
${feixe({
  a: { cy: 140, amp: 90, freq: 1.9, fase: 0.4, amp2: 42, freq2: 4.3, fase2: 1.9 },
  b: { cy: 220, amp: 55, freq: 3.3, fase: 2.7, amp2: 28, freq2: 1.4, fase2: 0.2 },
  n: 100,
  cores: QUENTE,
  opacidade: 0.85
})}

<!-- feixe atravessando a metade de baixo -->
${feixe({
  a: { cy: 640, amp: 130, freq: 1.4, fase: 3.1, amp2: 55, freq2: 3.6, fase2: 0.7 },
  b: { cy: 750, amp: 75, freq: 2.6, fase: 1.1, amp2: 35, freq2: 5.0, fase2: 2.4 },
  n: 90,
  cores: QUENTE_INV,
  opacidade: 0.9
})}

<!-- feixe fino ao fundo, para dar profundidade -->
<g opacity="0.45">
${feixe({
  a: { cy: 420, amp: 110, freq: 1.2, fase: 5.0, amp2: 45, freq2: 3.0, fase2: 1.4 },
  b: { cy: 470, amp: 60, freq: 2.4, fase: 2.2, amp2: 28, freq2: 4.6, fase2: 3.3 },
  n: 60,
  cores: QUENTE,
  largura: 0.8,
  opacidade: 0.8
})}
</g>
</svg>
`;

writeFileSync(process.argv[2], svg);
console.log('ondas.svg:', (svg.length / 1024).toFixed(0) + ' KB');
