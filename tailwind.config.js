/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // All colors read from CSS variables defined in styles/theme.css
        bg: 'var(--bg)',
        card: 'var(--card)',
        'card-2': 'var(--card-2)',
        line: 'var(--line)',
        txt: 'var(--txt)',
        txt2: 'var(--txt2)',
        accent: 'var(--accent)',
        'accent-ink': 'var(--accent-ink)',
        field: 'var(--field)',
        status: 'var(--status)',
        'status-tint': 'var(--status-tint)',
      },
      fontFamily: {
        sans: ['Inter', 'Manrope', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: { xl2: '20px' },
      boxShadow: {
        card: 'var(--shadow-card)',
        pop: 'var(--shadow-pop)',
      },
      keyframes: {
        pulseDot: {
          '0%,100%': { opacity: 1, transform: 'scale(1)' },
          '50%': { opacity: 0.35, transform: 'scale(0.82)' },
        },
        slideInRight: {
          from: { opacity: 0, transform: 'translateX(18px)' },
          to: { opacity: 1, transform: 'translateX(0)' },
        },
        glowPulse: {
          '0%,100%': { boxShadow: '0 0 0 0 var(--status-glow)' },
          '50%': { boxShadow: '0 0 26px 4px var(--status-glow)' },
        },
      },
      animation: {
        pulseDot: 'pulseDot 1.4s ease-in-out infinite',
        slideInRight: 'slideInRight 320ms cubic-bezier(.22,1,.36,1)',
        glowPulse: 'glowPulse 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
