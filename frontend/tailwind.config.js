/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      colors: {
        ops: 'var(--color-ops, #F5F1EB)',
        'ops-card': 'var(--color-ops-card, #FFFFFF)',
        'ops-border': 'var(--color-ops-border, #E5E0D8)',
        paper: '#FDFBF7',
        ink: '#2D241E',
        critical: '#D64545',
        urgent: '#E8A354',
        safe: '#6B8E23',
        relay: '#A65D43',
      },
      animation: {
        'pulse-ring': 'pulseRing 2s cubic-bezier(0.455, 0.03, 0.515, 0.955) infinite',
        'sweep': 'sweep 3s linear infinite',
        'blink': 'blink 1.2s step-start infinite',
      },
      keyframes: {
        pulseRing: {
          '0%': { transform: 'scale(0.8)', opacity: '0.6' },
          '100%': { transform: 'scale(1.4)', opacity: '0' },
        },
        sweep: {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
      },
    },
  },
  plugins: [],
  safelist: [
    'bg-ink/10', 'border-ink/20', 'text-ink',
    'border-urgent/60', 'border-critical/50',
    'glass-dark',
  ],
}
