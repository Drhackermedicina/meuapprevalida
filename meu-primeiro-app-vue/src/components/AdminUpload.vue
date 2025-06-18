<script setup>
import { ref, computed, watch } from 'vue';
console.log('Script Setup Executed - Admin Upload');

import { db } from '../firebaseConfig'; 
import { collection, addDoc, serverTimestamp } from "firebase/firestore"; 

const activeTab = ref('manualCreate');

const nomeArquivo = ref('');
const estacaoCarregadaDoJson = ref(null);
const mensagemStatusUpload = ref('');
const tipoMensagemUpload = ref('info');
const estaProcessandoUpload = ref(false);
const fileInputRef = ref(null);

function getInitialFormNovaEstacao() {
  return {
    idEstacao: '',
    tituloEstacao: '',
    numeroDaEstacao: null, // CAMPO PARA ORDENAÇÃO NUMÉRICA
    especialidade: '',
    tempoDuracaoMinutos: 10,
    palavrasChave: '',
    nivelDificuldade: 'Médio',
    cenarioAtendimento_nivelAtencao: 'atenção primária à saúde',
    cenarioAtendimento_tipoAtendimento: 'ambulatorial',
    cenarioAtendimento_infraestruturaUnidade: '',
    descricaoCasoCompleta: '',
    tarefasPrincipais: '',
    avisosImportantes: '',
    informacoesVerbaisSimulado: [{ contextoOuPerguntaChave: '', informacao: '' }],
    impressos: [{ idImpresso: `imp_${Date.now()}_1`, tituloImpresso: '', tipoConteudo: 'texto_simples', conteudo: { texto: ''} }],
    padraoEsperadoProcedimento: {
      idChecklistAssociado: '',
      sinteseEstacao: { resumoCasoPEP: '', focoPrincipalDetalhado: [''] },
      itensAvaliacao: [{
          idItem: `itempep_${Date.now()}_1`,
          itemNumeroOficial: '',
          descricaoItem: '',
          pontuacoes: {
              adequado: { criterio: 'Realizou corretamente e completamente.', pontos: 0 },
              parcialmenteAdequado: { criterio: 'Realizou parcialmente ou com pequenas falhas.', pontos: 0 },
              inadequado: { criterio: 'Não realizou ou realizou incorretamente.', pontos: 0 }
          }
      }],
      pontuacaoTotalEstacao: 0
    }
  };
}

const formNovaEstacao = ref(getInitialFormNovaEstacao());


function handleFileUpload(event) {
  mensagemStatusUpload.value = '';
  tipoMensagemUpload.value = 'info';
  estacaoCarregadaDoJson.value = null;
  nomeArquivo.value = '';
  const arquivo = event.target.files[0];

  if (!arquivo) {
    mensagemStatusUpload.value = 'Nenhum arquivo selecionado.';
    tipoMensagemUpload.value = 'erro';
    return;
  }
  nomeArquivo.value = arquivo.name;
  if (arquivo.type !== "application/json") {
    mensagemStatusUpload.value = `O arquivo "${arquivo.name}" não é do tipo JSON.`;
    tipoMensagemUpload.value = 'erro';
    limparInputArquivo();
    return;
  }
  const leitor = new FileReader();
  leitor.onload = (e) => {
    try {
      const dadosJson = JSON.parse(e.target.result);
      if (typeof dadosJson === 'object' && dadosJson !== null && !Array.isArray(dadosJson)) {
        estacaoCarregadaDoJson.value = dadosJson;
      } else if (Array.isArray(dadosJson) && dadosJson.length === 1) {
        estacaoCarregadaDoJson.value = dadosJson[0];
      } else {
        mensagemStatusUpload.value = `Erro: O arquivo JSON não contém um único objeto de estação.`;
        tipoMensagemUpload.value = 'erro';
        estacaoCarregadaDoJson.value = null;
        return;
      }
      mensagemStatusUpload.value = `Arquivo "${nomeArquivo.value}" carregado. Pronto para validação ou edição.`;
      tipoMensagemUpload.value = 'info';
      console.log("Objeto da Estação Carregada (JSON):", estacaoCarregadaDoJson.value);
    } catch (error) {
      mensagemStatusUpload.value = `Erro ao processar JSON: ${error.message}`;
      tipoMensagemUpload.value = 'erro';
      console.error("Erro no JSON:", error);
      estacaoCarregadaDoJson.value = null;
    }
  };
  leitor.onerror = () => {
    mensagemStatusUpload.value = `Erro ao tentar ler o arquivo "${nomeArquivo.value}".`;
    tipoMensagemUpload.value = 'erro';
    estacaoCarregadaDoJson.value = null;
  };
  leitor.readAsText(arquivo);
}

function validarEstruturaEstacao(estacao) {
  if (!estacao || typeof estacao !== 'object') {
    console.warn("Validação da estrutura falhou: dados da estação não são um objeto.", estacao);
    return false;
  }
  if (!estacao.idEstacao || typeof estacao.idEstacao !== 'string' || estacao.idEstacao.trim() === '') {
    console.warn("Validação da estrutura falhou: idEstacao ausente, inválido ou vazio.", estacao);
    return false;
  }
  if (!estacao.tituloEstacao || typeof estacao.tituloEstacao !== 'string' || estacao.tituloEstacao.trim() === '') {
    console.warn("Validação da estrutura falhou: tituloEstacao ausente, inválido ou vazio.", estacao);
    return false;
  }
  if (estacao.hasOwnProperty('numeroDaEstacao') && (typeof estacao.numeroDaEstacao !== 'number' || isNaN(estacao.numeroDaEstacao))) {
    console.warn("Validação: campo 'numeroDaEstacao' presente mas não é um número válido.", estacao);
    // Considerar se isso deve ser um erro fatal para o upload direto de JSON
    // Se o campo for opcional no JSON mas obrigatório no final, o processamento deve garantir um valor numérico.
  }
  console.log("Validação da estrutura passou (verificações básicas).");
  return true;
}

async function processarEstacaoDoJson() {
  if (!estacaoCarregadaDoJson.value) {
    mensagemStatusUpload.value = "Nenhum JSON carregado para processar.";
    tipoMensagemUpload.value = 'erro';
    return;
  }

  estaProcessandoUpload.value = true;
  mensagemStatusUpload.value = "Validando para salvamento direto...";
  tipoMensagemUpload.value = 'info';

  if (!validarEstruturaEstacao(estacaoCarregadaDoJson.value)) {
    mensagemStatusUpload.value = "Falha na validação da estrutura do JSON. Verifique o console para detalhes e se os campos 'idEstacao' e 'tituloEstacao' estão presentes e preenchidos.";
    tipoMensagemUpload.value = 'erro';
    estaProcessandoUpload.value = false;
    return;
  }

  const stationTitleForMessage = estacaoCarregadaDoJson.value.tituloEstacao || estacaoCarregadaDoJson.value.idEstacao || "Estação sem título/ID";
  mensagemStatusUpload.value = `Validado. Salvando "${stationTitleForMessage}" no Firestore...`;

  try {
    const estacoesColRef = collection(db, 'estacoes_clinicas');
    
    const dadosParaSalvar = {
      ...estacaoCarregadaDoJson.value, 
      numeroDaEstacao: Number(estacaoCarregadaDoJson.value.numeroDaEstacao) || 0, // Garante que é número, fallback para 0
      criadoEmTimestamp: serverTimestamp(), 
      atualizadoEmTimestamp: serverTimestamp() 
    };
    // Verifica se numeroDaEstacao é um número válido após a tentativa de conversão
    if (isNaN(dadosParaSalvar.numeroDaEstacao)) {
        console.warn("numeroDaEstacao resultou em NaN, usando 0 como padrão.", estacaoCarregadaDoJson.value.numeroDaEstacao);
        dadosParaSalvar.numeroDaEstacao = 0;
    }


    const docRef = await addDoc(estacoesColRef, dadosParaSalvar);
    
    mensagemStatusUpload.value = `Estação "${stationTitleForMessage}" salva com sucesso no Firestore! ID do Documento: ${docRef.id}`;
    tipoMensagemUpload.value = 'sucesso';
    console.log(`Estação salva no Firestore com ID: ${docRef.id}. Dados:`, dadosParaSalvar);
    
    estacaoCarregadaDoJson.value = null; 
    limparInputArquivo();
  } catch (error) {
    console.error("Erro CRÍTICO ao salvar estação do JSON no Firestore:", error);
    let detalheErro = error.message;
    if (error.code === 'permission-denied') {
        detalheErro += " (ERRO DE PERMISSÃO DO FIRESTORE - Verifique as regras de segurança e o UID do admin)";
    }
    mensagemStatusUpload.value = `Erro ao salvar estação no JSON no Firestore: ${detalheErro}`;
    tipoMensagemUpload.value = 'erro';
  } finally {
    estaProcessandoUpload.value = false;
  }
}

