import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eff4ff',
          100: '#dce7ff',
          200: '#bfd2ff',
          300: '#91b4ff',
          400: '#5d8cff',
          500: '#2b5aed',
          600: '#2047c9',
          700: '#193aa5',
          800: '#173384',
          900: '#172f69',
        },
        canvas: '#f5f7fa',
        ink: '#172033',
        muted: '#6f7b91',
        faint: '#98a3b8',
        line: '#e8edf5',
        forum: '#7357ff',
        forumSoft: '#f1edff',
        market: '#f58a32',
        marketSoft: '#fff3e9',
        campus: '#19a66a',
        campusSoft: '#e9f8f1',
        danger: '#dd4b55',
        dangerSoft: '#fff0f1',
      },
      borderRadius: {
        card: '16px',
        inner: '12px',
      },
      boxShadow: {
        card: '0 4px 12px rgba(0, 0, 0, 0.05)',
        float: '0 12px 30px rgba(43, 90, 237, 0.24)',
        sheet: '0 -12px 40px rgba(23, 32, 51, 0.14)',
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          '"PingFang SC"',
          '"Microsoft YaHei"',
          'sans-serif',
        ],
      },
      keyframes: {
        ripple: {
          '0%': { transform: 'scale(.75)', opacity: '0.55' },
          '100%': { transform: 'scale(1.8)', opacity: '0' },
        },
        flipIn: {
          '0%': { opacity: '0', transform: 'perspective(900px) rotateX(-16deg) translateY(24px)' },
          '100%': { opacity: '1', transform: 'perspective(900px) rotateX(0) translateY(0)' },
        },
        pillPop: {
          '0%': { transform: 'scale(.94)' },
          '70%': { transform: 'scale(1.04)' },
          '100%': { transform: 'scale(1)' },
        },
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        ripple: 'ripple .72s ease-out forwards',
        'flip-in': 'flipIn .46s cubic-bezier(.2,.8,.2,1) both',
        'pill-pop': 'pillPop .24s ease-out',
        'fade-up': 'fadeUp .3s ease-out both',
      },
    },
  },
  plugins: [],
} satisfies Config

