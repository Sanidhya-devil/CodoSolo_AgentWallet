/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          900: '#0b132b',
          800: '#1c2541',
          700: '#3a506b',
        },
        cyber: {
          cyan: '#48cae4',
          blue: '#0077b6',
          purple: '#7209b7',
          red: '#e63946',
        }
      }
    },
  },
  plugins: [],
}
