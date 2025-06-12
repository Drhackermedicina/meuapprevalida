// Arquivo: uploadFirestore.cjs
// Script para enviar UM arquivo JSON para o Firestore usando ADC (gcloud)

// Importa as bibliotecas necessárias (usando require por ser .cjs)
const admin = require('firebase-admin');
const fs = require('fs');

// --- CONFIGURAÇÕES ---
// Configurado para enviar o CHECKLIST da Estação 1

const dataFilePath = './estacao1_checklist.json'; // Arquivo a ser enviado (CHECKLIST)
const collectionName = 'checklists';              // Coleção de destino (CHECKLISTS)
const documentId = 'revalida_2024_2_estacao_1_pep'; // ID específico para este checklist

// --- FIM DAS CONFIGURAÇÕES ---

// Verifica se o arquivo de dados JSON existe
if (!fs.existsSync(dataFilePath)) {
  console.error(`ERRO: Arquivo de dados JSON não encontrado em: ${dataFilePath}`);
  console.error(`Certifique-se que o arquivo '${dataFilePath}' existe na mesma pasta que este script.`);
  process.exit(1); // Interrompe o script se o arquivo não existe
}

// Inicializa o Firebase Admin SDK usando Credenciais Padrão da Aplicação (ADC)
// Garanta que você rodou 'gcloud auth application-default login' no seu terminal antes!
try {
  admin.initializeApp();
  console.log('Firebase Admin SDK inicializado usando Credenciais Padrão (ADC).');
} catch (error) {
  console.error('
ERRO AO INICIALIZAR FIREBASE ADMIN SDK:');
  console.error(error.message);
  console.error("Verifique se você executou 'gcloud auth application-default login' com sucesso.");
  process.exit(1);
}

// Obtém referência ao Firestore
const db = admin.firestore();

// Função principal para fazer o upload
async function uploadJsonToFirestore() {
  try {
    // Lê o arquivo JSON
    console.log(`Lendo arquivo: ${dataFilePath}`);
    const fileContent = fs.readFileSync(dataFilePath, 'utf8');
    const jsonData = JSON.parse(fileContent); // Converte o texto em objeto JavaScript
    console.log('Arquivo JSON lido com sucesso.');

    // Define a referência da coleção
    const collectionRef = db.collection(collectionName);

    // Adiciona ou define o documento
    if (documentId) {
      // Usa .set() com o ID fornecido (sobrescreve se já existir)
      console.log(`Enviando para Coleção '${collectionName}', Documento '${documentId}'...`);
      await collectionRef.doc(documentId).set(jsonData);
      console.log(`SUCESSO! Documento '${documentId}' salvo/atualizado na coleção '${collectionName}'.`);
    } else {
      // Este 'else' não será usado com esta configuração, mas está aqui para referência
      // Usa .add() para gerar ID automático
      console.log(`Enviando para Coleção '${collectionName}' (ID automático)...`);
      const docRef = await collectionRef.add(jsonData);
      console.log(`SUCESSO! Documento salvo na coleção '${collectionName}' com ID: ${docRef.id}`);
    }

  } catch (error) {
    console.error(`ERRO ao processar/enviar o arquivo ${dataFilePath}:`);
     // Log mais detalhado do erro do Firestore
     if (error.code) {
       console.error(`Código do Erro Firestore: ${error.code}`);
     }
     console.error(error); // Log completo do erro
  }
}

// Executa a função
uploadJsonToFirestore();