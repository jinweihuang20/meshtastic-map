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
        <keep-alive>
          <component :is="Component" @view-on-map="handleViewOnMap" />
        </keep-alive>
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
  /* 禁止縮放 */
  touch-action: pan-x pan-y;
  -ms-touch-action: pan-x pan-y;
  /* 禁止文本選擇（可選，如果需要允許文本選擇可以移除） */
  /* -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none; */
  /* 禁止雙擊縮放高亮 */
  -webkit-tap-highlight-color: transparent;
}

#app {
  width: 100%;
  min-height: 100vh;
  position: relative;
  overflow-x: hidden;
  margin: 0;
  padding: 0;
}

.page-container {
  width: 100%;
  min-height: 100vh;
  margin: 0;
  padding: 0;
  position: relative;
}
</style>
