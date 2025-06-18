<script setup>
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
// Importe suas configurações do Firebase e funções do Firestore
import { db } from '../firebaseConfig.js';
// Ajuste este caminho se o seu firebaseConfig.js não estiver um nível acima
import { collection, getDocs, query, orderBy } from "firebase/firestore";
// IMPORTAR currentUser PARA VERIFICAR SE O USUÁRIO É ADMIN
import { currentUser } from '../authStore.js';
// Ajuste o caminho se o authStore não estiver um nível acima

// --- Refs ---
const stations = ref([]);
const isLoadingStations = ref(true);
const errorMessage = ref('');
const router = useRouter();
// --- Refs para controle do botão e link ---
const creatingSessionForStationId = ref(null);
const isLoadingSession = ref(false);
const generatedCandidateLink = ref('');
const errorApi = ref('');
const DEFAULT_STATION_DURATION_MINUTES_CLIENT = 10;
// Duração padrão no cliente

// --- Refs para controle dos botões sanfona ---
const showPreviousExamsSection = ref(false);
const show2024_2Stations = ref(false);

// Refs para REVALIDA FACIL e suas subpastas
const showRevalidaFacilStations = ref(false);
const showRevalidaFacilClinicaMedica = ref(false);
const showRevalidaFacilGO = ref(false);
const showRevalidaFacilCirurgia = ref(false);
const showRevalidaFacilPreventiva = ref(false);
const showRevalidaFacilPediatria = ref(false);


// --- Função para Buscar Estações ---
async function fetchStations() {
  isLoadingStations.value = true;
  errorMessage.value = '';
  stations.value = [];
  console.log("[DEBUG] Iniciando fetchStations...");  try {
    const stationsColRef = collection(db, 'estacoes_clinicas');
    // Sem orderBy para evitar problema de índice
    console.log("[DEBUG] Executando getDocs na coleção 'estacoes_clinicas' sem ordenação...");
    const querySnapshot = await getDocs(stationsColRef);

    const stationsList = [];
    querySnapshot.forEach((doc) => {
      stationsList.push({ id: doc.id, ...doc.data() });
    });
    
    // Ordenando manualmente no cliente
    stationsList.sort((a, b) => {
      const numA = a.numeroDaEstacao || 0;
      const numB = b.numeroDaEstacao || 0;
      return numA - numB;
    });
    
    stations.value = stationsList;
    console.log(`[DEBUG] Estações carregadas e ordenadas manualmente: ${stations.value.length}`);
    console.log("[DEBUG] Primeira estação:", stations.value[0]);    if (stations.value.length === 0) {
      errorMessage.value = "Nenhuma estação encontrada no Firestore na coleção 'estacoes_clinicas'.";
    }

  } catch (error) {
    console.error("[DEBUG] ERRO ao buscar lista de estações:", error);
    errorMessage.value = `Falha ao buscar estações: ${error.message}`;
    if (error.code === 'permission-denied') {
      errorMessage.value += " (Erro de permissão! Verifique as Regras de Segurança do Firestore)";
    } else if (error.code === 'failed-precondition' && error.message.toLowerCase().includes('index')) {
      errorMessage.value += ` (ÍNDICE DO FIRESTORE AUSENTE! A query 'orderBy("numeroDaEstacao")' requer um índice. Verifique o console do navegador ou do Firebase para o link de criação do índice na coleção 'revalidafacio' para o campo 'numeroDaEstacao'.)`;
      console.error("Firestore Index missing for 'numeroDaEstacao'. Please create it in the Firebase console. The error message usually provides a direct link.");
    }
  } finally {
    isLoadingStations.value = false;
    console.log("[DEBUG] fetchStations finalizado.");
  }
}

const stations2024_2 = computed(() => {
  return stations.value.filter(station => {
    const titulo = station.tituloEstacao?.toUpperCase() || '';
    // Filtra apenas estações com título "INEP 2024.2"
    return titulo.includes("INEP") && titulo.includes("2024.2");
  });
});

// Computed property base para todas as estações de Revalida Fácil
const stationsRevalidaFacil = computed(() => {
  return stations.value.filter(station => {
    const titulo = station.tituloEstacao?.toUpperCase() || '';
    // Filtra apenas estações com título "REVALIDA FACIL"
    return titulo.includes("REVALIDA FACIL") || titulo.includes("REVALIDAFACIL");
  });
});

