<script setup>
import Navigation from './components/Navigation.vue';
import { useRouter } from 'vue-router';

const router = useRouter();

const handleViewOnMap = (node) => {
  // 導航到地圖頁面
  router.push('/map');
  // 可以在這裡添加邏輯來定位到特定節點
  console.log('查看節點:', node);
};
</script>

<template>
  <div id="app">
    <Navigation />

    <div class="page-container">
      <router-view v-slot="{ Component }">
        <component :is="Component" @view-on-map="handleViewOnMap" />
      </router-view>
    </div>
  </div>
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body {
  width: 100%;
  height: 100%;
  overflow-x: hidden;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

#app {
  width: 100%;
  min-height: 100vh;
  position: relative;
  overflow-x: hidden;
}

.page-container {
  width: 100%;
  min-height: 100vh;
}

/* 確保地圖視圖保持全屏 */
.page-container > * {
  width: 100%;
  min-height: 100vh;
}
</style>
