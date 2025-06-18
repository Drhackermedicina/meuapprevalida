// Arquivo: functions/index.js

'use strict'; // Boas práticas para JavaScript

// Importa as bibliotecas necessárias para Firebase Functions v2 e Firebase Admin SDK
const { https } = require('firebase-functions/v2');
const admin = require('firebase-admin'); // Para interagir com o Firebase como administrador

// Inicializa o Firebase Admin SDK
// É importante que esta inicialização seja feita UMA ÚNICA VEZ
admin.initializeApp();

// --- Função para Atribuir o Papel de 'editor' a um Usuário ---
// Esta função é uma função HTTPS chamável (onCall) do Firebase Functions v2.
// Ela é chamada do seu frontend ou de um script administrativo.
exports.addEditorRole = https.onCall(
  {
    region: 'us-central1',
    // ADICIONE ESTA LINHA PARA FORÇAR A DESATIVAÇÃO DO APP CHECK
    enforceAppCheck: false, // Explicitamente desativa a aplicação do App Check para esta função
  },
  async (data, context) => {
    // 1. Verificar autenticação: Apenas usuários logados podem chamar esta função.
    // Se o contexto de autenticação (context.auth) for nulo, a requisição não é autenticada.
    if (!context.auth) {
      throw new https.HttpsError(
        'unauthenticated',
        'Apenas usuários autenticados podem atribuir papéis.'
      );
    }

    // ******** ADICIONE SEUS LOGS DE DEBUG AQUI ********
    console.log('[DEBUG-SERVER] addEditorRole: Iniciando execução interna.');
    console.log('[DEBUG-SERVER] addEditorRole: Conteúdo de data:', JSON.stringify(data));
    console.log('[DEBUG-SERVER] addEditorRole: UID do usuário autenticado:', context.auth.uid); // Este log é CRUCIAL
    console.log('[DEBUG-SERVER] addEditorRole: Claims do token do usuário:', JSON.stringify(context.auth.token));
    // *************************************************

    // 2. Verificar permissão do chamador: Apenas o administrador principal (com UID específico) pode atribuir papéis.
    const adminUID = 'zpJfB1NZjTO6FYTUZsIvrpSrp4g2'; // Substitua pelo seu UID de administrador principal

    // Se o UID do usuário que fez a chamada não corresponder ao UID do administrador, nega a permissão.
    if (context.auth.uid !== adminUID) {
      console.warn(`[Cloud Function] addEditorRole: Permissão negada para UID ${context.auth.uid}. Não é o administrador principal.`);
      throw new https.HttpsError(
        'permission-denied',
        'Apenas administradores podem atribuir papéis.'
      );
    }

    // 3. Validar os dados de entrada: O email do usuário é obrigatório.
    const email = data.email;
    if (!email) {
      throw new https.HttpsError(
        'invalid-argument',
        'O email do usuário é obrigatório.'
      );
    }

    try {
      // 4. Buscar o usuário pelo email no Firebase Authentication.
      const user = await admin.auth().getUserByEmail(email);
      console.log(`[DEBUG-SERVER] addEditorRole: Usuário encontrado para email ${email}: ${user.uid}`);

      // 5. Definir o Custom Claim 'editor: true' para o usuário.
      // Isso adiciona a propriedade 'editor: true' ao token de ID do usuário, permitindo o controle de acesso.
      await admin.auth().setCustomUserClaims(user.uid, { editor: true });
      console.log(`[DEBUG-SERVER] addEditorRole: Custom claim 'editor' definido para ${user.email}.`);

      // Loga o sucesso da operação no Cloud Logging.
      console.log(`[Cloud Function] Papel 'editor' atribuído a: ${user.email} (UID: ${user.uid})`);

      // Retorna uma mensagem de sucesso para o frontend.
      return {
        message: `O papel de 'editor' foi atribuído ao usuário ${email}.`,
        uid: user.uid
      };
    } catch (error) {
      // Captura e trata erros durante a execução da função.
      console.error('[Cloud Function] Erro ao adicionar papel de editor na operação:', error);
      // Erros específicos do Firebase Authentication (como usuário não encontrado) são tratados.
      if (error.code === 'auth/user-not-found') {
        throw new https.HttpsError(
          'not-found',
          'Usuário com o email fornecido não encontrado.'
        );
      }
      // Lança um erro genérico para outros problemas.
      throw new https.HttpsError(
        'internal', // Era 'unknown', 'internal' é mais apropriado para falha no backend
        'Falha ao adicionar papel de editor.',
        error.message
      );
    }
  }
);