// Computed properties para cada subpasta de Revalida Fácil
const stationsRevalidaFacilClinicaMedica = computed(() => {
  return stationsRevalidaFacil.value.filter(station => {
    const especialidade = station.especialidade?.toUpperCase() || '';
    const area = station.area?.toUpperCase() || '';
    return especialidade.includes("CLÍNICA MÉDICA") || 
           especialidade.includes("CLINICA MEDICA") ||
           area.includes("CLÍNICA MÉDICA") ||
           area.includes("CLINICA MEDICA");
  });
});

const stationsRevalidaFacilGO = computed(() => {
  return stationsRevalidaFacil.value.filter(station => {
    const especialidade = station.especialidade?.toUpperCase() || '';
    const area = station.area?.toUpperCase() || '';
    return especialidade.includes("GINECOLOGIA") || 
           especialidade.includes("OBSTETRÍCIA") ||
           especialidade.includes("OBSTETRICIA") ||
           area.includes("GINECOLOGIA") ||
           area.includes("OBSTETRÍCIA") ||
           area.includes("OBSTETRICIA") ||
           especialidade.includes("G.O");
  });
});

const stationsRevalidaFacilCirurgia = computed(() => {
  return stationsRevalidaFacil.value.filter(station => {
    const especialidade = station.especialidade?.toUpperCase() || '';
    const area = station.area?.toUpperCase() || '';
    return especialidade.includes("CIRURGIA") || area.includes("CIRURGIA");
  });
});

const stationsRevalidaFacilPreventiva = computed(() => {
  return stationsRevalidaFacil.value.filter(station => {
    const especialidade = station.especialidade?.toUpperCase() || '';
    const area = station.area?.toUpperCase() || '';
    return especialidade.includes("PREVENTIVA") || area.includes("PREVENTIVA");
  });
});

const stationsRevalidaFacilPediatria = computed(() => {
  return stationsRevalidaFacil.value.filter(station => {
    const especialidade = station.especialidade?.toUpperCase() || '';
    const area = station.area?.toUpperCase() || '';
    return especialidade.includes("PEDIATRIA") || area.includes("PEDIATRIA");
  });
});


async function startSimulationAsActor(stationId, checklistIdFromStation) {
  if (!stationId || !checklistIdFromStation) {
    errorApi.value = "Erro interno: ID da estação ou ID do checklist associado está inválido ou ausente na estação.";
    console.error(errorApi.value, { stationId, checklistId: checklistIdFromStation });
    return;
  }
  isLoadingSession.value = true;
  creatingSessionForStationId.value = stationId;
  errorApi.value = '';
  generatedCandidateLink.value = '';
  console.log(`ATOR: Iniciando simulação para estação ${stationId} (Checklist ID: ${checklistIdFromStation})`);

  const currentStation = stations.value.find(s => s.id === stationId);
  const stationDuration = currentStation?.tempoDuracaoMinutos || DEFAULT_STATION_DURATION_MINUTES_CLIENT;
  console.log(`ATOR: Duração para a estação ${stationId}: ${stationDuration} minutos.`);  try {
    // Troque para a URL do backend em produção ou use variável de ambiente
    const backendUrl = (import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000') + '/api/create-session';
    const response = await fetch(backendUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stationId: stationId,
        checklistId: checklistIdFromStation,
        tempoDuracaoMinutos: stationDuration
      })
    });
    if (!response.ok) {
      let errorData = { message: `Erro ${response.status} do servidor.` };
      try {
        errorData = await response.json();
      } catch (e) {
        console.warn("Não foi possível fazer o parse da resposta de erro do servidor como JSON.");
      }
      throw new Error(errorData.details || errorData.error || errorData.message || `Erro ${response.status} do servidor ao criar sessão.`);
    }
    const data = await response.json();
    const sessionId = data.sessionId;
    if (!sessionId) { throw new Error('Backend não retornou um sessionId válido.'); }
    console.log(`ATOR: Sessão criada no backend com ID: ${sessionId}`);

    let actorUrlPath, candidateUrlPath;
    try {
      const actorRoute = router.resolve({
        name: 'SimulationView',
        params: { id: stationId },
        query: { session: sessionId, role: 'actor' }
      });
      const candidateRoute = router.resolve({
        name: 'SimulationView',
        params: { id: stationId },
        query: { session: sessionId, role: 'candidate' }
      });
      actorUrlPath = actorRoute.href;
      candidateUrlPath = candidateRoute.href;
    } catch (routeError) {
      console.error("Erro ao resolver rotas de simulação:", routeError);
      throw new Error(`Falha ao construir URLs de simulação: ${routeError.message}.`);
    }

    generatedCandidateLink.value = `${window.location.origin}${candidateUrlPath}`;
    console.log("ATOR: Link para candidato:", generatedCandidateLink.value);

    console.log(`ATOR: Navegando para ${actorUrlPath}`);
    router.push(actorUrlPath);
  } catch (error) {
    console.error("Erro ao iniciar simulação como ator:", error);
    errorApi.value = `Erro: ${error.message}`;
  } finally {
    isLoadingSession.value = false;
    creatingSessionForStationId.value = null;
  }
}

