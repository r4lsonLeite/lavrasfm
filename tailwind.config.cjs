/**
 * As cores, tipografia e espaçamentos vivem em public/js/theme.js, que é a
 * fonte única do tema. Aqui só apontamos o Tailwind para lá.
 */
const { readFileSync } = require('node:fs');

const fonte = readFileSync(require('node:path').join(__dirname, 'public/js/theme.js'), 'utf8');
const escopo = { window: {}, console: { warn() {} }, tailwind: undefined };
new Function('window', 'console', 'tailwind', fonte.replace(/if \(typeof tailwind[\s\S]*$/, ''))(
  escopo.window,
  escopo.console,
  undefined
);

module.exports = {
  content: ['./public/**/*.html', './public/js/**/*.js'],
  ...escopo.window.lavrasTheme
};
