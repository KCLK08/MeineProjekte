/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        forest: {
          50: '#f2f7f4',
          100: '#e1ede6',
          500: '#2d6a4f',
          700: '#1b4332',
          900: '#081c15',
        },
        ink: '#14201a',
        mist: '#6b7c74',
        sand: '#f4f1ea',
        line: '#d7e0db',
        danger: '#b42318',
      },
    },
  },
  plugins: [],
};
