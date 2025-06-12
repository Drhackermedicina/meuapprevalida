// server.js - COM LÓGICA DE PAUSE MANUAL E AUTO-PAUSE AJUSTADA

import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';

// --- === CONFIGURAÇÕES === ---
const PORT = process.env.PORT || 3000;
const DEFAULT_STATION_DURATION_MINUTES = 10;
const VALID_CLIENT_DURATIONS = [5, 6, 7, 8, 9, 10];

// CONFIGURAÇÕES PARA TOLERÂNCIA DE DESCONEXÃO
const DISCONNECT_TOLERANCE_SECONDS = 60;
const DISCONNECT_CHECK_INTERVAL_MS = 5000;
// --- === FIM CONFIGURAÇÕES === ---

const app = express();
const server = http.createServer(app);

const allowedOrigins = [
  'http://localhost:5173',
  'https://revalidafacil.web.app',
  'https://appestacoes.web.app',
  // ADICIONADO PARA RESOLVER O ERRO CORS:
  'https://6000-firebase-studio-1749068965513.cluster-vpxjqdstfzgs6qeiaf7rdlsqrc.cloudworkstations.dev'
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn(`CORS: Origem HTTP bloqueada: ${origin}`);
      callback(new Error('A política de CORS para este site não permite acesso da Origem especificada.'));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());
app.get('/', (req, res) => { res.status(200).send('<h1>Backend Revalida Fácil Online!</h1>'); });
const io = new Server(server, {
  cors: corsOptions,
  pingTimeout: 60000,
  pingInterval: 25000
});

const simulationSessions = {};
const socketIdToSessionIdMap = {};

app.post('/api/create-session', (req, res) => {
  try {
    const { stationId, checklistId, tempoDuracaoMinutos } = req.body;

    if (!stationId || !checklistId) {
      const missing = [];
      if (!stationId) missing.push('stationId');
      if (!checklistId) missing.push('checklistId');
      console.error(`[API] Falha create-session: Faltando ${missing.join(', ')}`);
      return res.status(400).json({ error: `Dados obrigatórios faltando: ${missing.join(', ')}.`, details: `Faltando: ${missing.join(', ')}`});
    }

    const sessionId = uuidv4();
    let durationMinutes = DEFAULT_STATION_DURATION_MINUTES;
    if (tempoDuracaoMinutos !== undefined) {
      const parsedDuration = parseInt(tempoDuracaoMinutos, 10);
      if (!isNaN(parsedDuration) && parsedDuration > 0 && parsedDuration <= 60) {
        durationMinutes = parsedDuration;
      } else {
        console.warn(`[API] tempoDuracaoMinutos (${tempoDuracaoMinutos}) da estação é inválido ou fora do limite (1-60). Usando padrão de ${DEFAULT_STATION_DURATION_MINUTES} min.`);
      }
    }

    simulationSessions[sessionId] = {
      stationId: stationId,
      checklistId: checklistId,
      createdAt: Date.now(),
      participants: {},
      timerInterval: null,
      stationDurationMinutes: durationMinutes,
      remainingSeconds: durationMinutes * 60,
      simulationHasStarted: false,
      simulationIsOver: false,
      isManuallyPaused: false, // NOVO: Para pausa manual
      isPausedDueToDisconnect: false,
      disconnectToleranceTimer: null,
      toleranceRemainingSeconds: 0
    };
    console.log(`[API] Sessão ${sessionId} criada para Estação ${stationId}. Duração inicial definida via API: ${durationMinutes} min.`);
    res.status(201).json({ sessionId: sessionId });
  } catch (error) {
    console.error('[API] Erro CRÍTICO em /api/create-session:', error);
    res.status(500).json({ error: 'Erro interno do servidor ao criar a sessão.', details: error.message });
  }
});

