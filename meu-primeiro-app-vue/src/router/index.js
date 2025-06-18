// Arquivo: src/router/index.js

import { createRouter, createWebHistory } from 'vue-router';

// --- Importa os Componentes ---
import LoginView from '../components/login.vue';         // Corrigido para minúsculo
import RegisterView from '../components/Register.vue';   // CORRIGIDO
import StationList from '../components/StationList.vue'; // CORRIGIDO
import SimulationView from '../components/SimulationView.vue'; // CORRIGIDO
import AdminUpload from '../components/AdminUpload.vue';   // CORRIGIDO
import EditStationView from '../components/EditStationView.vue'; // CORRIGIDO

// --- Importa o Estado de Autenticação ---
import { currentUser } from '../authStore.js'; // Este caminho parece correto se authStore.js está em src/

// --- Define as Rotas ---
const routes = [
  {
    path: '/',
    redirect: '/login'
  },
  {
    path: '/login',
    name: 'Login',
    component: LoginView
  },
  {
    path: '/register',
    name: 'Register',
    component: RegisterView
  },
  {
    path: '/stations', 
    name: 'StationList',
    component: StationList,
    meta: { requiresAuth: true } 
  },
  {
    path: '/station/:id/simulate', 
    name: 'SimulationView',
    component: SimulationView,
    props: true,
    meta: { requiresAuth: true } 
  },
  {
    path: '/admin/upload', 
    name: 'AdminUpload',
    component: AdminUpload,
    meta: {
      requiresAuth: true, 
      requiresAdmin: true 
    }
  },
  // --- NOVA ROTA PARA EDITAR ESTAÇÃO ---
  {
    path: '/admin/edit-station/:id', 
    name: 'EditStation',
    component: EditStationView, 
    props: true, 
    meta: {
      requiresAuth: true,    
      requiresAdmin: true  
    }
  }
  // --- FIM DA NOVA ROTA ---
];

// --- Cria a Instância do Roteador ---
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: routes
});

// --- Navigation Guard (Proteção de Rotas) ---
router.beforeEach((to, from, next) => {
  const requiresAuth = to.matched.some(record => record.meta.requiresAuth);
  const requiresAdmin = to.matched.some(record => record.meta.requiresAdmin); 
  const isAuthenticated = currentUser.value != null;
  const isAdmin = isAuthenticated && currentUser.value.uid === 'xN0BqF7vvbbwpWlMNxhORH48Ri33';

  console.log(`Navegando para: ${to.path}, Requer Auth: ${requiresAuth}, Requer Admin: ${requiresAdmin}, Autenticado: ${isAuthenticated}, É Admin: ${isAdmin}`);

  if (requiresAdmin && !isAdmin) {
    console.log("Acesso negado à rota de admin! Redirecionando para /stations");
    next('/stations'); 
  } else if (requiresAuth && !isAuthenticated) {
    console.log("Não autenticado! Redirecionando para /login");
    next('/login');
  } else if ((to.path === '/login' || to.path === '/register') && isAuthenticated) {
    console.log("Já logado! Redirecionando para /stations");
    next('/stations');
  } else {
    next();
  }
});

// --- Exporta o Roteador ---
export default router;