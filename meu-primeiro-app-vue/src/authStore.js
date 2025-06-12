// Arquivo: src/authStore.js

import { ref } from 'vue';
import { auth } from './firebaseConfig.js'; // Certifique-se que este caminho está correto
import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";

// currentUser é uma variável reativa que armazena o objeto do usuário logado ou null
export const currentUser = ref(null);

// onAuthStateChanged observa as mudanças no estado de login do Firebase.
// Esta função é chamada automaticamente quando o usuário faz login, logout,
// ou quando o estado de autenticação é verificado na inicialização do app.
onAuthStateChanged(auth, async (user) => { // Tornar a função 'async' para poder usar 'await'
  if (user) {
    // Usuário está logado
    currentUser.value = user; // Atualiza a ref com o objeto do usuário
    console.log('[authStore.js] Usuário LOGADO:', user.email, user.uid);

    // ADIÇÃO CRÍTICA PARA DEPURAR: Forçar o refresh do token ID do usuário
    // Isso garante que o token enviado para a Cloud Function seja o mais recente e válido.
    try {
      const idTokenResult = await user.getIdTokenResult(true); // 'true' força o refresh
      console.log('[authStore.js] Token ID do usuário atualizado e claims:', idTokenResult.claims);
      // Opcional: Anexar os claims personalizados ao objeto currentUser se precisar deles no frontend
      currentUser.value.customClaims = idTokenResult.claims;
    } catch (error) {
      console.error('[authStore.js] Erro ao obter/atualizar ID Token:', error);
    }

  } else {
    // Usuário não está logado (fez logout ou nunca logou)
    currentUser.value = null; // Define a ref como null
    console.log('[authStore.js] Nenhum usuário LOGADO.');
  }
});

// Função para fazer logout
export async function signOutUser() { // Renomeado para signOutUser para evitar conflito com signOut do Firebase
  try {
    await firebaseSignOut(auth);
    // O onAuthStateChanged acima irá automaticamente atualizar currentUser.value para null
    console.log('[authStore.js] Usuário deslogado com sucesso.');
  } catch (error) {
    console.error('[authStore.js] Erro ao fazer logout:', error);
    // Você pode querer propagar o erro ou mostrar uma notificação para o usuário
    throw error; 
  }
}
