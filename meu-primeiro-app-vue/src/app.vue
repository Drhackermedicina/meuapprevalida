<script setup>
// --- Importações Essenciais ---
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { signOut } from "firebase/auth";
import { auth } from './firebaseConfig.js';
import { currentUser } from './authStore.js';
import { httpsCallable } from 'firebase/functions';
import { getFunctions } from 'firebase/functions';
import app from './firebaseConfig.js';

const router = useRouter();

// Refs para o formulário de atribuição de papel
const emailToGrantRole = ref('');
const grantRoleMessage = ref('');

// Instância do serviço de Cloud Functions
const functionsInstance = getFunctions(app, 'us-central1'); // Use a região da sua função

async function fazerLogout() {
  try {
    console.log("Tentando fazer logout...");
    await signOut(auth);
    console.log("Logout realizado com sucesso.");
    currentUser.value = null; // Limpar o currentUser no authStore também
    router.push('/login');
  } catch (error) {
    console.error("Erro ao fazer logout:", error);
    alert("Erro ao tentar sair. Tente novamente.");
  }
}

// Função para conceder papel de editor
async function grantEditorRole() {
  grantRoleMessage.value = ''; // Limpa mensagens anteriores
  if (!emailToGrantRole.value) {
    grantRoleMessage.value = 'Por favor, insira um email.';
    return;
  }

  // ADIÇÃO PARA DEBUG: Verifica o estado de currentUser no momento da chamada
  console.log("[FRONTEND] grantEditorRole: currentUser no momento da chamada:", currentUser.value);

  // Verifica se o usuário atual tem o UID de admin para poder chamar a função
  if (currentUser.value?.uid !== 'zpJfB1NZjTO6FYTUZsIvrpSrp4g2') {
    grantRoleMessage.value = 'Você não tem permissão para conceder acesso de edição.';
    alert('Você não tem permissão para conceder acesso de edição.');
    return;
  }

  const addEditorRoleCallable = httpsCallable(functionsInstance, 'addEditorRole');
  try {
    const result = await addEditorRoleCallable({ email: emailToGrantRole.value });
    grantRoleMessage.value = result.data.message;
    emailToGrantRole.value = ''; // Limpa o campo após sucesso
    console.log(result.data.message);
  } catch (error) {
    console.error('Erro ao chamar addEditorRole:', error);
    grantRoleMessage.value = `Erro ao conceder acesso: ${error.message}`;
    alert(`Erro ao conceder acesso: ${error.message}`);
  }
}
</script>

<template>
  <div id="app-layout">
    <header class="app-header">
      <div class="header-content">
        <h1>App Revalida 2ª Fase</h1>
        <nav class="app-nav">
          <router-link to="/">Home</router-link>

          <span v-if="!currentUser" class="auth-links">
            <router-link to="/login">Login</router-link>
            <router-link to="/register">Registro</router-link>
          </span>

          <span v-if="currentUser" class="user-session-links">
            <span class="welcome-message">Bem-vindo, {{ currentUser.email }}</span>
            <router-link to="/stations">Estações</router-link>

            <router-link v-if="currentUser.uid === 'zpJfB1NZjTO6FYTUZsIvrpSrp4g2'" to="/admin/upload">Upload (Admin)</router-link>

            <div v-if="currentUser.uid === 'zpJfB1NZjTO6FYTUZsIvrpSrp4g2'" class="admin-access-grant">
                <input
                    type="email"
                    v-model="emailToGrantRole"
                    placeholder="Email do usuário para Editor"
                    class="email-input"
                />
                <button @click="grantEditorRole" class="grant-button">Conceder Editor</button>
                <p v-if="grantRoleMessage" :class="{'success-message': grantRoleMessage.includes('sucesso'), 'error-message': grantRoleMessage.includes('Erro')}">{{ grantRoleMessage }}</p>
            </div>

            <button @click="fazerLogout" class="logout-button">Logout</button>
          </span>
        </nav>
      </div>
    </header>

    <main class="app-main">
      <router-view />
    </main>

    <footer class="app-footer">
      <p>© {{ new Date().getFullYear() }} App Revalida. Todos os direitos reservados.</p>
    </footer>
  </div>
