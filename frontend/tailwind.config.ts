import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Restrained dark palette. Extra tokens keep glassmorphism consistent.
        surface: {
          DEFAULT: '#08090b',
          raised: '#0d0f14',
          elevated: '#12141b',
        },
        hairline: 'rgba(255, 255, 255, 0.08)',
        hairlineStrong: 'rgba(255, 255, 255, 0.14)',
        accent: {
          DEFAULT: '#7c5cff',
          soft: '#a08dff',
          glow: 'rgba(124, 92, 255, 0.35)',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          'monospace',
        ],
      },
      boxShadow: {
        glass: '0 1px 0 rgba(255,255,255,0.04) inset, 0 20px 60px -20px rgba(0,0,0,0.6)',
        glow: '0 0 0 1px rgba(124,92,255,0.25), 0 12px 60px -20px rgba(124,92,255,0.45)',
      },
      backgroundImage: {
        'radial-glow':
          'radial-gradient(60% 50% at 50% 0%, rgba(124,92,255,0.18) 0%, rgba(0,0,0,0) 70%)',
      },
      borderRadius: {
        xl2: '1.25rem',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        fadeIn: 'fadeIn 400ms ease-out both',
      },
    },
  },
  plugins: [],
};

export default config;
