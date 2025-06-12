<script setup>
import { ref, onMounted, watch, reactive, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { db } from '../firebaseConfig.js'; // Assumindo que firebaseConfig.js está em src/
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { currentUser } from '../authStore.js'; // Assumindo que authStore.js está em src/

const route = useRoute();
const router = useRouter();

const stationId = ref(null); // Será definido pelo parâmetro da rota
const stationData = ref(null); // Cópia editável dos dados da estação
const originalStationData = ref(null); // Cópia original para comparação/reversão

const isLoading = ref(true);
const errorMessage = ref('');
const successMessage = ref('');

// Helper para converter o conteúdo dos impressos para string JSON para o textarea
// e de volta para objeto ao carregar/salvar.
function stringifyImpressoConteudo(impressosArray) {
  if (!Array.isArray(impressosArray)) return [];
  return impressosArray.map(imp => ({
    ...imp,
    // Garante que conteudoStringified seja sempre uma string, mesmo que imp.conteudo seja undefined
    conteudoStringified: JSON.stringify(imp.conteudo || {}, null, 2)
  }));
}

function parseImpressoConteudo(impressosArray) {
  if (!Array.isArray(impressosArray)) return [];
  return impressosArray.map(imp => {
    let parsedConteudo = {};
    try {
      if (typeof imp.conteudoStringified === 'string' && imp.conteudoStringified.trim() !== '') {
        parsedConteudo = JSON.parse(imp.conteudoStringified);
      } else {
        // Se conteudoStringified estiver vazio ou não for string, tenta usar o campo conteudo original se existir
        parsedConteudo = imp.conteudo && typeof imp.conteudo === 'object' ? imp.conteudo : {};
      }
    } catch (e) {
      console.error(`Erro ao parsear conteúdo JSON para o impresso ${imp.tituloImpresso}:`, e);
      // Mantém o conteúdo original ou um objeto vazio em caso de erro de parse
      parsedConteudo = imp.conteudo && typeof imp.conteudo === 'object' ? imp.conteudo : {};
    }
    // Cria um novo objeto sem conteudoStringified
    const { conteudoStringified, ...restOfImpresso } = imp;
    return { ...restOfImpresso, conteudo: parsedConteudo };
  });
}


// Verifica se o usuário atual é o admin definido
const isAdmin = computed(() => {
  return currentUser.value && currentUser.value.uid === 'zpJfB1NZjTO6FYTUZsIvrpSrp4g2';
});

async function fetchStationToEdit() {
  if (!stationId.value) {
    errorMessage.value = "Nenhum ID de estação fornecido para edição.";
    isLoading.value = false;
    return;
  }
  isLoading.value = true;
  errorMessage.value = '';
  successMessage.value = '';
  try {
    const docRef = doc(db, "estacoes_clinicas", stationId.value);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const loadedData = { id: docSnap.id, ...docSnap.data() };
      
      // Inicializa estruturas aninhadas se não existirem para evitar erros no template
      loadedData.instrucoesParticipante = loadedData.instrucoesParticipante || { cenarioAtendimento: { infraestruturaUnidade: [] }, tarefasPrincipais: [], avisosImportantes: [] };
      loadedData.instrucoesParticipante.cenarioAtendimento = loadedData.instrucoesParticipante.cenarioAtendimento || { infraestruturaUnidade: [] };
      loadedData.instrucoesParticipante.cenarioAtendimento.infraestruturaUnidade = loadedData.instrucoesParticipante.cenarioAtendimento.infraestruturaUnidade || [];
      loadedData.instrucoesParticipante.tarefasPrincipais = loadedData.instrucoesParticipante.tarefasPrincipais || [];
      loadedData.instrucoesParticipante.avisosImportantes = loadedData.instrucoesParticipante.avisosImportantes || [];
      
      loadedData.materiaisDisponiveis = loadedData.materiaisDisponiveis || { informacoesVerbaisSimulado: [], impressos: [] };
      loadedData.materiaisDisponiveis.informacoesVerbaisSimulado = loadedData.materiaisDisponiveis.informacoesVerbaisSimulado || [];
      loadedData.materiaisDisponiveis.impressos = loadedData.materiaisDisponiveis.impressos || [];
      
      loadedData.padraoEsperadoProcedimento = loadedData.padraoEsperadoProcedimento || { itensAvaliacao: [] };
      loadedData.padraoEsperadoProcedimento.itensAvaliacao = loadedData.padraoEsperadoProcedimento.itensAvaliacao || [];

      // Processa os impressos para stringificar o conteúdo
      if (loadedData.materiaisDisponiveis.impressos) {
        loadedData.materiaisDisponiveis.impressos = stringifyImpressoConteudo(loadedData.materiaisDisponiveis.impressos);
      }

      stationData.value = reactive(JSON.parse(JSON.stringify(loadedData)));
      originalStationData.value = JSON.parse(JSON.stringify(loadedData));
    } else {
      errorMessage.value = "Estação não encontrada para edição.";
      stationData.value = null;
    }
  } catch (error) {
    console.error("Erro ao buscar estação para edição:", error);
    errorMessage.value = `Falha ao carregar estação: ${error.message}`;
    stationData.value = null;
  } finally {
    isLoading.value = false;
  }
}

