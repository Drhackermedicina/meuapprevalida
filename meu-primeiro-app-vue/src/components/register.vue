<template>
  <div class="register-container">
    <h2>Criar Nova Conta</h2>
    <form @submit.prevent="handleRegister">
      <div class="form-group">
        <label for="email">Email:</label>
        <input type="email" id="email" v-model="email" required />
      </div>
      <div class="form-group">
        <label for="password">Senha:</label>
        <input type="password" id="password" v-model="password" required />
      </div>
      <button type="submit">Registrar</button>
      <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
    </form>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router'; // Para redirecionar após o registro

// Importamos 'auth' do nosso arquivo de configuração do Firebase
// e a função para criar usuário
// Verifique se o caminho '../firebaseConfig.js' está correto!
// Se Register.vue está em src/components/ e firebaseConfig.js está em src/, então '../firebaseConfig.js' está correto.
import { auth } from '../firebaseConfig.js';
import { createUserWithEmailAndPassword } from "firebase/auth";

const email = ref('');
const password = ref('');
const errorMessage = ref('');
const router = useRouter(); // Instância do roteador

const handleRegister = async () => {
  errorMessage.value = ''; // Limpa mensagens de erro anteriores

  if (!email.value || !password.value) {
    errorMessage.value = 'Por favor, preencha o e-mail e a senha.';
    return;
  }

  try {
    // Tenta criar o usuário no Firebase Authentication
    const userCredential = await createUserWithEmailAndPassword(auth, email.value, password.value);
    const user = userCredential.user;

    console.log('Usuário registrado com sucesso:', user.email);
    alert(`Usuário ${user.email} registrado com sucesso! Você será redirecionado para o login.`);

    // Limpa os campos
    email.value = '';
    password.value = '';

    // Redireciona para a página de login (ou outra página, como a lista de estações)
    router.push('/login'); // ou router.push('/stations');

  } catch (error) {
    // Trata os erros do Firebase
    console.error('Erro ao registrar:', error.code, error.message);
    if (error.code === 'auth/email-already-in-use') {
      errorMessage.value = 'Este e-mail já está em uso.';
    } else if (error.code === 'auth/invalid-email') {
      errorMessage.value = 'O formato do e-mail é inválido.';
    } else if (error.code === 'auth/weak-password') {
      errorMessage.value = 'A senha é muito fraca. Use pelo menos 6 caracteres.';
    } else {
      errorMessage.value = 'Ocorreu um erro ao tentar registrar. Tente novamente.';
    }
  }
};
</script>

<style scoped>
.register-container {
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