function goToEditStation(stationId) {
  if (!stationId) {
    console.error("ID da estação não fornecido para edição.");
    return;
  }
  router.push({ name: 'EditStation', params: { id: stationId } });
}

const goToAdminUpload = () => {
  console.log('Clicou no botão Upload (Área Admin)');
  try {
    router.push('/admin/upload');
    console.log('Redirecionamento para /admin/upload executado');
  } catch (error) {
    console.error('Erro ao redirecionar:', error);
  }
}

onMounted(fetchStations);
</script>

<template>
  <div class="station-list-container">
    <!-- Mostra o UID do usuário para depuração -->
    <div v-if="currentUser">UID logado: {{ currentUser.uid }}</div>
    <button v-if="currentUser && (currentUser.uid === 'xN0BqF7vvbbwpWlMNxhORH48Ri33' || currentUser.uid === 'F8NOHX6eCxPORAf8x3faSq3Wy9D3')" @click="goToAdminUpload" class="admin-upload-button">
      Upload (Área Admin)
    </button>

    <h2>Lista de Estações Disponíveis</h2>

    <div class="exam-group-container">
      <button
        @click="showPreviousExamsSection = !showPreviousExamsSection"
        class="exam-group-toggle-button"
        :aria-expanded="showPreviousExamsSection.toString()"
      >
        INEP REVALIDA PROVAS ANTERIORES
        <span class="toggle-arrow">{{ showPreviousExamsSection ? '▾' : '▸' }}</span>
      </button>

      <div v-if="showPreviousExamsSection" class="exam-year-container">
        <button
          @click="show2024_2Stations = !show2024_2Stations"
          class="exam-year-toggle-button"
          :aria-expanded="show2024_2Stations.toString()"
        >
          INEP REVALIDA 2024.2
          <span class="toggle-arrow">{{ show2024_2Stations ? '▾' : '▸' }}</span>
        </button>

        <div v-if="show2024_2Stations" class="stations-list-content">
          <div v-if="isLoadingStations" class="feedback loading">Carregando estações de 2024.2...</div>
          <div v-else-if="errorMessage && stations2024_2.length === 0" class="feedback error">{{ errorMessage }}</div>
          <div v-else-if="stations2024_2.length === 0 && !errorMessage" class="feedback info">Nenhuma estação encontrada para INEP REVALIDA 2024.2.</div>
          <ul v-else>
            <li v-for="station in stations2024_2" :key="station.id" class="station-item">
              <div class="station-info">
                <h3>{{ station.tituloEstacao || 'Estação sem Título' }}</h3>
                <p>Área: {{ station.especialidade || 'N/A' }} <code style="font-size: 0.8em;">(ID: {{ station.id }})</code></p>
                <p v-if="station.tempoDuracaoMinutos">Duração: {{ station.tempoDuracaoMinutos }} min</p>
                <p v-if="errorApi && creatingSessionForStationId === station.id" class="feedback error small">{{ errorApi }}</p>
              </div>
              <div class="station-actions">
                <button
                  @click="startSimulationAsActor(station.id, station.padraoEsperadoProcedimento && station.padraoEsperadoProcedimento.idChecklistAssociado)"
                  :disabled="isLoadingSession || !(station.padraoEsperadoProcedimento && station.padraoEsperadoProcedimento.idChecklistAssociado)">
                  {{ isLoadingSession && creatingSessionForStationId === station.id ? 'Criando...' : 'Iniciar Como Ator' }}
                </button>                <button
                  v-if="currentUser && (currentUser.uid === 'xN0BqF7vvbbwpWlMNxhORH48Ri33' || currentUser.uid === 'F8NOHX6eCxPORAf8x3faSq3Wy9D3')"
                  @click="goToEditStation(station.id)"
                  class="edit-station-button" title="Editar Estação (Admin)">
                  Editar
                </button>
                <p v-if="!(station.padraoEsperadoProcedimento && station.padraoEsperadoProcedimento.idChecklistAssociado)" class="feedback error small" style="text-align: right;">ID do Checklist ausente</p>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <div class="exam-group-container">
      <button
        @click="showRevalidaFacilStations = !showRevalidaFacilStations"
        class="exam-group-toggle-button"
        :aria-expanded="showRevalidaFacilStations.toString()"
      >
        REVALIDA FACIL
        <span class="toggle-arrow">{{ showRevalidaFacilStations ? '▾' : '▸' }}</span>
      </button>

      <div v-if="showRevalidaFacilStations" class="exam-year-container">

        <button
          @click="showRevalidaFacilClinicaMedica = !showRevalidaFacilClinicaMedica"
          class="exam-year-toggle-button btn-clinica-medica"
          :aria-expanded="showRevalidaFacilClinicaMedica.toString()"
        >
          CLÍNICA MÉDICA
          <span class="toggle-arrow">{{ showRevalidaFacilClinicaMedica ? '▾' : '▸' }}</span>
        </button>
        <div v-if="showRevalidaFacilClinicaMedica" class="stations-list-content">
          <div v-if="isLoadingStations" class="feedback loading">Carregando estações de Clínica Médica...</div>
          <div v-else-if="errorMessage && stationsRevalidaFacilClinicaMedica.length === 0 && !isLoadingStations" class="feedback error">
            {{ errorMessage }} <span v-if="stationsRevalidaFacil.length > 0">(Nenhuma estação de Clínica Médica encontrada).</span>
          </div>
          <div v-else-if="stationsRevalidaFacilClinicaMedica.length === 0 && !isLoadingStations" class="feedback info">
            Nenhuma estação encontrada para Clínica Médica em Revalida Fácil.
          </div>
          <ul v-else>
            <li v-for="station in stationsRevalidaFacilClinicaMedica" :key="station.id" class="station-item">
              <div class="station-info">
                <h3>{{ station.tituloEstacao || 'Estação sem Título' }}</h3>
                <p>Área: {{ station.especialidade || 'N/A' }} <code style="font-size: 0.8em;">(ID: {{ station.id }})</code></p>
                <p v-if="station.tempoDuracaoMinutos">Duração: {{ station.tempoDuracaoMinutos }} min</p>
                <p v-if="errorApi && creatingSessionForStationId === station.id" class="feedback error small">{{ errorApi }}</p>
              </div>
              <div class="station-actions">
                <button @click="startSimulationAsActor(station.id, station.padraoEsperadoProcedimento && station.padraoEsperadoProcedimento.idChecklistAssociado)" :disabled="isLoadingSession || !(station.padraoEsperadoProcedimento && station.padraoEsperadoProcedimento.idChecklistAssociado)">
                  {{ isLoadingSession && creatingSessionForStationId === station.id ? 'Criando...' : 'Iniciar Como Ator' }}
                </button>
                <button v-if="currentUser && (currentUser.uid === 'xN0BqF7vvbbwpWlMNxhORH48Ri33' || currentUser.uid === 'F8NOHX6eCxPORAf8x3faSq3Wy9D3')" @click="goToEditStation(station.id)" class="edit-station-button" title="Editar Estação (Admin)">Editar</button>
                <p v-if="!(station.padraoEsperadoProcedimento && station.padraoEsperadoProcedimento.idChecklistAssociado)" class="feedback error small" style="text-align: right;">ID do Checklist ausente</p>
              </div>
            </li>
          </ul>
        </div>

        <button
          @click="showRevalidaFacilGO = !showRevalidaFacilGO"
          class="exam-year-toggle-button btn-go"
          :aria-expanded="showRevalidaFacilGO.toString()"
        >
          G.O (Ginecologia e Obstetrícia)
          <span class="toggle-arrow">{{ showRevalidaFacilGO ? '▾' : '▸' }}</span>
        </button>
        <div v-if="showRevalidaFacilGO" class="stations-list-content">
          <div v-if="isLoadingStations" class="feedback loading">Carregando estações de G.O...</div>
          <div v-else-if="errorMessage && stationsRevalidaFacilGO.length === 0 && !isLoadingStations" class="feedback error">
            {{ errorMessage }} <span v-if="stationsRevalidaFacil.length > 0">(Nenhuma estação de G.O encontrada).</span>
          </div>
          <div v-else-if="stationsRevalidaFacilGO.length === 0 && !isLoadingStations" class="feedback info">
            Nenhuma estação encontrada para G.O em Revalida Fácil.
          </div>
          <ul v-else>
            <li v-for="station in stationsRevalidaFacilGO" :key="station.id" class="station-item">
              <div class="station-info">
                <h3>{{ station.tituloEstacao || 'Estação sem Título' }}</h3>
                <p>Área: {{ station.especialidade || 'N/A' }} <code style="font-size: 0.8em;">(ID: {{ station.id }})</code></p>
                <p v-if="station.tempoDuracaoMinutos">Duração: {{ station.tempoDuracaoMinutos }} min</p>
                <p v-if="errorApi && creatingSessionForStationId === station.id" class="feedback error small">{{ errorApi }}</p>
              </div>
              <div class="station-actions">
                <button @click="startSimulationAsActor(station.id, station.padraoEsperadoProcedimento && station.padraoEsperadoProcedimento.idChecklistAssociado)" :disabled="isLoadingSession || !(station.padraoEsperadoProcedimento && station.padraoEsperadoProcedimento.idChecklistAssociado)">
                  {{ isLoadingSession && creatingSessionForStationId === station.id ? 'Criando...' : 'Iniciar Como Ator' }}
                </button>
                <button v-if="currentUser && (currentUser.uid === 'xN0BqF7vvbbwpWlMNxhORH48Ri33' || currentUser.uid === 'F8NOHX6eCxPORAf8x3faSq3Wy9D3')" @click="goToEditStation(station.id)" class="edit-station-button" title="Editar Estação (Admin)">Editar</button>
                <p v-if="!(station.padraoEsperadoProcedimento && station.padraoEsperadoProcedimento.idChecklistAssociado)" class="feedback error small" style="text-align: right;">ID do Checklist ausente</p>
              </div>
            </li>
          </ul>
        </div>

        <button
          @click="showRevalidaFacilCirurgia = !showRevalidaFacilCirurgia"
          class="exam-year-toggle-button btn-cirurgia"
          :aria-expanded="showRevalidaFacilCirurgia.toString()"
        >
          CIRURGIA GERAL
          <span class="toggle-arrow">{{ showRevalidaFacilCirurgia ? '▾' : '▸' }}</span>
        </button>
        <div v-if="showRevalidaFacilCirurgia" class="stations-list-content">
          <div v-if="isLoadingStations" class="feedback loading">Carregando estações de Cirurgia Geral...</div>
          <div v-else-if="errorMessage && stationsRevalidaFacilCirurgia.length === 0 && !isLoadingStations" class="feedback error">
            {{ errorMessage }} <span v-if="stationsRevalidaFacil.length > 0">(Nenhuma estação de Cirurgia Geral encontrada).</span>
          </div>
          <div v-else-if="stationsRevalidaFacilCirurgia.length === 0 && !isLoadingStations" class="feedback info">
            Nenhuma estação encontrada para Cirurgia Geral em Revalida Fácil.
          </div>
          <ul v-else>
            <li v-for="station in stationsRevalidaFacilCirurgia" :key="station.id" class="station-item">
              <div class="station-info">
                <h3>{{ station.tituloEstacao || 'Estação sem Título' }}</h3>
                <p>Área: {{ station.especialidade || 'N/A' }} <code style="font-size: 0.8em;">(ID: {{ station.id }})</code></p>
                <p v-if="station.tempoDuracaoMinutos">Duração: {{ station.tempoDuracaoMinutos }} min</p>
                <p v-if="errorApi && creatingSessionForStationId === station.id" class="feedback error small">{{ errorApi }}</p>
              </div>
              <div class="station-actions">
                <button @click="startSimulationAsActor(station.id, station.padraoEsperadoProcedimento && station.padraoEsperadoProcedimento.idChecklistAssociado)" :disabled="isLoadingSession || !(station.padraoEsperadoProcedimento && station.padraoEsperadoProcedimento.idChecklistAssociado)">
                  {{ isLoadingSession && creatingSessionForStationId === station.id ? 'Criando...' : 'Iniciar Como Ator' }}
                </button>
                <button v-if="currentUser && (currentUser.uid === 'xN0BqF7vvbbwpWlMNxhORH48Ri33' || currentUser.uid === 'F8NOHX6eCxPORAf8x3faSq3Wy9D3')" @click="goToEditStation(station.id)" class="edit-station-button" title="Editar Estação (Admin)">Editar</button>
                <p v-if="!(station.padraoEsperadoProcedimento && station.padraoEsperadoProcedimento.idChecklistAssociado)" class="feedback error small" style="text-align: right;">ID do Checklist ausente</p>
              </div>
            </li>
          </ul>
        </div>

        <button
          @click="showRevalidaFacilPreventiva = !showRevalidaFacilPreventiva"
          class="exam-year-toggle-button btn-preventiva"
          :aria-expanded="showRevalidaFacilPreventiva.toString()"
        >
          MEDICINA PREVENTIVA
          <span class="toggle-arrow">{{ showRevalidaFacilPreventiva ? '▾' : '▸' }}</span>
        </button>
        <div v-if="showRevalidaFacilPreventiva" class="stations-list-content">
          <div v-if="isLoadingStations" class="feedback loading">Carregando estações de Medicina Preventiva...</div>
          <div v-else-if="errorMessage && stationsRevalidaFacilPreventiva.length === 0 && !isLoadingStations" class="feedback error">
            {{ errorMessage }} <span v-if="stationsRevalidaFacil.length > 0">(Nenhuma estação de Medicina Preventiva encontrada).</span>
          </div>
          <div v-else-if="stationsRevalidaFacilPreventiva.length === 0 && !isLoadingStations" class="feedback info">
            Nenhuma estação encontrada para Medicina Preventiva em Revalida Fácil.
          </div>
          <ul v-else>
            <li v-for="station in stationsRevalidaFacilPreventiva" :key="station.id" class="station-item">
              <div class="station-info">
                <h3>{{ station.tituloEstacao || 'Estação sem Título' }}</h3>
                <p>Área: {{ station.especialidade || 'N/A' }} <code style="font-size: 0.8em;">(ID: {{ station.id }})</code></p>
                <p v-if="station.tempoDuracaoMinutos">Duração: {{ station.tempoDuracaoMinutos }} min</p>
                <p v-if="errorApi && creatingSessionForStationId === station.id" class="feedback error small">{{ errorApi }}</p>
              </div>
              <div class="station-actions">
                <button @click="startSimulationAsActor(station.id, station.padraoEsperadoProcedimento && station.padraoEsperadoProcedimento.idChecklistAssociado)" :disabled="isLoadingSession || !(station.padraoEsperadoProcedimento && station.padraoEsperadoProcedimento.idChecklistAssociado)">
                  {{ isLoadingSession && creatingSessionForStationId === station.id ? 'Criando...' : 'Iniciar Como Ator' }}
                </button>
                <button v-if="currentUser && (currentUser.uid === 'xN0BqF7vvbbwpWlMNxhORH48Ri33' || currentUser.uid === 'F8NOHX6eCxPORAf8x3faSq3Wy9D3')" @click="goToEditStation(station.id)" class="edit-station-button" title="Editar Estação (Admin)">Editar</button>
                <p v-if="!(station.padraoEsperadoProcedimento && station.padraoEsperadoProcedimento.idChecklistAssociado)" class="feedback error small" style="text-align: right;">ID do Checklist ausente</p>
              </div>
            </li>
          </ul>
        </div>

        <button
          @click="showRevalidaFacilPediatria = !showRevalidaFacilPediatria"
          class="exam-year-toggle-button btn-pediatria"
          :aria-expanded="showRevalidaFacilPediatria.toString()"
        >
          PEDIATRIA
          <span class="toggle-arrow">{{ showRevalidaFacilPediatria ? '▾' : '▸' }}</span>
        </button>
        <div v-if="showRevalidaFacilPediatria" class="stations-list-content">
          <div v-if="isLoadingStations" class="feedback loading">Carregando estações de Pediatria...</div>
          <div v-else-if="errorMessage && stationsRevalidaFacilPediatria.length === 0 && !isLoadingStations" class="feedback error">
            {{ errorMessage }} <span v-if="stationsRevalidaFacil.length > 0">(Nenhuma estação de Pediatria encontrada).</span>
          </div>
          <div v-else-if="stationsRevalidaFacilPediatria.length === 0 && !isLoadingStations" class="feedback info">
            Nenhuma estação encontrada para Pediatria em Revalida Fácil.
          </div>
          <ul v-else>
            <li v-for="station in stationsRevalidaFacilPediatria" :key="station.id" class="station-item">
             <div class="station-info">
                <h3>{{ station.tituloEstacao || 'Estação sem Título' }}</h3>
                <p>Área: {{ station.especialidade || 'N/A' }} <code style="font-size: 0.8em;">(ID: {{ station.id }})</code></p>
                <p v-if="station.tempoDuracaoMinutos">Duração: {{ station.tempoDuracaoMinutos }} min</p>
                <p v-if="errorApi && creatingSessionForStationId === station.id" class="feedback error small">{{ errorApi }}</p>
              </div>
              <div class="station-actions">
                <button @click="startSimulationAsActor(station.id, station.padraoEsperadoProcedimento && station.padraoEsperadoProcedimento.idChecklistAssociado)" :disabled="isLoadingSession || !(station.padraoEsperadoProcedimento && station.padraoEsperadoProcedimento.idChecklistAssociado)">
                  {{ isLoadingSession && creatingSessionForStationId === station.id ? 'Criando...' : 'Iniciar Como Ator' }}
                </button>
                <button v-if="currentUser && (currentUser.uid === 'xN0BqF7vvbbwpWlMNxhORH48Ri33' || currentUser.uid === 'F8NOHX6eCxPORAf8x3faSq3Wy9D3')" @click="goToEditStation(station.id)" class="edit-station-button" title="Editar Estação (Admin)">Editar</button>
                <p v-if="!(station.padraoEsperadoProcedimento && station.padraoEsperadoProcedimento.idChecklistAssociado)" class="feedback error small" style="text-align: right;">ID do Checklist ausente</p>
              </div>
            </li>
          </ul>
        </div>

      </div>
    </div>

    <div v-if="generatedCandidateLink" class="invite-link-section feedback info">
      <p>✅ Sessão criada! Compartilhe este link com o <strong>Candidato</strong>:</p>
      <div class="generated-link-text">{{ generatedCandidateLink }}</div>
      <button @click="() => { try { navigator.clipboard.writeText(generatedCandidateLink); alert('Link copiado!'); } catch(e) { alert('Falha ao copiar. Selecione e copie manualmente.'); } }">Copiar Link</button>
    </div>

  </div>
