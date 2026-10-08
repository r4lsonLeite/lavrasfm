/**
 * Popula o banco com conteúdo de exemplo para ver o layout preenchido.
 * Uso: npm run seed
 */
import { db, saveSettings } from './db.js';
import { createNews, createVideo } from './content.js';
import { createProgram } from './programacao.js';

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
  image_url: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800&q=80',
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
  image_url: 'https://images.unsplash.com/photo-1531243269054-5ebf6f34081e?w=800&q=80',
  highlight: 'destaque',
  position: 2,
  published_at: hoursAgo(5)
});

createNews({
  title: 'Alterações no trânsito central para o feriado',
  url: 'https://exemplo.com.br/transito-feriado',
  category: 'LOCAL',
  image_url: 'https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=800&q=80',
  highlight: 'destaque',
  position: 3,
  published_at: hoursAgo(8)
});

createNews({
  title: 'Bate-papo exclusivo com o prefeito municipal',
  url: 'https://exemplo.com.br/entrevista-prefeito',
  category: 'ENTREVISTA',
  image_url: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800&q=80',
  highlight: 'normal',
  invert: true,
  position: 4,
  published_at: hoursAgo(12)
});

createNews({
  title: 'Time da cidade se prepara para a final do campeonato',
  url: 'https://exemplo.com.br/final-campeonato',
  category: 'ESPORTES',
  image_url: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=800&q=80',
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

createProgram({
  name: 'Bom Dia Lavras',
  presenter: 'Railson Leite',
  description: 'Notícias da cidade, prestação de serviço e música para começar o dia.',
  days: '12345',
  start_time: '06:00',
  end_time: '09:00'
});

createProgram({
  name: 'Manhã Total',
  presenter: 'Equipe LavrasFM',
  description: 'Sucessos, recados e pedidos dos ouvintes.',
  days: '12345',
  start_time: '09:00',
  end_time: '12:00'
});

createProgram({
  name: 'Almoço Musical',
  presenter: 'Equipe LavrasFM',
  days: '0123456',
  start_time: '12:00',
  end_time: '14:00'
});

createProgram({
  name: 'Tarde da Gente',
  presenter: 'Equipe LavrasFM',
  description: 'A trilha da tarde, com participação do ouvinte pelo WhatsApp.',
  days: '12345',
  start_time: '14:00',
  end_time: '18:00'
});

createProgram({
  name: 'Noite de Prosa',
  presenter: 'Equipe LavrasFM',
  description: 'Entrevistas, cultura e a agenda da cidade para o dia seguinte.',
  days: '12345',
  start_time: '18:00',
  end_time: '21:00'
});

createProgram({
  name: 'Sábado Animado',
  presenter: 'Equipe LavrasFM',
  days: '6',
  start_time: '08:00',
  end_time: '12:00'
});

// Programa que vira a noite: começa no sábado e termina no domingo.
createProgram({
  name: 'Balada da Madrugada',
  presenter: 'Equipe LavrasFM',
  days: '56',
  start_time: '23:00',
  end_time: '02:00'
});

console.log('Conteúdo de exemplo criado. Rode `npm start` e abra http://localhost:3000');
