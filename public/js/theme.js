/* Tema do LavrasFM — mesmas cores, tipografia e espaçamentos do rascunho. */
// Se o CDN do Tailwind não carregar, a página ainda deve abrir: guardamos a
// config em window.lavrasTheme e só a aplicamos quando `tailwind` existir.
window.lavrasTheme = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'secondary-container': '#dfe0e0',
        background: '#f8f9fb',
        'error-container': '#ffdad6',
        'on-secondary': '#ffffff',
        'tertiary-container': '#151c27',
        error: '#ba1a1a',
        'on-secondary-container': '#616363',
        'surface-container-low': '#f3f4f6',
        'tertiary-fixed-dim': '#c0c7d6',
        'on-tertiary-container': '#7d8492',
        'secondary-fixed-dim': '#c6c6c7',
        'surface-variant': '#e1e2e4',
        'on-primary-container': '#858383',
        'surface-bright': '#f8f9fb',
        primary: '#000000',
        'primary-fixed': '#e5e2e1',
        'on-primary': '#ffffff',
        'on-secondary-fixed-variant': '#454747',
        'on-secondary-fixed': '#1a1c1c',
        'on-surface': '#191c1e',
        'inverse-surface': '#2e3132',
        'on-surface-variant': '#444748',
        'secondary-fixed': '#e2e2e2',
        'on-error': '#ffffff',
        outline: '#747878',
        'on-primary-fixed': '#1c1b1b',
        'outline-variant': '#c4c7c7',
        'on-background': '#191c1e',
        'surface-container-high': '#e7e8ea',
        'surface-container-highest': '#e1e2e4',
        'on-error-container': '#93000a',
        'primary-fixed-dim': '#c8c6c5',
        secondary: '#5d5f5f',
        'primary-container': '#1c1b1b',
        surface: '#f8f9fb',
        'on-tertiary': '#ffffff',
        'on-tertiary-fixed-variant': '#404754',
        'surface-container': '#edeef0',
        'inverse-on-surface': '#f0f1f3',
        'on-tertiary-fixed': '#151c27',
        'surface-container-lowest': '#ffffff',
        tertiary: '#000000',
        'surface-dim': '#d9dadc',
        'on-primary-fixed-variant': '#474646',
        'tertiary-fixed': '#dce2f3',
        'inverse-primary': '#c8c6c5',
        'surface-tint': '#5f5e5e'
      },
      borderRadius: { DEFAULT: '0.125rem', lg: '0.25rem', xl: '0.5rem', full: '0.75rem' },
      spacing: {
        'margin-desktop': '40px',
        'container-max': '1200px',
        gutter: '24px',
        unit: '8px',
        'margin-mobile': '16px'
      },
      fontFamily: {
        'body-md': ['Hanken Grotesk', 'system-ui', 'sans-serif'],
        'label-sm': ['Hanken Grotesk', 'system-ui', 'sans-serif'],
        'display-lg-mobile': ['Hanken Grotesk', 'system-ui', 'sans-serif'],
        'display-lg': ['Hanken Grotesk', 'system-ui', 'sans-serif'],
        'headline-md': ['Hanken Grotesk', 'system-ui', 'sans-serif'],
        'body-lg': ['Hanken Grotesk', 'system-ui', 'sans-serif']
      },
      fontSize: {
        'body-md': ['16px', { lineHeight: '24px', fontWeight: '400' }],
        'label-sm': ['12px', { lineHeight: '16px', letterSpacing: '0.05em', fontWeight: '600' }],
        'display-lg-mobile': ['32px', { lineHeight: '40px', letterSpacing: '-0.01em', fontWeight: '700' }],
        'display-lg': ['48px', { lineHeight: '56px', letterSpacing: '-0.02em', fontWeight: '700' }],
        'headline-md': ['24px', { lineHeight: '32px', fontWeight: '600' }],
        'body-lg': ['18px', { lineHeight: '28px', fontWeight: '400' }]
      }
    }
  }
};

if (typeof tailwind !== 'undefined') {
  tailwind.config = window.lavrasTheme;
} else {
  console.warn('[LavrasFM] Tailwind não carregou — o site abre sem os estilos utilitários.');
}