</template>

<style scoped>
.station-list-container {
  padding: 25px;
  font-family: 'Inter', sans-serif;
  max-width: 850px;
  margin: 2rem auto;
  background-color: #FFFFFF;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.exam-group-container {
  margin-bottom: 25px;
  border: 1px solid #DEE2E6;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 6px rgba(0,0,0,0.06);
}

.exam-group-toggle-button {
  background-color: #207D76;
  color: white;
  padding: 16px 22px;
  width: 100%;
  text-align: left;
  border: none;
  cursor: pointer;
  font-size: 1.1em;
  font-weight: 600;
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: background-color 0.2s ease;
  border-radius: 0; /* Removido para que o border-radius do exam-group-container funcione */
}
.exam-group-toggle-button:hover {
  background-color: #1A655F;
}

.exam-year-toggle-button {
  /* background-color: #D4A373; Default color, will be overridden by specific classes */
  color: white;
  font-size: 1.0em;
  padding: 14px 22px;
  width: 100%;
  text-align: left;
  border: none;
  cursor: pointer;
  font-weight: 600;
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: background-color 0.2s ease;
  border-top: 1px solid #FFFFFF30;
}
/* Default hover for exam-year-toggle-button if no specific color class is applied */
.exam-year-toggle-button:not([class*="btn-"]):hover {
  background-color: #BF8D5B;
}