function limparInputArquivo() { if (fileInputRef.value) { fileInputRef.value.value = null; } nomeArquivo.value = ''; }

function mapJsonToFormData(jsonData) {
    const form = getInitialFormNovaEstacao();
    if (!jsonData) return form;

    form.idEstacao = jsonData.idEstacao || '';
    form.tituloEstacao = jsonData.tituloEstacao || '';
    form.numeroDaEstacao = typeof jsonData.numeroDaEstacao === 'number' ? jsonData.numeroDaEstacao : (parseInt(jsonData.numeroDaEstacao, 10) || null);
    form.especialidade = jsonData.especialidade || '';
    form.tempoDuracaoMinutos = jsonData.tempoDuracaoMinutos || 10;
    form.nivelDificuldade = jsonData.nivelDificuldade || 'Médio';

    if (Array.isArray(jsonData.palavrasChave)) {
        form.palavrasChave = jsonData.palavrasChave.join(', ');
    } else if (typeof jsonData.palavrasChave === 'string') {
        form.palavrasChave = jsonData.palavrasChave;
    } else {
        form.palavrasChave = '';
    }

    const ip = jsonData.instrucoesParticipante || jsonData.instrucoes_candidato || {};
    form.descricaoCasoCompleta = ip.descricaoCasoCompleta || ip.descricao_caso || (ip.cenario_atendimento && ip.cenario_atendimento.descricao_caso) || '';
    
    const tarefas = ip.tarefasPrincipais || ip.tarefas || [];
    form.tarefasPrincipais = Array.isArray(tarefas) ? tarefas.join('\n') : (tarefas || '');
    
    const avisos = ip.avisosImportantes || (ip.observacao_toque ? [ip.observacao_toque] : []) || [];
    form.avisosImportantes = Array.isArray(avisos) ? avisos.join('\n') : (avisos || '');

    const ca = ip.cenarioAtendimento || (ip.cenario_atendimento || {});
    form.cenarioAtendimento_nivelAtencao = ca.nivelAtencao || ca.nivel_atencao || getInitialFormNovaEstacao().cenarioAtendimento_nivelAtencao;
    form.cenarioAtendimento_tipoAtendimento = ca.tipoAtendimento || ca.tipo_atendimento || getInitialFormNovaEstacao().cenarioAtendimento_tipoAtendimento;
    const infra = ca.infraestruturaUnidade || ca.infraestrutura_unidade || [];
    form.cenarioAtendimento_infraestruturaUnidade = Array.isArray(infra) ? infra.join('; ') : (infra || '');
    
    const md = jsonData.materiaisDisponiveis || {};
    const orientacoesAtor = jsonData.orientacoes_ator || {};

    const informacoesVerbaisExistentes = md.informacoesVerbaisSimulado || orientacoesAtor.informacoes_gerais || [];
    if (Array.isArray(informacoesVerbaisExistentes) && informacoesVerbaisExistentes.length > 0) {
        form.informacoesVerbaisSimulado = informacoesVerbaisExistentes.map(info => ({
            contextoOuPerguntaChave: info.contextoOuPerguntaChave || (typeof info === 'string' ? 'Informação Geral' : (info.hasOwnProperty('informacao') ? '' : 'Contexto não especificado')),
            informacao: info.informacao || (typeof info === 'string' ? info : '')
        }));
    } else {
        form.informacoesVerbaisSimulado = getInitialFormNovaEstacao().informacoesVerbaisSimulado;
    }
    if (orientacoesAtor.perguntas_ao_candidato && Array.isArray(orientacoesAtor.perguntas_ao_candidato)) {
        orientacoesAtor.perguntas_ao_candidato.forEach(pergunta => {
            form.informacoesVerbaisSimulado.push({
                contextoOuPerguntaChave: orientacoesAtor.condicao_perguntas || "Perguntas do Ator ao Candidato",
                informacao: pergunta
            });
        });
    }

    if (Array.isArray(md.impressos) && md.impressos.length > 0) {
        form.impressos = md.impressos.map((imp, idx) => {
            const defaultConteudo = (type) => {
                if (type === 'texto_simples') return { texto: '' };
                if (type === 'imagem_com_texto') return { textoDescritivo: '', caminhoImagem: '', laudo: '' };
                if (type === 'lista_chave_valor_secoes') return { secoes: [{ tituloSecao: '', itens: [{ chave: '', valor: '' }] }] };
                return {};
            };
            const tipo = imp.tipoConteudo || 'texto_simples';
            let conteudo = defaultConteudo(tipo); 
            
            if(imp.conteudo){ 
                if (tipo === 'texto_simples') {
                    conteudo.texto = typeof imp.conteudo.texto === 'string' ? imp.conteudo.texto : '';
                } else if (tipo === 'imagem_com_texto') {
                    conteudo.textoDescritivo = typeof imp.conteudo.textoDescritivo === 'string' ? imp.conteudo.textoDescritivo : '';
                    conteudo.caminhoImagem = typeof imp.conteudo.caminhoImagem === 'string' ? imp.conteudo.caminhoImagem : '';
                    conteudo.laudo = typeof imp.conteudo.laudo === 'string' ? imp.conteudo.laudo : '';
                } else if (tipo === 'lista_chave_valor_secoes') {
                    conteudo.secoes = (Array.isArray(imp.conteudo.secoes) ? imp.conteudo.secoes : []).map(s => ({
                        tituloSecao: typeof s.tituloSecao === 'string' ? s.tituloSecao : '',
                        itens: (Array.isArray(s.itens) ? s.itens : []).map(i => ({ 
                            chave: typeof i.chave === 'string' ? i.chave : '',
                            valor: typeof i.valor === 'string' ? i.valor : '' 
                        })).filter(i => i.chave || i.valor)
                    })).filter(s => s.tituloSecao || s.itens.length > 0);
                    if(conteudo.secoes.length === 0) { 
                        conteudo.secoes = [{ tituloSecao: '', itens: [{chave: '', valor: ''}] }];
                    }
                } else { 
                    conteudo = JSON.parse(JSON.stringify(imp.conteudo)); 
                }
            }

            return {
                idImpresso: imp.idImpresso || `imp_loaded_${Date.now()}_${idx}`,
                tituloImpresso: imp.tituloImpresso || '',
                tipoConteudo: tipo,
                conteudo: conteudo
            };
        });
    } else {
        form.impressos = getInitialFormNovaEstacao().impressos;
    }
    if (form.impressos.length === 0) { 
        form.impressos.push(getInitialFormNovaEstacao().impressos[0] || { idImpresso: `imp_${Date.now()}_empty`, tituloImpresso: '', tipoConteudo: 'texto_simples', conteudo: { texto: '' } });
    }

    const jsonPep = jsonData.padraoEsperadoProcedimento || {};
    const orientacoesAvaliador = jsonData.orientacoes_avaliador_pep || jsonData.orientacoes_avaliador_geral || {};
    const defaultPepForm = getInitialFormNovaEstacao().padraoEsperadoProcedimento;

    form.padraoEsperadoProcedimento.idChecklistAssociado = jsonPep.idChecklistAssociado || '';
    
    const jsonSintese = jsonPep.sinteseEstacao || orientacoesAvaliador.sinteseEstacao || {};
    form.padraoEsperadoProcedimento.sinteseEstacao.resumoCasoPEP = jsonSintese.resumoCasoPEP || jsonSintese.resumo_caso_pep || jsonSintese.sintese_estacao || '';
    
    const focos = jsonSintese.focoPrincipalDetalhado || orientacoesAvaliador.objetivos_participante || [];
    form.padraoEsperadoProcedimento.sinteseEstacao.focoPrincipalDetalhado = (Array.isArray(focos) && focos.length > 0)
        ? focos.map(f => (typeof f === 'string' ? f : ''))
        : [''];

    const itensPepJson = jsonPep.itensAvaliacao || (orientacoesAvaliador.pep_definitivo && orientacoesAvaliador.pep_definitivo.itens_avaliacao) || [];
    if (Array.isArray(itensPepJson) && itensPepJson.length > 0) {
        form.padraoEsperadoProcedimento.itensAvaliacao = itensPepJson.map((item, idx) => {
            const pontuacoesJson = item.pontuacoes || item.pontuacao || {};
            return {
                idItem: item.idItem || `itempep_loaded_${Date.now()}_${idx}`,
                itemNumeroOficial: item.itemNumeroOficial || item.item_numero_oficial || '',
                descricaoItem: item.descricaoItem || item.descricao_completa || '',
                pontuacoes: {
                    adequado: { 
                        criterio: pontuacoesJson.adequado?.criterio || '', 
                        pontos: parseFloat(pontuacoesJson.adequado?.pontos) || 0 
                    },
                    parcialmenteAdequado: { 
                        criterio: pontuacoesJson.parcialmenteAdequado?.criterio || pontuacoesJson.parcialmente_adequado?.criterio || '', 
                        pontos: parseFloat(pontuacoesJson.parcialmenteAdequado?.pontos || pontuacoesJson.parcialmente_adequado?.pontos) || 0 
                    },
                    inadequado: { 
                        criterio: pontuacoesJson.inadequado?.criterio || '', 
                        pontos: parseFloat(pontuacoesJson.inadequado?.pontos) || 0 
                    }
                }
            };
        });
    } else {
        form.padraoEsperadoProcedimento.itensAvaliacao = defaultPepForm.itensAvaliacao;
    }
    if (form.padraoEsperadoProcedimento.itensAvaliacao.length === 0) {
        form.padraoEsperadoProcedimento.itensAvaliacao.push(defaultPepForm.itensAvaliacao[0] || { idItem: `itempep_${Date.now()}_empty`, itemNumeroOficial: '', descricaoItem: '', pontuacoes: { adequado: {criterio:'', pontos:0}, parcialmenteAdequado: {criterio:'', pontos:0}, inadequado: {criterio:'', pontos:0}} });
    }
    
    form.padraoEsperadoProcedimento.pontuacaoTotalEstacao = parseFloat(jsonPep.pontuacaoTotalEstacao || (orientacoesAvaliador.pep_definitivo && orientacoesAvaliador.pep_definitivo.pontuacao_total_estacao)) || calcularPontuacaoTotalPEP.value;

    return form;
}

