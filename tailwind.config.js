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
        'brand-dark': '#262626'
      },
      fontFamily: {
        'heading-primary': 'var(--font-heading-family)',
        'heading-primary-italic': 'var(--font-heading-family-italic)',
        'body-condensed': 'var(--font-body-condensed)'
      },
      fontSize: {
        '7xl': ['80px', { lineHeight: 'auto' }],
        '6xl': ['72px', { lineHeight: 'auto' }],
        '5xl': ['62px', { lineHeight: 'auto' }],
        '4xl': ['49px', { lineHeight: 'auto' }],
        '3xl': ['38px', { lineHeight: 'auto' }],
        'xl': ['20px', { lineHeight: 'auto' }],
        'lg': ['16px', { lineHeight: 'auto' }],
        'base': ['14px', { lineHeight: 'auto' }],
        'sm': ['12px', { lineHeight: 'auto' }],
      }
    }
  },
  plugins: [],
};