async function saveStationChanges() {
  if (!stationData.value || !stationData.value.id) {
    errorMessage.value = "Nenhum dado da estação para salvar.";
    alert("Nenhum dado da estação para salvar.");
    return;
  }
  if (!isAdmin.value) {
    errorMessage.value = "Apenas administradores podem salvar alterações.";
    alert("Apenas administradores podem salvar alterações.");
    return;
  }

  isLoading.value = true;
  errorMessage.value = '';
  successMessage.value = '';

  try {
    const stationDocRef = doc(db, 'estacoes_clinicas', stationData.value.id);
    
    const dataToSave = JSON.parse(JSON.stringify(stationData.value));
    delete dataToSave.id; 

    if (dataToSave.materiaisDisponiveis && dataToSave.materiaisDisponiveis.impressos) {
      dataToSave.materiaisDisponiveis.impressos = parseImpressoConteudo(dataToSave.materiaisDisponiveis.impressos);
    }

    await updateDoc(stationDocRef, dataToSave);
    successMessage.value = "Estação atualizada com sucesso!";
    originalStationData.value = JSON.parse(JSON.stringify(stationData.value)); 
    setTimeout(() => { successMessage.value = ''; }, 3000);

  } catch (error) {
    console.error("Erro ao salvar alterações da estação:", error);
    errorMessage.value = `Falha ao salvar: ${error.message}`;
  } finally {
    isLoading.value = false;
  }
}

function addToArray(targetArray, newItemTemplate = {}) {
  if (Array.isArray(targetArray)) {
    targetArray.push(reactive(JSON.parse(JSON.stringify(newItemTemplate))));
  } else {
    console.error("Tentativa de adicionar a um não-array:", targetArray, "Template:", newItemTemplate);
  }
}

function removeFromArray(targetArray, index) {
  if (Array.isArray(targetArray)) {
    targetArray.splice(index, 1);
  }
}

function addActorScriptItem() {
  if (stationData.value?.materiaisDisponiveis?.informacoesVerbaisSimulado) {
    addToArray(stationData.value.materiaisDisponiveis.informacoesVerbaisSimulado, { contextoOuPerguntaChave: 'Novo Contexto', informacao: 'Nova Informação' });
  }
}

function addImpressoItem() {
    if (stationData.value?.materiaisDisponiveis?.impressos) {
        const newImpresso = {
            idImpresso: `est${stationData.value.numeroDaEstacao || 'X'}_novo_impresso_${Date.now()}`,
            tituloImpresso: 'Novo Impresso (Título)',
            tipoConteudo: 'lista_chave_valor_secoes',
            conteudo: { secoes: [{ tituloSecao: 'Nova Seção', itens: [{chave: 'Nova Chave', valor: 'Novo Valor'}] }] },
        };
        newImpresso.conteudoStringified = JSON.stringify(newImpresso.conteudo, null, 2);
        addToArray(stationData.value.materiaisDisponiveis.impressos, newImpresso);
    }
}

function addPEPItem() {
    if (stationData.value?.padraoEsperadoProcedimento?.itensAvaliacao) {
        const newItemNumero = (stationData.value.padraoEsperadoProcedimento.itensAvaliacao.length + 1).toString();
        addToArray(stationData.value.padraoEsperadoProcedimento.itensAvaliacao, {
            idItem: `pep_est${stationData.value.numeroDaEstacao || 'X'}_novo_item_${Date.now()}`,
            itemNumeroOficial: newItemNumero,
            descricaoItem: 'Nova descrição do item PEP...',
            pontuacoes: {
                adequado: { criterio: 'Critério para adequado', pontos: 0.0 },
                parcialmenteAdequado: { criterio: 'Critério para parcialmente adequado', pontos: 0.0 },
                inadequado: { criterio: 'Critério para inadequado', pontos: 0.0 }
            }
        });
    }
}

