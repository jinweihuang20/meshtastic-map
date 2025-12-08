<template>
  <div class="favorites-wrapper">
    <!-- 搜尋欄 -->
    <NodeSearchBar :nodes="allNodes" :show-refresh-button="false" mode="favorites" display-mode="icon" theme="dark"
      @toggle-favorite="handleToggleFavoriteFromSearch" />

    <div v-if="favoriteNodes.length === 0" class="empty-state">
      <div class="empty-icon">⭐</div>
      <h3>尚未收藏任何節點</h3>
      <p>在地圖上點擊節點，或使用上方搜尋功能將它們添加到最愛清單</p>
    </div>

    <template v-else>
      <!-- 快速導航條（僅移動端顯示） -->
      <div v-if="windowWidth < 768" class="quick-nav">
        <div ref="quickNavScroll" class="quick-nav-scroll">
          <button v-for="(node, index) in favoriteNodes" :key="node.node_id" :ref="el => setNavItemRef(el, index)"
            class="quick-nav-item" :class="{ active: activeIndex === index }" @click="scrollToCard(index)">
            <span class="nav-item-name">{{ node.long_name || node.short_name || '未知節點' }}</span>
          </button>
        </div>
      </div>

      <div ref="listContainer" class="favorites-container" @scroll="handleScroll">
        <div class="favorites-list">
          <div v-for="(node, index) in favoriteNodes" :key="node.node_id" :ref="el => setCardRef(el, index)"
            class="favorite-item">
            <!-- 左側：節點信息 -->
            <div class="node-info-section">
              <div class="node-header">
                <div class="node-name">
                  <span class="node-icon">📡</span>
                  <strong>{{ node.long_name || node.short_name || '未知節點' }}</strong>
                </div>
                <button class="remove-btn" @click="removeFavorite(node.node_id)" title="移除">
                  移除收藏
                </button>
              </div>

              <div class="node-details">
                <div class="info-row">
                  <span class="label">ID:</span>
                  <span class="value">{{ node.node_id_hex || node.node_id }}</span>
                </div>
                <div class="info-row">
                  <span class="label">型號:</span>
                  <span class="value">{{ node.hardware_model_name || '未知' }}</span>
                </div>
                <div class="info-row">
                  <span class="label">位置:</span>
                  <span class="value">{{ formatCoordinates(node.latitude, node.longitude) }}</span>
                </div>
                <template v-if="getLatestMetric(node.node_id)">
                  <div class="info-row">
                    <span class="label">電量:</span>
                    <span class="value">{{ getLatestMetric(node.node_id).battery_level || 'N/A' }}%</span>
                  </div>
                  <div v-if="getLatestMetric(node.node_id).channel_utilization !== undefined" class="info-row">
                    <span class="label">頻道利用率:</span>
                    <span class="value">{{ parseFloat(getLatestMetric(node.node_id).channel_utilization || 0).toFixed(1)
                    }}%</span>
                  </div>
                  <div v-if="getLatestMetric(node.node_id).air_util_tx !== undefined" class="info-row">
                    <span class="label">空中傳輸率:</span>
                    <span class="value">{{ parseFloat(getLatestMetric(node.node_id).air_util_tx || 0).toFixed(1)
                    }}%</span>
                  </div>
                  <div v-if="getLatestMetric(node.node_id).updated_at" class="info-row">
                    <span class="label">更新時間:</span>
                    <span class="value">{{ formatDateTime(getLatestMetric(node.node_id).updated_at) }} ({{
                      getRelativeTime(getLatestMetric(node.node_id).updated_at) }})</span>
                  </div>
                </template>
              </div>

              <button class="action-btn" @click="viewOnMap(node)">
                🗺️ 在地圖上查看
              </button>
            </div>

            <!-- 右側：趨勢圖 -->
            <div class="chart-section">
              <DeviceMetricsChart v-if="nodeMetrics[node.node_id] && nodeMetrics[node.node_id].length > 0"
                :node-id="node.node_id" :metrics="nodeMetrics[node.node_id]" :height="chartHeight" />
              <div v-else-if="loadingMetrics[node.node_id]" class="chart-placeholder">
                載入圖表中...
              </div>
              <div v-else class="chart-placeholder">
                暫無設備指標數據
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, onActivated, defineEmits, nextTick } from 'vue';
import DeviceMetricsChart from './DeviceMetricsChart.vue';
import NodeSearchBar from './NodeSearchBar.vue';

