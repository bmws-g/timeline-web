import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// base: './' — Vercel·Cloudflare Pages·GitHub Pages 어디에 올려도 상대 경로로 동작합니다.
export default defineConfig({
  base: './',
  plugins: [vue()],
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
  },
})
