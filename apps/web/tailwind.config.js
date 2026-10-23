/** @type {import('tailwindcss').Config} */
const c = (v) => `hsl(var(--${v}) / <alpha-value>)`;
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: c('bg'), fg: c('fg'), card: c('card'), muted: c('muted'), 'muted-fg': c('muted-fg'), border: c('border'),
        primary: c('primary'), 'primary-fg': c('primary-fg'), accent: c('accent'),
        success: c('success'), warning: c('warning'), danger: c('danger'), sidebar: c('sidebar'), 'sidebar-fg': c('sidebar-fg'),
      },
      fontFamily: { sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'], display: ['Fraunces', 'Georgia', 'serif'], mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'] },
      boxShadow: { card: '0 1px 2px hsl(var(--shadow) / .06), 0 4px 16px -6px hsl(var(--shadow) / .10)' },
      keyframes: { fade: { from: { opacity: 0, transform: 'translateY(4px)' }, to: { opacity: 1, transform: 'none' } } },
      animation: { fade: 'fade .25s ease-out both' },
    },
  },
  plugins: [],
};
