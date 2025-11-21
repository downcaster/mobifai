/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./App.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: '#6200EE',
        secondary: '#03DAC6',
        background: '#F5F5F5',
        surface: '#FFFFFF',
        error: '#B00020',
      }
    },
  },
  plugins: [],
}
