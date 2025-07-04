const { fontFamily } = require('tailwindcss/defaultTheme');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: 'oklch(0.16 0.028 264.665)',
          '50': 'oklch(0.31 0.03 264.665)',
          '100': 'oklch(0.25 0.03 264.665)',
          '200': 'oklch(0.16 0.028 264.665)',
          '300': 'oklch(0.1 0.026 264.665)',
        },
        secondary: {
          DEFAULT: 'oklch(0.44 0.03 256.802)',
          '50': 'oklch(0.6 0.03 256.802)',
          '100': 'oklch(0.44 0.03 256.802)',
          '200': 'oklch(0.31 0.03 264.665)',
          '300': 'oklch(0.25 0.03 264.665)',
        },
        accent: {
          DEFAULT: 'oklch(0.75 0.15 211.53)',
          '50': 'oklch(0.92 0.08 205.041)',
          '100': 'oklch(0.85 0.12 207.078)',
          '200': 'oklch(0.75 0.15 211.53)',
          '300': 'oklch(0.61 0.126 221.723)',
        },
        'text-primary': 'oklch(0.97 0.003 264.542)',
        'text-secondary': 'oklch(0.44 0.03 256.802)',
        'background-primary': 'oklch(0.16 0.028 264.665)',
        'background-secondary': 'oklch(0.1 0.026 264.665)',
        'background-header': 'oklch(0.18 0.03 264.665)',
        'background-chat': 'oklch(0.17 0.025 265)',
        'sidebar-item': 'oklch(0.13 0.028 264.665)',
        'sidebar-item-hover': 'oklch(0.15 0.03 264.665)',
        'sidebar-heading': 'oklch(0.2 0.03 264.665)',
        'sidebar-button': 'oklch(0.14 0.028 260)',
      },
      fontFamily: {
        sans: ['var(--font-inter)', ...fontFamily.sans],
      },
    },
  },
  plugins: [],
};
