/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'dark-bg': '#03101b',
        'accent-blue': '#00d4ff',
        'accent-yellow': '#ffd700',
        'accent-green': '#00ff88',
        'accent-orange': '#ff6b35',
      },
    },
  },
  plugins: [],
}

