// Arquivo: src/main.js (CONFIRMADO DENTRO DE SRC)

import { createApp } from 'vue'

// Assumindo que todos estão dentro de SRC ou subpastas
import './style.css'                 // Caminho CORRETO (style.css está em src)
import App from './App.vue'             // Caminho CORRETO (App.vue está em src)
import router from './router'         // Caminho CORRETO (router está em src/router)
import { currentUser } from './authStore.js'; // Caminho CORRETO (authStore.js está em src)
import { auth } from './firebaseConfig.js' // Caminho CORRETO (firebaseConfig.js está em src)

import { onAuthStateChanged } from 'firebase/auth'

// Variável para garantir que o app só seja montado uma vez
let appInstance = null;

// Configura o "vigia" AQUI, antes de montar o app
const unsubscribe = onAuthStateChanged(auth, (user) => {
  console.log("src/main.js - onAuthStateChanged disparado. Usuário:", user ? user.email : 'Nenhum');

  // Atualiza o estado global diretamente
  if (user) {
    currentUser.value = {
      uid: user.uid,
      email: user.email
    };
  } else {
    currentUser.value = null;
  }

  // Só cria e monta a instância do Vue DEPOIS que onAuthStateChanged rodou pela primeira vez
  if (!appInstance) {
    console.log("Estado inicial de autenticação resolvido. Montando App Vue...");
    appInstance = createApp(App);
    appInstance.use(router);
    appInstance.mount('#app');
  }

  // unsubscribe(); // Opcional
});