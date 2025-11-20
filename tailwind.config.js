/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#00079E',
        'primary-hover': '#0006CC',
        secondary: '#3CA5AA',
        accent: '#7FF7F9',
      },
    },
  },
  plugins: [],
}