/* NOVAS CLASSES DE COR PARA OS BOTÕES DAS SUBPASTAS */
.btn-clinica-medica {
  background-color: #5A9BD5 !important; /* Azul */
}
.btn-clinica-medica:hover {
  background-color: #4A80B0 !important;
}

.btn-go {
  background-color: #C37AC9 !important; /* Roxo/Rosa */
}
.btn-go:hover {
  background-color: #A260A8 !important;
}

.btn-cirurgia {
  background-color: #70AD47 !important; /* Verde */
}
.btn-cirurgia:hover {
  background-color: #5A8C3A !important;
}

.btn-preventiva {
  background-color: #ED7D31 !important; /* Laranja */
}
.btn-preventiva:hover {
  background-color: #C86A26 !important;
}

.btn-pediatria {
  background-color: #40C0CB !important; /* Azul Claro/Teal */
}
.btn-pediatria:hover {
  background-color: #30A0A8 !important;
}
/* FIM DAS NOVAS CLASSES DE COR */

/* Estilos se necessário para o container das subpastas */

.toggle-arrow {
  font-size: 1em;
  margin-left: 12px;
  transition: transform 0.3s ease;
  font-weight: normal;
}

button[aria-expanded="true"] .toggle-arrow {
  transform: rotate(90deg);
}

