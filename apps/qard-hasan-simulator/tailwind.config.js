/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans"', "Segoe UI", "system-ui", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "monospace"],
      },
      colors: {
        ink: {
          50: "#f4f7f7",
          100: "#e6eeee",
          200: "#c9d6d5",
          300: "#9bb3b1",
          400: "#6d8c8a",
          500: "#4d6d6b",
          600: "#3c5655",
          700: "#2f4443",
          800: "#1f2f2f",
          900: "#152222",
          950: "#0c1515",
        },
        accent: {
          50: "#eefbf6",
          100: "#d5f4e8",
          400: "#34b48a",
          500: "#1f8f6d",
          600: "#14745a",
          700: "#125c49",
        },
      },
    },
  },
  plugins: [],
};
