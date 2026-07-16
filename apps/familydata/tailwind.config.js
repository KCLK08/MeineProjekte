/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        pine: {
          50: '#eef6f2',
          100: '#d8ebe2',
          200: '#b4d6c6',
          400: '#3d9a74',
          500: '#1f7a5c',
          700: '#0c3b2e',
          800: '#0a3228',
          900: '#07241d',
        },
        canvas: '#e8f0ec',
        paper: '#f7fbf8',
        ink: '#10241c',
        mute: '#5a7368',
        line: '#c5d7ce',
        warn: '#b45309',
        danger: '#b42318',
        ok: '#157a4b',
      },
      fontFamily: {
        display: ['Fraunces_700Bold'],
        displayMedium: ['Fraunces_600SemiBold'],
        sans: ['DMSans_400Regular'],
        sansMedium: ['DMSans_500Medium'],
        sansBold: ['DMSans_700Bold'],
      },
    },
  },
  plugins: [],
};
