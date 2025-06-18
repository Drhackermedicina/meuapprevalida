// src/firebaseConfig.js

import { initializeApp } from "firebase/app";
// Vamos importar também o que precisamos para Autenticação e Firestore
import { getAuth } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";

// Suas credenciais do Firebase
const firebaseConfig = {
  apiKey: "AIzaSyDuakOooHv9a5slO0I3o3gttSBlSXD0aWw", // <<< SUA API KEY REAL AQUI
  authDomain: "revalida-companion.firebaseapp.com",
  projectId: "revalida-companion",
  storageBucket: "revalida-companion.appspot.com", // Corrigido para .appspot.com
  messagingSenderId: "772316263153",
  appId: "1:772316263153:web:d0af4ecc404b6ca16a2f50" // Substitua pelo appId correto se necessário
};

// Inicializa o Firebase com a sua configuração
const app = initializeApp(firebaseConfig);

// Inicializa os serviços de Autenticação e Firestore e os exporta
// para que outros arquivos do seu projeto possam usá-los
export const auth = getAuth(app);
// Inicializa o Firestore apontando para o banco de dados 'estacoes'
export const db = initializeFirestore(app, { databaseId: 'estacoes' });

// Opcionalmente, você pode exportar a instância 'app' se precisar dela em algum outro lugar
export default app;