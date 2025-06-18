// Script para promover um usuário a admin via Cloud Function
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';

// Configuração do seu Firebase (ajuste se necessário)
const firebaseConfig = {
  apiKey: "AIzaSyDuakOooHv9a5slO0I3o3gttSBlSXD0aWw",
  authDomain: "revalida-companion.firebaseapp.com",
  projectId: "revalida-companion",
  storageBucket: "revalida-companion.appspot.com",
  messagingSenderId: "772316263153",
  appId: "1:772316263153:web:d0af4ecc404b6ca16a2f50"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const functions = getFunctions(app, 'us-central1');

// Troque pelo UID do usuário que deseja promover
const targetUid = 'F8NOHX6eCxPORAf8x3faSq3Wy9D3';

async function setAdminRole() {
  // Faça login como admin principal antes de rodar este script!
  // Exemplo: await signInWithEmailAndPassword(auth, 'SEU_EMAIL_ADMIN', 'SUA_SENHA');
  const addAdminRole = httpsCallable(functions, 'addAdminRole');
  try {
    const result = await addAdminRole({ uid: targetUid });
    console.log(result.data);
  } catch (error) {
    console.error(error);
  }
}

setAdminRole();
