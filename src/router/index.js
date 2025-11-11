import { createRouter, createWebHistory } from 'vue-router'
import MapView from '../components/MapView.vue'
import Favorites from '../components/Favorites.vue'

const routes = [
  {
    path: '/',
    redirect: '/map'
  },
  {
    path: '/map',
    name: 'map',
    component: MapView,
    meta: {
      title: 'Map - Meshtastic Map'
    }
  },
  {
    path: '/favorites',
    name: 'favorites',
    component: Favorites,
    meta: {
      title: '我的最愛 - Meshtastic Map'
    }
  },
  {
    // 404 頁面
    path: '/:pathMatch(.*)*',
    redirect: '/map'
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// 路由守衛 - 更新頁面標題
router.beforeEach((to, from, next) => {
  document.title = to.meta.title || 'Meshtastic Map'
  next()
})

export default router