function carregarJsonParaFormularioDeEdicao() {
    if (!estacaoCarregadaDoJson.value) {
        mensagemStatusUpload.value = "Nenhum arquivo JSON carregado para editar.";
        tipoMensagemUpload.value = 'erro';
        return;
    }
    try {
        formNovaEstacao.value = mapJsonToFormData(estacaoCarregadaDoJson.value);
        activeTab.value = 'manualCreate';
        mensagemStatusManual.value = `Dados do arquivo "${nomeArquivo.value}" carregados para edição. Revise e salve quando pronto.`;
        tipoMensagemManual.value = 'info';
        mensagemStatusUpload.value = ''; 
    } catch (error) {
        console.error("Erro ao mapear JSON para formulário:", error);
        mensagemStatusManual.value = "Ocorreu um erro ao tentar carregar os dados do JSON para o formulário de edição.";
        tipoMensagemManual.value = 'erro';
    }
}

const mensagemStatusManual = ref('');
const tipoMensagemManual = ref('info');
const estaSalvandoManualmente = ref(false);

watch(() => formNovaEstacao.value.impressos, (newImpressos, oldImpressos) => {
  if (!newImpressos) return;
  newImpressos.forEach((impresso, index) => {
    if (!impresso.conteudo) {
        impresso.conteudo = {};
    }
    
    let oldTipoConteudo = oldImpressos && oldImpressos[index] ? oldImpressos[index].tipoConteudo : undefined;
    const conteudoNaoCorrespondeAoTipo = 
        (impresso.tipoConteudo === 'texto_simples' && typeof impresso.conteudo.texto === 'undefined') ||
        (impresso.tipoConteudo === 'imagem_com_texto' && (typeof impresso.conteudo.caminhoImagem === 'undefined' || typeof impresso.conteudo.textoDescritivo === 'undefined' || typeof impresso.conteudo.laudo === 'undefined')) ||
        (impresso.tipoConteudo === 'lista_chave_valor_secoes' && typeof impresso.conteudo.secoes === 'undefined');

    if (impresso.tipoConteudo !== oldTipoConteudo || conteudoNaoCorrespondeAoTipo) {
        if (impresso.tipoConteudo === 'texto_simples') {
            impresso.conteudo = { texto: impresso.conteudo?.texto || '' };
        } else if (impresso.tipoConteudo === 'imagem_com_texto') {
            impresso.conteudo = { 
                textoDescritivo: impresso.conteudo?.textoDescritivo || '', 
                caminhoImagem: impresso.conteudo?.caminhoImagem || '', 
                laudo: impresso.conteudo?.laudo || '' 
            };
        } else if (impresso.tipoConteudo === 'lista_chave_valor_secoes') {
            const secoesExistentes = Array.isArray(impresso.conteudo?.secoes) ? impresso.conteudo.secoes : [];
            impresso.conteudo = { 
                secoes: secoesExistentes.length > 0 ? secoesExistentes.map(s => ({
                    tituloSecao: s.tituloSecao || '',
                    itens: (Array.isArray(s.itens) ? s.itens : []).map(i => ({chave: i.chave || '', valor: i.valor || ''}))
                })) 
                : [{ tituloSecao: '', itens: [{ chave: '', valor: ''}] }] 
            };
        }
    }
  });
}, { deep: true });

function adicionarInfoVerbal() { formNovaEstacao.value.informacoesVerbaisSimulado.push({ contextoOuPerguntaChave: '', informacao: '' });}
function removerInfoVerbal(index) {formNovaEstacao.value.informacoesVerbaisSimulado.splice(index, 1);}

function adicionarImpresso() {
  const novoIdImpresso = `imp_${Date.now()}_${formNovaEstacao.value.impressos.length + 1}`;
  formNovaEstacao.value.impressos.push({ idImpresso: novoIdImpresso, tituloImpresso: '', tipoConteudo: 'texto_simples', conteudo: { texto: '' } });
}
function removerImpresso(index) {formNovaEstacao.value.impressos.splice(index, 1);}

