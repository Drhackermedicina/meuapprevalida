// src/firebaseConfig.js

import { initializeApp } from "firebase/app";
// Vamos importar também o que precisamos para Autenticação e Firestore
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Suas credenciais do Firebase
const firebaseConfig = {
  apiKey: "AIzaSyDIVtTrioEtvHXGCcvNATsxbYxZrUZhqng", // <<< SUA API KEY REAL AQUI
  authDomain: "appestacoes.firebaseapp.com",
  projectId: "appestacoes",
  storageBucket: "appestacoes.firebasestorage.app",
  messagingSenderId: "160232798179",
  appId: "1:160232798179:web:f9ce1140035c5f4ea312d6",
  measurementId: "G-1MLQKNX03Y" // Este é opcional
};

// Inicializa o Firebase com a sua configuração
const app = initializeApp(firebaseConfig);

// Inicializa os serviços de Autenticação e Firestore e os exporta
// para que outros arquivos do seu projeto possam usá-los
export const auth = getAuth(app);
export const db = getFirestore(app);

// Opcionalmente, você pode exportar a instância 'app' se precisar dela em algum outro lugar
export default app;