const emit = defineEmits(['view-on-map']);

const favoriteNodes = ref([]);
const allNodes = ref([]); // 所有節點數據（用於搜索）
const nodeMetrics = ref({});
const loadingMetrics = ref({});
const windowWidth = ref(window.innerWidth);
const listContainer = ref(null);
const quickNavScroll = ref(null);
const cardRefs = ref([]);
const navItemRefs = ref([]);
const activeIndex = ref(0);
const isScrolling = ref(false);
const isScrollingNav = ref(false);

// 監聽窗口大小變化
const handleResize = () => {
  windowWidth.value = window.innerWidth;
};

// 響應式圖表高度
const chartHeight = computed(() => {
  // 移動端（直立螢幕）
  if (windowWidth.value < 768) {
    return '280px';
  }
  // 平板
  if (windowWidth.value < 1024) {
    return '350px';
  }
  // 桌面
  return '400px';
});

// 獲取設備指標數據
const fetchDeviceMetrics = async (nodeId) => {
  try {
    const timeFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const response = await fetch(`/api/v1/nodes/${nodeId}/device-metrics?time_from=${timeFrom}`);
    const data = await response.json();
    // 反轉數據陣列以確保時間順序從舊到新
    const metrics = data.device_metrics || [];
    return metrics.reverse();
  } catch (error) {
    console.error('獲取設備指標失敗:', error);
    return [];
  }
};

// 載入所有節點數據（用於搜索）
const loadAllNodes = async () => {
  try {
    // 先嘗試從緩存載入
    const cachedData = localStorage.getItem('meshtastic_nodes_cache');
    if (cachedData) {
      try {
        allNodes.value = JSON.parse(cachedData);
        console.log(`從緩存載入 ${allNodes.value.length} 個節點用於搜索`);
        return;
      } catch (error) {
        console.error('讀取緩存失敗:', error);
      }
    }

    // 如果沒有緩存，從 API 獲取
    const response = await fetch('/api/v1/nodes');
    const data = await response.json();
    allNodes.value = data.nodes || [];
    console.log(`從 API 載入 ${allNodes.value.length} 個節點用於搜索`);
  } catch (error) {
    console.error('載入節點數據失敗:', error);
    allNodes.value = [];
  }
};

// 加載收藏的節點
const loadFavorites = async () => {
  const stored = localStorage.getItem('meshtastic_favorites');
  if (stored) {
    try {
      favoriteNodes.value = JSON.parse(stored);

      // 為每個節點加載指標數據
      for (const node of favoriteNodes.value) {
        loadingMetrics.value[node.node_id] = true;
        const metrics = await fetchDeviceMetrics(node.node_id);
        nodeMetrics.value[node.node_id] = metrics;
        loadingMetrics.value[node.node_id] = false;
      }
    } catch (error) {
      console.error('加載收藏失敗:', error);
      favoriteNodes.value = [];
    }
  }
};

// 處理從搜索組件切換收藏
const handleToggleFavoriteFromSearch = (node) => {
  const nodeId = node.node_id;
  const isFavorited = favoriteNodes.value.some(n => n.node_id === nodeId);

  if (isFavorited) {
    // 移除收藏
    favoriteNodes.value = favoriteNodes.value.filter(n => n.node_id !== nodeId);
    delete nodeMetrics.value[nodeId];
    delete loadingMetrics.value[nodeId];
  } else {
    // 添加收藏
    const lat = node.latitude / 10000000;
    const lng = node.longitude / 10000000;

    const nodeData = {
      node_id: node.node_id,
      node_id_hex: node.node_id_hex,
      long_name: node.long_name,
      short_name: node.short_name,
      hardware_model_name: node.hardware_model_name,
      hasConnection: node.mqtt_connection_state_updated_at !== null &&
        node.mqtt_connection_state_updated_at !== undefined &&
        node.mqtt_connection_state_updated_at !== '',
      latitude: lat,
      longitude: lng,
      battery_level: node.battery_level,
      altitude: node.altitude
    };
    favoriteNodes.value.push(nodeData);

    // 為新節點加載指標數據
    (async () => {
      loadingMetrics.value[nodeId] = true;
      const metrics = await fetchDeviceMetrics(nodeId);
      nodeMetrics.value[nodeId] = metrics;
      loadingMetrics.value[nodeId] = false;
    })();
  }

  // 保存到 localStorage
  localStorage.setItem('meshtastic_favorites', JSON.stringify(favoriteNodes.value));

  // 觸發自定義事件
  window.dispatchEvent(new CustomEvent('favorites-updated'));
};

