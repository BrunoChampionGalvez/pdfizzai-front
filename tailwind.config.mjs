// This is a minimal Tailwind CSS v4 config
// Most configuration is now handled in globals.css using @theme
// This file primarily exists to ensure proper IDE support and content detection

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
};