function adicionarItemAvaliacaoPEP() {
  const novoIdItemPEP = `itempep_${Date.now()}_${formNovaEstacao.value.padraoEsperadoProcedimento.itensAvaliacao.length + 1}`;
  formNovaEstacao.value.padraoEsperadoProcedimento.itensAvaliacao.push({
    idItem: novoIdItemPEP, itemNumeroOficial: '', descricaoItem: '',
    pontuacoes: { adequado: { criterio: 'Realizou corretamente e completamente.', pontos: 0 }, parcialmenteAdequado: { criterio: 'Realizou parcialmente ou com pequenas falhas.', pontos: 0 }, inadequado: { criterio: 'Não realizou ou realizou incorretamente.', pontos: 0 } }
  });
}
function removerItemAvaliacaoPEP(index) {formNovaEstacao.value.padraoEsperadoProcedimento.itensAvaliacao.splice(index, 1);}

function adicionarFocoPrincipalPEP() { formNovaEstacao.value.padraoEsperadoProcedimento.sinteseEstacao.focoPrincipalDetalhado.push('');}
function removerFocoPrincipalPEP(index) { formNovaEstacao.value.padraoEsperadoProcedimento.sinteseEstacao.focoPrincipalDetalhado.splice(index, 1); }

const calcularPontuacaoTotalPEP = computed(() => {
    let total = 0;
    if (formNovaEstacao.value?.padraoEsperadoProcedimento?.itensAvaliacao) {
        formNovaEstacao.value.padraoEsperadoProcedimento.itensAvaliacao.forEach(item => {
            if (item?.pontuacoes?.adequado && typeof item.pontuacoes.adequado.pontos === 'number') {
                total += item.pontuacoes.adequado.pontos;
            }
        });
    }
    return total;
});

watch(calcularPontuacaoTotalPEP, (newTotal) => {
    if (formNovaEstacao.value?.padraoEsperadoProcedimento) {
        formNovaEstacao.value.padraoEsperadoProcedimento.pontuacaoTotalEstacao = newTotal;
    }
}, { immediate: true });

function construirObjetoEstacao() {
  const pepForm = formNovaEstacao.value.padraoEsperadoProcedimento;
  const idEstacaoBase = formNovaEstacao.value.idEstacao.trim();

  const novaEstacao = {
    idEstacao: idEstacaoBase,
    tituloEstacao: formNovaEstacao.value.tituloEstacao.trim(),
    numeroDaEstacao: parseInt(formNovaEstacao.value.numeroDaEstacao, 10) || 0, // GARANTE QUE É NÚMERO
    especialidade: formNovaEstacao.value.especialidade.trim(),
    tempoDuracaoMinutos: parseInt(formNovaEstacao.value.tempoDuracaoMinutos, 10) || 10,
    palavrasChave: formNovaEstacao.value.palavrasChave.split(',').map(kw => kw.trim()).filter(kw => kw),
    nivelDificuldade: formNovaEstacao.value.nivelDificuldade,

    instrucoesParticipante: {
      cenarioAtendimento: {
        nivelAtencao: formNovaEstacao.value.cenarioAtendimento_nivelAtencao.trim(),
        tipoAtendimento: formNovaEstacao.value.cenarioAtendimento_tipoAtendimento.trim(),
        infraestruturaUnidade: formNovaEstacao.value.cenarioAtendimento_infraestruturaUnidade.split(';').map(inf => inf.trim()).filter(inf => inf),
      },
      descricaoCasoCompleta: formNovaEstacao.value.descricaoCasoCompleta.trim(),
      tarefasPrincipais: formNovaEstacao.value.tarefasPrincipais.split('\n').map(t => t.trim()).filter(t => t),
      avisosImportantes: formNovaEstacao.value.avisosImportantes.split('\n').map(a => a.trim()).filter(a => a),
    },

    materiaisDisponiveis: {
      impressos: formNovaEstacao.value.impressos.filter(
        imp => imp.idImpresso.trim() !== '' && imp.tituloImpresso.trim() !== ''
      ).map(imp => {
          let finalConteudo = {};
          const currentConteudo = imp.conteudo || {};
          if (imp.tipoConteudo === 'texto_simples') {
              finalConteudo = { texto: currentConteudo.texto?.trim() || '' };
          } else if (imp.tipoConteudo === 'imagem_com_texto') {
              finalConteudo = {
                  textoDescritivo: currentConteudo.textoDescritivo?.trim() || '',
                  caminhoImagem: currentConteudo.caminhoImagem?.trim() || '',
                  laudo: currentConteudo.laudo?.trim() || ''
              };
          } else if (imp.tipoConteudo === 'lista_chave_valor_secoes') {
              const secoesTratadas = (Array.isArray(currentConteudo.secoes) ? currentConteudo.secoes : []).map(sec => ({
                  tituloSecao: sec.tituloSecao?.trim() || '',
                  itens: (Array.isArray(sec.itens) ? sec.itens : []).map(it => ({
                      chave: it.chave?.trim() || '',
                      valor: it.valor?.trim() || ''
                  })).filter(it => it.chave || it.valor)
              })).filter(sec => sec.tituloSecao || sec.itens.length > 0);
              finalConteudo = { secoes: secoesTratadas.length > 0 ? secoesTratadas : [{ tituloSecao: '', itens: [{ chave: '', valor: ''}] }] };
          } else {
              finalConteudo = typeof currentConteudo === 'object' && currentConteudo !== null ? JSON.parse(JSON.stringify(currentConteudo)) : {};
          }
          return {
              idImpresso: imp.idImpresso.trim(),
              tituloImpresso: imp.tituloImpresso.trim(),
              tipoConteudo: imp.tipoConteudo,
              conteudo: finalConteudo
          };
      }),
      informacoesVerbaisSimulado: formNovaEstacao.value.informacoesVerbaisSimulado.filter(
        info => info.contextoOuPerguntaChave.trim() !== '' || info.informacao.trim() !== ''
      ).map(info => ({
          contextoOuPerguntaChave: info.contextoOuPerguntaChave.trim(),
          informacao: info.informacao.trim()
      })),
      perguntasAtorSimulado: []
    },

    padraoEsperadoProcedimento: {
      idChecklistAssociado: pepForm.idChecklistAssociado.trim() || `pep_${idEstacaoBase || Date.now()}`,
      sinteseEstacao: {
        resumoCasoPEP: pepForm.sinteseEstacao.resumoCasoPEP.trim(),
        focoPrincipalDetalhado: pepForm.sinteseEstacao.focoPrincipalDetalhado.map(f => f.trim()).filter(f => f)
      },
      itensAvaliacao: pepForm.itensAvaliacao.filter(
        item => item.idItem.trim() !== '' && item.descricaoItem.trim() !== ''
      ).map(item => ({
          idItem: item.idItem.trim(),
          itemNumeroOficial: item.itemNumeroOficial.trim(),
          descricaoItem: item.descricaoItem.trim(),
          pontuacoes: {
              adequado: { criterio: item.pontuacoes.adequado.criterio.trim(), pontos: parseFloat(item.pontuacoes.adequado.pontos) || 0 },
              parcialmenteAdequado: { criterio: item.pontuacoes.parcialmenteAdequado.criterio.trim(), pontos: parseFloat(item.pontuacoes.parcialmenteAdequado.pontos) || 0 },
              inadequado: { criterio: item.pontuacoes.inadequado.criterio.trim(), pontos: parseFloat(item.pontuacoes.inadequado.pontos) || 0 },
          }
      })),
      pontuacaoTotalEstacao: calcularPontuacaoTotalPEP.value
    }
  };

  if (novaEstacao.instrucoesParticipante.avisosImportantes && novaEstacao.instrucoesParticipante.avisosImportantes.length === 0) {
      delete novaEstacao.instrucoesParticipante.avisosImportantes;
  }
  if (novaEstacao.materiaisDisponiveis.perguntasAtorSimulado && novaEstacao.materiaisDisponiveis.perguntasAtorSimulado.length === 0) {
      delete novaEstacao.materiaisDisponiveis.perguntasAtorSimulado;
  }

  return novaEstacao;
}


