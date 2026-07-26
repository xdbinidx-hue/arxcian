/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // arxcianin teemavärit. Kanavat tulevat CSS-muuttujista, jotka on
      // määritelty .arxcian-root -luokassa globals.css:ssä. <alpha-value>
      // pitää läpinäkyvyysmodifierit (bg-ax-panel/80) toimivina.
      colors: {
        ax: {
          bg: 'rgb(var(--ax-bg) / <alpha-value>)',
          panel: 'rgb(var(--ax-panel) / <alpha-value>)',
          'panel-hi': 'rgb(var(--ax-panel-hi) / <alpha-value>)',
          text: 'rgb(var(--ax-text) / <alpha-value>)',
          dim: 'rgb(var(--ax-dim) / <alpha-value>)',
          faint: 'rgb(var(--ax-faint) / <alpha-value>)',
          accent: 'rgb(var(--ax-accent) / <alpha-value>)',
          up: 'rgb(var(--ax-up) / <alpha-value>)',
          down: 'rgb(var(--ax-down) / <alpha-value>)',
          warn: 'rgb(var(--ax-warn) / <alpha-value>)',
          // Viivat käyttävät kiinteää alfaa, ei modifieria
          line: 'rgb(var(--ax-line) / 0.12)',
          'line-strong': 'rgb(var(--ax-line) / 0.26)',
        },
      },
    },
  },
  plugins: [],
}
