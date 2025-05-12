/** @type {import('tailwindcss').Config} */

module.exports = {
  prefix: "_",
  content: [
    "./layout/**/*.liquid",
    "./sections/**/*.liquid",
    "./snippets/**/*.liquid",
    "./templates/**/*.liquid",
    "./templates/customers/**/*.liquid",
  ],
  theme: {
    extend: {
      colors: {
        'brand-primary-700': '#00677F',
        'brand-primary-500': '#0097A9',
        'brand-primary-100': '#F6FBFF',
        'brand-secondary-700': '#916969',
        'brand-secondary-500': '#FCB52D',
        'brand-background': '#F8F9FB',
        'brand-border': '#E2E5E8',
        'brand-border-darker': '#CECECE',
        'brand-light': '#ffffff',
        'brand-dark': '#141718'
      }
    }
  },
  plugins: [],
};
