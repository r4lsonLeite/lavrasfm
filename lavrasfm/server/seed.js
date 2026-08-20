/**
 * Popula o banco com conteúdo de exemplo para ver o layout preenchido.
 * Uso: npm run seed
 */
import { db, saveSettings } from './db.js';
import { createNews, createVideo } from './content.js';

const hoursAgo = (hours) =>
  new Date(Date.now() - hours * 3600_000).toISOString().slice(0, 19).replace('T', ' ');

const newsCount = db.prepare('SELECT COUNT(*) AS total FROM news').get().total;
const videoCount = db.prepare('SELECT COUNT(*) AS total FROM videos').get().total;

if (newsCount > 0 || videoCount > 0) {
  console.log('O banco já tem conteúdo — nada foi alterado.');
  process.exit(0);
}

saveSettings({
  station_name: 'LavrasFM',
  tagline: 'A rádio de Lavras, ao vivo, 24 horas por dia.',
  now_playing: 'Programa da Manhã',
  // Stream público de demonstração — troque pelo endereço da rádio no painel.
  stream_url: 'https://ice1.somafm.com/groovesalad-128-mp3',
  stream_format: 'audio/mpeg'
});

createNews({
  title: 'Festival Lavras Sounds movimenta o centro da cidade neste fim de semana',
  url: 'https://exemplo.com.br/festival-lavras-sounds',
  category: 'EVENTOS',
  excerpt: 'Três dias de shows, feira gastronômica e cobertura ao vivo da LavrasFM direto da praça central.',
  image_url: 'https://images.unsplash.com/photo-1470229722913-7ea0d7c8a1a5?w=1600&q=80',
  source: 'Redação LavrasFM',
  highlight: 'banner',
  published_at: hoursAgo(1)
});

createNews({
  title: 'Novo álbum da banda local atinge o topo das paradas regionais',
  url: 'https://exemplo.com.br/novo-album-ecos-da-serra',
  category: 'MÚSICA',
  excerpt: "A banda 'Ecos da Serra' lança seu terceiro trabalho de estúdio com boa recepção da crítica e do público da região.",
  source: 'Redação LavrasFM',
  highlight: 'destaque',
  position: 1,
  published_at: hoursAgo(2)
});

createNews({
  title: 'Exposição de arte moderna abre neste fim de semana',
  url: 'https://exemplo.com.br/exposicao-arte-moderna',
  category: 'CULTURA',
  excerpt: 'Mostra reúne 40 obras de artistas mineiros no centro cultural da cidade.',
  highlight: 'secundaria',
  position: 2,
  published_at: hoursAgo(5)
});

createNews({
  title: 'Alterações no trânsito central para o feriado',
  url: 'https://exemplo.com.br/transito-feriado',
  category: 'LOCAL',
  highlight: 'normal',
  position: 3,
  published_at: hoursAgo(8)
});

createNews({
  title: 'Bate-papo exclusivo com o prefeito municipal',
  url: 'https://exemplo.com.br/entrevista-prefeito',
  category: 'ENTREVISTA',
  highlight: 'normal',
  invert: true,
  position: 4,
  published_at: hoursAgo(12)
});

createNews({
  title: 'Time da cidade se prepara para a final do campeonato',
  url: 'https://exemplo.com.br/final-campeonato',
  category: 'ESPORTES',
  highlight: 'normal',
  position: 5,
  published_at: hoursAgo(20)
});

createVideo({
  title: 'Programa da Manhã — edição especial',
  description: 'Acompanhe a transmissão em vídeo direto do nosso estúdio principal.',
  youtube_url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk',
  kind: 'live',
  featured: true
});

createVideo({
  title: 'Vozes da Cidade #42 — a nova cena tecnológica de Lavras',
  description: 'Episódio completo com convidados especiais.',
  youtube_url: 'https://www.youtube.com/watch?v=5qap5aO4i9A',
  kind: 'video',
  position: 1
});

console.log('Conteúdo de exemplo criado. Rode `npm start` e abra http://localhost:3000');
