// Salve este código como seedStations.js na pasta do seu BACKEND (meu-revalida-backend)

import admin from 'firebase-admin';

// --- === DADOS DAS ESTAÇÕES (Extraídos do PDF Revalida 2024/2) === ---
// !!!!! VERIFIQUE E CORRIJA TODOS OS checklistDocId ABAIXO !!!!!
const stationsData = [
  // --- ESTAÇÃO 1: Dengue ---
  {
    _id: "revalida_2024_2_estacao_1", // ID do Documento no Firestore
    title: "Estação 1: Dengue (Revalida 2024/2)",
    area: "Clínica Médica",
    examSource: "Revalida INEP 2024/2",
    caseSummary: "Homem de 21 anos com queixa de febre e cefaleia há 4 dias, em um quadro de dengue sem sinais de alarme e sem condições especiais (grupo A).",
    checklistDocId: "VERIFIQUE_E_COLOQUE_O_ID_REAL_DO_CHECKLIST_1_AQUI", // Ex: "revalida_2024_2_estacao_1_pep"
    candidateTasks: [
      "Realizar atendimento adequado de um paciente com sintomas de dengue...",
      "Realizar exame físico específico, prova do laço...",
      "Interpretar os achados do exame físico e laboratorial adequadamente..."
    ],
    actorScriptHints: [], // TODO: Adicionar hints do PDF depois
    releasableData: [] // TODO: Adicionar dados liberáveis do PDF depois
  },
  // --- ESTAÇÃO 2: Oclusão Arterial Aguda ---
  {
    _id: "revalida_2024_2_estacao_2",
    title: "Estação 2: Oclusão Arterial Aguda (Revalida 2024/2)",
    area: "Cirurgia Geral",
    examSource: "Revalida INEP 2024/2",
    caseSummary: "Homem com 50 anos de idade, que procurou o serviço de emergência hospitalar devido à queixa de dor intensa súbita e constante - na perna esquerda, iniciada há cerca de 2 horas.",
    checklistDocId: "VERIFIQUE_E_COLOQUE_O_ID_REAL_DO_CHECKLIST_2_AQUI", // Ex: "revalida_2024_2_estacao_2_pep"
    candidateTasks: [
        "realizar o atendimento adequado de um paciente com dor intensa súbita e constante em MIE...",
        "realizar exame físico específico dos MMII...",
        "interpretar os achados dos exames físico e complementares adequadamente...",
        "propor plano de tratamento emergencial adequado ao caso..."
    ],
    actorScriptHints: [],
    releasableData: []
  },
  // --- ESTAÇÃO 3: Criptorquidia ---
  {
    _id: "revalida_2024_2_estacao_3",
    title: "Estação 3: Criptorquidia (Revalida 2024/2)",
    area: "Pediatria",
    examSource: "Revalida INEP 2024/2",
    caseSummary: "Lactente com 6 meses de idade, do sexo masculino, atendido em uma unidade básica de saúde por apresentar a bolsa escrotal vazia desde o nascimento.",
    checklistDocId: "VERIFIQUE_E_COLOQUE_O_ID_REAL_DO_CHECKLIST_3_AQUI", // Ex: "revalida_2024_2_estacao_3_pep"
    candidateTasks: [
        "Diagnosticar com base na história e exame físico a forma anatomopatológica de distopia testicular ou criptorquidia.",
        "Diagnosticar a fimose fisiológica e orientar a conduta adequada.",
        "Orientar a conduta adequada para as diferentes formas de distopia testicular...",
        "Encaminhar para atenção especializada o diagnóstico diferencial de Distúrbio do Desenvolvimento Sexual (DDS)..."
    ],
    actorScriptHints: [],
    releasableData: []
  },
  // --- ESTAÇÃO 4: Sangramento 2ª Metade Gestação ---
  {
    _id: "revalida_2024_2_estacao_4",
    title: "Estação 4: Sangramento 2ª Metade Gestação (Revalida 2024/2)",
    area: "Ginecologia e Obstetrícia",
    examSource: "Revalida INEP 2024/2",
    caseSummary: "Gestante com 36 anos de idade, com um quadro de sangramento na segunda metade da gestação.",
    checklistDocId: "VERIFIQUE_E_COLOQUE_O_ID_REAL_DO_CHECKLIST_4_AQUI", // Ex: "revalida_2024_2_estacao_4_pep"
    candidateTasks: [
        "conduzir um caso de sangramento na segunda metade da gravidez...",
        "realizar anamnese completa e mostrar intenção de realizar exame físico..."
    ],
    actorScriptHints: [],
    releasableData: []
  },
  // --- ESTAÇÃO 5: Acidente com Lagarta (Erucismo) ---
  {
    _id: "revalida_2024_2_estacao_5",
    title: "Estação 5: Acidente com Lagarta (Revalida 2024/2)",
    area: "Medicina da Família e Comunidade",
    examSource: "Revalida INEP 2024/2",
    caseSummary: "Mulher com 40 anos de idade que procurou atendimento na unidade básica de saúde com queixa de dor intensa em queimação na pele do braço direito.",
    checklistDocId: "VERIFIQUE_E_COLOQUE_O_ID_REAL_DO_CHECKLIST_5_AQUI", // Ex: "revalida_2024_2_estacao_5_pep"
    candidateTasks: [
        "ouvir a história do acidente da paciente e expressar o raciocínio clínico-epidemiológico;",
        "verbalizar o diagnóstico, incluindo o grau de risco de erucismo...",
        "estabelecer medidas urgentes de cuidado para o controle da dor...",
        "notificar o acidente com lagarta."
    ],
    actorScriptHints: [],
    releasableData: []
  },
  // --- ESTAÇÃO 6: AVC (NIHSS) ---
  {
    _id: "revalida_2024_2_estacao_6",
    title: "Estação 6: AVC - Escala NIHSS (Revalida 2024/2)",
    area: "Clínica Médica",
    examSource: "Revalida INEP 2024/2",
    caseSummary: "Homem com 58 anos de idade, que procurou o pronto atendimento hospitalar com suspeita de Acidente Vascular Cerebral (AVC) por apresentar déficit neurológico (hemiplegia E) e cefaleia, iniciados há cerca de 1 hora.",
    checklistDocId: "VERIFIQUE_E_COLOQUE_O_ID_REAL_DO_CHECKLIST_6_AQUI", // Ex: "revalida_2024_2_estacao_6_pep"
    candidateTasks: [
        "realizar um atendimento inicial ao paciente com suspeita de AVC;",
        "aplicar a escala NIHSS ao paciente de forma correta para o caso;",
        "totalizar a pontuação da escala NIHSS, verbalizando-a;",
        "solicitar exames complementares necessários frente a suspeita diagnóstica."
    ],
    actorScriptHints: [],
    releasableData: []
  },
   // --- ESTAÇÃO 7: Trauma Esplênico ---
  {
    _id: "revalida_2024_2_estacao_7",
    title: "Estação 7: Trauma Esplênico (Revalida 2024/2)",
    area: "Cirurgia Geral",
    examSource: "Revalida INEP 2024/2",
    caseSummary: "Paciente com 22 anos de idade com quadro de ruptura esplênica em 2 tempos, dor e sinais de choque hipovolêmico [...]. Sofreu um acidente com a queda de uma pia de concreto sobre o seu abdome há 2 dias.",
    checklistDocId: "VERIFIQUE_E_COLOQUE_O_ID_REAL_DO_CHECKLIST_7_AQUI", // Ex: "revalida_2024_2_estacao_7_pep"
    candidateTasks: [
      "comunicar-se adequadamente com o paciente...",
      "mobilizar o raciocínio clínico e solicitar os exames complementares pertinentes...",
      "correlacionar a anamnese, o exame físico e o resultado dos exames...",
      "definir a conduta inicial e o encaminhamento a ser dado ao paciente."
    ],
    actorScriptHints: [],
    releasableData: []
  },
  // --- ESTAÇÃO 8: Hipertensão Infantil ---
  {
    _id: "revalida_2024_2_estacao_8",
    title: "Estação 8: Hipertensão Infantil (Revalida 2024/2)",
    area: "Pediatria",
    examSource: "Revalida INEP 2024/2",
    caseSummary: "Criança do sexo feminino com 3 anos e 4 meses de idade, que foi com a sua mãe à unidade básica de saúde [...] para fazer a consulta de rotina [...] realizar a aferição da pressão arterial...",
    checklistDocId: "VERIFIQUE_E_COLOQUE_O_ID_REAL_DO_CHECKLIST_8_AQUI", // Ex: "revalida_2024_2_estacao_8_pep"
    candidateTasks: [
      "demonstrar o conhecimento básico das principais patologias, condições e fatores de risco...",
      "demonstrar o domínio da técnica de aferição da pressão arterial em crianças...",
      "ser capaz de classificar a pressão arterial obtida..."
    ],
    actorScriptHints: [],
    releasableData: []
  },
   // --- ESTAÇÃO 9: Violência Sexual ---
  {
    _id: "revalida_2024_2_estacao_9",
    title: "Estação 9: Violência Sexual (Revalida 2024/2)",
    area: "Ginecologia e Obstetrícia",
    examSource: "Revalida INEP 2024/2",
    caseSummary: "Mulher que procura o serviço de emergência ginecológica após sofrer violência sexual.",
    checklistDocId: "VERIFIQUE_E_COLOQUE_O_ID_REAL_DO_CHECKLIST_9_AQUI", // Ex: "revalida_2024_2_estacao_9_pep"
    candidateTasks: [
      "acolher e prestar atendimento à paciente em contexto de violência sexual;",
      "tranquilizando-a e orientando-a quanto a dispensa do boletim de ocorrência (BO)...",
      "orientar que registrar o BO é um direito da paciente.",
      "prescrever contracepção de emergência...",
      "orientar que, no contexto do caso clínico, não será necessário realizar vacinação;",
      "solicitar sorologias (HIV/ Anti HCV / HBS Ag / VDRL...);",
      "prescrever Ceftriaxona + Penicilina Benzatina + Azitromicina e antiretroviral...",
      "informar a necessidade de Notificação Compulsória...",
      "encaminhar a paciente para seguimento com equipe de Psicologia."
    ],
    actorScriptHints: [],
    releasableData: []
  },
   // --- ESTAÇÃO 10: DIP ---
  {
    _id: "revalida_2024_2_estacao_10",
    title: "Estação 10: Doença Inflamatória Pélvica (Revalida 2024/2)",
    area: "Medicina da Família e Comunidade",
    examSource: "Revalida INEP 2024/2",
    caseSummary: "Paciente de 21 anos que comparece à consulta devido a queixa de dor abdominal em hipogastro, há 1 semana, relatos de corrimento vaginal fétido com aspecto esverdeado e dores during a relação sexual.",
    checklistDocId: "VERIFIQUE_E_COLOQUE_O_ID_REAL_DO_CHECKLIST_10_AQUI", // Ex: "revalida_2024_2_estacao_10_pep"
    candidateTasks: [
      "conduzir a anamnese e conversar sobre sexualidade com a paciente...",
      "solicitar exames para doenças sexualmente transmissíveis...",
      "prescrever o tratamento para os três germes mais prevalentes (Gonococo... Clamidia... Anaeróbios...)",
      "explicar à paciente diagnóstico, tratamento e prevenção de IST.",
      "recomendar repouso e abstinência sexual..."
    ],
    actorScriptHints: [],
    releasableData: []
  }
];
// --- === FIM DOS DADOS DAS ESTAÇÕES === ---


