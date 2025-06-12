// Arquivo: vite.config.js (na raiz do seu projeto)

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path' // <--- ADICIONE ESTA LINHA para importar o módulo 'path' do Node.js

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: { // <--- ADICIONE ESTA SEÇÃO 'resolve'
    alias: {
      // Define que o alias '@' deve apontar para o diretório 'src' do seu projeto
      '@': path.resolve(__dirname, './src'),
    }
  }
})