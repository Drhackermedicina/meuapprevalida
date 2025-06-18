<script setup>
// Imports
import { ref, onMounted, watch, onUnmounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { db } from '../firebaseConfig.js';
import { doc, getDoc } from 'firebase/firestore';
import { currentUser } from '../authStore.js';
import io from 'socket.io-client';

// Refs para dados da estação e checklist
const stationData = ref(null);
const checklistData = ref(null);
// Refs para controle de UI e estado
const isLoading = ref(true);
const errorMessage = ref('');
const socket = ref(null);
const connectionStatus = ref('Desconectado');

// Refs para dados da simulação
const releasedData = ref({});
const evaluationScores = ref({});
const isChecklistVisibleForCandidate = ref(false);
const pepReleasedToCandidate = ref(false);

const actorVisibleImpressoContent = ref({});
const candidateReceivedScores = ref({});
const candidateReceivedTotalScore = ref(0);
const actorReleasedImpressoIds = ref({});

// Refs para informações do parceiro e da sessão
const partner = ref(null);
const route = useRoute();
const router = useRouter();

const stationId = ref(null);
const sessionId = ref(null);
const userRole = ref(null);

const inviteLinkToShow = ref('');
const copySuccess = ref(false);

// Refs para estado de prontidão e controle da simulação
const myReadyState = ref(false);
const partnerReadyState = ref(false);
const simulationStarted = ref(false);
const simulationEnded = ref(false);
const simulationWasManuallyEndedEarly = ref(false);
// Refs para o timer e seleção de duração
const simulationTimeSeconds = ref(10 * 60);
const timerDisplay = ref(formatTime(simulationTimeSeconds.value));
const selectedDurationMinutes = ref(10);

// --- Função Helper para Formatar Tempo ---
function formatTime(totalSeconds) {
  if (isNaN(totalSeconds) || totalSeconds < 0) totalSeconds = 0;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// --- Função para Tocar Som (Início/Fim) ---
function playSoundEffect() {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (!audioContext) { console.warn("Web Audio API não suportada."); return; }
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(1200, audioContext.currentTime);
    gainNode.gain.setValueAtTime(0.25, audioContext.currentTime);
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
    setTimeout(() => { if (audioContext.state !== 'closed') { audioContext.close(); } }, 700);
  } catch (e) { console.warn("Não foi possível tocar o som:", e);
  }
}

// --- NOVO: Função para Formatar a Descrição do Item do PEP para Exibição ---
function formatItemDescriptionForDisplay(descriptionText, itemTitle = '') {
  if (!descriptionText || typeof descriptionText !== 'string') {
    return descriptionText || '';
  }
  let desc = descriptionText.trim();

  // Remove o nome do item do início da descrição (ex: "Apresentação: ...")
  if (itemTitle) {
    const regex = new RegExp('^' + itemTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\s*:', 'i');
    desc = desc.replace(regex, '').trim();
  } else {
    desc = desc.replace(/^([^:]+):/, '').trim();
  }

  // Remove 'e,' e 'e' desnecessários
  desc = desc.replace(/\s+e,?\s+/g, ', ');
  desc = desc.replace(/,\s*,/g, ','); // remove vírgulas duplas
  desc = desc.replace(/,\s*\./g, '.'); // remove vírgula antes de ponto final
  desc = desc.replace(/,\s*$/g, ''); // remove vírgula no final

  // NOVO: Remove vírgula imediatamente antes de parênteses
  desc = desc.replace(/,\s*\(/g, ' (');

  // Substitui '\n' e ';' por <br>
  desc = desc.replace(/\\n/g, '<br>').replace(/;/g, '<br>');

  // Coloca em negrito apenas o que vem antes dos dois pontos, exceto se estiver entre parênteses
  desc = desc.replace(/(^|<br>)([^<\(\)\n:]+?):/g, '$1<strong>$2:</strong>');

  return desc;
}

// REMOVIDO: A computed property `parsedDescriptions` e a função `parseItemDescription` original
// foram removidas pois não são mais necessárias para o formato de exibição desejado.


// --- Função para Buscar Dados da Estação e Checklist ---
async function fetchSimulationData(currentStationId) {
  if (!currentStationId) { errorMessage.value = 'ID da estação inválido.';
    isLoading.value = false; return; }
  isLoading.value = true; errorMessage.value = '';
  console.log(`FETCH: Buscando Estação ID: ${currentStationId} em 'estacoes_clinicas'`);
  try {
    const stationDocRef = doc(db, 'estacoes_clinicas', currentStationId);
    const stationSnap = await getDoc(stationDocRef);
    if (!stationSnap.exists()) { throw new Error(`Estação ${currentStationId} não encontrada.`); }
    stationData.value = { id: stationSnap.id, ...stationSnap.data() };
    console.log("FETCH: Estação Carregada:", stationData.value?.tituloEstacao);

    const durationFromQuery = route.query.duration ? parseInt(route.query.duration) : null;
    const validOptions = [5, 6, 7, 8, 9, 10];

    if (!durationFromQuery || !validOptions.includes(durationFromQuery)) {
      const stationDefaultMinutes = stationData.value?.tempoDuracaoMinutos;
      if (stationDefaultMinutes && validOptions.includes(stationDefaultMinutes)) {
        selectedDurationMinutes.value = stationDefaultMinutes;
      } else {
        if (!validOptions.includes(selectedDurationMinutes.value)) {
          selectedDurationMinutes.value = 10;
        }
      }
    }
    simulationTimeSeconds.value = selectedDurationMinutes.value * 60;
    timerDisplay.value = formatTime(simulationTimeSeconds.value);

    if (stationData.value?.padraoEsperadoProcedimento) {
      checklistData.value = stationData.value.padraoEsperadoProcedimento;
      if (!checklistData.value.itensAvaliacao || !Array.isArray(checklistData.value.itensAvaliacao) || checklistData.value.itensAvaliacao.length === 0) {
        console.warn("FETCH: PEP não contém 'itensAvaliacao' válidos.");
      }
    } else {
      console.warn(`FETCH: 'padraoEsperadoProcedimento' não encontrado na estação. PEP (checklistData) será nulo.`);
      checklistData.value = null;
    }
  } catch (error) { console.error("FETCH: Erro ao buscar dados:", error);
    errorMessage.value = `Falha ao carregar dados da estação: ${error.message}`; stationData.value = null;
    checklistData.value = null;}
  finally {
    isLoading.value = false; console.log("FETCH: Finalizado. isLoading:", isLoading.value, "stationData:", !!stationData.value, "checklistData:", !!checklistData.value);
    if (stationData.value && !errorMessage.value && sessionId.value && userRole.value && stationId.value && currentUser.value?.uid) {
      if (!socket.value || !socket.value.connected) { connectWebSocket();
      }
    } else { console.warn("FETCH: Dados faltando para conectar ao WebSocket ou erro no fetch.");
    }
  }
}

// --- Lógica do WebSocket ---
function connectWebSocket() {
  if (!sessionId.value || !userRole.value || !stationId.value || !currentUser.value?.uid) { console.error("SOCKET: Dados essenciais faltando para conexão.");
    return; }
  const backendUrl = 'http://localhost:3000'; // Backend local
  console.log(`SOCKET: Conectando a ${backendUrl} para Sessão: ${sessionId.value}, Usuário: ${currentUser.value.uid}, Papel: ${userRole.value}`);
  connectionStatus.value = 'Conectando';
  if (socket.value && socket.value.connected) { socket.value.disconnect(); }
  socket.value = io(backendUrl, { transports: ['websocket'], query: { sessionId: sessionId.value, userId: currentUser.value.uid, role: userRole.value, stationId: stationId.value }});
  socket.value.on('connect', () => { connectionStatus.value = 'Conectado'; console.log('SOCKET: Conectado! ID do Socket:', socket.value.id); });
  socket.value.on('disconnect', (reason) => {
    connectionStatus.value = 'Desconectado';
    const wasPartnerConnected = !!partner.value;
    partner.value = null;

    const isCandidateReviewing = userRole.value === 'candidate' && stationData.value && simulationStarted.value;

    if (!isCandidateReviewing) {
      myReadyState.value = false;
      partnerReadyState.value = false;
      if (!simulationStarted.value) {
        timerDisplay.value = formatTime(selectedDurationMinutes.value * 60);
      }
    }

    if (isCandidateReviewing) {
      if (!errorMessage.value && reason !== 'io client disconnect' && reason !== 'io client disconnect forced close by client') {
        errorMessage.value = "Conexão perdida. Você pode continuar revisando os dados da estação.";
      }
    } else {
      if (!errorMessage.value && reason !== 'io client disconnect' && reason !== 'io client disconnect forced close by client') {
        errorMessage.value = "Conexão com o servidor de simulação perdida.";
      }
    }
      console.log(`SOCKET: Desconectado. Razão: ${reason}`);
  });
  socket.value.on('connect_error', (err) => { connectionStatus.value = 'Erro de Conexão'; if(!errorMessage.value) errorMessage.value = `Falha ao conectar: ${err.message}`; console.error('SOCKET: Erro de conexão', err);});
  socket.value.on('SERVER_ERROR', (data) => { console.error('SOCKET: Erro do Servidor:', data.message); errorMessage.value = `Erro do servidor: ${data.message}`; });
  socket.value.on('SERVER_JOIN_CONFIRMED', (data) => { console.log('>>> EVENTO RECEBIDO: SERVER_JOIN_CONFIRMED <<<', data); });
  socket.value.on('SERVER_PARTNER_JOINED', (participantInfo) => { console.log('>>> EVENTO RECEBIDO: SERVER_PARTNER_JOINED <<<', participantInfo); if (participantInfo && participantInfo.userId !== currentUser.value?.uid) { partner.value = participantInfo; partnerReadyState.value = participantInfo.isReady || false; errorMessage.value = ''; } });
  socket.value.on('SERVER_EXISTING_PARTNERS', (participantsList) => { console.log('>>> EVENTO RECEBIDO: SERVER_EXISTING_PARTNERS <<<', participantsList); updatePartnerInfo(participantsList); });
  function updatePartnerInfo(participants) { const currentUserId = currentUser.value?.uid;
  if (participants && Array.isArray(participants) && currentUserId) { const otherParticipant = participants.find(p => p.userId !== currentUserId); if(otherParticipant) { partner.value = otherParticipant;
  partnerReadyState.value = partner.value.isReady || false; errorMessage.value = ''; } else { partner.value = null;
  partnerReadyState.value = false;} } else { partner.value = null; partnerReadyState.value = false;} }

  socket.value.on('SERVER_PARTNER_LEFT', (data) => {
    console.log('>>> EVENTO RECEBIDO: SERVER_PARTNER_LEFT <<<', data);
    if (partner.value && partner.value.userId === data.userId) {
      partner.value = null;
      partnerReadyState.value = false;

      const isCandidateReviewing = userRole.value === 'candidate' && stationData.value && simulationStarted.value;

      if (!isCandidateReviewing) {
        myReadyState.value = false;
      }

      if (isCandidateReviewing) {
        if (!errorMessage.value) {
            errorMessage.value = "O parceiro desconectou. Você pode continuar revisando os dados da estação.";
        }
      } else {
        if (!errorMessage.value) {
          errorMessage.value = "Simulação interrompida: o parceiro desconectou.";
        }
      }
    }
  });
  socket.value.on('CANDIDATE_RECEIVE_DATA', (payload) => { console.log('>>> EVENTO RECEBIDO: CANDIDATE_RECEIVE_DATA <<<', payload); const { dataItemId } = payload; if (userRole.value === 'candidate' && stationData.value?.materiaisDisponiveis?.impressos) { const impressoParaLiberar = stationData.value.materiaisDisponiveis.impressos.find(item => item.idImpresso === dataItemId); if (impressoParaLiberar) { releasedData.value[dataItemId] = { ...impressoParaLiberar }; releasedData.value = {...releasedData.value}; } } });
  socket.value.on('SERVER_PARTNER_READY', (data) => { console.log('>>> EVENTO RECEBIDO: SERVER_PARTNER_READY <<<', data); if (data && data.userId !== currentUser.value?.uid) { if (partner.value && partner.value.userId === data.userId) { partner.value.isReady = data.isReady; } partnerReadyState.value = data.isReady; } });
  socket.value.on('SERVER_START_SIMULATION', (data) => {
    console.log('>>> EVENTO RECEBIDO: SERVER_START_SIMULATION <<<', data);
    if (data && typeof data.durationSeconds === 'number') {
        simulationTimeSeconds.value = data.durationSeconds;
        timerDisplay.value = formatTime(data.durationSeconds);
        console.log(`[CLIENT] SERVER_START_SIMULATION recebido. Timer configurado para ${data.durationSeconds}s pelo servidor.`);
    } else {
        console.warn('[CLIENT] SERVER_START_SIMULATION não continha durationSeconds. Timer pode estar dessincronizado com o cliente inicial.');
        timerDisplay.value = formatTime(simulationTimeSeconds.value);
    }
    simulationStarted.value = true;
    simulationEnded.value = false;
    simulationWasManuallyEndedEarly.value = false;
    errorMessage.value = '';
    playSoundEffect();
  });
  socket.value.on('TIMER_UPDATE', (data) => {
    if (typeof data.remainingSeconds === 'number') {
      timerDisplay.value = formatTime(data.remainingSeconds);
      if (data.remainingSeconds <= 0 && !simulationEnded.value) {
        simulationEnded.value = true;
      }
    }
  });
  socket.value.on('TIMER_END', () => {
    console.log('>>> EVENTO RECEBIDO: TIMER_END <<<');
    timerDisplay.value = "00:00";
    if (!simulationEnded.value) {
      playSoundEffect();
    }
    simulationEnded.value = true;
    simulationWasManuallyEndedEarly.value = false; // Garante que é false se terminou por tempo
  });
  socket.value.on('TIMER_STOPPED', (data) => {
    console.log('>>> EVENTO RECEBIDO: TIMER_STOPPED <<<', data);
    const previousTimerDisplay = timerDisplay.value;

    if (!simulationEnded.value) {
        playSoundEffect();
    }
    simulationEnded.value = true;

    // A lógica para `simulationWasManuallyEndedEarly` permanece aqui,
    // pois ela é usada para desabilitar a 'Submissão de Avaliação'.
    if (data?.reason === 'manual_end') { // Verificando se a razão é 'manual_end'
      simulationWasManuallyEndedEarly.value = true;
      console.log("Simulação encerrada manualmente ANTES do tempo.");
    } else {
      simulationWasManuallyEndedEarly.value = false; // Garante que é false para outras razões
    }


    if (data?.reason === 'participante desconectou' && !errorMessage.value) {
      errorMessage.value = "Simulação interrompida: parceiro desconectou.";
    } else if (data?.reason === 'manual_end' && !errorMessage.value && simulationWasManuallyEndedEarly.value) { // Esta condição será TRUE se for 'manual_end'
      errorMessage.value = "Simulação encerrada manualmente pelo ator/avaliador antes do tempo.";
    } else if (data?.reason === 'tempo esgotado' && !errorMessage.value) { // Adicionado para clarity
      errorMessage.value = "Simulação encerrada: tempo esgotado.";
    } else if (!errorMessage.value) {
      errorMessage.value = "Simulação encerrada.";
    // Fallback para outras razões ou manual_end que já não era antes
    }
  });
  socket.value.on('CANDIDATE_RECEIVE_PEP_VISIBILITY', (payload) => {
    console.log('>>> EVENTO RECEBIDO: CANDIDATE_RECEIVE_PEP_VISIBILITY <<<', payload);
    if (userRole.value === 'candidate' && payload && typeof payload.shouldBeVisible === 'boolean') {
      isChecklistVisibleForCandidate.value = payload.shouldBeVisible;
    }
  });
  socket.value.on('CANDIDATE_RECEIVE_UPDATED_SCORES', (data) => {
    if (userRole.value === 'candidate' && data && data.scores) {
      console.log('CANDIDATO: Scores recebidos/atualizados:', data.scores, 'Total:', data.totalScore);
      candidateReceivedScores.value = { ...data.scores };
      if (typeof data.totalScore === 'number') {
        candidateReceivedTotalScore.value = data.totalScore;
      }
    }
  });
}

// --- Função Setup Session ---
function setupSession() {
  console.log("SETUP_SESSION: Iniciando...");
  errorMessage.value = '';
  isLoading.value = true;
  if (socket.value && socket.value.connected) { socket.value.disconnect(); }
  socket.value = null;
  stationData.value = null;
  checklistData.value = null;
  stationId.value = route.params.id;
  sessionId.value = route.query.session;
  userRole.value = route.query.role;

  inviteLinkToShow.value = '';

  myReadyState.value = false;
  partnerReadyState.value = false;
  simulationStarted.value = false;
  simulationEnded.value = false;
  simulationWasManuallyEndedEarly.value = false;
  partner.value = null;
  releasedData.value = {};
  evaluationScores.value = {};
  isChecklistVisibleForCandidate.value = false;
  pepReleasedToCandidate.value = false;
  actorVisibleImpressoContent.value = {};
  candidateReceivedScores.value = {};
  candidateReceivedTotalScore.value = 0;
  actorReleasedImpressoIds.value = {};

  const durationFromQuery = route.query.duration ? parseInt(route.query.duration) : null;
  const validOptions = [5, 6, 7, 8, 9, 10];
  if (durationFromQuery && validOptions.includes(durationFromQuery)) {
      selectedDurationMinutes.value = durationFromQuery;
      console.log(`Duração definida pela URL: ${selectedDurationMinutes.value} min`);
  } else {
      selectedDurationMinutes.value = 10;
      if(durationFromQuery) console.warn(`Duração inválida (${durationFromQuery}) na URL, usando padrão ${selectedDurationMinutes.value} min.`);
  }
  timerDisplay.value = formatTime(selectedDurationMinutes.value * 60);
  console.log("SETUP_SESSION: Dados da Rota:", { params: route.params, query: route.query });
  if (!sessionId.value) { errorMessage.value = "Link inválido: ID Sessão não encontrado."; isLoading.value = false; return;
  }
  if (!stationId.value) { errorMessage.value = "Link inválido: ID Estação não encontrado."; isLoading.value = false; return;
  }
  if (!userRole.value || !['actor', 'candidate', 'evaluator'].includes(userRole.value)) { errorMessage.value = "Link inválido: Papel não definido/incorreto."; isLoading.value = false; return;
  }
  console.log("SETUP_SESSION: Refs atualizados:", { stationId: stationId.value, sessionId: sessionId.value, userRole: userRole.value });

  fetchSimulationData(stationId.value);
}

// --- Computed Property para Soma Automática das Notas ---
const totalScore = computed(() => {
  return Object.values(evaluationScores.value).reduce((sum, score) => {
    const numScore = parseFloat(score);
    return sum + (isNaN(numScore) ? 0 : numScore);
  }, 0);
});
// --- Computed Property e Watch para 'bothParticipantsReady' ---
const bothParticipantsReady = computed(() => myReadyState.value && partnerReadyState.value && !!partner.value);
watch(bothParticipantsReady, (newValue) => {
  if (newValue &&
      (userRole.value === 'actor' || userRole.value === 'evaluator') &&
      socket.value?.connected &&
      !simulationStarted.value &&
      !simulationEnded.value &&
      inviteLinkToShow.value // Garante que o link já foi gerado (simulando que a sessão foi iniciada no backend)
      ) {
    const durationToSend = selectedDurationMinutes.value;
    console.log(`[CLIENT - WATCHER] Preparando para emitir CLIENT_START_SIMULATION (ambos prontos). Duração selecionada:`, durationToSend, 'Tipo:', typeof durationToSend);
    socket.value.emit('CLIENT_START_SIMULATION', {
      sessionId: sessionId.value,
      durationMinutes: durationToSend // Usando a variável durationToSend
    });
  } else if (newValue && userRole.value === 'candidate' && !simulationStarted.value) {
    console.log("CANDIDATO: Ambos prontos, aguardando início...");
  }
});
// --- Hooks Ciclo de Vida ---
onMounted(() => { console.log("SimulationView Montado. Configurando sessão inicial..."); setupSession(); });
watch(() => route.fullPath, (newPath, oldPath) => { if (newPath !== oldPath && route.name === 'SimulationView') { console.log("MUDANÇA DE ROTA (SimulationView fullPath):", newPath, "Reconfigurando sessão..."); setupSession(); }});
onUnmounted(() => { if (socket.value) { console.log("Componente SimulationView DESMONTADO. Desconectando socket."); socket.value.disconnect(); socket.value = null; } });
function toggleActorImpressoVisibility(impressoId) {
  actorVisibleImpressoContent.value[impressoId] = !actorVisibleImpressoContent.value[impressoId];
  actorVisibleImpressoContent.value = {...actorVisibleImpressoContent.value};
}

function updateTimerDisplayFromSelection() {
  if (selectedDurationMinutes.value) {
    const newTimeInSeconds = parseInt(selectedDurationMinutes.value) * 60;
    if (!simulationStarted.value && !inviteLinkToShow.value) {
        if (simulationTimeSeconds.value !== newTimeInSeconds) {
          simulationTimeSeconds.value = newTimeInSeconds;
          timerDisplay.value = formatTime(simulationTimeSeconds.value);
          console.log(`Duração da estação alterada para: ${selectedDurationMinutes.value} minutos via dropdown.`);
        }
    } else if (simulationStarted.value) {
        console.warn("Não é possível alterar a duração após o início da simulação.");
    } else if (inviteLinkToShow.value) {
      // Se o link já foi gerado, a duração está "travada" com a duração do link.
      // Resetar o dropdown para o valor correto caso o usuário mude e tente iniciar de novo.
      // O `selectedDurationMinutes` deve ser o que foi usado para gerar o link (que é o que está no timerDisplay)
      const currentDurationInMinutes = Math.round(simulationTimeSeconds.value / 60);
      const validOptions = [5,6,7,8,9,10];
      if (selectedDurationMinutes.value !== currentDurationInMinutes && validOptions.includes(currentDurationInMinutes) ) {
          selectedDurationMinutes.value = currentDurationInMinutes;
      }
      console.warn("Duração travada após geração do link. Use o valor previamente selecionado.");
    }
  }
}

function generateInviteLinkWithDuration() {
  if (isLoading.value) {
    errorMessage.value = "Aguarde o carregamento dos dados da estação.";
    return;
  }
  if (!stationData.value) {
    errorMessage.value = "Dados da estação ainda não carregados. Tente novamente em instantes.";
    return;
  }

  if ((userRole.value === 'actor' || userRole.value === 'evaluator') && stationId.value && sessionId.value) {
    const partnerRoleToInvite = userRole.value === 'actor' ?
    'candidate' : (userRole.value === 'evaluator' ? 'actor' : null);
    if (partnerRoleToInvite) {
      try {
        const inviteQuery = {
          session: sessionId.value,
          role: partnerRoleToInvite,
          duration: selectedDurationMinutes.value // Inclui a duração selecionada no link
        };
        console.log("Gerando link com query:", inviteQuery);
        const inviteRoute = router.resolve({
          name: 'SimulationView',
          params: { id: stationId.value },
          query: inviteQuery
        });
        inviteLinkToShow.value = window.location.origin + inviteRoute.href;
        console.log(`Link de convite gerado para ${partnerRoleToInvite} com duração ${selectedDurationMinutes.value} min: ${inviteLinkToShow.value}`);
      } catch (e) {
        console.error("Erro ao gerar link de convite com duração:", e);
        errorMessage.value = "Erro ao gerar link de convite.";
      }
    }
  } else {
    console.warn("Não foi possível gerar o link: dados insuficientes ou papel inadequado.");
    errorMessage.value = "Não foi possível gerar o link de convite neste momento.";
  }
}

// --- Funções de Interação ---
function releaseData(dataItemId) {
  // Lógica no frontend para verificar se o item já foi liberado, ou se a simulação terminou/começou
  // A validação final de estado (ativa/encerrada) é feita no backend
  if (!socket.value?.connected) { alert("Erro: Não conectado.");
    return; }
  if (userRole.value !== 'actor') { alert("Apenas o ator pode liberar dados."); return; }
  if (!sessionId.value) return;
  // A validação de `simulationStarted` ou `simulationEnded` será feita no backend.
  // No frontend, apenas verificamos se já foi liberado para evitar spam de botão.
  if (!!actorReleasedImpressoIds.value[dataItemId]) {
    console.log(`ATOR: ${dataItemId} já foi liberado.`);
    return;
  }

  console.log(`ATOR: Tentando liberar ${dataItemId}`);
  socket.value.emit('ACTOR_RELEASE_DATA', { sessionId: sessionId.value, dataItemId });
  actorReleasedImpressoIds.value = {...actorReleasedImpressoIds.value, [dataItemId]: true}; // Atualiza localmente
  console.log("actorReleasedImpressoIds atualizado:", actorReleasedImpressoIds.value);
}

async function copyInviteLink() { if(!inviteLinkToShow.value) return; try {await navigator.clipboard.writeText(inviteLinkToShow.value); copySuccess.value=true; setTimeout(()=>copySuccess.value=false,2000);
  } catch(e){alert('Falha ao copiar.')} }
function sendReady() { if (socket.value?.connected && sessionId.value && !myReadyState.value) { console.log(`SOCKET: (${userRole.value}) Enviando CLIENT_IM_READY...`);
  socket.value.emit('CLIENT_IM_READY', { sessionId: sessionId.value }); myReadyState.value = true; } else { let rsn=""; if(myReadyState.value) rsn="Já pronto."; else if(!socket.value?.connected) rsn="Não conectado.";
  else rsn="Erro."; alert(rsn); } }

// MODIFICAÇÃO 2: Nova função para lidar com o clique do botão "Iniciar Simulação"
function handleStartSimulationClick() {
  if (socket.value?.connected && sessionId.value && (userRole.value === 'actor' || userRole.value === 'evaluator') && bothParticipantsReady.value && !simulationStarted.value) {
    const durationToSend = selectedDurationMinutes.value;
    console.log('[CLIENT - BUTTON CLICK] Preparando para emitir CLIENT_START_SIMULATION. Duração selecionada:', durationToSend, 'Tipo:', typeof durationToSend);
    socket.value.emit('CLIENT_START_SIMULATION', {
      sessionId: sessionId.value,
      durationMinutes: durationToSend
    });
  } else {
    console.error("[CLIENT - BUTTON CLICK] Não foi possível emitir CLIENT_START_SIMULATION. Condições não atendidas:", {
      connected: socket.value?.connected,
      sessionId: sessionId.value,
      userRole: userRole.value,
      bothReady: bothParticipantsReady.value,
      simStarted: simulationStarted.value
    });
    alert("Não é possível iniciar a simulação neste momento. Verifique se todos estão prontos e a conexão está ativa.");
  }
}

function submitEvaluation() {
  if (userRole.value !== 'actor' && userRole.value !== 'evaluator') { alert("Apenas o Ator/Avaliador pode submeter avaliação."); return;
  }
  if (!socket.value?.connected || !sessionId.value) { alert("Não conectado a uma sessão válida."); return;
  }
  if (Object.keys(evaluationScores.value).length === 0) { alert("Nenhuma pontuação foi registrada."); return;
  }

  // A validação para submissão de avaliação baseada na razão do término
  // permanece aqui no frontend, conforme seu requisito.
  if (simulationWasManuallyEndedEarly.value) {
    alert("A avaliação não pode ser submetida pois a estação foi encerrada manualmente antes do tempo pelo ator/avaliador.");
    return;
  }

  console.log(`ATOR/AVALIADOR: Submetendo:`, evaluationScores.value, "Total:", totalScore.value.toFixed(2));
  socket.value.emit('EVALUATOR_SUBMIT_EVALUATION', { sessionId: sessionId.value, stationId: stationId.value, evaluatorId: currentUser.value?.uid, scores: evaluationScores.value, totalScore: totalScore.value });
  // Se o PEP já foi liberado, re-envia os scores atualizados para o candidato.
  // Isso garante que se houver uma avaliação inicial e o PEP for liberado depois, os scores sejam enviados.
  // Ou se o avaliador submeter a avaliação depois de liberar o PEP.
  if (pepReleasedToCandidate.value && socket.value?.connected) {
      console.log('ATOR/AVALIADOR: Re-enviando scores para candidato após submissão final:', evaluationScores.value);
      socket.value.emit('EVALUATOR_SCORES_UPDATED_FOR_CANDIDATE', {
          sessionId: sessionId.value,
          scores: evaluationScores.value,
          totalScore: totalScore.value
      });
  }
}

function releasePepToCandidate() {
  if (!socket.value?.connected || !sessionId.value) { alert("Erro: Não conectado."); return;
  }
  if (!simulationEnded.value) { alert("O PEP só pode ser liberado para o candidato ao final da simulação."); return;
  }
  if (pepReleasedToCandidate.value) { console.log("PEP já foi liberado anteriormente."); return;
  }
  if(userRole.value !== 'actor' && userRole.value !== 'evaluator') {alert("Não autorizado.");
  return;}

  // NENHUMA VERIFICAÇÃO DE `simulationWasManuallyEndedEarly` AQUI NO FRONTEND.
  // O PEP será liberado se a simulação terminou, por qualquer razão.
  // O backend já permite isso.
  const payload = { sessionId: sessionId.value };
  console.log(`SOCKET: (${userRole.value}) Emitindo ACTOR_RELEASE_PEP:`, payload);
  socket.value.emit('ACTOR_RELEASE_PEP', payload);
  pepReleasedToCandidate.value = true;
  // Marca localmente como liberado

  // Envia os scores iniciais ao liberar o PEP (se já houver algum)
  if (socket.value?.connected) {
      console.log('ATOR/AVALIADOR: Enviando scores iniciais ao liberar PEP:', evaluationScores.value);
      socket.value.emit('EVALUATOR_SCORES_UPDATED_FOR_CANDIDATE', {
        sessionId: sessionId.value,
        scores: evaluationScores.value,
        totalScore: totalScore.value
      });
  }
}
function manuallyEndSimulation() {
    if (!simulationStarted.value || simulationEnded.value) { return;
    }
    if (!socket.value?.connected || !sessionId.value) { alert("Erro: Não conectado para encerrar."); return;
    }
    if (userRole.value !== 'actor' && userRole.value !== 'evaluator') { alert("Não autorizado."); return;
    }
    console.log(`SOCKET: (${userRole.value}) Emitindo CLIENT_MANUAL_END_SIMULATION para ${sessionId.value}`);
    socket.value.emit('CLIENT_MANUAL_END_SIMULATION', { sessionId: sessionId.value });
}

watch(evaluationScores, (newScores) => {
  if (socket.value?.connected &&
      (userRole.value === 'actor' || userRole.value === 'evaluator') &&
      pepReleasedToCandidate.value) { // Só envia se o PEP já foi explicitamente liberado
    console.log('ATOR/AVALIADOR: Enviando atualização de scores para candidato:', newScores);
    socket.value.emit('EVALUATOR_SCORES_UPDATED_FOR_CANDIDATE', {
      sessionId: sessionId.value,
      scores: newScores,
      totalScore: totalScore.value
    });
  }
}, { deep: true });
</script>

<template>
  <div class="simulation-view">
    <div v-if="isLoading" class="feedback loading">Carregando dados da estação e configurando simulação...</div>
    <div v-else-if="errorMessage && !stationData && !isLoading" class="feedback error">{{ errorMessage }}</div>
    <div v-else-if="errorMessage && !simulationStarted && !stationData" class="feedback error">{{ errorMessage }}</div>
    <div v-else-if="!stationData && !isLoading" class="feedback error">
      Falha ao carregar os dados da estação. Verifique o ID e tente novamente.
    </div>

    <div v-else-if="stationData && sessionId" class="simulation-content">
      <div class="simulation-header">
        <div class="simulation-header">
    <h2>Simulação:
        <template v-if="userRole === 'candidate'">
            {{ stationData.especialidade || 'Especialidade Não Definida' }}
        </template>
        <template v-else>
            {{ stationData.tituloEstacao || 'Carregando título...' }}
        </template>
    </h2>
    </div>
        <div class="timer-section">
            <div class="timer-display" :class="{ 'ended': simulationEnded }">
              Tempo: {{ timerDisplay }}
            </div>
            <div v-if="(userRole === 'actor' || userRole === 'evaluator') && !simulationStarted && !simulationEnded" class="duration-selector">
                <label for="duration-select" style="margin-right: 5px; font-weight: 500; font-size: 0.9em;">Duração:</label>
              <select id="duration-select" v-model="selectedDurationMinutes" @change="updateTimerDisplayFromSelection"
                      :disabled="!!inviteLinkToShow"
                      style="padding: 5px; border-radius: 4px; border: 1px solid #ccc;">
                <option value="5">5 min</option>
                <option value="6">6 min</option>
                <option value="7">7 min</option>
                <option value="8">8 min</option>
                <option value="9">9 min</option>
                <option value="10">10 min</option>
              </select>
            </div>
            <button
              v-if="(userRole === 'actor' || userRole === 'evaluator') && simulationStarted && !simulationEnded"
              @click="manuallyEndSimulation"
              class="end-simulation-button">
              Encerrar Estação
            </button>
        </div>
      </div>
      <p>
        <strong>Seu Papel:</strong> <span class="user-role">{{ userRole }}</span> |
        <strong>Sessão ID:</strong> <span class="session-id">{{ sessionId.substring(0,8) }}...</span> |
        <strong>Status Conexão:</strong> <span :class="`connection-status ${connectionStatus.toLowerCase().replace(/[^a-z0-9]/g, '-')}`">{{ connectionStatus }}</span>
      </p>
      <p v-if="connectionStatus === 'Conectado' && partner">
        <strong>Parceiro Conectado:</strong> {{ partner.role }} (ID: {{ partner.userId ? partner.userId.substring(0,8) : '...' }}... <span :class="partnerReadyState ? 'ready' : 'not-ready'">{{ partnerReadyState ? '[Pronto]' : '[Aguardando]' }}</span>)
      </p>
      <p v-if="connectionStatus === 'Conectado' && !partner && (userRole === 'actor' || userRole === 'evaluator') && inviteLinkToShow">
        Aguardando parceiro conectar... Use o link de convite abaixo.
      </p>
       <p v-if="connectionStatus === 'Conectado' && !partner && (userRole === 'actor' || userRole === 'evaluator') && !inviteLinkToShow">
        Aguardando parceiro conectar... (Clique em "Iniciar Sessão & Gerar Link" primeiro)
      </p>
       <p v-if="connectionStatus === 'Conectado' && !partner && userRole === 'candidate'">
        Aguardando parceiro (ator/avaliador) conectar...
      </p>

      <div v-if="inviteLinkToShow && (userRole === 'actor' || userRole === 'evaluator')" class="invite-link-display info-box">
        <h4>Link de Convite (para {{ userRole === 'actor' ? 'Candidato' : (userRole === 'evaluator' ? 'Ator' : 'Parceiro') }} - Duração: {{selectedDurationMinutes}} min):</h4>
        <div class="generated-link-text">{{ inviteLinkToShow }}</div>
        <button @click="copyInviteLink" :disabled="copySuccess">{{ copySuccess ? 'Copiado!' : 'Copiar Link' }}</button>
      </div>

      <div v-if="connectionStatus === 'Conectado' && !simulationStarted && !simulationEnded" class="ready-check info-box">
        <h4>Prontidão para Iniciar</h4>
        <button v-if="(userRole === 'actor' || userRole === 'evaluator') && !inviteLinkToShow && !simulationStarted && !simulationEnded"
                @click="generateInviteLinkWithDuration"
                class="initiate-session-button">
          Iniciar Sessão & Gerar Link
        </button>

        <div v-if="inviteLinkToShow || userRole === 'candidate'">
            <div class="ready-status"><span>Você:</span><strong :class="myReadyState ? 'ready' : 'not-ready'">{{ myReadyState ? 'Pronto!' : 'Aguardando' }}</strong></div>
            <div class="ready-status"><span>Parceiro ({{ partner?.role || 'N/A' }}):</span><strong v-if="partner" :class="partnerReadyState ? 'ready' : 'not-ready'">{{ partnerReadyState ? 'Pronto!' : 'Aguardando' }}</strong><em v-else>Offline / Não conectado</em></div>
            <button v-if="!myReadyState" @click="sendReady" class="ready-button">Estou Pronto!</button>
            <p v-if="myReadyState && partner && !partnerReadyState">Aguardando o parceiro ({{partner.role}}) ficar pronto.</p>
            <p v-if="myReadyState && !partner && (userRole === 'actor' || userRole === 'evaluator') && inviteLinkToShow">Aguardando conexão do parceiro ({{ userRole === 'actor' ? 'Candidato' : 'Ator' }}).</p>
            <p v-if="bothParticipantsReady">Ambos prontos! {{ userRole === 'candidate' ? 'Aguardando início pelo ator/avaliador.' : 'Você pode iniciar a simulação.'
            }}</p>
            <button v-if="(userRole === 'actor' || userRole === 'evaluator') && bothParticipantsReady && !simulationStarted"
                    @click="handleStartSimulationClick"
                    class="start-simulation-button">
              Iniciar Simulação
            </button>
        </div>
        <p v-else-if="(userRole === 'actor' || userRole === 'evaluator') && !inviteLinkToShow">
            <em>Clique em "Iniciar Sessão & Gerar Link" para definir a duração e obter o link de convite.</em>
        </p>
      </div>
      <div v-if="simulationStarted && !simulationEnded" class="feedback success simulation-active-banner">Simulação em progresso!</div>
      <div v-if="simulationEnded && connectionStatus === 'Conectado'" class="feedback error simulation-ended-banner">Simulação encerrada.</div>
      <div v-if="errorMessage && stationData" class="feedback error" style="margin-top: 10px;">{{ errorMessage }}</div>
      <hr>

      <div class="role-specific-content">
        <div v-if="userRole === 'actor' || userRole === 'evaluator'" class="actor-evaluator-section">
          <h3>Visão do Ator/Avaliador</h3>

          <div v-if="stationData.instrucoesParticipante" class="info-box actor-instructions-display">
            <h4>Instruções Gerais / Cenário (Para Candidato)</h4>
            <p><strong>Nível de Atenção:</strong> {{ stationData.instrucoesParticipante.cenarioAtendimento?.nivelAtencao }}</p>
            <p><strong>Tipo de Atendimento:</strong> {{ stationData.instrucoesParticipante.cenarioAtendimento?.tipoAtendimento }}</p>
            <p v-if="stationData.instrucoesParticipante.cenarioAtendimento?.infraestruturaUnidade?.length > 0">
                <strong>Infraestrutura:</strong>
                {{ stationData.instrucoesParticipante.cenarioAtendimento.infraestruturaUnidade.join('; ') }}
            </p>
            <p><strong>Descrição do Caso:</strong> {{ stationData.instrucoesParticipante.descricaoCasoCompleta }}</p>
            <div v-if="stationData.instrucoesParticipante.tarefasPrincipais?.length > 0">
                <p><strong>Tarefas do Candidato:</strong></p>
                <ul>
                    <li v-for="(tarefa,i) in stationData.instrucoesParticipante.tarefasPrincipais" :key="'actor-task-'+i">{{tarefa}}</li>
                </ul>
            </div>
            <div v-if="stationData.instrucoesParticipante.avisosImportantes?.length > 0">
                <p><strong>Avisos Importantes (para Candidato):</strong></p>
                <ul>
                    <li v-for="(aviso,i) in stationData.instrucoesParticipante.avisosImportantes" :key="'actor-aviso-'+i">{{aviso}}</li>
                </ul>
            </div>
          </div>

          <div v-if="stationData?.materiaisDisponiveis?.informacoesVerbaisSimulado && stationData.materiaisDisponiveis.informacoesVerbaisSimulado.length > 0" class="info-box roteiro-ator-display">
            <h4>Roteiro / Informações a Fornecer (se perguntado pelo candidato)</h4>
            <ul>
              <li v-for="(info, idx) in stationData.materiaisDisponiveis.informacoesVerbaisSimulado" :key="'script-' + idx" class="roteiro-item">
                <p class="roteiro-contexto"><strong>{{ info.contextoOuPerguntaChave }}:</strong></p>
                <p class="roteiro-informacao">{{ info.informacao }}</p>
              </li>
            </ul>
          </div>
          <div v-else-if="stationData?.materiaisDisponiveis"><p class="info-box"><em>(Não há informações verbais específicas definidas para o ator.)</em></p></div>

          <div v-if="stationData?.materiaisDisponiveis?.impressos && stationData.materiaisDisponiveis.impressos.length > 0" class="info-box data-release-controls">
            <h4>Liberar "Impressos" para o Candidato:</h4>
            <p v-if="!simulationStarted && !simulationEnded && !inviteLinkToShow"><em>(Primeiro, inicie a sessão e gere o link de convite)</em></p>
            <p v-if="!simulationStarted && !simulationEnded && inviteLinkToShow"><em>(Aguardando início da simulação para liberar impressos)</em></p>

            <div v-for="impresso in stationData.materiaisDisponiveis.impressos" :key="impresso.idImpresso" class="impresso-control-item">
              <div class="impresso-buttons-container">
                <span class="lock-icon" :title="!!actorReleasedImpressoIds[impresso.idImpresso] ? 'Impresso Liberado' : 'Impresso Não Liberado'">
                  {{ !!actorReleasedImpressoIds[impresso.idImpresso] ? '🔓' : '🔒' }}
                </span>
                <button @click="releaseData(impresso.idImpresso)"
                        :disabled="!simulationStarted || !!actorReleasedImpressoIds[impresso.idImpresso]"
                        :class="{ 'released': !!actorReleasedImpressoIds[impresso.idImpresso], 'release-button': true }">
                  {{ !!actorReleasedImpressoIds[impresso.idImpresso] ? `Liberado: ${impresso.tituloImpresso} ✓` : `Liberar: ${impresso.tituloImpresso}` }}
                </button>
                <button @click="toggleActorImpressoVisibility(impresso.idImpresso)" class="view-content-button">
                  {{ actorVisibleImpressoContent[impresso.idImpresso] ? 'Ocultar' : 'Ver' }} Conteúdo
                </button>
              </div>

              <div v-if="actorVisibleImpressoContent[impresso.idImpresso]" class="impresso-content-preview actor-impresso-preview">
                <h5>Preview: {{ impresso.tituloImpresso }}</h5>
                <div v-if="impresso.tipoConteudo === 'texto_simples' && impresso.conteudo"
                     v-html="impresso.conteudo.texto"
                     class="impresso-texto-simples">
                </div>
                <div v-if="impresso.tipoConteudo === 'imagem_com_texto' && impresso.conteudo">
                  <p v-if="impresso.conteudo.textoDescritivo" v-html="impresso.conteudo.textoDescritivo"></p>
                  <img v-if="impresso.conteudo.caminhoImagem" :src="impresso.conteudo.caminhoImagem" :alt="impresso.tituloImpresso" class="impresso-imagem"/>
                  <p v-if="impresso.conteudo.legendaImagem"><em>{{ impresso.conteudo.legendaImagem }}</em></p>
                  <div v-if="impresso.conteudo.laudo" class="laudo-impresso"><pre>{{ impresso.conteudo.laudo }}</pre></div>
                </div>
                <div v-if="impresso.tipoConteudo === 'lista_chave_valor_secoes' && impresso.conteudo && impresso.conteudo.secoes">
                  <div v-for="(secao, idxS) in impresso.conteudo.secoes" :key="`actor-prev-sec-${impresso.idImpresso}-${idxS}`" class="impresso-secao">
                    <h6 v-if="secao.tituloSecao">{{ secao.tituloSecao }}</h6>
                    <ul v-if="secao.itens && secao.itens.length > 0" class="lista-chave-valor">
                      <li v-for="(itemSec, idxI) in secao.itens" :key="`actor-prev-item-${impresso.idImpresso}-${idxS}-${idxI}`">
                        <strong>{{ itemSec.chave }}:</strong> <span v-html="itemSec.valor"></span>
                      </li>
                    </ul>
                    <div v-if="secao.texto && Array.isArray(secao.texto) && secao.texto.length > 0">
                      <p v-for="(txt, idxT) in secao.texto" :key="`actor-prev-txt-${impresso.idImpresso}-${idxS}-${idxT}`" v-html="txt"></p>
                    </div>
                    <div v-else-if="secao.texto && typeof secao.texto === 'string'">
                      <p v-html="secao.texto"></p>
                    </div>
                  </div>
                </div>
                <div v-if="impresso.tipoConteudo === 'tabela_objetos' && impresso.conteudo && impresso.conteudo.cabecalhos && impresso.conteudo.linhas">
                  <table class="tabela-impressos">
                    <thead>
                      <tr><th v-for="cab in impresso.conteudo.cabecalhos" :key="`actor-prev-th-${cab.key}`">{{ cab.label }}</th></tr>
                    </thead>
                    <tbody>
                      <tr v-for="(linha, idxL) in impresso.conteudo.linhas" :key="`actor-prev-lin-${impresso.idImpresso}-${idxL}`">
                        <td v-for="cab in impresso.conteudo.cabecalhos" :key="`actor-prev-cel-${impresso.idImpresso}-${idxL}-${cab.key}`" v-html="linha[cab.key]"></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div v-if="impresso.tipoConteudo === 'imagem_descritiva' && impresso.conteudo">
                    <p v-if="impresso.conteudo.descricao" v-html="impresso.conteudo.descricao"></p>
                    <img v-if="impresso.conteudo.caminhoImagem" :src="impresso.conteudo.caminhoImagem" :alt="impresso.tituloImpresso" class="impresso-imagem"/>
                </div>
                <pre v-if="!['texto_simples', 'imagem_com_texto', 'lista_chave_valor_secoes', 'tabela_objetos', 'imagem_descritiva'].includes(impresso.tipoConteudo) || (impresso.tipoConteudo === 'texto_simples' && typeof impresso.conteudo !== 'object')">{{ typeof impresso.conteudo === 'object' ? JSON.stringify(impresso.conteudo, null, 2) : impresso.conteudo }}</pre>
              </div>
            </div>
          </div>

          <div v-if="checklistData" class="pep-section-for-actor-evaluator"> 
            <div v-if="checklistData.itensAvaliacao && checklistData.itensAvaliacao.length > 0" class="info-box checklist-section">
              <div class="pep-main-header-exact">
                  <h4 class="pep-main-header-item-exact">ITEM</h4>
                  <h4 class="pep-main-header-avaliacao-exact">AVALIAÇÃO</h4>
              </div>
              <ul>
                <li v-for="(item, index) in checklistData.itensAvaliacao" :key="item.idItem || `pep-item-${index}`" class="pep-item-layout-exact">
                  <div class="pep-item-content-column-exact">
                    <h5 class="pep-item-main-title-display">
                      <strong v-if="item.itemNumeroOficial">{{ item.itemNumeroOficial }}. </strong>
                      {{ item.descricaoItem ? item.descricaoItem.split(':')[0].trim() : 'Item sem descrição' }}
                    </h5>
                    <p class="pep-item-full-description" v-html="formatItemDescriptionForDisplay(item.descricaoItem, item.descricaoItem ? item.descricaoItem.split(':')[0].trim() : '')"></p>
                    
                    <div class="pep-criteria-texts-exact">
                        <div v-if="item.pontuacoes?.adequado?.criterio" class="pep-criterion-line-text"><strong>Adequado:</strong> {{ item.pontuacoes.adequado.criterio }}</div>
                        <div v-if="item.pontuacoes?.parcialmenteAdequado?.criterio" class="pep-criterion-line-text"><strong>Parcialmente adequado:</strong> {{ item.pontuacoes.parcialmenteAdequado.criterio }}</div>
                        <div v-if="item.pontuacoes?.inadequado?.criterio" class="pep-criterion-line-text"><strong>Inadequado:</strong> {{ item.pontuacoes.inadequado.criterio }}</div>
                    </div>
                  </div>

                  <div class="pep-item-scoring-inputs-column-exact">
                    <div class="scoring-radio-group-exact">
                        <div class="scoring-radio-line-exact" :style="{ visibility: item.pontuacoes?.adequado && item.pontuacoes.adequado.pontos != null ? 'visible' : 'hidden' }">
                            <template v-if="item.pontuacoes?.adequado && item.pontuacoes.adequado.pontos != null">
                                <input type="radio" :id="`eval_${item.idItem}_adeq_${index}`" :name="`eval_${item.idItem}`" :value="item.pontuacoes.adequado.pontos" v-model="evaluationScores[item.idItem]" :disabled="!simulationStarted">
                                <label :for="`eval_${item.idItem}_adeq_${index}`" class="scoring-point-label">{{ item.pontuacoes.adequado.pontos.toFixed(2) }}</label>
                            </template>
                        </div>
                        <div class="scoring-radio-line-exact" :style="{ visibility: item.pontuacoes?.parcialmenteAdequado && item.pontuacoes.parcialmenteAdequado.pontos != null ? 'visible' : 'hidden' }">
                            <template v-if="item.pontuacoes?.parcialmenteAdequado && item.pontuacoes.parcialmenteAdequado.pontos != null">
                                <input type="radio" :id="`eval_${item.idItem}_parc_${index}`" :name="`eval_${item.idItem}`" :value="item.pontuacoes.parcialmenteAdequado.pontos" v-model="evaluationScores[item.idItem]" :disabled="!simulationStarted">
                                <label :for="`eval_${item.idItem}_parc_${index}`" class="scoring-point-label">{{ item.pontuacoes.parcialmenteAdequado.pontos.toFixed(2) }}</label>
                            </template>
                        </div>
                        <div class="scoring-radio-line-exact" :style="{ visibility: item.pontuacoes?.inadequado && item.pontuacoes.inadequado.pontos != null ? 'visible' : 'hidden' }">
                            <template v-if="item.pontuacoes?.inadequado && item.pontuacoes.inadequado.pontos != null">
                                <input type="radio" :id="`eval_${item.idItem}_inad_${index}`" :name="`eval_${item.idItem}`" :value="item.pontuacoes.inadequado.pontos" v-model="evaluationScores[item.idItem]" :disabled="!simulationStarted">
                                <label :for="`eval_${item.idItem}_inad_${index}`" class="scoring-point-label">{{ item.pontuacoes.inadequado.pontos.toFixed(2) }}</label>
                            </template>
                        </div>
                    </div>
                  </div>
                </li>
              </ul>
              <div class="pep-total-score" v-if="Object.keys(evaluationScores).length > 0 && (userRole === 'actor' || userRole === 'evaluator')">
                <strong>Pontuação Total Calculada: {{ totalScore.toFixed(2) }}</strong>
              </div>
              <button @click="submitEvaluation"
                      :disabled="!simulationEnded || simulationWasManuallyEndedEarly"
                      class="submit-evaluation-button">
                Submeter Avaliação
              </button>
            </div>
            <div v-else-if="checklistData">
              <p class="info-box"><em>Checklist carregado, mas não contém 'itensAvaliacao' ou o array está vazio.</em></p>
            </div>
          </div>
           <div v-else-if="(userRole === 'actor' || userRole === 'evaluator')">
             <p class="info-box"><em>(Aguardando carregamento dos dados do checklist...)</em></p>
           </div>

          <div v-if="checklistData?.itensAvaliacao?.length > 0 && (userRole === 'actor' || userRole === 'evaluator')" class="info-box pep-release-controls">
            <h4>Checklist (PEP) para Candidato:</h4>
            <button @click="releasePepToCandidate"
                    :disabled="!simulationEnded || pepReleasedToCandidate" class="release-pep-button">
              <span v-if="pepReleasedToCandidate">PEP Liberado ✓</span>
              <span v-else>Liberar PEP para Candidato</span>
            </button>
            <p v-if="!simulationEnded"><em>(PEP poderá ser liberado ao final da simulação)</em></p>
            </div>
        </div>

        <div v-if="userRole === 'candidate' && simulationStarted" class="candidate-section">
          <h3>Visão do Candidato</h3>
          <div v-if="stationData.instrucoesParticipante" class="info-box candidate-instructions-display">
            <h4>Instruções da Estação</h4>
            <p><strong>Cenário:</strong> Nível de Atenção: {{ stationData.instrucoesParticipante.cenarioAtendimento?.nivelAtencao }}, Tipo: {{ stationData.instrucoesParticipante.cenarioAtendimento?.tipoAtendimento }}</p>
            <p v-if="stationData.instrucoesParticipante.cenarioAtendimento?.infraestruturaUnidade?.length > 0">
                <strong>Infraestrutura Disponível:</strong>
                {{ stationData.instrucoesParticipante.cenarioAtendimento.infraestruturaUnidade.join('; ') }}
            </p>
            <p><strong>Descrição do Caso:</strong> {{ stationData.instrucoesParticipante.descricaoCasoCompleta }}</p>
            <div v-if="stationData.instrucoesParticipante.tarefasPrincipais?.length > 0">
                <p><strong>Suas Tarefas:</strong></p>
                <ul>
                    <li v-for="(tarefa,i) in stationData.instrucoesParticipante.tarefasPrincipais" :key="'cand-task-'+i">{{tarefa}}</li>
                </ul>
            </div>
            <div v-if="stationData.instrucoesParticipante.avisosImportantes?.length > 0">
                <p><strong>Avisos Importantes:</strong></p>
                <ul>
                    <li v-for="(aviso,i) in stationData.instrucoesParticipante.avisosImportantes" :key="'cand-aviso-'+i">{{aviso}}</li>
                </ul>
            </div>
          </div>
          <div class="info-box received-data">
            <h4>Dados Recebidos do Ator ("Impressos")</h4>
            <div v-if="Object.keys(releasedData).length === 0"><em>(Nenhum "impresso" recebido ainda.)</em></div>
            <div v-else>
                <div v-for="impressoLiberado in releasedData" :key="'released-'+impressoLiberado.idImpresso" class="released-item">
                    <h5>{{ impressoLiberado.tituloImpresso }}</h5>
                    <div v-if="impressoLiberado.tipoConteudo === 'texto_simples' && impressoLiberado.conteudo"
                         v-html="impressoLiberado.conteudo.texto"
                         class="impresso-texto-simples">
                    </div>
                    <div v-if="impressoLiberado.tipoConteudo === 'imagem_com_texto' && impressoLiberado.conteudo">
                        <p v-if="impressoLiberado.conteudo.textoDescritivo" v-html="impressoLiberado.conteudo.textoDescritivo"></p>
                        <img v-if="impressoLiberado.conteudo.caminhoImagem" :src="impressoLiberado.conteudo.caminhoImagem" :alt="impressoLiberado.tituloImpresso" class="impresso-imagem"/>
                        <p v-if="impressoLiberado.conteudo.legendaImagem"><em>{{ impressoLiberado.conteudo.legendaImagem }}</em></p>
                        <div v-if="impressoLiberado.conteudo.laudo" class="laudo-impresso"><pre>{{ impressoLiberado.conteudo.laudo }}</pre></div>
                    </div>
                    <div v-if="impressoLiberado.tipoConteudo === 'lista_chave_valor_secoes' && impressoLiberado.conteudo && impressoLiberado.conteudo.secoes">
                        <div v-for="(secao, idxS) in impressoLiberado.conteudo.secoes" :key="`cand-sec-${impressoLiberado.idImpresso}-${idxS}`" class="impresso-secao">
                            <h6 v-if="secao.tituloSecao">{{ secao.tituloSecao }}</h6>
                            <ul v-if="secao.itens && secao.itens.length > 0" class="lista-chave-valor">
                                <li v-for="(itemSec, idxI) in secao.itens" :key="`cand-item-${impressoLiberado.idImpresso}-${idxS}-${idxI}`">
                                    <strong>{{ itemSec.chave }}:</strong> <span v-html="itemSec.valor"></span>
                                </li>
                            </ul>
                            <div v-if="secao.texto && Array.isArray(secao.texto) && secao.texto.length > 0">
                                <p v-for="(txt, idxT) in secao.texto" :key="`cand-txt-${impressoLiberado.idImpresso}-${idxS}-${idxT}`" v-html="txt"></p>
                            </div>
                            <div v-else-if="secao.texto && typeof secao.texto === 'string'">
                                <p v-html="secao.texto"></p>
                            </div>
                        </div>
                    </div>
                    <div v-if="impressoLiberado.tipoConteudo === 'tabela_objetos' && impressoLiberado.conteudo && impressoLiberado.conteudo.cabecalhos && impressoLiberado.conteudo.linhas">
                        <table class="tabela-impressos">
                            <thead>
                                <tr><th v-for="cab in impressoLiberado.conteudo.cabecalhos" :key="`cand-th-${cab.key}`">{{ cab.label }}</th></tr>
                            </thead>
                            <tbody>
                                <tr v-for="(linha, idxL) in impressoLiberado.conteudo.linhas" :key="`cand-lin-${impressoLiberado.idImpresso}-${idxL}`">
                                    <td v-for="cab in impressoLiberado.conteudo.cabecalhos" :key="`cand-cel-${impressoLiberado.idImpresso}-${idxL}-${cab.key}`" v-html="linha[cab.key]"></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                     <div v-if="impressoLiberado.tipoConteudo === 'imagem_descritiva' && impressoLiberado.conteudo">
                        <p v-if="impressoLiberado.conteudo.descricao" v-html="impressoLiberado.conteudo.descricao"></p>
                        <img v-if="impressoLiberado.conteudo.caminhoImagem" :src="impressoLiberado.conteudo.caminhoImagem" :alt="impressoLiberado.tituloImpresso" class="impresso-imagem"/>
                    </div>
                    <pre v-if="!['texto_simples', 'imagem_com_texto', 'lista_chave_valor_secoes', 'tabela_objetos', 'imagem_descritiva'].includes(impressoLiberado.tipoConteudo) || (impressoLiberado.tipoConteudo === 'texto_simples' && typeof impressoLiberado.conteudo !== 'object')">{{ typeof impressoLiberado.conteudo === 'object' ? JSON.stringify(impressoLiberado.conteudo, null, 2) : impressoLiberado.conteudo }}</pre>
                </div>
            </div>
          </div>

          <div v-if="isChecklistVisibleForCandidate && checklistData?.itensAvaliacao?.length > 0" class="info-box checklist-section candidate-pep-view">
            <h4>Checklist (PEP) Liberado para Consulta</h4>
            <ul>
                <li v-for="(item, index) in checklistData.itensAvaliacao" :key="'cand-chk-'+item.idItem" class="pep-item-candidate-view">
                  <h5 class="pep-item-main-title-display">
                    <strong v-if="item.itemNumeroOficial">{{ item.itemNumeroOficial }}. </strong>
                    {{ item.descricaoItem ? item.descricaoItem.split(':')[0].trim() : 'Item sem descrição' }}
                  </h5>
                  <p class="pep-item-full-description" v-html="formatItemDescriptionForDisplay(item.descricaoItem)"></p>

                  <div class="pep-item-possible-scores">
                    <p><strong>Critérios de Pontuação:</strong></p>
                    <ul class="criteria-list-candidate">
                      <li v-if="item.pontuacoes?.adequado && item.pontuacoes.adequado.pontos != null">
                        Adequado: {{ item.pontuacoes.adequado.criterio }} ({{ item.pontuacoes.adequado.pontos.toFixed(2) }} pts)
                      </li>
                      <li v-if="item.pontuacoes?.parcialmenteAdequado && item.pontuacoes.parcialmenteAdequado.pontos != null">
                        Parcialmente Adequado: {{ item.pontuacoes.parcialmenteAdequado.criterio }} ({{ item.pontuacoes.parcialmenteAdequado.pontos.toFixed(2) }} pts)
                      </li>
                      <li v-if="item.pontuacoes?.inadequado && item.pontuacoes.inadequado.pontos != null">
                        Inadequado: {{ item.pontuacoes.inadequado.criterio }} ({{ item.pontuacoes.inadequado.pontos.toFixed(2) }} pts)
                      </li>
                    </ul>
                  </div>

                  <div v-if="candidateReceivedScores[item.idItem] !== undefined" class="candidate-score-display">
                    <strong>Sua Pontuação neste Item:</strong>
                    <span :class="`score-${String(candidateReceivedScores[item.idItem]).replace('.', '_')}`">{{ parseFloat(candidateReceivedScores[item.idItem]).toFixed(2) }}</span>
                    pts
                  </div>
                  <div v-else class="candidate-score-display">
                    <strong>Sua Pontuação neste Item:</strong> <em>(Aguardando avaliação)</em>
                  </div>
                </li>
              </ul>
            <div v-if="Object.keys(candidateReceivedScores).length > 0 && checklistData.itensAvaliacao.some(it => candidateReceivedScores[it.idItem] !== undefined)" class="candidate-total-score-display pep-total-score">
              <strong>Sua Pontuação Total: {{ candidateReceivedTotalScore.toFixed(2) }}</strong>
            </div>
          </div>
           <div v-else-if="isChecklistVisibleForCandidate"><p class="info-box"><em>Checklist liberado, mas dados não disponíveis ou vazios.</em></p></div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Estilos Gerais da Página de Simulação */
.simulation-view { padding: 1rem; max-width: 900px; margin: auto; font-family: 'Inter', sans-serif; color: #333; }
.simulation-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;
flex-wrap: wrap; border-bottom: 1px solid #eee; padding-bottom: 0.5rem;}
.simulation-header h2 { margin: 0; font-size: 1.6em; color: #2c3e50;
font-weight: 600;}

.timer-section { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.timer-display { font-size: 1.5em; font-weight: bold; color: #1d3557;
background-color: #f1faee; padding: 8px 18px; border-radius: 6px; border: 1px solid #a8dadc; white-space: nowrap; box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}
.timer-display.ended { color: #e63946; border-color: #e63946; background-color: #fef2f2; }
.end-simulation-button { padding: 8px 15px; font-size: 0.9em; background-color: #e63946; color: white;
border: none; border-radius: 5px; cursor: pointer; font-weight: 500; }
.end-simulation-button:hover:not(:disabled) { background-color: #d0313e; }

.duration-selector { display: flex; align-items: center; gap: 5px;
margin-left: 10px; }
.duration-selector label { font-weight: 500; font-size: 0.9em; color: #4a5568; }
.duration-selector select { padding: 6px 8px; border-radius: 4px;
border: 1px solid #cbd5e0; background-color: white; font-size: 0.9em; }
.duration-selector select:disabled { background-color: #e9ecef; cursor: not-allowed;
}


.simulation-view > p { font-size: 0.95em; color: #457b9d; margin-bottom: 0.6rem;}
.user-role, .session-id { font-weight: 600; color: #1d3557; }
.connection-status { font-weight: 600;
padding: 2px 6px; border-radius: 4px; font-size: 0.85em;}
.connection-status.conectado { color: #2b9348; background-color: #e9f5e9;}
.connection-status.conectando { color: #fca311; background-color: #fff8e1;}
.connection-status.desconectado,
.connection-status.erro-de-conexao,
.connection-status.erro-de-conexão { color: #e63946;
background-color: #fdecec;}

.feedback { padding: 1rem; margin-top: 1rem; border-radius: 6px; font-weight: 500; text-align: center; border: 1px solid transparent;
line-height: 1.5;}
.feedback.error { background-color: #fef2f2; color: #c81e1e; border-color: #fecaca; }
.feedback.loading { background-color: #eff6ff; color: #1e40af; border-color: #bfdbfe;
}
.feedback.info { background-color: #eef6fc; color: #0c5460; border-color: #bee5eb; }
.feedback.success { background-color: #f0fdf4; color: #15803d; border-color: #bbf7d0; }
.simulation-active-banner { margin-bottom: 1rem;
background-color: #e6fffa; border-color: #90f3e0; color: #0d9488;}
.simulation-ended-banner { margin-top: 1rem; }

.info-box { margin-bottom: 1.5rem; padding: 1.25rem; border: 1px solid #e0e0e0;
border-radius: 8px; background-color: #ffffff; box-shadow: 0 1px 3px rgba(0,0,0,0.03);}
.info-box h3, .info-box h4, .info-box h5, .info-box h6 { margin-top: 0;
margin-bottom: 0.8rem; color: #1d3557; border-bottom: 1px solid #e9ecef; padding-bottom: 0.5rem; font-weight: 600; }
.info-box h4 { font-size: 1.2em;
}

.info-box.actor-instructions-display,
.info-box.candidate-instructions-display,
.info-box.roteiro-ator-display { text-align: left; }
.info-box.actor-instructions-display p,
.info-box.candidate-instructions-display p,
.info-box.roteiro-ator-display p,
.info-box.actor-instructions-display div > p,
.info-box.candidate-instructions-display div > p,
.info-box.roteiro-ator-display div > p,
.info-box.actor-instructions-display ul,
.info-box.candidate-instructions-display ul,
.info-box.roteiro-ator-display ul,
.info-box.actor-instructions-display li,
.info-box.candidate-instructions-display li,
.info-box.roteiro-ator-display li { text-align: left !important;
}
.info-box.actor-instructions-display ul,
.info-box.candidate-instructions-display ul { list-style-type: disc; padding-left: 20px; margin-left: 0; }
.info-box.roteiro-ator-display ul { list-style-type: none; padding-left: 0;
}
.info-box.roteiro-ator-display .roteiro-item { margin-bottom: 12px; padding-left: 5px; }
.info-box.roteiro-ator-display .roteiro-contexto { font-weight: bold; margin-bottom: 4px; color: #1d3557; line-height: 1.5;
}
.info-box.roteiro-ator-display .roteiro-informacao { margin-left: 15px; color: #495057; line-height: 1.5; white-space: pre-line; }

.info-box ul { padding-left: 0; list-style-type: none;
}
.info-box li { margin-bottom: 0.5rem; line-height: 1.6; color: #495057; }
.info-box p { margin-bottom: 0.5rem; line-height: 1.6;
color: #495057;}

.invite-link-display { background-color: #e9f7fd; border-left: 4px solid #0ea5e9; }
.invite-link-display .generated-link-text { padding: 10px; font-size: 0.95em; border: 1px solid #a5d8f3;
border-radius: 4px; background-color: #f8fcff; word-break: break-all; margin-bottom: 10px; display: block; }
.invite-link-display button { padding: 8px 15px; background-color: #0ea5e9; color: white;
border: none; border-radius: 4px; cursor: pointer; font-size: 0.9em; font-weight: 500;}
.invite-link-display button:hover:not(:disabled) { background-color: #0b8ac9; }
.invite-link-display button:disabled { background-color: #a0aec0;
}

.ready-check { border-left: 4px solid #805ad5; background-color: #faf5ff; }
.ready-check .ready-status { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.6rem;
padding: 0.4rem 0;}
.ready-check .ready-status span { font-weight: 500; flex-basis: 130px; color: #4a5568; }
.ready-check .ready-status strong { flex-grow: 1; text-align: left;
font-size: 1.05em;}
.ready-check .ready-status strong.ready { color: #38a169; }
.ready-check .ready-status strong.not-ready { color: #e53e3e; }
.ready-check .ready-status em { color: #718096;
font-style: normal; }

.initiate-session-button {
  background-color: #5cb85c;
  color: white;
  border: none;
  border-radius: 6px;
  padding: 12px 20px;
  margin-bottom: 1rem;
  display: block;
width: fit-content;
  margin-left: 0;
  margin-right: auto;
  font-weight: 600;
  font-size: 1em;
  cursor: pointer;
  transition: background-color 0.2s, box-shadow 0.2s;
box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}
.initiate-session-button:hover:not(:disabled) {
  background-color: #4cae4c;
  box-shadow: 0 3px 6px rgba(0,0,0,0.15);
}


.ready-button, .start-simulation-button, .submit-evaluation-button, .release-pep-button {
  font-weight: 600; padding: 10px 18px; border: none; border-radius: 6px; cursor: pointer;
  display: inline-block;
margin: 1rem 0.5rem 0 0; font-size: 1em; transition: background-color 0.2s, box-shadow 0.2s;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}
.ready-button { background-color: #4299e1; color: white; }
.ready-button:hover:not(:disabled) { background-color: #3182ce; box-shadow: 0 3px 6px rgba(0,0,0,0.15); }
.start-simulation-button { background-color: #48bb78;
color: white; }
.start-simulation-button:hover:not(:disabled) { background-color: #38a169; box-shadow: 0 3px 6px rgba(0,0,0,0.15); }
.submit-evaluation-button { background-color: #007bff; color: white; margin-top: 1.5rem;
display: block; width: fit-content; }
.release-pep-button { background-color: #ecc94b; color: #2d3748; }
.release-pep-button:hover:not(:disabled) { background-color: #d69e2e; box-shadow: 0 3px 6px rgba(0,0,0,0.15);
}

.role-specific-content { margin-top: 1.5rem; }
.candidate-section { border-left: 4px solid #4299e1; background-color: #ebf8ff; padding: 1rem;
border-radius: 0 8px 8px 0;}
.actor-evaluator-section { border-left: 4px solid #38b2ac; background-color: #e6fffa; padding: 1rem;
border-radius: 0 8px 8px 0;}

.received-data { min-height: 50px; background-color: #fff; border: 1px dashed #cbd5e0; padding: 1rem;
border-radius: 6px;}
.released-item { margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 1px dotted #e2e8f0; }
.released-item:last-child { border-bottom: none; margin-bottom: 0;
}
.released-item h5 { margin-top:0; margin-bottom: 0.6rem; color: #2c5282; font-size: 1.15em;}
.impresso-texto-simples { white-space: pre-line; text-align: left; }
.impresso-imagem { max-width: 100%;
height: auto; border: 1px solid #cbd5e0; border-radius: 4px; margin-top: 0.5rem; margin-bottom: 0.5rem; }
.laudo-impresso pre { white-space: pre-wrap; word-wrap: break-word;
background-color: #f7fafc; padding: 0.8rem; border-radius: 4px; font-size: 0.9em; color: #2d3748; border: 1px solid #e2e8f0; text-align: left; }
.impresso-secao { margin-bottom: 0.8rem;
text-align: left; }
.impresso-secao h6 { font-size: 1.05em; color: #2d3748; margin-bottom: 0.4rem; font-weight: 600; text-align: left; }
.impresso-secao ul.lista-chave-valor { padding-left: 0;
list-style-type: none; text-align: left;}
.impresso-secao ul.lista-chave-valor li { margin-bottom: 0.3rem; text-align: left;}
.impresso-secao ul.lista-chave-valor li strong { color: #1a202c;
}

.tabela-impressos { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 0.9em; text-align: left;}
.tabela-impressos th, .tabela-impressos td { border: 1px solid #d2d6dc;
padding: 8px; text-align: left; }
.tabela-impressos th { background-color: #e9ecef; font-weight: 600; color: #495057;}

.impresso-control-item { margin-bottom: 1rem; padding-bottom: 1rem;
border-bottom: 1px dashed #ccc; }
.impresso-control-item:last-child { border-bottom: none; margin-bottom: 0; }
.impresso-buttons-container { display: flex; align-items: center; gap: 10px; margin-bottom: 0.5rem;
flex-wrap: wrap; }
.data-release-controls button.release-button { flex-grow: 1; }
.data-release-controls button.view-content-button { background-color: #6c757d; color: white; padding: 8px 14px; border-radius: 5px;
cursor: pointer; font-weight: 500; border: none; transition: background-color 0.2s; }
.data-release-controls button.view-content-button:hover:not(:disabled) { background-color: #5a6268; }
.actor-impresso-preview { margin-top: 0.75rem; padding: 0.75rem;
border: 1px solid #e0e0e0; border-radius: 4px; background-color: #f9f9f9; }
.actor-impresso-preview h5 { margin-top: 0; font-size: 1.1em; color: #1d3557;
}
.lock-icon { margin-right: 8px; font-size: 1.2em; vertical-align: middle; color: #4a5568; }
.data-release-controls button { margin-right: 0; margin-bottom: 0; background-color: #48bb78; color:white;
border:none; padding: 8px 14px; border-radius: 5px; cursor: pointer; transition: background-color 0.2s; font-weight: 500; }
.data-release-controls button:hover:not(:disabled) { background-color: #38a169;
}
.data-release-controls button.released { background-color: #a0aec0; border: 1px solid #718096; color: #1a202c; cursor: default;}

.checklist-section ul { padding-left: 0;
list-style-type: none;}
button:disabled { background-color: #a0aec0 !important; cursor: not-allowed !important; opacity: 0.6; }
input[type="radio"]:disabled { cursor: not-allowed;
opacity: 0.5;}
input[type="radio"]:disabled + label.scoring-point-label { cursor: not-allowed; opacity: 0.5;}

.pep-main-header-exact { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #4a5568;
padding-bottom: 0.7em; margin-bottom: 1em; font-size: 0.95em; }
.pep-main-header-item-exact { flex-grow: 1; font-weight: 700; color: #2d3748; text-transform: uppercase; text-align: left;
}
.pep-main-header-avaliacao-exact { flex-basis: 120px; text-align: center; font-weight: 700; color: #2d3748; text-transform: uppercase; }
.pep-item-layout-exact { display: flex; justify-content: space-between; align-items: flex-start;
padding: 1.2em 0; border-bottom: 1px solid #e2e8f0; }
.pep-item-layout-exact:last-child { border-bottom: none; }
.pep-item-content-column-exact { flex-grow: 1; padding-right: 1.5em; text-align: left;
}
.pep-item-main-title-display { font-weight: bold; text-align: left; font-size: 1.15em; color: #1a202c; margin-top: 0; margin-bottom: 0.8em; }
.pep-item-main-title-display strong { margin-right: 0.3em;
}
/* NOVO ESTILO: Para a descrição completa do item PEP */
.pep-item-full-description {
    text-align: left;
    color: #4a5568;
    line-height: 1.6;
    margin-top: 0.5em;
    margin-bottom: 1em;
    padding-left: 5px; /* Para alinhar com o texto da descrição do item */
}
/* REMOVIDO: estilos para pep-subitems-list-display, pep-subitem-entry, pep-subitem-number, pep-item-single-description */

.pep-criteria-texts-exact { margin-top: 1em; font-size: 0.9em; text-align: left; }
.pep-criteria-texts-exact .pep-criterion-line-text { margin-bottom: 0.6em;
line-height: 1.5; display: flex; align-items: flex-start; color: #4a5568; }
.pep-criteria-texts-exact .pep-criterion-line-text strong { font-weight: 600; color: #2d3748; margin-right: 0.4em; white-space: nowrap;
}
.pep-item-scoring-inputs-column-exact { flex-basis: 100px; display: flex; flex-direction: column; align-items: center; padding-top: 0.1em; justify-content: flex-start; }
.scoring-radio-group-exact { width: 100%; display: flex;
flex-direction: column; }
.scoring-radio-line-exact { display: flex; align-items: center; justify-content: flex-end; width: 100%; margin-bottom: 1.1em; min-height: 1.5em; }
.scoring-radio-line-exact:last-child { margin-bottom: 0;
}
.scoring-radio-line-exact input[type="radio"] { margin-right: 0.5em; transform: scale(1.15); cursor: pointer; }
.scoring-radio-line-exact label.scoring-point-label { font-size: 1em; font-weight: 600; color: #1a202c; min-width: 40px;
text-align: center; cursor: pointer; }
.pep-total-score { margin-top: 1.5em; padding-top: 1em; border-top: 1px solid #cbd5e0; text-align: right; font-size: 1.1em; font-weight: bold;
color: #1d3557; }

.pep-item-candidate-view { padding: 10px 0; margin-bottom: 15px; border-bottom: 1px solid #eee; }
.pep-item-candidate-view:last-child { border-bottom: none;
}
.pep-item-possible-scores { margin-top: 0.8rem; font-size: 0.85em; background-color: #f8f9fa; padding: 8px; border-radius: 4px; border: 1px solid #e9ecef;
}
.pep-item-possible-scores p strong { color: #343a40; font-weight: 600; }
.pep-item-possible-scores ul.criteria-list-candidate { list-style-type: none; padding-left: 10px; margin-top: 5px;
}
.pep-item-possible-scores ul.criteria-list-candidate li { margin-bottom: 3px; color: #495057; }

.candidate-score-display { margin-top: 0.75rem; padding: 0.5rem; background-color: #e7f5ff; border: 1px solid #b3dfff;
border-radius: 4px; font-size: 0.95em; }
.candidate-score-display strong { color: #0056b3; }
.candidate-score-display span { font-weight: bold; padding: 0 0.25rem; color: #004085;
}
.candidate-total-score-display { margin-top: 1rem; padding-top: 1rem; }
.candidate-pep-view > ul { margin-bottom: 1.5rem; }

</style>