// 移除收藏
const removeFavorite = (nodeId) => {
  favoriteNodes.value = favoriteNodes.value.filter(node => node.node_id !== nodeId);
  localStorage.setItem('meshtastic_favorites', JSON.stringify(favoriteNodes.value));

  // 清除該節點的指標數據
  delete nodeMetrics.value[nodeId];
  delete loadingMetrics.value[nodeId];
};

// 格式化座標
const formatCoordinates = (lat, lng) => {
  if (!lat || !lng) return '未知';
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
};

// 獲取節點的最新指標（第一筆數據，因為 reverse() 後第一筆是最新的）
// 注意：根據 fetchDeviceMetrics 的實現，數據經過 reverse() 後，第一筆是最舊的，最後一筆是最新的
// 但根據用戶要求使用"頭一筆"，這裡使用第一筆數據
// 如果數據順序不符合預期，可能需要調整為使用最後一筆：metrics[metrics.length - 1]
const getLatestMetric = (nodeId) => {
  const metrics = nodeMetrics.value[nodeId];
  if (metrics && metrics.length > 0) {
    // 根據用戶要求使用第一筆數據
    // 如果第一筆不是最新的，請改為：return metrics[metrics.length - 1];
    // return metrics[0];
    return metrics[metrics.length - 1];
  }
  return null;
};

// 格式化日期時間
const formatDateTime = (dateString) => {
  if (!dateString) return '未知';
  try {
    const date = new Date(dateString);
    return date.toLocaleString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch (error) {
    return '未知';
  }
};

// 計算相對時間（距離當前多久）
const getRelativeTime = (dateString) => {
  if (!dateString) return '未知';
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    const diffMonths = Math.floor(diffDays / 30);
    const diffYears = Math.floor(diffDays / 365);

    if (diffSeconds < 60) {
      return '剛剛';
    } else if (diffMinutes < 60) {
      return `${diffMinutes}分鐘前`;
    } else if (diffHours < 24) {
      return `${diffHours}小時前`;
    } else if (diffDays < 30) {
      return `${diffDays}天前`;
    } else if (diffMonths < 12) {
      return `${diffMonths}個月前`;
    } else {
      return `${diffYears}年前`;
    }
  } catch (error) {
    return '未知';
  }
};

// 在地圖上查看節點
const viewOnMap = (node) => {
  emit('view-on-map', node);
};

// 設置卡片 ref
const setCardRef = (el, index) => {
  if (el) {
    cardRefs.value[index] = el;
  }
};

// 設置導航項 ref
const setNavItemRef = (el, index) => {
  if (el) {
    navItemRefs.value[index] = el;
  }
};

// 滾動到指定卡片
const scrollToCard = async (index) => {
  if (!listContainer.value || !cardRefs.value[index]) return;

  isScrolling.value = true;
  const card = cardRefs.value[index];
  const container = listContainer.value;

  // 計算卡片在容器中的位置
  const cardRect = card.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const scrollLeft = container.scrollLeft + (cardRect.left - containerRect.left);

  container.scrollTo({
    left: scrollLeft,
    behavior: 'smooth'
  });

  // 更新活動索引
  activeIndex.value = index;

  // 同時滾動快速導航條，使對應的導航項顯示在最左方
  scrollNavToItem(index);

  // 等待滾動完成後重置標記
  setTimeout(() => {
    isScrolling.value = false;
  }, 500);
};