async function salvarEstacaoManualmente() {
  estaSalvandoManualmente.value = true;
  mensagemStatusManual.value = 'Construindo e validando a estrutura da estação...';
  tipoMensagemManual.value = 'info';

  const novaEstacaoObjeto = construirObjetoEstacao();
  console.log("Objeto da Estação Construído para Salvar (Criação Manual):", JSON.parse(JSON.stringify(novaEstacaoObjeto)));

  if (!validarEstruturaEstacao(novaEstacaoObjeto)) {
    mensagemStatusManual.value = "Falha na validação da estrutura da estação criada manualmente. Verifique 'ID da Estação' e 'Título da Estação'.";
    tipoMensagemManual.value = 'erro';
    estaSalvandoManualmente.value = false;
    return;
  }
  if (typeof novaEstacaoObjeto.numeroDaEstacao !== 'number' || isNaN(novaEstacaoObjeto.numeroDaEstacao) || novaEstacaoObjeto.numeroDaEstacao <= 0) {
    mensagemStatusManual.value = "Erro de validação: O campo 'Número da Estação' deve ser um número válido e maior que zero.";
    tipoMensagemManual.value = 'erro';
    estaSalvandoManualmente.value = false;
    return;
  }

  if (!novaEstacaoObjeto.padraoEsperadoProcedimento?.itensAvaliacao?.length || novaEstacaoObjeto.padraoEsperadoProcedimento.itensAvaliacao.some(item => !item.idItem || !item.descricaoItem)) {
      mensagemStatusManual.value = "Erro de validação: O PEP (Checklist) deve conter pelo menos um item de avaliação com ID e Descrição preenchidos.";
      tipoMensagemManual.value = 'erro';
      estaSalvandoManualmente.value = false;
      return;
  }

  mensagemStatusManual.value = `Estação "${novaEstacaoObjeto.tituloEstacao}" pronta. Tentando salvar no Firestore...`;
  tipoMensagemManual.value = 'info';

  try {
    const estacoesColRef = collection(db, 'estacoes_clinicas');
    const dadosParaSalvarManual = {
      ...novaEstacaoObjeto,
      criadoEmTimestamp: serverTimestamp(),
      atualizadoEmTimestamp: serverTimestamp()
    };

    const docRef = await addDoc(estacoesColRef, dadosParaSalvarManual);

    mensagemStatusManual.value = `Estação "${novaEstacaoObjeto.tituloEstacao}" (ID Firestore: ${docRef.id}) salva com sucesso!`;
    tipoMensagemManual.value = 'sucesso';
    console.log(`Estação salva manualmente com ID Firestore: ${docRef.id}. Dados:`, dadosParaSalvarManual);
    
    // formNovaEstacao.value = getInitialFormNovaEstacao(); 
  } catch (error) {
    let detalheErro = error.message;
    if (error.code === 'permission-denied') {
        detalheErro += " (ERRO DE PERMISSÃO DO FIRESTORE - Verifique as regras de segurança e o UID do admin)";
    }
    mensagemStatusManual.value = `Erro ao salvar estação manualmente no Firestore: ${detalheErro}`;
    tipoMensagemManual.value = 'erro';
    console.error("Erro ao salvar manualmente no Firestore:", error);
  } finally {
    estaSalvandoManualmente.value = false;
  }
}

async function onBatchStationsJsonUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  let stations;
  try {
    const text = await file.text();
    stations = JSON.parse(text);
    if (!Array.isArray(stations)) throw new Error('O JSON deve ser um array de estações.');
  } catch (e) {
    mensagemStatusUpload.value = 'Arquivo JSON inválido ou formato incorreto.';
    tipoMensagemUpload.value = 'erro';
    return;
  }
  const estacoesColRef = collection(db, 'estacoes_clinicas');
  let sucesso = 0, falha = 0;
  for (const station of stations) {
    try {
      const dadosParaSalvar = {
        ...station,
        criadoEmTimestamp: serverTimestamp(),
        atualizadoEmTimestamp: serverTimestamp()
      };
      await addDoc(estacoesColRef, dadosParaSalvar);
      sucesso++;
    } catch (e) {
      falha++;
      console.error('Falha ao salvar estação:', station, e);
    }
  }
  mensagemStatusUpload.value = `Processo concluído: ${sucesso} estações salvas, ${falha} falharam.`;
  tipoMensagemUpload.value = falha === 0 ? 'sucesso' : 'erro';
}
</script>