onMounted(() => {
  // O watch com immediate: true já chama fetchStationToEdit na montagem se route.params.id estiver presente
});

watch(() => route.params.id, (newId) => {
  if (newId) { // Verifica se newId existe antes de atribuir e buscar
    stationId.value = newId;
    fetchStationToEdit();
  }
}, { immediate: true }); // immediate: true para rodar na montagem inicial

</script>

<template>
  <div class="edit-station-container">
    <button @click="router.push({ name: 'StationList' })" class="back-button">&larr; Voltar para Lista de Estações</button>
    <h2>Editar Estação</h2>
    
    <div v-if="isLoading" class="feedback loading">Carregando dados da estação...</div>
    <div v-if="errorMessage" class="feedback error">{{ errorMessage }}</div>
    <div v-if="successMessage" class="feedback success">{{ successMessage }}</div>

    <form v-if="stationData && !isLoading && isAdmin" @submit.prevent="saveStationChanges" class="edit-form">
      <p class="station-id-display">Editando Estação ID: <strong>{{ stationData.id }}</strong></p>
      
      <fieldset class="fieldset-group">
        <legend>Informações Gerais da Estação</legend>
        <div class="form-group">
          <label for="tituloEstacao">Título da Estação:</label>
          <input type="text" id="tituloEstacao" v-model="stationData.tituloEstacao" required>
        </div>
        <div class="form-group">
          <label for="numeroDaEstacao">Número da Estação:</label>
          <input type="number" id="numeroDaEstacao" v-model.number="stationData.numeroDaEstacao" required>
        </div>
        <div class="form-group">
          <label for="especialidade">Especialidade:</label>
          <input type="text" id="especialidade" v-model="stationData.especialidade" required>
        </div>
        <div class="form-group">
          <label for="tempoDuracaoMinutos">Tempo de Duração (minutos):</label>
          <input type="number" id="tempoDuracaoMinutos" v-model.number="stationData.tempoDuracaoMinutos" required>
        </div>
        <div class="form-group">
          <label for="palavrasChave">Palavras-Chave (separadas por vírgula):</label>
          <input type="text" id="palavrasChave" v-model="stationData.palavrasChave">
        </div>
        <div class="form-group">
          <label for="nivelDificuldade">Nível de Dificuldade:</label>
          <input type="text" id="nivelDificuldade" v-model="stationData.nivelDificuldade">
        </div>
      </fieldset>

      <fieldset class="fieldset-group" v-if="stationData.instrucoesParticipante">
        <legend>Instruções para o Participante</legend>
        <div v-if="stationData.instrucoesParticipante.cenarioAtendimento" class="sub-fieldset">
            <label class="sub-legend">Cenário de Atendimento</label>
            <div class="form-group">
                <label for="nivelAtencao">Nível de Atenção:</label>
                <input type="text" id="nivelAtencao" v-model="stationData.instrucoesParticipante.cenarioAtendimento.nivelAtencao">
            </div>
            <div class="form-group">
                <label for="tipoAtendimento">Tipo de Atendimento:</label>
                <input type="text" id="tipoAtendimento" v-model="stationData.instrucoesParticipante.cenarioAtendimento.tipoAtendimento">
            </div>
            <div class="form-group">
                <label>Infraestrutura da Unidade:</label>
                <div v-for="(infra, index) in stationData.instrucoesParticipante.cenarioAtendimento.infraestruturaUnidade" :key="'infra-' + index" class="array-item-editor-simple">
                    <input type="text" v-model="stationData.instrucoesParticipante.cenarioAtendimento.infraestruturaUnidade[index]">
                    <button type="button" @click="removeFromArray(stationData.instrucoesParticipante.cenarioAtendimento.infraestruturaUnidade, index)" class="remove-button-small">Remover</button>
                </div>
                <button type="button" @click="addToArray(stationData.instrucoesParticipante.cenarioAtendimento.infraestruturaUnidade, '')" class="add-button-small">Adicionar Infraestrutura</button>
            </div>
        </div>

        <div class="form-group">
          <label for="descricaoCasoCompleta">Descrição do Caso Completa:</label>
          <textarea id="descricaoCasoCompleta" v-model="stationData.instrucoesParticipante.descricaoCasoCompleta" rows="5"></textarea>
        </div>
        
        <div class="form-group">
          <label>Tarefas Principais:</label>
          <div v-for="(tarefa, index) in stationData.instrucoesParticipante.tarefasPrincipais" :key="'tarefa-' + index" class="array-item-editor-simple">
            <textarea v-model="stationData.instrucoesParticipante.tarefasPrincipais[index]" rows="2"></textarea>
            <button type="button" @click="removeFromArray(stationData.instrucoesParticipante.tarefasPrincipais, index)" class="remove-button-small">Remover</button>
          </div>
          <button type="button" @click="addToArray(stationData.instrucoesParticipante.tarefasPrincipais, '')" class="add-button-small">Adicionar Tarefa</button>
        </div>

        <div class="form-group">
          <label>Avisos Importantes:</label>
          <div v-for="(aviso, index) in stationData.instrucoesParticipante.avisosImportantes" :key="'aviso-' + index" class="array-item-editor-simple">
            <textarea v-model="stationData.instrucoesParticipante.avisosImportantes[index]" rows="2"></textarea>
            <button type="button" @click="removeFromArray(stationData.instrucoesParticipante.avisosImportantes, index)" class="remove-button-small">Remover</button>
          </div>
          <button type="button" @click="addToArray(stationData.instrucoesParticipante.avisosImportantes, '')" class="add-button-small">Adicionar Aviso</button>
        </div>
      </fieldset>

      <fieldset class="fieldset-group" v-if="stationData.materiaisDisponiveis && stationData.materiaisDisponiveis.informacoesVerbaisSimulado">
        <legend>Roteiro do Ator (Informações Verbais)</legend>
        <div v-for="(info, index) in stationData.materiaisDisponiveis.informacoesVerbaisSimulado" :key="'infoRoteiro-' + index" class="array-item-editor item-bloco">
          <div class="form-group">
            <label :for="'contexto-' + index">Contexto/Pergunta Chave {{ index + 1 }}:</label>
            <input type="text" :id="'contexto-' + index" v-model="info.contextoOuPerguntaChave">
          </div>
          <div class="form-group">
            <label :for="'informacao-' + index">Informação {{ index + 1 }} (em 1ª pessoa, use \n para quebras de linha):</label>
            <textarea :id="'informacao-' + index" v-model="info.informacao" rows="4"></textarea>
          </div>
          <button type="button" @click="removeFromArray(stationData.materiaisDisponiveis.informacoesVerbaisSimulado, index)" class="remove-button">Remover Item do Roteiro</button>
        </div>
        <button type="button" @click="addActorScriptItem()" class="add-button">Adicionar Item ao Roteiro</button>
      </fieldset>
      
      <fieldset class="fieldset-group" v-if="stationData.materiaisDisponiveis && stationData.materiaisDisponiveis.impressos">
        <legend>Impressos para o Candidato</legend>
        <div v-for="(impresso, impIndex) in stationData.materiaisDisponiveis.impressos" :key="impresso.idImpresso || 'impresso-' + impIndex" class="array-item-editor item-bloco">
          <h4>Impresso {{ impIndex + 1 }}</h4>
          <div class="form-group">
            <label :for="'impId-' + impIndex">ID do Impresso (único):</label>
            <input type="text" :id="'impId-' + impIndex" v-model="impresso.idImpresso" required>
          </div>
          <div class="form-group">
            <label :for="'impTitulo-' + impIndex">Título do Impresso:</label>
            <input type="text" :id="'impTitulo-' + impIndex" v-model="impresso.tituloImpresso" required>
          </div>
          <div class="form-group">
            <label :for="'impTipo-' + impIndex">Tipo de Conteúdo (Ex: lista_chave_valor_secoes, imagem_com_texto):</label>
            <input type="text" :id="'impTipo-' + impIndex" v-model="impresso.tipoConteudo" required>
          </div>
          <div class="form-group">
             <label :for="'impConteudo-' + impIndex">Conteúdo (em formato JSON):</label>
             <textarea :id="'impConteudo-' + impIndex" v-model="impresso.conteudoStringified" rows="7" placeholder="Cole o objeto de conteúdo aqui como JSON string. Ex: {&quot;secoes&quot;: [{&quot;tituloSecao&quot;: &quot;SINAIS&quot;, &quot;itens&quot;: [{&quot;chave&quot;: &quot;FC&quot;, &quot;valor&quot;: &quot;100bpm&quot;}]}]}"></textarea>
             <small>Edite o conteúdo como uma string JSON válida. Use o modelo `dengue.json` como referência para a estrutura interna do objeto `conteudo` conforme o `tipoConteudo`.</small>
          </div>
          <button type="button" @click="removeFromArray(stationData.materiaisDisponiveis.impressos, impIndex)" class="remove-button">Remover Impresso</button>
        </div>
        <button type="button" @click="addImpressoItem()" class="add-button">Adicionar Impresso</button>
      </fieldset>

      <fieldset class="fieldset-group" v-if="stationData.padraoEsperadoProcedimento && stationData.padraoEsperadoProcedimento.itensAvaliacao">
        <legend>PEP - Itens de Avaliação</legend>
        <div v-for="(itemPEP, pepIndex) in stationData.padraoEsperadoProcedimento.itensAvaliacao" :key="itemPEP.idItem || 'pep-' + pepIndex" class="array-item-editor item-bloco">
            <h4>Item do PEP {{ pepIndex + 1 }} (Nº Oficial: <input type="text" v-model="itemPEP.itemNumeroOficial" style="width: 50px; display: inline-block;">)</h4>
            <div class="form-group">
                <label :for="'pepIdItem-' + pepIndex">ID do Item (único):</label>
                <input type="text" :id="'pepIdItem-' + pepIndex" v-model="itemPEP.idItem" required>
            </div>
            <div class="form-group">
                <label :for="'pepDesc-' + pepIndex">Descrição do Item (use \n para quebras de linha):</label>
                <textarea :id="'pepDesc-' + pepIndex" v-model="itemPEP.descricaoItem" rows="4"></textarea>
            </div>
            <div v-if="itemPEP.pontuacoes" class="sub-fieldset">
                <label class="sub-legend">Pontuações</label>
                <div v-if="itemPEP.pontuacoes.adequado" class="form-group">
                    <label>Adequado - Critério:</label> <textarea v-model="itemPEP.pontuacoes.adequado.criterio" rows="2"></textarea>
                    <label>Adequado - Pontos:</label> <input type="number" step="0.01" v-model.number="itemPEP.pontuacoes.adequado.pontos">
                </div>
                <div class="form-group" v-if="itemPEP.pontuacoes.parcialmenteAdequado">
                    <label>Parcialmente Adequado - Critério:</label> <textarea v-model="itemPEP.pontuacoes.parcialmenteAdequado.criterio" rows="2"></textarea>
                    <label>Parcialmente Adequado - Pontos:</label> <input type="number" step="0.01" v-model.number="itemPEP.pontuacoes.parcialmenteAdequado.pontos">
                </div>
                <div v-if="itemPEP.pontuacoes.inadequado" class="form-group">
                    <label>Inadequado - Critério:</label> <textarea v-model="itemPEP.pontuacoes.inadequado.criterio" rows="2"></textarea>
                    <label>Inadequado - Pontos:</label> <input type="number" step="0.01" v-model.number="itemPEP.pontuacoes.inadequado.pontos">
                </div>
            </div>
             <button type="button" @click="removeFromArray(stationData.padraoEsperadoProcedimento.itensAvaliacao, pepIndex)" class="remove-button">Remover Item PEP</button>
        </div>
        <button type="button" @click="addPEPItem()" class="add-button">Adicionar Item ao PEP</button>
      </fieldset>

      <button type="submit" class="save-button" :disabled="isLoading">
        {{ isLoading ? 'Salvando...' : 'Salvar Alterações na Estação' }}
      </button>
    </form>
    <div v-else-if="!isAdmin && !isLoading">
        <p class="feedback error">Você não tem permissão para editar esta estação.</p>
    </div>
    <div v-else-if="!isLoading && !errorMessage && !stationData">
      <p class="feedback info">Nenhuma estação carregada ou ID inválido.</p>
    </div>
  </div>