// 滾動快速導航條，使指定索引的導航項顯示在最左方
const scrollNavToItem = (index) => {
  if (!quickNavScroll.value || !navItemRefs.value[index] || isScrollingNav.value) return;

  isScrollingNav.value = true;
  const navItem = navItemRefs.value[index];
  const navScroll = quickNavScroll.value;

  // 計算導航項在滾動容器中的位置
  const itemRect = navItem.getBoundingClientRect();
  const scrollRect = navScroll.getBoundingClientRect();
  const scrollLeft = navScroll.scrollLeft + (itemRect.left - scrollRect.left);

  navScroll.scrollTo({
    left: scrollLeft,
    behavior: 'smooth'
  });

  // 等待滾動完成後重置標記
  setTimeout(() => {
    isScrollingNav.value = false;
  }, 300);
};

// 處理滾動事件，更新活動索引
const handleScroll = () => {
  if (isScrolling.value || !listContainer.value || windowWidth.value >= 768) return;

  const container = listContainer.value;
  const scrollLeft = container.scrollLeft;
  const containerWidth = container.clientWidth;
  const cardWidth = containerWidth - 32; // calc(100vw - 32px)
  const gap = 12;
  const cardTotalWidth = cardWidth + gap;

  // 計算當前可見的卡片索引
  const currentIndex = Math.round(scrollLeft / cardTotalWidth);
  const clampedIndex = Math.max(0, Math.min(currentIndex, favoriteNodes.value.length - 1));

  if (activeIndex.value !== clampedIndex) {
    activeIndex.value = clampedIndex;
    // 當活動索引變化時，自動滾動快速導航條，使對應的導航項顯示在最左方
    scrollNavToItem(clampedIndex);
  }
};

onMounted(async () => {
  await loadAllNodes(); // 載入所有節點用於搜索
  loadFavorites();
  window.addEventListener('resize', handleResize);

  // 監聽 localStorage 變化（跨標籤頁同步）
  window.addEventListener('storage', handleStorageChange);

  // 監聽自定義事件（同一窗口內同步）
  window.addEventListener('favorites-updated', handleFavoritesUpdated);
});

onActivated(() => {
  // 當組件被 keep-alive 激活時，重新載入最愛數據
  // 這樣可以確保從其他頁面切換回來時數據是最新的
  loadFavorites();
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  window.removeEventListener('storage', handleStorageChange);
  window.removeEventListener('favorites-updated', handleFavoritesUpdated);
});

// 處理 localStorage 變化事件（跨標籤頁）
const handleStorageChange = (e) => {
  if (e.key === 'meshtastic_favorites') {
    console.log('檢測到最愛數據變化（跨標籤頁），重新載入...');
    loadFavorites();
  }
};

// 處理自定義事件（同一窗口內）
const handleFavoritesUpdated = () => {
  console.log('檢測到最愛數據變化（同窗口），重新載入...');
  loadFavorites();
};

// 暴露方法供外部調用
defineExpose({
  refresh: loadFavorites
});
</script>

<style scoped>
.favorites-wrapper {
  width: 100%;
  min-height: calc(100vh - var(--navbar-height, 60px));
  padding-top: calc(var(--navbar-height, 60px));
  background: #0f0f0f;
  box-sizing: border-box;
  position: relative;
  display: flex;
  flex-direction: column;
}

.favorites-container {
  width: 100%;
  flex: 1;
  margin-top: 8px;
  padding-left: 0;
  padding-right: 0;
  padding-bottom: 16px;
  box-sizing: border-box;
  position: relative;
  /* 移動端允許水平滾動 */
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  /* 允許水平滾動 */
  touch-action: pan-x;
  /* 確保可以滾動 */
  overscroll-behavior: contain;
}

.favorites-header {
  text-align: center;
  margin-bottom: 20px;
  padding: 20px 16px 10px;
}

.favorites-header h2 {
  margin: 0 0 8px 0;
  font-size: 24px;
  color: #2c3e50;
  font-weight: 700;
}

.subtitle {
  margin: 0;
  color: #7f8c8d;
  font-size: 14px;
}