.stations-list-content {
  padding: 20px;
  background-color: #F8F9FA;
  border-top: 1px solid #DEE2E6; /* Adiciona uma linha sutil acima do conteúdo */
}

h2 {
  text-align: center;
  margin-bottom: 2rem;
  margin-top: 1rem;
  color: #343A40;
  font-weight: 700;
  font-size: 1.8em;
}

ul { list-style: none; padding: 0; margin-top: 15px;
}

.station-item {
  border: 1px solid #E9ECEF;
  border-radius: 6px;
  padding: 18px 22px;
  margin-bottom: 18px;
  background-color: #fff;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
}

.station-info {
  flex-grow: 1;
  flex-basis: 70%;
  min-width: 280px;
  padding-right: 1.5rem;
  text-align: left;
}

.station-actions {
  flex-shrink: 0;
  text-align: right;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  width: 100%;
  margin-top: 12px;
}

@media (min-width: 720px) {
  .station-actions {
    width: auto;
    margin-top: 0;
    flex-direction: row;
    align-items: center;
  }
  .station-info {
    padding-right: 1.5rem;
  }
}

.station-info h3 {
  margin: 0 0 10px 0;
  color: #343A40;
  font-size: 1.2em;
  font-weight: 600;
  text-align: left;
}
.station-info p {
  margin: 0 0 6px 0;
  color: #495057;
  font-size: 0.95em;
  text-align: left;
}
.station-info code {
  background-color: #E9ECEF;
  color: #495057;
  padding: 3px 6px;
  border-radius: 4px;
  font-size: 0.88em;
}

