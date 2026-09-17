/*
 * Identidade visual da LavrasFM.
 *
 * Este arquivo é a fonte única das cores, tipografia e espaçamentos: o
 * tailwind.config.cjs lê daqui para gerar o CSS. Mudou aqui, rode
 * `npm run build:css`.
 */
window.lavrasTheme = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        /* Azuis — do fundo do cabeçalho ao texto de apoio. */
        'azul-900': '#052a63',
        'azul-800': '#073a86',
        'azul-700': '#0b4aa8',
        'azul-600': '#1160cf',
        'azul-500': '#1f7ae8',
        'azul-100': '#d9e8fb',
        'azul-50': '#eef4fd',

        /* Laranjas — o botão de ouvir, as tarjas de categoria, os destaques. */
        'laranja-600': '#e06a05',
        'laranja-500': '#f7861b',
        'laranja-400': '#fba91a',
        'amarelo-300': '#ffc63b',

        /*
         * Tinta e superfícies em cinza neutro. Cinza azulado somado ao azul do
         * cabeçalho, do rodapé e do player deixava a página inteira puxando
         * para o azul; o neutro devolve o contraste para a marca.
         */
        tinta: '#1c1f24',
        'tinta-media': '#3f434a',
        'tinta-suave': '#63676e',
        'tinta-clara': '#8e9299',
        borda: '#e5e5e7',
        'borda-forte': '#d2d3d6',
        fundo: '#f4f4f5',
        'placa': '#ebebed',
        branco: '#ffffff',

        /* Sinal de transmissão ao vivo. */
        'ao-vivo': '#e8353b',

        /* Nomes antigos, mantidos para o painel administrativo. */
        primary: '#073a86',
        'on-primary': '#ffffff',
        surface: '#ffffff',
        'surface-container': '#f4f4f5',
        'surface-container-low': '#fafafa',
        'surface-container-lowest': '#ffffff',
        'surface-container-high': '#ebebed',
        'surface-variant': '#e5e5e7',
        'surface-dim': '#d2d3d6',
        'on-surface': '#1c1f24',
        'on-surface-variant': '#63676e',
        'on-secondary-container': '#63676e',
        outline: '#8e9299',
        'outline-variant': '#e5e5e7',
        error: '#e8353b',
        'on-error': '#ffffff',
        'error-container': '#fde8e8',
        'on-error-container': '#a01a20',
        background: '#f4f4f5',
        'on-background': '#1c1f24'
      },

      borderRadius: {
        DEFAULT: '0.5rem',
        lg: '0.75rem',
        xl: '1rem',
        '2xl': '1.5rem',
        full: '9999px'
      },

      spacing: {
        'margin-desktop': '40px',
        'container-max': '1280px',
        gutter: '28px',
        unit: '8px',
        'margin-mobile': '16px'
      },

      fontFamily: {
        /* Archivo carrega as manchetes; Hanken Grotesk, o texto corrido. */
        display: ['Archivo', 'Hanken Grotesk', 'system-ui', 'sans-serif'],
        'body-md': ['Hanken Grotesk', 'system-ui', 'sans-serif'],
        'label-sm': ['Hanken Grotesk', 'system-ui', 'sans-serif'],
        'display-lg-mobile': ['Archivo', 'system-ui', 'sans-serif'],
        'display-lg': ['Archivo', 'system-ui', 'sans-serif'],
        'headline-md': ['Archivo', 'system-ui', 'sans-serif'],
        'body-lg': ['Hanken Grotesk', 'system-ui', 'sans-serif']
      },

      fontSize: {
        'body-md': ['16px', { lineHeight: '24px', fontWeight: '400' }],
        'label-sm': ['12px', { lineHeight: '16px', letterSpacing: '0.08em', fontWeight: '700' }],
        'display-lg-mobile': ['30px', { lineHeight: '36px', letterSpacing: '-0.02em', fontWeight: '800' }],
        'display-lg': ['44px', { lineHeight: '50px', letterSpacing: '-0.025em', fontWeight: '800' }],
        'headline-md': ['22px', { lineHeight: '28px', letterSpacing: '-0.01em', fontWeight: '700' }],
        'body-lg': ['18px', { lineHeight: '28px', fontWeight: '400' }]
      },

      backgroundImage: {
        'gradiente-azul': 'linear-gradient(135deg, #073a86 0%, #0b4aa8 45%, #1160cf 100%)',
        'gradiente-laranja': 'linear-gradient(135deg, #f7861b 0%, #fba91a 100%)'
      },

      boxShadow: {
        carta: '0 1px 3px rgba(16, 36, 63, .08), 0 8px 24px -12px rgba(16, 36, 63, .18)',
        player: '0 -4px 24px rgba(5, 42, 99, .22)'
      }
    }
  }
};

if (typeof tailwind !== 'undefined') {
  tailwind.config = window.lavrasTheme;
} else {
  console.warn('[LavrasFM] Tailwind não carregou — o site abre sem os estilos utilitários.');
}