/* Empty State */
.empty-state {
  text-align: center;
  padding: 60px 16px;
  background: #1a1a1a;
  border-radius: 12px;
  box-shadow: none;
  margin: 16px auto;
  max-width: 100%;
  border: 1px solid #2a2a2a;
}

.empty-icon {
  font-size: 60px;
  margin-bottom: 16px;
  opacity: 0.6;
  filter: brightness(0.9);
}

.empty-state h3 {
  margin: 0 0 8px 0;
  font-size: 20px;
  color: #e0e0e0;
  font-weight: 600;
}

.empty-state p {
  margin: 0;
  color: #888888;
  font-size: 14px;
}

/* 快速導航條（僅移動端） */
.quick-nav {
  position: sticky;
  top: calc(var(--navbar-height, 60px));
  z-index: 100;
  background: #0f0f0f;
  padding: 12px 0;
  border-bottom: 1px solid #2a2a2a;
  margin-bottom: 0;
  flex-shrink: 0;
}

.quick-nav-scroll {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 0 16px;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  /* Firefox */
  -ms-overflow-style: none;
  /* IE and Edge */
}

.quick-nav-scroll::-webkit-scrollbar {
  display: none;
  /* Chrome, Safari, Opera */
}

.quick-nav-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: #1a1a1a;
  border: 1px solid #2a2a2a;
  border-radius: 20px;
  color: #888888;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.quick-nav-item:hover {
  background: #2a2a2a;
  border-color: #3a3a3a;
  color: #e0e0e0;
}

.quick-nav-item.active {
  background: linear-gradient(135deg, rgb(43, 107, 66) 0%, rgb(72, 161, 103) 100%);
  border-color: rgb(72, 161, 103);
  color: white;
  box-shadow: 0 2px 8px rgba(72, 161, 103, 0.3);
}

.nav-item-icon {
  font-size: 14px;
}

.nav-item-name {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Favorites List - 移動端水平滾動 */
.favorites-list {
  display: flex;
  flex-direction: row;
  gap: 12px;
  width: max-content;
  padding-left: 16px;
  padding-right: 16px;
  min-width: 100%;
}

.favorite-item {
  background: #353535;
  /* border-radius: 2px; */
  border: 1px solid #888888;
  overflow: visible;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  width: calc(100vw - 32px);
  min-width: calc(100vw - 32px);
  max-width: calc(100vw - 32px);
  flex-shrink: 0;
  position: relative;
  margin-bottom: 0;
  /* 確保觸摸事件可以正常傳遞 */
  touch-action: pan-x pan-y;
  /* 防止意外觸發縮放 */
  -webkit-user-select: none;
  user-select: none;
}

/* 節點信息區 - 左側 */
.node-info-section {
  padding: 12px;
  background: #1a1a1a;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.node-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 8px;
  border-bottom: 1px solid #2a2a2a;
}

.node-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 20px;
  letter-spacing: 1px;
  color: #e0e0e0;
  font-weight: 600;
}

.node-icon {
  font-size: 16px;
}

.remove-btn {
  background: rgba(231, 76, 60, 0.15);
  border: 1px solid rgba(231, 76, 60, 0.3);
  color: #ff6b6b;
  height: 28px;
  padding: 0 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  white-space: nowrap;
  font-weight: 500;
}

.remove-btn:hover {
  background: rgba(231, 76, 60, 0.25);
  border-color: rgba(231, 76, 60, 0.5);
  transform: scale(1.05);
}

.node-details {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.info-row {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 8px;
  min-height: 20px;
}

.label {
  font-size: 11px;
  color: #888888;
  font-weight: 500;
  min-width: 85px;
  flex-shrink: 0;
  flex-grow: 0;
  line-height: 1.4;
}

.value {
  font-size: 12px;
  color: #e0e0e0;
  font-weight: 500;
  flex: 1;
  word-break: break-word;
  line-height: 1.4;
  overflow-wrap: break-word;
}

.status-badge {
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  background: #2a4a6a;
  color: #7db3e8;
  display: inline-block;
  border: 1px solid rgba(125, 179, 232, 0.2);
}

.status-badge.connected {
  background: #1a4a2a;
  color: #7de8a3;
  border-color: rgba(125, 232, 163, 0.2);
}

.action-btn {
  width: 100%;
  padding: 10px 12px;
  background: #2a2a2a;
  color: #e0e0e0;
  border: 1px solid #3a3a3a;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.action-btn:hover {
  background: #3a3a3a;
  border-color: #4a4a4a;
  color: #ffffff;
  transform: translateY(-1px);
}

/* 圖表區 - 右側 */
.chart-section {
  padding: 12px;
  background: #141414;
  height: 280px;
  min-height: 280px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0 0 8px 8px;
}

/* 移動端：整個卡片圓角 */
@media (max-width: 767px) {
  .chart-section {
    border-radius: 0 0 8px 8px;
  }
}

.chart-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #666666;
  font-size: 12px;
}