</template>

<style scoped>
#app-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.app-header {
  background-color: #FFFFFF;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid #DEE2E6;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.header-content {
  max-width: 1100px;
  margin: 0 auto;
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
}

.app-header h1 {
  font-size: 1.5rem;
  color: #343A40;
  margin: 0;
  margin-right: 1rem;
}

.app-nav {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
}

.app-nav a,
.app-nav .welcome-message,
.app-nav .logout-button {
  font-weight: 500;
  color: #495057;
  text-decoration: none;
  margin: 0.25rem 0.75rem;
  padding: 0.25rem 0;
  transition: color 0.2s ease;
}

.app-nav a:hover,
.app-nav .logout-button:hover {
  color: #207D76;
  text-decoration: none;
}

.app-nav a.router-link-exact-active {
  color: #207D76;
  font-weight: 700;
}

.auth-links, .user-session-links {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
}

.auth-links a, .user-session-links a, .user-session-links .welcome-message {
  margin-left: 0.5rem;
  margin-right: 0.5rem;
}

.auth-links a:first-child, .user-session-links a:first-child, .user-session-links .welcome-message:first-child {
  margin-left: 0.75rem;
}

.logout-button {
  background: none;
  border: 1px solid transparent;
  cursor: pointer;
  font-size: inherit;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
}

.logout-button:hover {
  background-color: #E9ECEF;
  color: #207D76;
}

.welcome-message {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}

.app-main {
  flex-grow: 1;
  padding: 1.5rem;
  width: 100%;
}

.app-footer {
  padding: 1rem;
  text-align: center;
  font-size: 0.875em;
  color: #6C757D;
  border-top: 1px solid #DEE2E6;
  background-color: #FFFFFF;
}

/* NOVO: Estilos para a seção de administração de acesso */
.admin-access-grant {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-left: 1rem; /* Margem para separar dos outros links */
    padding: 5px 10px;
    background-color: #f0f8ff; /* Um azul claro */
    border: 1px solid #a8d8ff;
    border-radius: 5px;
}

.admin-access-grant .email-input {
    padding: 6px 10px;
    border: 1px solid #cceeff;
    border-radius: 4px;
    flex-grow: 1; /* Ocupa espaço disponível */
    min-width: 120px; /* Garante que não fique muito pequeno */
}

.admin-access-grant .grant-button {
    background-color: #007bff; /* Azul primário */
    color: white;
    padding: 6px 12px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 500;
    transition: background-color 0.2s;
}

.admin-access-grant .grant-button:hover {
    background-color: #0056b3;
}

.admin-access-grant p {
    margin: 0;
    font-size: 0.8em;
    white-space: nowrap;
}

.admin-access-grant .success-message {
    color: #28a745; /* Verde para sucesso */
}

.admin-access-grant .error-message {
    color: #dc3545; /* Vermelho para erro */
}


/* Ajustes para telas menores */
@media (max-width: 768px) {
  .header-content {
    flex-direction: column;
    align-items: center;
  }
  .app-header h1 {
    margin-bottom: 0.5rem;
    text-align: center;
    width: 100%;
  }
  .app-nav {
    justify-content: center;
    width: 100%;
  }
  .auth-links a:first-child, .user-session-links a:first-child, .user-session-links .welcome-message:first-child {
    margin-left: 0.5rem;
  }
  .welcome-message {
    max-width: 150px;
  }
  /* NOVO: Ajuste para a seção de admin em telas menores */
  .admin-access-grant {
      flex-direction: column;
      align-items: stretch; /* Estica os itens para preencher a largura */
      margin-left: 0; /* Remove margem lateral */
      margin-top: 10px; /* Espaço entre navegação e essa seção */
      width: 100%; /* Ocupa toda a largura disponível */
      gap: 5px; /* Reduz o espaço entre os itens */
      padding: 10px;
  }
  .admin-access-grant .email-input,
  .admin-access-grant .grant-button {
      width: 100%; /* Ocupa toda a largura */
      margin: 0; /* Remove margens extras */
  }
}
</style>
