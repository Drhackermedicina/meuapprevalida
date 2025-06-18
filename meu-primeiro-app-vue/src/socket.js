// src/socket.js
import { io } from 'socket.io-client';

// URL do seu backend (pode ser definida por variável de ambiente para produção)
const URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000'; // Apenas domínio para WebSocket

console.log(`[Socket] Criando instância para ${URL}`);
const socket = io(URL, {
  autoConnect: false, // Só conecta quando chamarmos socket.connect()
});

// --- Listeners básicos para debug ---
socket.on("connect", () => {
  console.log(`[Socket] Conectado com sucesso! ID: ${socket.id}`);
});

socket.on("disconnect", (reason) => {
  console.log(`[Socket] Desconectado: ${reason}`);
});

socket.on("connect_error", (err) => {
  console.error(`[Socket] Erro de conexão: ${err.message}`, err.data || '');
});

// Listener genérico (útil para ver todos os eventos recebidos)
socket.onAny((event, ...args) => {
  console.log(`[Socket] Evento Recebido << ${event}`, args);
});
// --- Fim Listeners ---

// Exporta a instância para ser usada em outros componentes
export default socket;