function startSimulationTimer(sessionId) {
    const session = simulationSessions[sessionId];
    if (!session) {
        console.error(`[TIMER] Tentativa de iniciar timer para sessão ${sessionId} inexistente.`);
        return;
    }
    if (session.timerInterval) {
        console.warn(`[TIMER] Timer para sessão ${sessionId} já estava em execução. Limpando o antigo antes de iniciar novo.`);
        clearInterval(session.timerInterval);
        session.timerInterval = null;
    }
    if (!session.simulationHasStarted) {
        console.warn(`[TIMER] Tentativa de iniciar timer para sessão ${sessionId} que não foi marcada como 'simulationHasStarted'.`);
        return;
    }
    if (session.simulationIsOver) {
        console.warn(`[TIMER] Tentativa de iniciar timer para sessão ${sessionId} que já foi marcada como 'simulationIsOver'.`);
        return;
    }
    if (isNaN(session.remainingSeconds) || session.remainingSeconds <= 0) {
        console.error(`[TIMER] ERRO CRÍTICO: remainingSeconds inválido (${session.remainingSeconds}) para sessão ${sessionId} ao INICIAR o timer. A duração não foi corretamente definida antes do início.`);
        stopSimulationTimer(sessionId, 'erro_tempo_inicial_invalido');
        io.to(sessionId).emit('SERVER_ERROR', { message: 'Erro crítico ao iniciar o timer da simulação (duração inválida).' });
        return;
    }

    if (session.disconnectToleranceTimer) {
        clearInterval(session.disconnectToleranceTimer);
        session.disconnectToleranceTimer = null;
        // session.isPausedDueToDisconnect = false; // Será resetado ao retomar de fato
        console.log(`[TIMER] Timer de tolerância limpado para sessão ${sessionId} ao iniciar/retomar timer principal.`);
    }

    console.log(`[TIMER] Iniciando/Retomando timer para sessão ${sessionId} com ${session.remainingSeconds} segundos.`);
    session.timerInterval = setInterval(() => {
        const currentSessionState = simulationSessions[sessionId];
        if (!currentSessionState) {
            console.log(`[TIMER] Sessão ${sessionId} não existe mais durante o intervalo. Parando timer.`);
            if(session.timerInterval) clearInterval(session.timerInterval);
            return;
        }
        
        // MODIFICADO: Verifica pausa manual OU automática
        if (currentSessionState.isPausedDueToDisconnect || currentSessionState.isManuallyPaused) {
            // console.log(`[TIMER] Sessão ${sessionId} pausada (Auto: ${currentSessionState.isPausedDueToDisconnect}, Manual: ${currentSessionState.isManuallyPaused}), não decrementando tempo.`);
            return;
        }

        if (currentSessionState.simulationIsOver) {
            console.log(`[TIMER] Sessão ${sessionId} já terminou (simulationIsOver=true) durante o intervalo. Parando timer.`);
            if (currentSessionState.timerInterval) clearInterval(currentSessionState.timerInterval);
            currentSessionState.timerInterval = null;
            return;
        }

        if (currentSessionState.remainingSeconds > 0) {
            currentSessionState.remainingSeconds--;
            io.to(sessionId).emit('TIMER_UPDATE', { remainingSeconds: currentSessionState.remainingSeconds });
        } else {
            io.to(sessionId).emit('TIMER_END');
            stopSimulationTimer(sessionId, 'tempo esgotado');
            console.log(`[TIMER] Timer naturalmente encerrado para sessão ${sessionId} (tempo esgotado).`);
        }
    }, 1000);
}

function stopSimulationTimer(sessionId, reason = 'desconhecido') {
    const session = simulationSessions[sessionId];
    if (session) {
        if (session.timerInterval) {
            clearInterval(session.timerInterval);
            session.timerInterval = null;
            console.log(`[TIMER] Timer principal parado para sessão ${sessionId}. Razão: ${reason}.`);
        }
        if (session.disconnectToleranceTimer) {
            clearInterval(session.disconnectToleranceTimer);
            session.disconnectToleranceTimer = null;
            console.log(`[TIMER] Timer de tolerância parado para sessão ${sessionId} como parte de stopSimulationTimer.`);
        }

        if (!session.simulationIsOver) {
            session.simulationIsOver = true;
            // Resetar estados de pausa ao encerrar
            session.isManuallyPaused = false;
            session.isPausedDueToDisconnect = false;
            io.to(sessionId).emit('TIMER_STOPPED', { reason });
            console.log(`[SESSÃO] Sessão ${sessionId} marcada como encerrada. Razão: ${reason}`);
        }
    } else {
        console.log(`[TIMER] Tentativa de parar timer para sessão ${sessionId} que não existe mais.`);
    }
}