/* Tablet and Desktop Styles - 左右佈局 */
@media (min-width: 768px) {
  .favorites-wrapper {
    padding-top: calc(var(--navbar-height, 60px) + 20px);
  }

  .quick-nav {
    display: none;
  }

  .favorites-container {
    padding-left: 20px;
    padding-right: 20px;
    padding-bottom: 20px;
    overflow-x: hidden;
    overflow-y: auto;
    touch-action: pan-y;
  }

  .favorites-header {
    margin-bottom: 30px;
    padding: 20px 0;
  }

  .favorites-header h2 {
    font-size: 32px;
  }

  .subtitle {
    font-size: 16px;
  }

  .empty-state {
    padding: 80px 20px;
    border-radius: 16px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    border: 1px solid #2a2a2a;
    max-width: 500px;
    margin: 0 auto;
  }

  .empty-icon {
    font-size: 80px;
    margin-bottom: 20px;
  }

  .empty-state h3 {
    font-size: 24px;
  }

  .empty-state p {
    font-size: 16px;
  }

  .favorites-list {
    flex-direction: column;
    gap: 20px;
    width: 100%;
    padding-left: 0;
    padding-right: 0;
  }

  .favorite-item {
    flex-direction: row;
    width: 100%;
    min-width: auto;
    max-width: none;
    margin-bottom: 0;
    border-radius: 2px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  }

  .node-info-section {
    flex: 0 0 350px;
    padding: 20px;
    border-right: 1px solid #2a2a2a;
  }

  .node-name {
    font-size: 18px;
  }

  .node-icon {
    font-size: 24px;
  }

  .chart-section {
    flex: 1;
    padding: 20px;
    height: 350px;
    min-height: 350px;
    border-radius: 0 12px 12px 0;
  }

  .node-details {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px 16px;
  }

  .info-row {
    flex-direction: column;
    gap: 4px;
    min-height: auto;
  }

  .label {
    min-width: auto;
    font-size: 10px;
    color: #888888;
  }

  .value {
    font-size: 13px;
    word-break: break-word;
  }

}

/* Large Desktop Styles */
@media (min-width: 1024px) {
  .favorites-wrapper {
    padding-top: calc(var(--navbar-height, 60px) + 30px);
  }

  .favorites-container {
    padding-left: 30px;
    padding-right: 30px;
    padding-bottom: 30px;
  }

  .favorites-header h2 {
    font-size: 36px;
  }

  .favorites-list {
    gap: 24px;
  }

  .node-info-section {
    flex: 0 0 400px;
  }

  .chart-section {
    height: 400px;
    min-height: 400px;
  }

  .node-details {
    grid-template-columns: 1fr 1fr;
    gap: 12px 20px;
  }

  .info-row {
    flex-direction: column;
    gap: 4px;
  }

  .label {
    font-size: 11px;
  }

  .value {
    font-size: 14px;
  }
}

/* Extra Large Desktop */
@media (min-width: 1400px) {
  .favorites-wrapper {
    padding-top: calc(var(--navbar-height, 70px) + 40px);
  }

  .favorites-container {
    padding-left: 40px;
    padding-right: 40px;
    padding-bottom: 40px;
  }

  .favorites-list {
    gap: 28px;
  }

  .node-info-section {
    flex: 0 0 450px;
  }

  .node-name {
    font-size: 20px;
  }

  .node-icon {
    font-size: 28px;
  }

  .info-row {
    flex-direction: column;
  }
}
</style>