.station-actions button {
  padding: 10px 18px;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  transition: background-color 0.2s ease, transform 0.1s ease;
  font-size: 0.9em;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}
.station-actions button:disabled {
  background-color: #CED4DA !important;
  color: #6C757D !important;
  cursor: not-allowed !important;
  opacity: 0.8;
  box-shadow: none;
}
.station-actions button:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 2px 5px rgba(0,0,0,0.15);
}

.station-actions button:first-of-type { /* Botão 'Iniciar Como Ator' */
   background-color: #207D76;
}
.station-actions button:first-of-type:hover:not(:disabled) {
   background-color: #1A655F;
}

.edit-station-button { /* Botão 'Editar' */
  background-color: #ffc107 !important;
  color: #212529 !important;
}
.edit-station-button:hover:not(:disabled) {
  background-color: #e0a800 !important;
}


.feedback { padding: 1rem; margin-top: 1rem; border-radius: 6px; font-weight: 500;
text-align: center; line-height: 1.5; border-width: 1px;
border-style: solid;}
.feedback.error { background-color: #F8D7DA;
color: #721C24; border-color: #F5C6CB; }
.feedback.loading { background-color: #D1ECF1; color: #0C5460; border-color: #BEE5EB;
}
.feedback.info { background-color: #D1ECF1; color: #0C5460; border-color: #BEE5EB;
}
.feedback.small { padding: 0.4rem; font-size: 0.85em; margin-top: 0.2rem; margin-bottom: 0.5rem; text-align: right;
border: none; background: none; color: #721C24; width: 100%;}

.invite-link-section { margin-top: 25px;
padding: 18px; text-align: left; background-color: #E6FFFA;
border: 1px solid #A6F7DE;
border-radius: 6px;}
.invite-link-section p { margin-bottom: 10px; font-weight: normal;
color: #137967;}
.generated-link-text {
  padding: 12px;
  font-size: 0.9em;
  border: 1px solid #A6F7DE;
  border-radius: 4px;
  background-color: #FFFFFF;
  word-break: break-all;
  margin-bottom: 12px;
  color: #1A202C;
}
.invite-link-section button {
  background-color: #22C55E;
  color: white;
  font-size: 0.9em; padding: 9px 14px; vertical-align: middle;
  border: none; border-radius: 5px; cursor: pointer; transition: background-color 0.2s ease;
}
.invite-link-section button:hover:not(:disabled) { background-color: #16A34A; }

.admin-upload-button {
  background-color: #007bff;
  color: white;
  padding: 10px 18px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  margin-bottom: 18px;
  font-size: 1em;
}
.admin-upload-button:hover {
  background-color: #0056b3;
}
</style>