</template>

<style scoped>
.edit-station-container {
  max-width: 900px;
  margin: 20px auto;
  padding: 25px;
  background-color: #fff;
  border-radius: 8px;
  box-shadow: 0 4px 15px rgba(0,0,0,0.1);
  font-family: 'Inter', sans-serif;
}
.edit-station-container h2 {
  text-align: center;
  color: #333;
  margin-bottom: 25px;
  font-size: 1.8em;
}
.station-id-display {
  font-size: 0.9em;
  color: #6c757d;
  margin-bottom: 20px;
  text-align: center;
  background-color: #f8f9fa;
  padding: 8px;
  border-radius: 4px;
}

.back-button {
  display: inline-block;
  margin-bottom: 20px;
  padding: 8px 15px;
  background-color: #6c757d;
  color: white;
  text-decoration: none;
  border-radius: 4px;
  font-size: 0.9em;
  border: none;
  cursor: pointer;
}
.back-button:hover {
  background-color: #5a6268;
}

.edit-form { display: flex; flex-direction: column; gap: 25px; }
.fieldset-group {
  border: 1px solid #dee2e6;
  padding: 25px;
  border-radius: 6px;
  margin-bottom: 25px;
  background-color: #fdfdfd;
}
legend {
  font-weight: 600;
  color: #007bff;
  padding: 0 10px;
  font-size: 1.3em;
  margin-bottom: 15px;
}
.sub-fieldset {
    border: 1px dashed #e0e0e0;
    padding: 15px;
    margin-top: 10px;
    margin-bottom: 15px;
    border-radius: 4px;
}
.sub-legend {
    display: block;
    font-weight: 600;
    color: #343a40;
    margin-bottom: 10px;
    font-size: 1.1em;
}