// --- === LÓGICA DO SCRIPT PARA ADICIONAR/ATUALIZAR NO FIRESTORE === ---
async function seedFirestore() {
  console.log("Iniciando script para popular Firestore...");

  try {
    // Inicializa Firebase Admin SDK usando ADC
    // Garanta que você rodou 'gcloud auth application-default login' antes
    admin.initializeApp();
    const db = admin.firestore();
    console.log("Firebase Admin SDK inicializado com sucesso via ADC.");

    // Define a coleção alvo (usando PLURAL)
    const stationsCollection = db.collection('stations');
    console.log("Referência da coleção 'stations' obtida.");

    console.log(`\nIniciando escrita de ${stationsData.length} estações...`);

    // Cria um array de Promises para as operações de escrita
    const writePromises = stationsData.map(async (station) => {
      const { _id, ...dataToSave } = station; // Separa o ID do resto dos dados

      // Validação mínima dos dados no script
      if (!_id) {
        console.warn(`  -> [PULANDO] Estação sem _id definida no script: ${dataToSave.title || 'Título desconhecido'}`);
        return; // Pula esta estação
      }
      if (!dataToSave.title || !dataToSave.checklistDocId || dataToSave.checklistDocId.startsWith("VERIFIQUE")) {
         console.warn(`  -> [PULANDO] Estação '${_id}' (${dataToSave.title}) por faltar 'title' ou 'checklistDocId' VÁLIDO no script.`);
         return; // Pula esta estação
      }

      // Usa .set() com o ID especificado. Isso cria o documento se não existir,
      // ou sobrescreve completamente se já existir.
      // Usar { merge: true } poderia ser uma opção se você quisesse apenas atualizar campos.
      try {
        await stationsCollection.doc(_id).set(dataToSave);
        console.log(`  -> [OK] Estação '${_id}' (${dataToSave.title}) salva.`);
      } catch (writeError) {
        console.error(`  -> [ERRO] ao salvar estação '${_id}':`, writeError.message);
      }
    });

    // Espera todas as escritas terminarem
    await Promise.all(writePromises);

    console.log("\nProcesso de escrita concluído!");
    console.log("Verifique a coleção 'stations' no seu Console do Firebase.");

  } catch (error) {
    console.error("\n--- ERRO CRÍTICO DURANTE A EXECUÇÃO DO SCRIPT ---");
    console.error(error);
    if (error.message.includes('Could not load the default credentials')) {
        console.error("\n--> Certifique-se que você executou 'gcloud auth application-default login' com sucesso neste ambiente.");
    } else if (error.message.includes('7 PERMISSION_DENIED')) {
        console.error("\n--> Erro de PERMISSÃO. Verifique se a conta autenticada via 'gcloud login' tem permissão de escrita ('Cloud Datastore User', 'Editor' ou 'Owner') no Firestore deste projeto.");
    } else {
        console.error("\n--> Verifique a conexão com a internet e as configurações do Firebase.");
    }
    process.exit(1); // Sai com código de erro
  }
}

// Executa a função principal
seedFirestore();