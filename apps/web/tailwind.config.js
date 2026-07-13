/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Inter', 'ui-sans-serif', 'system-ui']
      },
      boxShadow: {
        pop: '0 18px 50px rgba(15, 23, 42, 0.18)'
      }
    }
  },
  plugins: []
};