.form-group { display: flex; flex-direction: column; margin-bottom:18px }
.form-group label { margin-bottom: 8px; font-weight: 500; color: #495057; font-size: 0.95em; }
.form-group input[type="text"],
.form-group input[type="number"],
.form-group textarea {
  padding: 10px 12px;
  border: 1px solid #ced4da;
  border-radius: 4px;
  font-size: 1rem;
  color: #495057;
  background-color: #fff;
  transition: border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out;
  width: 100%; 
  box-sizing: border-box; 
}
.form-group input[type="text"]:focus,
.form-group input[type="number"]:focus,
.form-group textarea:focus {
  border-color: #80bdff;
  outline: 0;
  box-shadow: 0 0 0 0.2rem rgba(0, 123, 255, 0.25);
}
.form-group textarea { min-height: 80px; resize: vertical; }
.form-group small {
    font-size: 0.8rem;
    color: #6c757d;
    margin-top: 4px;
}

.array-item-editor {
  border: 1px solid #e0e0e0;
  padding: 15px;
  margin-bottom: 15px;
  border-radius: 4px;
  background-color: #f8f9fa;
}
.item-bloco {}

.array-item-editor-simple {
    display: flex;
    align-items: flex-start; 
    margin-bottom: 8px;
}
.array-item-editor-simple input[type="text"],
.array-item-editor-simple textarea {
    flex-grow: 1;
    margin-right: 8px;
}

.remove-button, .add-button {
  padding: 8px 15px;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9em;
  margin-top: 10px;
  transition: background-color 0.2s;
  align-self: flex-start;
}
.remove-button-small {
    padding: 6px 10px;
    font-size: 0.8em;
    background-color: #ef4444;
    color:white;
    border:none;
    border-radius:4px;
    cursor:pointer;
    margin-left: 5px;
    height: fit-content; 
}
.remove-button-small:hover { background-color: #dc2626; }
.add-button-small {
    padding: 6px 10px;
    font-size: 0.8em;
    background-color: #3b82f6;
    color:white;
    border:none;
    border-radius:4px;
    cursor:pointer;
    margin-top: 5px;
    display: inline-block; 
}
.add-button-small:hover { background-color: #2563eb; }

.remove-button { background-color: #dc3545; margin-left: 10px; align-self: flex-end; } 
.remove-button:hover { background-color: #c82333; }
.add-button { background-color: #007bff; }
.add-button:hover { background-color: #0056b3; }

.save-button {
  padding: 12px 25px;
  background-color: #28a745;
  color: white;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-size: 1.1em;
  font-weight: bold;
  transition: background-color 0.2s;
  align-self: center;
  margin-top: 20px;
}
.save-button:hover { background-color: #218838; }
.save-button:disabled { background-color: #aaa; cursor: not-allowed; }

.feedback { padding: 1rem; margin-top: 1rem; margin-bottom: 1rem; border-radius: 6px; font-weight: 500; text-align: center; line-height: 1.5; border-width: 1px; border-style: solid;}
.feedback.error { background-color: #f8d7da; color: #721c24; border-color: #f5c6cb; }
.feedback.loading { background-color: #d1ecf1; color: #0c5460; border-color: #bee5eb; }
.feedback.success { background-color: #d4edda; color: #155724; border-color: #c3e6cb; }
</style>