// --- Função para Proteger a Rota /adminupload ---
// Esta é uma função HTTPS chamável (onCall) do Firebase Functions v2,
// que o seu frontend pode chamar para operações de upload administrativas.
exports.adminUpload = https.onCall(
  {
    region: 'us-central1',
    // ADICIONE ESTA LINHA PARA FORÇAR A DESATIVAÇÃO DO APP CHECK
    enforceAppCheck: false, // Explicitamente desativa a aplicação do App Check para esta função
  },
  async (data, context) => {
    // 1. Verificar autenticação: Apenas usuários logados podem chamar esta função.
    if (!context.auth) {
      throw new https.HttpsError(
        'unauthenticated',
        'Apenas usuários autenticados podem realizar uploads.'
      );
    }

    // ADIÇÃO DE LOGS PARA DEBUG AQUI TAMBÉM
    console.log('[DEBUG-SERVER] adminUpload: Iniciando execução interna.');
    console.log('[DEBUG-SERVER] adminUpload: UID do usuário autenticado:', context.auth.uid);
    console.log('[DEBUG-SERVER] adminUpload: Claims do token do usuário:', JSON.stringify(context.auth.token));

    // 2. Verificar permissão: Apenas usuários com o Custom Claim 'editor: true' ou 'admin: true'
    // podem acessar esta função.
    const userClaims = context.auth.token; // Acessa os claims do token de autenticação.
    if (userClaims.editor !== true && userClaims.admin !== true) {
      console.warn(`[Cloud Function] adminUpload: Permissão negada para UID ${context.auth.uid}. Claims: ${JSON.stringify(userClaims)}`);
      throw new https.HttpsError(
        'permission-denied',
        'Você não tem permissão para realizar esta operação de upload.'
      );
    }

    // 3. Obter o UID do usuário (para logs ou associações de dados).
    const uid = context.auth.uid;
    console.log(`[Cloud Function] Usuário ${uid} com permissão de upload para /adminupload.`);

    // TODO: Implemente sua lógica de upload aqui.
    // 'data' conterá os dados enviados pelo frontend (ex: nome do arquivo, conteúdo).

    // Retorna uma mensagem de sucesso após o processamento do upload.
    return { status: 'success', message: 'Upload processado com sucesso em /adminupload.' };
  }
);

// --- Função para Atribuir o Papel de 'admin' a um Usuário pelo UID ---
exports.addAdminRole = https.onCall(
  {
    region: 'us-central1',
    enforceAppCheck: false,
  },
  async (data, context) => {
    if (!context.auth) {
      throw new https.HttpsError(
        'unauthenticated',
        'Apenas usuários autenticados podem atribuir papéis.'
      );
    }

    const adminUID = 'zpJfB1NZjTO6FYTUZsIvrpSrp4g2';
    if (context.auth.uid !== adminUID) {
      throw new https.HttpsError(
        'permission-denied',
        'Apenas administradores podem atribuir papéis.'
      );
    }

    const targetUid = data.uid;
    if (!targetUid) {
      throw new https.HttpsError(
        'invalid-argument',
        'O UID do usuário é obrigatório.'
      );
    }

    try {
      await admin.auth().setCustomUserClaims(targetUid, { admin: true });
      return {
        message: `O papel de 'admin' foi atribuído ao usuário UID: ${targetUid}.`
      };
    } catch (error) {
      throw new https.HttpsError(
        'internal',
        'Falha ao adicionar papel de admin.',
        error.message
      );
    }
  }
);