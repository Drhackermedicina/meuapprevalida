import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // Em produção, troque para seu domínio
    methods: ['GET', 'POST']
  }
});

app.use(cors({ origin: '*' })); // Em produção, troque para seu domínio
app.use(express.json());

// Rota de teste
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Exemplo de endpoint HTTP
app.post('/api/create-session', (req, res) => {
  // Sua lógica de criação de sessão aqui
  res.json({ sessionId: 'mock-session-id', ...req.body });
});

// WebSocket/socket.io
io.on('connection', (socket) => {
  console.log('Novo cliente conectado:', socket.id);

  socket.on('disconnect', () => {
    console.log('Cliente desconectado:', socket.id);
  });

  // Adicione aqui os eventos customizados do seu app
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor backend rodando na porta ${PORT}`);
});