function startDisconnectToleranceTimer(sessionId, disconnectedUserId) {
    const session = simulationSessions[sessionId];
    if (!session || session.simulationIsOver || session.isPausedDueToDisconnect) {
        if (session && session.isPausedDueToDisconnect) {
            console.warn(`[TOLERANCE] Timer de tolerância para ${sessionId} já ativo. Não iniciando novo.`);
            return; 
        }
        console.warn(`[TOLERANCE] Não foi possível iniciar timer de tolerância para ${sessionId}. Sessão encerrada ou não aplicável.`);
        return;
    }

    session.isPausedDueToDisconnect = true;
    session.toleranceRemainingSeconds = DISCONNECT_TOLERANCE_SECONDS;

    console.log(`[TOLERANCE] Iniciando timer de tolerância para sessão ${sessionId}. Tempo: ${DISCONNECT_TOLERANCE_SECONDS}s. Usuário desconectado: ${disconnectedUserId}`);
    
    // Notifica os clientes que a simulação está pausada automaticamente
    io.to(sessionId).emit('SERVER_AUTO_PAUSE_TRIGGERED', { 
        reason: 'participante_desconectou', 
        gracePeriodSeconds: session.toleranceRemainingSeconds 
    });

    // Pausa o timer principal se estiver rodando (apenas limpa o intervalo, não muda remainingSeconds)
    if (session.timerInterval) {
        clearInterval(session.timerInterval);
        session.timerInterval = null;
        console.log(`[TOLERANCE] Timer principal da sessão ${sessionId} pausado devido à desconexão.`);
    }


    session.disconnectToleranceTimer = setInterval(() => {
        const currentSessionState = simulationSessions[sessionId];
        if (!currentSessionState) {
            console.log(`[TOLERANCE] Sessão ${sessionId} não existe mais durante o timer de tolerância. Parando.`);
            if (session.disconnectToleranceTimer) clearInterval(session.disconnectToleranceTimer);
            return;
        }

        const activeParticipants = Object.values(currentSessionState.participants).filter(p => io.sockets.sockets.has(p.socketId));
        if (activeParticipants.length >= 2) {
            console.log(`[TOLERANCE] Pelo menos 2 participantes ativos na sessão ${sessionId}. Retomando simulação.`);
            clearInterval(currentSessionState.disconnectToleranceTimer);
            currentSessionState.disconnectToleranceTimer = null;
            currentSessionState.isPausedDueToDisconnect = false;
            // currentSessionState.isManuallyPaused permanece como estava antes da desconexão
            io.to(sessionId).emit('SERVER_SIMULATION_RESUMED'); // Cliente limpa ambos os flags de pausa
            if (!currentSessionState.isManuallyPaused) { // Só retoma o timer se não estiver manualmente pausado
                startSimulationTimer(sessionId);
            } else {
                console.log(`[TOLERANCE] Simulação ${sessionId} reconectada, mas permanece em pausa manual.`);
            }
            return;
        }

        if (currentSessionState.toleranceRemainingSeconds > 0) {
            currentSessionState.toleranceRemainingSeconds--;
            // O cliente pode ou não precisar de updates frequentes deste timer de tolerância.
            // O evento SERVER_AUTO_PAUSE_TRIGGERED já informou o tempo inicial.
            // io.to(sessionId).emit('TOLERANCE_TIMER_UPDATE', { remainingSeconds: currentSessionState.toleranceRemainingSeconds });
        } else {
            console.log(`[TOLERANCE] Tempo de tolerância esgotado para sessão ${sessionId}. Encerrando simulação.`);
            stopSimulationTimer(sessionId, 'reconnection_failed'); // Razão específica para o cliente
            // Mensagem de erro já é tratada pelo TIMER_STOPPED no cliente.
            clearInterval(currentSessionState.disconnectToleranceTimer);
            currentSessionState.disconnectToleranceTimer = null;
        }
    }, 1000);
}


