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
        'brand-primary-700': '#0F2D64',
        'brand-primary-500': '#3D72F6',
        'brand-secondary-700': '#6C7275',
        'brand-background': '#F1F1F1',
        'brand-border': '#DADEE2',
        'brand-light': '#ffffff',
        'brand-dark': '#141718'
      },
      fontFamily: {
        'heading-primary': 'var(--font-heading-family)'
      }
    }
  },
  plugins: [],
};