<template>
  <div class="admin-upload-page">
    <h2>Gerenciamento de Estações Clínicas</h2>
    <div class="tab-navigation">
      <button @click="activeTab = 'uploadJson'" :class="['tab-button', { 'active': activeTab === 'uploadJson' }]">Carregar via Arquivo JSON</button>
      <button @click="activeTab = 'manualCreate'" :class="['tab-button', { 'active': activeTab === 'manualCreate' }]">Criar/Editar Estação Manualmente</button>
    </div>

    <div class="tab-content">
      <div v-if="activeTab === 'uploadJson'" class="upload-json-section card">
        <h3>Carregar Estação Individual via Arquivo JSON</h3>
        <p>Selecione um arquivo <code>.json</code> contendo os dados de uma única estação clínica. Certifique-se de que o JSON inclui o campo <code>"numeroDaEstacao"</code> (numérico) para ordenação correta.</p>
        <div class="upload-box-internal">
          <label for="json-file-input" class="custom-file-upload-label-internal">
            <span v-if="!nomeArquivo">Clique para selecionar o arquivo JSON</span>
            <span v-else>Arquivo selecionado: {{ nomeArquivo }}</span>
          </label>
          <input id="json-file-input" type="file" @change="handleFileUpload" accept=".json" ref="fileInputRef"/>
        </div>
        <div v-if="estacaoCarregadaDoJson" class="json-actions">
            <button @click="processarEstacaoDoJson" :disabled="estaProcessandoUpload" class="process-button-internal">
              <span v-if="estaProcessandoUpload && mensagemStatusUpload.includes('Salvando')">Salvando...</span>
              <span v-else>Validar e Salvar JSON Diretamente</span>
            </button>
            <button @click="carregarJsonParaFormularioDeEdicao" class="edit-button-internal">
              Carregar para Edição Manual
            </button>
        </div>
        <div v-if="mensagemStatusUpload" :class="['status-message-internal', tipoMensagemUpload]">{{ mensagemStatusUpload }}</div>
        <div v-if="estacaoCarregadaDoJson && !estaProcessandoUpload" class="preview-section-internal">
          <h4>Prévia da Estação Carregada do JSON:</h4>
          <p><strong>ID da Estação (do JSON):</strong> {{ estacaoCarregadaDoJson.idEstacao }}</p>
          <p><strong>Título:</strong> {{ estacaoCarregadaDoJson.tituloEstacao }}</p>
          <p><strong>Número (ordenação):</strong> {{ estacaoCarregadaDoJson.numeroDaEstacao }}</p>
          <p><strong>Especialidade:</strong> {{ estacaoCarregadaDoJson.especialidade }}</p>
          <details>
            <summary>Ver mais dados do JSON (estrutura crua)</summary>
            <pre>{{ JSON.stringify(estacaoCarregadaDoJson, null, 2) }}</pre>
          </details>
        </div>
      </div>

      <div v-if="activeTab === 'manualCreate'" class="manual-create-section card">
        <h3>Criar ou Editar Nova Estação Manualmente</h3>
        <form @submit.prevent="salvarEstacaoManualmente" class="manual-form">
          <h4>Dados Gerais da Estação</h4>
          <div class="form-group"><label for="manualIdEstacao">ID da Estação (identificador único para o conteúdo, ex: cardio_iam_001):</label><input type="text" id="manualIdEstacao" v-model="formNovaEstacao.idEstacao" required placeholder="Ex: cardio_iam_001"></div>
          <div class="form-group"><label for="manualTituloEstacao">Título da Estação (como aparecerá na lista):</label><input type="text" id="manualTituloEstacao" v-model="formNovaEstacao.tituloEstacao" required placeholder="Ex: Atendimento ao Paciente com Dor Torácica Aguda"></div>
          
          <div class="form-group">
            <label for="manualNumeroDaEstacao">Número da Estação (para ordenação numérica):</label>
            <input type="number" id="manualNumeroDaEstacao" v-model.number="formNovaEstacao.numeroDaEstacao" required min="1" placeholder="Ex: 1, 2, 10">
          </div>

          <div class="form-group"><label for="manualEspecialidade">Especialidade (Área):</label><input type="text" id="manualEspecialidade" v-model="formNovaEstacao.especialidade" required placeholder="Ex: Cardiologia, Clínica Médica"></div>
          <div class="form-group"><label for="manualTempoDuracaoMinutos">Tempo de Duração (minutos):</label><input type="number" id="manualTempoDuracaoMinutos" v-model.number="formNovaEstacao.tempoDuracaoMinutos" min="1" required></div>
          <div class="form-group"><label for="manualPalavrasChave">Palavras-Chave (separadas por vírgula):</label><input type="text" id="manualPalavrasChave" v-model="formNovaEstacao.palavrasChave" placeholder="Ex: infarto, ECG, anamnese, dor precordial"></div>
          <div class="form-group"><label for="manualNivelDificuldade">Nível de Dificuldade:</label><select id="manualNivelDificuldade" v-model="formNovaEstacao.nivelDificuldade"><option>Fácil</option><option>Médio</option><option>Difícil</option></select></div>

          <h4>Instruções para o Participante (Candidato)</h4>
          <div class="form-group"><label for="manualDescricaoCaso">Descrição Completa do Caso para o Candidato:</label><textarea id="manualDescricaoCaso" v-model="formNovaEstacao.descricaoCasoCompleta" rows="5" required placeholder="Descreva o cenário clínico que o candidato encontrará..."></textarea></div>
          <div class="form-group"><label for="manualTarefasPrincipais">Tarefas Principais do Candidato (uma por linha):</label><textarea id="manualTarefasPrincipais" v-model="formNovaEstacao.tarefasPrincipais" rows="4" required placeholder="Ex: Realizar anamnese completa.&#10;Interpretar o ECG.&#10;Propor conduta inicial."></textarea></div>
          <div class="form-group"><label for="manualAvisosImportantes">Avisos Importantes para o Candidato (um por linha, opcional):</label><textarea id="manualAvisosImportantes" v-model="formNovaEstacao.avisosImportantes" rows="3" placeholder="Ex: O paciente simulado pode apresentar instabilidade.&#10;Comunique-se de forma clara e objetiva com o paciente e/ou acompanhante."></textarea></div>

          <h4>Cenário de Atendimento (Visível para o Candidato)</h4>
          <div class="form-group"><label for="manualNivelAtencao">Nível de Atenção:</label><input type="text" id="manualNivelAtencao" v-model="formNovaEstacao.cenarioAtendimento_nivelAtencao" placeholder="Ex: atenção primária, secundária, terciária"></div>
          <div class="form-group"><label for="manualTipoAtendimento">Tipo de Atendimento:</label><input type="text" id="manualTipoAtendimento" v-model="formNovaEstacao.cenarioAtendimento_tipoAtendimento" placeholder="Ex: ambulatorial, emergência, enfermaria"></div>
          <div class="form-group"><label for="manualInfraestrutura">Infraestrutura da Unidade Disponível (separar por ponto e vírgula ";"):</label><textarea id="manualInfraestrutura" v-model="formNovaEstacao.cenarioAtendimento_infraestruturaUnidade" rows="3" placeholder="Ex: maca; monitor cardíaco; acesso venoso periférico; materiais para intubação"></textarea></div>

          <h4>Roteiro do Ator / Informações Verbais (para o Ator/Avaliador)</h4>
          <div v-for="(info, index) in formNovaEstacao.informacoesVerbaisSimulado" :key="'infoVerbal-'+index" class="dynamic-item-group">
            <h5>Informação Verbal {{ index + 1 }}</h5>
            <div class="form-group">
              <label :for="'infoVerbalContexto' + index">Contexto ou Pergunta-Chave do Candidato:</label>
              <input type="text" :id="'infoVerbalContexto' + index" v-model="info.contextoOuPerguntaChave" placeholder="Ex: Se o candidato perguntar sobre alergias...">
            </div>
            <div class="form-group">
              <label :for="'infoVerbalInformacao' + index">Informação a ser Fornecida pelo Ator:</label>
              <textarea :id="'infoVerbalInformacao' + index" v-model="info.informacao" rows="2" placeholder="Ex: Diga que o paciente é alérgico à penicilina."></textarea>
            </div>
            <button type="button" @click="removerInfoVerbal(index)" class="remove-item-button">Remover Informação Verbal</button>
          </div>
          <button type="button" @click="adicionarInfoVerbal" class="add-item-button">+ Adicionar Informação Verbal</button>

          <h4>Materiais Disponíveis (Impressos a serem liberados pelo Ator/Avaliador)</h4>
          <div v-for="(impresso, index) in formNovaEstacao.impressos" :key="impresso.idImpresso" class="dynamic-item-group">
            <h5>Impresso {{ index + 1 }}</h5>
            <div class="form-group">
              <label :for="'impressoId' + index">ID do Impresso (único, ex: ecg_inicial):</label>
              <input type="text" :id="'impressoId' + index" v-model="impresso.idImpresso" required>
            </div>
            <div class="form-group">
              <label :for="'impressoTitulo' + index">Título do Impresso (Ex: ECG de 12 Derivações):</label>
              <input type="text" :id="'impressoTitulo' + index" v-model="impresso.tituloImpresso" required>
            </div>
            <div class="form-group">
              <label :for="'impressoTipoConteudo' + index">Tipo de Conteúdo do Impresso:</label>
              <select :id="'impressoTipoConteudo' + index" v-model="impresso.tipoConteudo">
                <option value="texto_simples">Texto Simples</option>
                <option value="imagem_com_texto">Imagem com Texto/Laudo</option>
                <option value="lista_chave_valor_secoes">Lista Chave-Valor (Exames)</option>
              </select>
            </div>

            <div v-if="impresso.tipoConteudo === 'texto_simples'" class="form-group">
                <label :for="'impressoConteudoTexto' + index">Conteúdo (texto):</label>
                <textarea :id="'impressoConteudoTexto' + index" v-model="impresso.conteudo.texto" rows="3" placeholder="Insira o texto do impresso aqui..."></textarea>
            </div>
            <div v-if="impresso.tipoConteudo === 'imagem_com_texto'">
                <div class="form-group"><label :for="'impressoConteudoImgDesc' + index">Texto Descritivo (opcional):</label><textarea :id="'impressoConteudoImgDesc' + index" v-model="impresso.conteudo.textoDescritivo" rows="2"></textarea></div>
                <div class="form-group"><label :for="'impressoConteudoImgPath' + index">Caminho/URL da Imagem:</label><input type="text" :id="'impressoConteudoImgPath' + index" v-model="impresso.conteudo.caminhoImagem" placeholder="https://exemplo.com/imagem.jpg"></div>
                <div class="form-group"><label :for="'impressoConteudoImgLaudo' + index">Laudo da Imagem (opcional):</label><textarea :id="'impressoConteudoImgLaudo' + index" v-model="impresso.conteudo.laudo" rows="3"></textarea></div>
            </div>
            <div v-if="impresso.tipoConteudo === 'lista_chave_valor_secoes'">
                <div v-for="(secao, secaoIndex) in impresso.conteudo.secoes" :key="secaoIndex" class="dynamic-item-group-nested">
                    <h5>Seção {{ secaoIndex + 1 }}</h5>
                    <div class="form-group"><label :for="'secaoTitulo' + index + '_' + secaoIndex">Título da Seção:</label><input type="text" :id="'secaoTitulo' + index + '_' + secaoIndex" v-model="secao.tituloSecao" placeholder="Ex: Hemograma"></div>
                    <div v-for="(itemSecao, itemSecaoIndex) in secao.itens" :key="itemSecaoIndex" class="dynamic-item-group-very-nested">
                        <input type="text" v-model="itemSecao.chave" placeholder="Chave (Ex: Hb)" style="flex-basis: 40%;">
                        <input type="text" v-model="itemSecao.valor" placeholder="Valor (Ex: 12.5 g/dL)" style="flex-basis: 40%;">
                        <button type="button" @click="secao.itens.splice(itemSecaoIndex, 1)" class="remove-item-button-small" style="flex-basis: auto;">X</button>
                    </div>
                    <button type="button" @click="secao.itens.push({chave: '', valor: ''})" class="add-item-button-small">+ Item na Seção</button>
                    <button type="button" @click="impresso.conteudo.secoes.splice(secaoIndex, 1)" class="remove-item-button" style="margin-top: 5px; float: right;">Remover Seção</button>
                </div>
                <button type="button" @click="impresso.conteudo.secoes.push({tituloSecao: '', itens: [{chave:'', valor:''}]})" class="add-item-button" style="clear:both; display:block;">+ Seção no Impresso</button>
            </div>
            <button type="button" @click="removerImpresso(index)" class="remove-item-button">Remover Impresso</button>
          </div>
          <button type="button" @click="adicionarImpresso" class="add-item-button">+ Adicionar Impresso</button>

          <h4>Padrão Esperado de Procedimento (PEP / Checklist para Avaliador)</h4>
          <div class="form-group"><label for="pepIdChecklist">ID do Checklist (Identificador único para este PEP):</label><input type="text" id="pepIdChecklist" v-model="formNovaEstacao.padraoEsperadoProcedimento.idChecklistAssociado" placeholder="Ex: pep_cardio_iam_001"></div>
          
          <div class="form-group">
            <label for="pepResumoCaso">Síntese da Estação - Resumo do Caso Clínico para o PEP:</label>
            <textarea id="pepResumoCaso" v-model="formNovaEstacao.padraoEsperadoProcedimento.sinteseEstacao.resumoCasoPEP" rows="3" placeholder="Breve resumo do caso para orientar o avaliador..."></textarea>
          </div>
          
          <div class="form-group">
            <label>Síntese da Estação - Foco Principal Detalhado do PEP (um por linha):</label>
            <div v-for="(foco, index) in formNovaEstacao.padraoEsperadoProcedimento.sinteseEstacao.focoPrincipalDetalhado" :key="'focoPep-' + index" class="foco-pep-item">
                <input type="text" v-model="formNovaEstacao.padraoEsperadoProcedimento.sinteseEstacao.focoPrincipalDetalhado[index]" :placeholder="'Foco principal ' + (index + 1) + ' da avaliação...'">
                <button type="button" @click="removerFocoPrincipalPEP(index)" class="remove-item-button-small" title="Remover Foco">X</button>
            </div>
            <button type="button" @click="adicionarFocoPrincipalPEP" class="add-item-button-small">+ Adicionar Foco Principal</button>
          </div>

          <h5>Itens de Avaliação do PEP</h5>
          <div v-for="(item, index) in formNovaEstacao.padraoEsperadoProcedimento.itensAvaliacao" :key="item.idItem" class="dynamic-item-group pep-item">
            <h6>Item de Avaliação {{ index + 1 }}</h6>
            <div class="form-group"><label :for="'pepItemId' + index">ID do Item (único no checklist, ex: anamnese_dor):</label><input type="text" :id="'pepItemId' + index" v-model="item.idItem" required></div>
            <div class="form-group"><label :for="'pepItemNumero' + index">Número Oficial do Item (Ex: 1.a, 2.1):</label><input type="text" :id="'pepItemNumero' + index" v-model="item.itemNumeroOficial" placeholder="Ex: 1.1"></div>
            <div class="form-group"><label :for="'pepItemDescricao' + index">Descrição do Item de Avaliação:</label><textarea :id="'pepItemDescricao' + index" v-model="item.descricaoItem" rows="2" required placeholder="Descreva o que deve ser avaliado..."></textarea></div>
            <fieldset class="pontuacoes-group">
                <legend>Critérios e Pontuações do Item</legend>
                <div><label :for="'pepItemAdequadoCriterio' + index">Critério - Adequado:</label><input type="text" :id="'pepItemAdequadoCriterio' + index" v-model="item.pontuacoes.adequado.criterio" placeholder="Ex: Realizou completamente e corretamente."><label :for="'pepItemAdequadoPontos' + index">Pontos:</label><input type="number" step="0.01" :id="'pepItemAdequadoPontos' + index" v-model.number="item.pontuacoes.adequado.pontos"></div>
                <div><label :for="'pepItemParcialCriterio' + index">Critério - Parcialmente Adequado:</label><input type="text" :id="'pepItemParcialCriterio' + index" v-model="item.pontuacoes.parcialmenteAdequado.criterio" placeholder="Ex: Realizou parcialmente ou com pequenas falhas."><label :for="'pepItemParcialPontos' + index">Pontos:</label><input type="number" step="0.01" :id="'pepItemParcialPontos' + index" v-model.number="item.pontuacoes.parcialmenteAdequado.pontos"></div>
                <div><label :for="'pepItemInadequadoCriterio' + index">Critério - Inadequado / Não Fez:</label><input type="text" :id="'pepItemInadequadoCriterio' + index" v-model="item.pontuacoes.inadequado.criterio" placeholder="Ex: Não realizou ou realizou incorretamente."><label :for="'pepItemInadequadoPontos' + index">Pontos:</label><input type="number" step="0.01" :id="'pepItemInadequadoPontos' + index" v-model.number="item.pontuacoes.inadequado.pontos"></div>
            </fieldset>
            <button type="button" @click="removerItemAvaliacaoPEP(index)" class="remove-item-button">Remover Item de Avaliação</button>
          </div>
          <button type="button" @click="adicionarItemAvaliacaoPEP" class="add-item-button">+ Adicionar Item de Avaliação</button>

          <div class="form-group pep-total-score-display">
              <label for="pepPontuacaoTotal">Pontuação Total Máxima da Estação (PEP):</label>
              <input type="number" step="0.01" id="pepPontuacaoTotal" v-model.number="formNovaEstacao.padraoEsperadoProcedimento.pontuacaoTotalEstacao" readonly title="Calculado automaticamente com base nos pontos 'Adequado' de cada item.">
              <span v-if="typeof calcularPontuacaoTotalPEP.value === 'number'">(Calculado: {{ calcularPontuacaoTotalPEP.value.toFixed(2) }})</span>
              <span v-else>(Calculado: N/A)</span>
          </div>

          <button type="submit" :disabled="estaSalvandoManualmente" class="save-manual-button">
            <span v-if="estaSalvandoManualmente">Salvando Estação...</span>
            <span v-else>Salvar Dados da Estação</span>
          </button>
          <div v-if="mensagemStatusManual" :class="['status-message-internal', tipoMensagemManual]" style="margin-top: 15px;">{{ mensagemStatusManual }}</div>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ... (estilos existentes do seu AdminUpload.vue) ... */