io.on('connection', (socket) => {
    console.log(`--> Nova conexão Socket.IO: ${socket.id}`);
    const { sessionId, userId, role, stationId: queryStationId } = socket.handshake.query; // clientInitialDurationMinutes removido daqui por enquanto
    console.log(`   Dados da conexão: sessionId=${sessionId}, userId=${userId}, role=${role}, stationId=${queryStationId}`);

    if (!sessionId || !userId || !role || !queryStationId) {
        socket.emit('SERVER_ERROR', { message: 'Dados de conexão incompletos (sessionId, userId, role, stationId são obrigatórios).' });
        socket.disconnect(true);
        return;
    }

    const currentSession = simulationSessions[sessionId];
    if (!currentSession) {
        console.log(`   [${socket.id}] Conexão recusada: Sessão ${sessionId} não existe ou expirou.`);
        socket.emit('SERVER_ERROR', { message: `Sessão ${sessionId} inválida ou expirada.` });
        socket.disconnect(true);
        return;
    }
    
    const isReconnectingToEndedSessionForReview = currentSession.simulationIsOver && 
        (role === 'evaluator' || role === 'actor' || (role === 'candidate' && currentSession.participants[socket.id]));

    if (currentSession.simulationIsOver && !isReconnectingToEndedSessionForReview) {
        console.log(`   [${socket.id}] Conexão recusada para ${role}: Sessão ${sessionId} já foi encerrada e não é para revisão.`);
        socket.emit('SERVER_ERROR', { message: `Sessão ${sessionId} já foi encerrada.` });
        socket.disconnect(true);
        return;
    }
    
    const participantsArray = Object.values(currentSession.participants);
    const existingParticipantByUserId = participantsArray.find(p => p.userId === userId);

    if (participantsArray.length >= 2 && !existingParticipantByUserId && !currentSession.participants[socket.id]) {
         console.log(`   [${socket.id}] Conexão recusada para novo participante ${userId} (${role}): Sessão ${sessionId} já está cheia (2 participantes).`);
         socket.emit('SERVER_ERROR', { message: `Sessão ${sessionId} já está com 2 participantes.` });
         socket.disconnect(true);
         return;
    }
    if (!existingParticipantByUserId) {
        const roleAlreadyTakenByOther = participantsArray.some(p => p.role === role);
        if (roleAlreadyTakenByOther) {
             console.log(`   [${socket.id}] Conexão recusada para ${userId} (${role}): Papel ${role} já ocupado por outro usuário na sessão ${sessionId}.`);
             socket.emit('SERVER_ERROR', { message: `O papel de ${role} já está ocupado nesta sessão.` });
             socket.disconnect(true);
             return;
        }
    } else if (existingParticipantByUserId && existingParticipantByUserId.role !== role) {
         console.log(`   [${socket.id}] Conexão recusada para ${userId}: Tentando entrar como ${role}, mas já está na sessão como ${existingParticipantByUserId.role}.`);
         socket.emit('SERVER_ERROR', { message: `Você já está nesta sessão como ${existingParticipantByUserId.role}.` });
         socket.disconnect(true);
         return;
    }

    socket.userData = { sessionId, userId, role, stationId: queryStationId, isReady: false, socketId: socket.id, evaluationScores: {} };
    socket.join(sessionId);
    socketIdToSessionIdMap[socket.id] = { sessionId, userId, role };

    for (const sid in currentSession.participants) {
        if (currentSession.participants[sid].userId === userId &&
            currentSession.participants[sid].role === role &&
            sid !== socket.id) {
            console.log(`   [${socket.id}] Participante ${userId} (${role}) reconectando. Socket antigo ${sid} será removido.`);
            const oldSocketInstance = io.sockets.sockets.get(sid);
            if(oldSocketInstance) oldSocketInstance.disconnect(true); // Força desconexão do socket antigo
            delete currentSession.participants[sid];
            // socketIdToSessionIdMap já será atualizado/sobrescrito para o novo socket.id
            break; 
        }
    }
    currentSession.participants[socket.id] = socket.userData; // Adiciona/atualiza com o novo socketId
    if (existingParticipantByUserId && existingParticipantByUserId.socketId !== socket.id) {
         socket.userData.isReady = existingParticipantByUserId.isReady || false;
         socket.userData.evaluationScores = existingParticipantByUserId.evaluationScores || {};
         console.log(`   [${socket.id}] Estado de pronto e scores restaurados para ${userId} (${role}) após reconexão.`);
    }

    console.log(`   [${socket.id}] Usuário ${userId} (${role}) conectado/atualizado na sala ${sessionId}`);
    console.log(`   Sessão ${sessionId} (Participantes):`, Object.keys(currentSession.participants).length, Object.values(currentSession.participants).map(p=> ({role: p.role, ready: p.isReady, userId: p.userId.substring(0,5) })));
    
    socket.emit('SERVER_JOIN_CONFIRMED', {
        sessionId,
        userId,
        role,
        isReady: socket.userData.isReady,
        simulationStarted: currentSession.simulationHasStarted,
        simulationEnded: currentSession.simulationIsOver,
        remainingSeconds: currentSession.remainingSeconds,
        stationDurationMinutes: currentSession.stationDurationMinutes,
        isManuallyPaused: currentSession.isManuallyPaused, // Envia estado de pausa manual
        isPausedDueToDisconnect: currentSession.isPausedDueToDisconnect,
        toleranceRemainingSeconds: currentSession.toleranceRemainingSeconds
     });
    socket.emit('SERVER_EXISTING_PARTNERS', Object.values(currentSession.participants).filter(p => p.socketId !== socket.id).map(p => ({userId: p.userId, role: p.role, isReady: p.isReady})));
    socket.to(sessionId).emit('SERVER_PARTNER_JOINED', {userId: socket.userData.userId, role: socket.userData.role, isReady: socket.userData.isReady});

    const currentActiveParticipants = Object.values(currentSession.participants).filter(p => io.sockets.sockets.has(p.socketId));
    if (currentSession.isPausedDueToDisconnect && currentActiveParticipants.length >= 2) {
        console.log(`[RECONNECT] Usuário ${userId} reconectou para sessão ${sessionId} que estava pausada por desconexão. Retomando simulação.`);
        clearInterval(currentSession.disconnectToleranceTimer);
        currentSession.disconnectToleranceTimer = null;
        currentSession.isPausedDueToDisconnect = false;
        io.to(sessionId).emit('SERVER_SIMULATION_RESUMED'); 
        if (!currentSession.isManuallyPaused) { // Só retoma o timer se não estiver manualmente pausado
            startSimulationTimer(sessionId);
        } else {
            console.log(`[TOLERANCE] Simulação ${sessionId} reconectada, mas permanece em pausa manual.`);
        }
    }


    socket.on('CLIENT_IM_READY', (payload) => {
        if (!socket.userData || !payload || socket.userData.sessionId !== payload.sessionId) {
            console.warn(`[CLIENT_IM_READY] Payload inválido. SocketID: ${socket.id}, UserData: ${JSON.stringify(socket.userData)}, Payload: ${JSON.stringify(payload)}`);
            return;
        }
        const session = simulationSessions[socket.userData.sessionId];
        if (!session || !session.participants[socket.id] || session.simulationIsOver) {
            console.warn(`[CLIENT_IM_READY] Sessão inválida ou encerrada para ${socket.id}. simOver: ${session?.simulationIsOver}`);
            return;
        }

        if (!session.participants[socket.id].isReady) {
            session.participants[socket.id].isReady = true;
            socket.userData.isReady = true;
            console.log(`   [${socket.id}] Usuário ${socket.userData.userId} (${socket.userData.role}) PRONTO na sala ${socket.userData.sessionId}`);
            io.to(socket.userData.sessionId).emit('SERVER_PARTNER_READY', { userId: socket.userData.userId, role: socket.userData.role, isReady: true });
        }
    });
    socket.on('CLIENT_START_SIMULATION', (payload) => {
        console.log(`[SERVER] Evento CLIENT_START_SIMULATION recebido. Payload completo:`, JSON.stringify(payload));
        const { sessionId: userSessionId, durationMinutes: clientDurationMinutes } = payload;
        const { userId, role } = socket.userData || {};

        if (!userSessionId || !userId || !role) {
            console.error(`[SERVER - CLIENT_START_SIMULATION] Dados insuficientes do socket (ID: ${socket.id}) para iniciar a sessão ${userSessionId}.`);
            return socket.emit('SERVER_ERROR', { message: 'Não foi possível iniciar a simulação: dados de usuário ausentes.' });
        }
        if (role !== 'actor' && role !== 'evaluator') {
            console.warn(`[SERVER - CLIENT_START_SIMULATION] Usuário ${userId} (${role}) tentou iniciar a sessão ${userSessionId} sem permissão.`);
            return socket.emit('SERVER_ERROR', { message: 'Apenas o ator/avaliador pode iniciar a simulação.' });
        }

        const session = simulationSessions[userSessionId];
        if (!session) {
            console.error(`[SERVER - CLIENT_START_SIMULATION] Sessão ${userSessionId} não encontrada para o usuário ${userId}.`);
            return socket.emit('SERVER_ERROR', { message: `Sessão ${userSessionId} não encontrada.` });
        }
        if (session.simulationHasStarted) { console.warn(`[SERVER - CLIENT_START_SIMULATION] Tentativa de iniciar sessão ${userSessionId} que já começou.`); return; }
        if (session.simulationIsOver) { console.warn(`[SERVER - CLIENT_START_SIMULATION] Tentativa de iniciar sessão ${userSessionId} que já terminou.`); return; }
        if (session.isManuallyPaused || session.isPausedDueToDisconnect) { // NOVO: Não iniciar se pausado
            console.warn(`[SERVER - CLIENT_START_SIMULATION] Tentativa de iniciar sessão ${userSessionId} que está pausada.`);
            return socket.emit('SERVER_ERROR', { message: 'A simulação está pausada e não pode ser iniciada.'});
        }


        const participants = Object.values(session.participants);
        const allParticipantsReady = participants.length >= 2 && participants.every(p => p.isReady);
        if (!allParticipantsReady) {
             console.warn(`[SERVER - CLIENT_START_SIMULATION] Falha ao iniciar ${userSessionId} por ${userId} (${role}): Nem todos prontos.`);
             return socket.emit('SERVER_ERROR', { message: 'Ambos os participantes precisam estar "Pronto" para iniciar.'});
        }

        let finalDurationMinutes = DEFAULT_STATION_DURATION_MINUTES; 
        if (clientDurationMinutes && Number.isInteger(parseInt(clientDurationMinutes)) && VALID_CLIENT_DURATIONS.includes(parseInt(clientDurationMinutes))) {
            finalDurationMinutes = parseInt(clientDurationMinutes);
        }
        else if (session?.stationDurationMinutes && VALID_CLIENT_DURATIONS.includes(session.stationDurationMinutes)) {
            finalDurationMinutes = session.stationDurationMinutes;
        }
        
        session.stationDurationMinutes = finalDurationMinutes;
        session.remainingSeconds = finalDurationMinutes * 60;
        session.simulationHasStarted = true;
        session.simulationIsOver = false;
        session.isManuallyPaused = false; // Garante que não começa pausado
        session.isPausedDueToDisconnect = false;

        console.log(`[SERVER] Duração FINAL que será usada e enviada para a simulação ${userSessionId}: ${finalDurationMinutes} minutos (${session.remainingSeconds}s).`);
        io.to(userSessionId).emit('SERVER_START_SIMULATION', {
            startTime: Date.now(),
            stationId: session.stationId,
            durationSeconds: session.remainingSeconds
        });
        startSimulationTimer(userSessionId);
    });

    // NOVO: Handlers para Pause/Resume Manual
    socket.on('CLIENT_REQUEST_PAUSE', (payload) => {
        if (!socket.userData || socket.userData.sessionId !== payload.sessionId) return;
        const { sessionId: requestedSessionId } = payload;
        const { userId, role } = socket.userData;

        if (role !== 'actor' && role !== 'evaluator') {
            return socket.emit('SERVER_ERROR', { message: 'Apenas ator/avaliador podem pausar a simulação.' });
        }
        const session = simulationSessions[requestedSessionId];
        if (session && session.simulationHasStarted && !session.simulationIsOver && !session.isPausedDueToDisconnect) {
            if (!session.isManuallyPaused) {
                session.isManuallyPaused = true;
                if (session.timerInterval) { // Pausa o timer principal
                    clearInterval(session.timerInterval);
                    session.timerInterval = null;
                }
                io.to(requestedSessionId).emit('SERVER_SIMULATION_PAUSED', { manual: true });
                console.log(`   [PAUSE] Sessão ${requestedSessionId} pausada manualmente por ${userId} (${role}).`);
            }
        } else {
            socket.emit('SERVER_ERROR', { message: 'Não é possível pausar a simulação neste estado.' });
        }
    });

    socket.on('CLIENT_REQUEST_RESUME', (payload) => {
        if (!socket.userData || socket.userData.sessionId !== payload.sessionId) return;
        const { sessionId: requestedSessionId } = payload;
        const { userId, role } = socket.userData;

        if (role !== 'actor' && role !== 'evaluator') {
            return socket.emit('SERVER_ERROR', { message: 'Apenas ator/avaliador podem retomar a simulação.' });
        }
        const session = simulationSessions[requestedSessionId];
        if (session && session.simulationHasStarted && !session.simulationIsOver && session.isManuallyPaused && !session.isPausedDueToDisconnect) {
            session.isManuallyPaused = false;
            startSimulationTimer(requestedSessionId); // Retoma o timer principal
            io.to(requestedSessionId).emit('SERVER_SIMULATION_RESUMED');
            console.log(`   [RESUME] Sessão ${requestedSessionId} retomada manualmente por ${userId} (${role}).`);
        } else {
            socket.emit('SERVER_ERROR', { message: 'Não é possível retomar a simulação neste estado ou não estava manualmente pausada.' });
        }
    });


    socket.on('CLIENT_MANUAL_END_SIMULATION', (payload) => {
        if (!socket.userData || socket.userData.sessionId !== payload.sessionId) { return; }
        if (socket.userData.role !== 'actor' && socket.userData.role !== 'evaluator') { return; }
        const { sessionId: sessionToEnd } = payload;
        const session = simulationSessions[sessionToEnd];
        if (session && session.simulationHasStarted && !session.simulationIsOver) {
            console.log(`   [${socket.id}] Ator/Avaliador (${socket.userData.role}) solicitou encerramento manual da sessão ${sessionToEnd}`);
            stopSimulationTimer(sessionToEnd, 'manual_end');
        } else {
            console.log(`   [${socket.id}] Tentativa de encerrar manualmente sessão ${sessionToEnd} que não está ativa ou já terminou.`);
        }
    });
    
    socket.on('ACTOR_RELEASE_DATA', (payload) => {
        if (!socket.userData || socket.userData.sessionId !== payload.sessionId || socket.userData.role !== 'actor') return;
        const { sessionId, dataItemId } = payload;
        const session = simulationSessions[sessionId];
        
        if (session && (session.simulationHasStarted || session.simulationIsOver) && !session.isManuallyPaused && !session.isPausedDueToDisconnect) { // Não liberar se pausado
            const status = session.simulationIsOver ? 'encerrada' : 'em andamento';
            console.log(`   [${socket.id}] Ator ${socket.userData.userId} liberou ${dataItemId} em ${sessionId} (Sessão ${status}).`);
            io.to(sessionId).emit('CANDIDATE_RECEIVE_DATA', { dataItemId });
        } else {
             let reason = "não iniciada";
             if(session && session.isManuallyPaused) reason = "pausada manualmente";
             if(session && session.isPausedDueToDisconnect) reason = "pausada por desconexão";
            console.log(`   [${socket.id}] Ator tentou liberar dados para sessão ${sessionId} que está ${reason}.`);
            socket.emit('SERVER_ERROR', { message: `Não é possível liberar dados enquanto a simulação está ${reason}.`});
        }
    });
    socket.on('EVALUATOR_SUBMIT_EVALUATION', (payload) => {
        if (!socket.userData || socket.userData.sessionId !== payload.sessionId || (socket.userData.role !== 'evaluator' && socket.userData.role !== 'actor') ) return;
        console.log(`   [${socket.id}] ${socket.userData.role} ${socket.userData.userId} submeteu avaliação para ${payload.sessionId}:`, payload.scores);

        const session = simulationSessions[payload.sessionId];
        if (session && session.participants[socket.id]) {
            session.participants[socket.id].evaluationScores = payload.scores;
            session.participants[socket.id].totalScore = payload.totalScore;
        }

        socket.emit('SERVER_RESPONSE', { success: true, message: 'Avaliação recebida pelo servidor.' });

        if (session && session.simulationIsOver) { // Envia ao candidato APENAS se a simulação já terminou.
             io.to(payload.sessionId).emit('CANDIDATE_RECEIVE_UPDATED_SCORES', {
                scores: payload.scores,
                totalScore: payload.totalScore
            });
        }
    });
    socket.on('ACTOR_RELEASE_PEP', (payload) => {
        if (!socket.userData || socket.userData.sessionId !== payload.sessionId || (socket.userData.role !== 'actor' && socket.userData.role !== 'evaluator')) return;
        const { sessionId } = payload;
        const session = simulationSessions[sessionId];
        if (session && session.simulationIsOver) { 
            console.log(`   [${socket.id}] ${socket.userData.role} liberando PEP para ${sessionId} (Sessão encerrada).`);
            io.to(sessionId).emit('CANDIDATE_RECEIVE_PEP_VISIBILITY', { shouldBeVisible: true });

            const actorOrEvaluatorSocketId = Object.keys(session.participants).find(
                sid => session.participants[sid].role === 'actor' || session.participants[sid].role === 'evaluator'
            );
            const actorOrEvaluatorData = actorOrEvaluatorSocketId ? session.participants[actorOrEvaluatorSocketId] : null;

            // Sempre envia os scores ao liberar o PEP, mesmo que já tenham sido enviados na submissão final
            // Isso garante que o candidato os receba se o PEP for liberado
            const scoresToSend = actorOrEvaluatorData?.evaluationScores || {};
            const totalScoreToSend = actorOrEvaluatorData?.totalScore || 0;
            
            console.log(`[ACTOR_RELEASE_PEP] Scores a serem enviados ao candidato da sessão ${sessionId}:`, scoresToSend);
            io.to(sessionId).emit('CANDIDATE_RECEIVE_UPDATED_SCORES', {
                scores: scoresToSend,
                totalScore: totalScoreToSend
            });

        } else {
            const msg = session ? 'PEP só pode ser liberado após o término da simulação.' : `Sessão ${sessionId} não encontrada ou ainda não encerrada.`;
            console.log(`   [${socket.id}] Tentativa de liberar PEP para sessão ${sessionId}: ${msg}`);
            socket.emit('SERVER_ERROR', { message: msg });
        }
    });

    // Este evento é mais para o ator/avaliador enviar atualizações PONTUAIS ao candidato se o PEP já estiver visível.
    // A submissão final e liberação do PEP já cuidam do envio principal dos scores.
    socket.on('EVALUATOR_SCORES_UPDATED_FOR_CANDIDATE', (payload) => {
         if (!socket.userData || socket.userData.sessionId !== payload.sessionId || (socket.userData.role !== 'actor' && socket.userData.role !== 'evaluator')) {
             return;
         }
         const { sessionId, scores, totalScore } = payload;
         const session = simulationSessions[sessionId];
         // Verifique se o PEP já foi liberado para o candidato nesta sessão
         // (Precisa de um flag na sessão `pepReleasedToCandidateTimestamp` ou similar, ou confiar no frontend para não enviar antes)
         // Por ora, apenas retransmite se a sessão existir.
         if (session) {
             console.log(`   [${socket.id}] ${socket.userData.role} ${socket.userData.userId} (CLIENT EVENT) enviou ATUALIZAÇÃO DE SCORES para ${sessionId}. Retransmitindo...`);
             io.to(sessionId).emit('CANDIDATE_RECEIVE_UPDATED_SCORES', { scores, totalScore });
         }
    });
    
    socket.on('disconnect', (reason) => {
        const disconnectedSocketId = socket.id;
        const sessionUserData = { ...socketIdToSessionIdMap[disconnectedSocketId] }; // Copia antes de deletar
        console.log(`<-- Disconnect: ${disconnectedSocketId}. Razão: ${reason}. UserData Mapeado:`, JSON.stringify(sessionUserData));

        const sessionIdToClean = sessionUserData?.sessionId;
        delete socketIdToSessionIdMap[disconnectedSocketId]; // Remove o mapeamento do socket desconectado

        if (sessionIdToClean) {
            const session = simulationSessions[sessionIdToClean];
            if (session) {
                let userId = sessionUserData?.userId; // Tenta pegar da cópia
                let role = sessionUserData?.role;   // Tenta pegar da cópia

                if (session.participants[disconnectedSocketId]) {
                    // Se não pegou da cópia, pega do participante antes de deletar
                    if (!userId) userId = session.participants[disconnectedSocketId].userId;
                    if (!role) role = session.participants[disconnectedSocketId].role;

                    delete session.participants[disconnectedSocketId];
                    const remainingCount = Object.keys(session.participants).length;
                    console.log(`   [Sessão ${sessionIdToClean}] Participante ${userId || 'desconhecido'} (${role || 'desconhecido'}) removido (socket: ${disconnectedSocketId}). Restantes: ${remainingCount}`);
                    
                    // Notifica os outros participantes que alguém saiu
                    io.to(sessionIdToClean).emit('SERVER_PARTNER_LEFT', { socketId: disconnectedSocketId, userId, role });

                    const isRunning = session.simulationHasStarted && !session.simulationIsOver;

                    if (isRunning && remainingCount < 2 && !session.isPausedDueToDisconnect) {
                        // Somente inicia o timer de tolerância se não já estiver em um (evita múltiplos timers)
                        console.log(`   [Sessão ${sessionIdToClean}] Número de participantes caiu para ${remainingCount} durante simulação ativa. Iniciando tolerância.`);
                        startDisconnectToleranceTimer(sessionIdToClean, userId);
                    } else if (isRunning && remainingCount >= 2 && session.isPausedDueToDisconnect) {
                        // Se alguém desconectou, mas ainda temos 2 ou mais E ESTAVA PAUSADO POR DESCONEXÃO (ex: 3p -> 2p)
                        // E o que desconectou não era o que mantinha a sessão unicamente com 1p.
                        // Esta lógica é complexa, o startDisconnectToleranceTimer já verifica se reconectou
                        console.log(`   [Sessão ${sessionIdToClean}] Um participante saiu, mas ainda há ${remainingCount}. Se estava em auto-pausa e agora >1, deve retomar.`);
                        // A retomada é tratada dentro do startDisconnectToleranceTimer ou na reconexão do novo socket.
                    }
                    
                    if (remainingCount === 0) {
                        if (!session.simulationIsOver) {
                            console.log(`   [Sessão ${sessionIdToClean}] Sala ficou vazia. Encerrando e removendo.`);
                            stopSimulationTimer(sessionIdToClean, 'sala vazia');
                        } else {
                            console.log(`   [Sessão ${sessionIdToClean}] Sala vazia (simulação já havia terminado). Removendo.`);
                        }
                        // Limpa timers explicitamente antes de deletar a sessão
                        if(session.timerInterval) clearInterval(session.timerInterval);
                        if(session.disconnectToleranceTimer) clearInterval(session.disconnectToleranceTimer);
                        delete simulationSessions[sessionIdToClean];
                        console.log(`   [Sessão ${sessionIdToClean}] Deletada do objeto de sessões.`);
                    }
                } else {
                    console.log(`   [Sessão ${sessionIdToClean}] Participante com socketId ${disconnectedSocketId} não foi encontrado na lista da sessão durante o disconnect (pode já ter sido removido).`);
                }
            } else {
                console.log(`   [${disconnectedSocketId}] Sessão ${sessionIdToClean} não encontrada no objeto global simulationSessions ao desconectar.`);
            }
        } else {
            console.log(`   [${disconnectedSocketId}] Socket desconectado sem sessionId mapeado. Não foi possível limpar participante da sessão.`);
        }
        console.log("Sessões Ativas (Após DC):", Object.keys(simulationSessions).length);
    });
});
server.listen(PORT, () => {
  console.log(`*** Backend Revalida Fácil rodando em http://localhost:${PORT} ***`);
  console.log(`*** Permitindo CORS das seguintes origens: ${allowedOrigins.join(', ')} ***`);
});
server.on('error', (error) => { console.error('Erro Servidor HTTP:', error); });