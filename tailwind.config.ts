import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#1E293B', // Midnight Blue
          50: '#475569',
          100: '#334155',
          200: '#1E293B',
          300: '#0F172A',
        },
        secondary: {
          DEFAULT: '#64748B', // Slate Gray
          50: '#94A3B8',
          100: '#64748B',
          200: '#475569',
          300: '#334155',
        },
        accent: {
          DEFAULT: '#22D3EE', // Electric Cyan
          50: '#A5F3FC',
          100: '#67E8F9',
          200: '#22D3EE',
          300: '#0891B2',
        },
        text: {
          primary: '#F9FAFB', // Soft White
          secondary: '#64748B', // Slate Gray
        },
        background: {
          primary: '#1E293B', // Midnight Blue
          secondary: '#0F172A',
        }
      },
    },
  },
  plugins: [],
};

export default config;