.admin-upload-page { max-width: 950px; margin: 20px auto; padding: 20px; font-family: 'Inter', sans-serif; }
.admin-upload-page h2 { text-align: center; color: #2c3e50; margin-bottom: 25px; font-weight: 600; }

.tab-navigation { display: flex; margin-bottom: 20px; border-bottom: 2px solid #dee2e6; }
.tab-button { padding: 12px 24px; cursor: pointer; border: none; background-color: transparent; font-size: 1.05em; font-weight: 500; color: #007bff; border-bottom: 3px solid transparent; margin-bottom: -2px; transition: color 0.2s ease-in-out, border-bottom-color 0.2s ease-in-out; }
.tab-button.active { color: #0056b3; border-bottom-color: #0056b3; font-weight: 600; }
.tab-button:hover:not(.active) { color: #0056b3; background-color: #f0f6ff; }

.tab-content .card { background-color: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
.tab-content .card h3 { margin-top: 0; color: #0056b3; border-bottom: 1px solid #eaeaea; padding-bottom: 12px; margin-bottom: 25px; font-weight: 600; }

.manual-form .form-group { margin-bottom: 20px; }
.manual-form label { display: block; margin-bottom: 6px; font-weight: 500; color: #34495e; font-size: 0.95em; }
.manual-form input[type="text"],
.manual-form input[type="number"],
.manual-form select,
.manual-form textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #ced4da;
  border-radius: 4px;
  box-sizing: border-box;
  font-size: 1em;
  transition: border-color 0.2s ease-in-out, box-shadow 0.2s ease-in-out;
}
.manual-form input[type="text"]:focus,
.manual-form input[type="number"]:focus,
.manual-form select:focus,
.manual-form textarea:focus {
  border-color: #007bff;
  box-shadow: 0 0 0 0.2rem rgba(0,123,255,.25);
  outline: none;
}
.manual-form textarea { resize: vertical; min-height: 80px; }
.manual-form h4 { margin-top: 35px; margin-bottom: 20px; color: #0056b3; border-bottom: 1px solid #e0e0e0; padding-bottom: 10px; font-weight: 600; font-size: 1.2em; }
.manual-form h5 { margin-top: 25px; margin-bottom: 15px; color: #17a2b8; font-weight: 500; font-size: 1.1em; }
.manual-form h6 { margin-top: 18px; margin-bottom: 12px; color: #28a745; font-weight: 500; font-size: 1.05em;}

.dynamic-item-group {
  background-color: #f9f9f9;
  border: 1px solid #e7e7e7;
  border-left: 4px solid #6c757d;
  border-radius: 5px;
  padding: 20px;
  margin-bottom: 25px;
  position: relative;
}
.dynamic-item-group h5, .dynamic-item-group h6 { margin-top: 0; }

.dynamic-item-group-nested {
  background-color: #f0f0f0;
  border: 1px solid #d0d0d0;
  border-left: 3px solid #17a2b8;
  padding: 15px;
  margin-top: 10px;
  margin-bottom: 10px;
  border-radius: 4px;
}
.dynamic-item-group-very-nested {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 5px;
  padding-left: 10px;
}
.dynamic-item-group-very-nested input[type="text"] {
  flex-grow: 1;
}


.pep-item { border-left-color: #28a745; }
.foco-pep-item { display: flex; align-items: center; margin-bottom: 8px; }
.foco-pep-item input[type="text"] { flex-grow: 1; margin-right: 8px; }

.add-item-button, .remove-item-button {
  border: none; padding: 8px 15px; border-radius: 4px; cursor: pointer; font-size: 0.9em; margin-top: 10px; transition: background-color 0.2s, transform 0.1s;
  font-weight: 500;
}
.add-item-button { background-color: #007bff; color: white; margin-bottom: 20px; display: inline-block; }
.remove-item-button { background-color: #dc3545; color: white; }

.dynamic-item-group > .remove-item-button {
  position: absolute;
  top: 15px;
  right: 15px;
  margin-top: 0;
  padding: 6px 10px;
}

.add-item-button:hover:not(:disabled) { background-color: #0056b3; transform: translateY(-1px); }
.remove-item-button:hover:not(:disabled) { background-color: #c82333; transform: translateY(-1px); }

.add-item-button-small, .remove-item-button-small {
  padding: 5px 10px; font-size: 0.85em; margin-left: 8px; border-radius: 3px;
  border: none; color: white; cursor: pointer;
}
.add-item-button-small { background-color: #5cb85c; }
.remove-item-button-small { background-color: #fd7e14; }
.add-item-button-small:hover { background-color: #4cae4c;}
.remove-item-button-small:hover { background-color: #e6690b;}


.pontuacoes-group { border: 1px solid #ced4da; padding: 15px; margin-top:15px; border-radius: 4px; background-color: #fff; }
.pontuacoes-group legend { font-size: 1em; font-weight: 500; padding: 0 8px; color: #495057; margin-bottom: 10px;}
.pontuacoes-group > div { margin-bottom: 12px; display: grid; grid-template-columns: auto 1fr auto 80px; gap: 8px 12px; align-items: center;}
.pontuacoes-group > div > label:first-child { font-weight:normal; font-size:0.9em; color: #495057;}
.pontuacoes-group > div > label:nth-of-type(2) { font-weight:normal; font-size:0.9em; justify-self: end; color: #495057;}
.pontuacoes-group input[type="text"], .pontuacoes-group input[type="number"] { font-size: 0.95em; padding: 8px 10px;}

.pep-total-score-display { margin-top: 20px; padding-top:15px; border-top: 1px solid #eee;}
.pep-total-score-display label { font-weight: 600; }
.pep-total-score-display input[type="number"] { background-color: #e9ecef; cursor: not-allowed; width: auto; display: inline-block; max-width:100px; margin-right: 10px;}
.pep-total-score-display span { font-size: 0.9em; color: #495057;}


.save-manual-button { display: block; width: 100%; padding: 14px; font-size: 1.15em; font-weight: 600; color: white; background-color: #17a2b8; border: none; border-radius: 5px; cursor: pointer; margin-top: 30px; transition: background-color 0.2s, transform 0.1s; }
.save-manual-button:hover:not(:disabled) { background-color: #138496; transform: translateY(-1px); }
.save-manual-button:disabled { background-color: #adb5bd; cursor: not-allowed; }

.status-message-internal { margin-top: 20px; padding: 15px; border-radius: 5px; font-weight: 500; border: 1px solid transparent; line-height: 1.5;}
.status-message-internal.info { background-color: #e6f7ff; color: #005f87; border-color: #91d5ff; }
.status-message-internal.sucesso { background-color: #f6ffed; color: #389e0d; border-color: #b7eb8f; }
.status-message-internal.erro { background-color: #fff1f0; color: #cf1322; border-color: #ffa39e; }

.json-actions { margin-top: 15px; display: flex; gap: 10px; flex-wrap: wrap; }
.json-actions .process-button-internal, .json-actions .edit-button-internal { flex-grow: 1; min-width: 200px; }
.edit-button-internal {
  padding: 12px; font-size: 1.1em; font-weight: bold; color: white; background-color: #ffc107; 
  border: none; border-radius: 5px; cursor: pointer; transition: background-color 0.2s;
}
.edit-button-internal:hover:not(:disabled) { background-color: #e0a800; }


.upload-box-internal { border: 2px dashed #007bff; padding: 25px; text-align: center; margin-bottom: 25px; background-color: #f8f9fa; border-radius: 6px; transition: background-color 0.3s; }
.upload-box-internal:hover { background-color: #eef2f7; }
.custom-file-upload-label-internal { display: inline-block; padding: 12px 25px; font-size: 1em; font-weight: 500; color: #fff; background-color: #007bff; border-radius: 5px; cursor: pointer; transition: background-color 0.2s ease-in-out; }
.custom-file-upload-label-internal:hover { background-color: #0056b3; }
#json-file-input { display: none; }
.preview-section-internal { margin-top: 25px; padding: 20px; background-color: #f9f9f9; border: 1px solid #e0e0e0; border-radius: 5px; }
.preview-section-internal h4 { margin-top: 0; color: #333; font-weight: 600; }
.preview-section-internal p { margin-bottom: 8px; color: #555; }
.preview-section-internal p strong { color: #333; }
.preview-section-internal details { margin-top: 10px; }
.preview-section-internal pre { background-color: #e9ecef; padding: 10px; border-radius: 4px; max-height: 300px; overflow: auto;}

</style>
