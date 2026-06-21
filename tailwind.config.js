/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        card: 'var(--card)',
        border: 'var(--border)',
        primary: 'var(--primary)',
        muted: 'var(--muted)',
        'muted-foreground': 'var(--muted-foreground)',
        input: 'var(--input)',
        ring: 'var(--ring)',
        nexus: {
          bg: 'var(--nexus-bg)',
          panel: 'var(--nexus-panel)',
          card: 'var(--nexus-card)',
          accent: 'var(--nexus-accent)',
          dim: 'var(--nexus-dim)',
          border: 'var(--nexus-border)',
          green: '#22c55e',
          red: '#ef4444',
          yellow: '#eab308',
        },
        cyber: {
          bg: 'var(--nexus-bg)',
          card: 'var(--nexus-card)',
          cyan: 'var(--nexus-accent)',
          dim: 'var(--nexus-dim)',
          magenta: '#ec4899',
          red: '#ef4444',
          green: '#22c55e',
        },
      },
      fontFamily: {
        sans: ['var(--nexus-font)', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'accent-glow': '0 0 20px color-mix(in srgb, var(--nexus-accent) 30%, transparent)',
        panel: '0 4px 24px rgba(0, 0, 0, 0.4)',
        'neon-cyan': '0 0 20px color-mix(in srgb, var(--nexus-accent) 40%, transparent)',
        'neon-magenta': '0 0 20px rgba(236, 72, 153, 0.35)',
        'neon-cyan-lg': '0 0 30px color-mix(in srgb, var(--nexus-accent) 50%, transparent)',
      },
    },
  },
  plugins: [],
};
