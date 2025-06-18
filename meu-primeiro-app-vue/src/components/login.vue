<template>
  <div class="login-container">
    <h2>Login</h2>
    <form @submit.prevent="handleLogin">
      <div class="form-group">
        <label for="email">Email:</label>
        <input type="email" id="email" v-model="email" required />
      </div>
      <div class="form-group">
        <label for="password">Senha:</label>
        <input type="password" id="password" v-model="password" required />
      </div>
      <button type="submit">Entrar</button>
      <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
    </form>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router'; // Para redirecionar após o login

// Importamos 'auth' do nosso arquivo de configuração do Firebase
// e a função para fazer login
// Verifique se o caminho '../firebaseConfig.js' está correto!
// Se Login.vue está em src/components/ e firebaseConfig.js está em src/, então '../firebaseConfig.js' está correto.
import { auth } from '../firebaseConfig.js';
import { signInWithEmailAndPassword } from "firebase/auth";

// Não precisamos importar currentUser aqui para esta lógica específica de login,
// pois o authStore já está escutando as mudanças de autenticação.
// A decisão de redirecionamento será baseada no UID do usuário que acabou de logar.

const email = ref('');
const password = ref('');
const errorMessage = ref('');
const router = useRouter(); // Instância do roteador

const handleLogin = async () => {
  errorMessage.value = ''; // Limpa mensagens de erro anteriores

  if (!email.value || !password.value) {
    errorMessage.value = 'Por favor, preencha o e-mail e a senha.';
    return;
  }

  try {
    // Tenta fazer login com o Firebase Authentication
    const userCredential = await signInWithEmailAndPassword(auth, email.value, password.value);
    // O onAuthStateChanged no authStore.js vai atualizar o currentUser automaticamente.

    console.log('Usuário logado com sucesso:', userCredential.user.email);
    console.log('UID do usuário logado:', userCredential.user.uid);
    // Atualiza o UID do admin para o correto
    const adminUID = 'kCJbc2xYS4Z02jGNGmHKiezKZOC2';

    if (userCredential.user.uid === adminUID) {
      console.log('Usuário é admin, redirecionando para /admin/upload');
      router.push('/admin/upload');
    } else {
      console.log('Usuário comum, redirecionando para /stations');
      router.push('/stations');
    }

  } catch (error) {
    // Trata os erros do Firebase
    console.error('Erro ao logar:', error.code, error.message);
    if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
      errorMessage.value = 'E-mail ou senha incorretos.';
    } else if (error.code === 'auth/invalid-email') {
      errorMessage.value = 'O formato do e-mail é inválido.';
    } else {
      errorMessage.value = 'Ocorreu um erro ao tentar fazer login. Tente novamente.';
    }
  }
};
</script>

<style scoped>
.login-container {
  max-width: 400px;
  margin: 50px auto;
  padding: 20px;
  border: 1px solid #ccc;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.form-group {
  margin-bottom: 15px;
}

.form-group label {
  display: block;
  margin-bottom: 5px;
}

.form-group input {
  width: 100%;
  padding: 8px;
  box-sizing: border-box;
  border: 1px solid #ddd;
  border-radius: 4px;
}

button {
  padding: 10px 15px;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

button:hover {
  background-color: #0056b3;
}

.error-message {
  color: red;
  margin-top: 10px;
}
</style>