import { createRouter, createWebHashHistory } from 'vue-router'
import { isAdmin, isLoggedIn } from './auth'
import Home from './views/Home.vue'
import ImportView from './views/Import.vue'
import Login from './views/Login.vue'
import Exam from './views/Exam.vue'
import ExamList from './views/ExamList.vue'
import Practice from './views/Practice.vue'
import Register from './views/Register.vue'
import Settings from './views/Settings.vue'
import WrongList from './views/WrongList.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/login', name: 'login', component: Login, meta: { public: true } },
    { path: '/register', name: 'register', component: Register, meta: { public: true } },
    { path: '/', name: 'home', component: Home },
    { path: '/import', name: 'import', component: ImportView },
    { path: '/practice', name: 'practice', component: Practice },
    { path: '/exams', name: 'exams', component: ExamList },
    { path: '/exam', name: 'exam', component: Exam },
    { path: '/wrong', name: 'wrong', component: WrongList },
    { path: '/settings', name: 'settings', component: Settings, meta: { admin: true } },
  ],
})

router.beforeEach((to) => {
  if (to.meta.public) {
    if (isLoggedIn() && (to.name === 'login' || to.name === 'register')) return { name: 'home' }
    return true
  }
  if (!isLoggedIn()) return { name: 'login', query: { redirect: to.fullPath } }
  if (to.meta.admin && !isAdmin()) return { name: 'home' }
  return true
})
