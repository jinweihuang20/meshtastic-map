<template>
  <div class="favorites-container">
    <div v-if="favoriteNodes.length === 0" class="empty-state">
      <div class="empty-icon">⭐</div>
      <h3>尚未收藏任何節點</h3>
      <p>在地圖上點擊節點，將它們添加到最愛清單</p>
    </div>

    <div v-else class="favorites-list">
      <div v-for="node in favoriteNodes" :key="node.node_id" class="favorite-item">
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
            <div v-if="node.battery_level" class="info-row">
              <span class="label">電量:</span>
              <span class="value">{{ node.battery_level }}%</span>
            </div>
            <div class="info-row">
              <span class="label">狀態:</span>
              <span class="status-badge" :class="{ connected: node.hasConnection }">
                {{ node.hasConnection ? '● 已連接' : '○ 未連接' }}
              </span>
            </div>
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

<script setup>
import { ref, computed, onMounted, onUnmounted, defineEmits } from 'vue';
import DeviceMetricsChart from './DeviceMetricsChart.vue';

const emit = defineEmits(['view-on-map']);

const favoriteNodes = ref([]);
const nodeMetrics = ref({});
const loadingMetrics = ref({});
const windowWidth = ref(window.innerWidth);

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

// 在地圖上查看節點
const viewOnMap = (node) => {
  emit('view-on-map', node);
};

onMounted(() => {
  loadFavorites();
  window.addEventListener('resize', handleResize);
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
});

// 暴露方法供外部調用
defineExpose({
  refresh: loadFavorites
});
</script>

<style scoped>
.favorites-container {
  width: 100%;
  min-height: calc(100vh - var(--navbar-height, 60px));
  padding-top: calc(var(--navbar-height, 60px) + 16px);
  padding-left: 16px;
  padding-right: 16px;
  padding-bottom: 16px;
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  box-sizing: border-box;
  position: relative;
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
  background: white;
  border-radius: 0;
  box-shadow: none;
  margin: 0 auto;
  max-width: 100%;
}

.empty-icon {
  font-size: 60px;
  margin-bottom: 16px;
  opacity: 0.5;
}

.empty-state h3 {
  margin: 0 0 8px 0;
  font-size: 20px;
  color: #2c3e50;
}

.empty-state p {
  margin: 0;
  color: #7f8c8d;
  font-size: 14px;
}

/* Favorites List - 單排垂直佈局 */
.favorites-list {
  display: flex;
  flex-direction: column;
  gap: 0;
  width: 100%;
}

.favorite-item {
  background: white;
  border-radius: 0;
  box-shadow: none;
  border-bottom: 8px solid #e9ecef;
  overflow: visible;
  transition: all 0.3s ease;
  display: flex;
  flex-direction: column;
  width: 100%;
  position: relative;
}

.favorite-item:hover {
  box-shadow: none;
}

/* 節點信息區 - 左側 */
.node-info-section {
  padding: 12px;
  background: white;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.node-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 8px;
  border-bottom: 1px solid #e9ecef;
}

.node-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  color: #2c3e50;
}

.node-icon {
  font-size: 16px;
}

.remove-btn {
  background: rgba(231, 76, 60, 0.1);
  border: none;
  color: #e74c3c;
  height: 28px;
  padding: 0 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.remove-btn:hover {
  background: rgba(231, 76, 60, 0.2);
  transform: scale(1.1);
}

.node-details {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 10px;
}

.info-row {
  display: flex;
  flex-direction: row;
  gap: 20px;
}

.label {
  font-size: 10px;
  color: #7f8c8d;
  font-weight: 500;
  width: 30px;
}

.value {
  font-size: 12px;
  color: #2c3e50;
  font-weight: 600;
  word-break: break-all;
}

.status-badge {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  background: #3498db;
  color: white;
  display: inline-block;
}

.status-badge.connected {
  background: #2ecc71;
}

.action-btn {
  width: 100%;
  padding: 8px 12px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
}

.action-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

/* 圖表區 - 右側 */
.chart-section {
  padding: 12px;
  background: #f8f9fa;
  height: 280px;
  min-height: 280px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.chart-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #7f8c8d;
  font-size: 12px;
}

/* Tablet and Desktop Styles - 左右佈局 */
@media (min-width: 768px) {
  .favorites-container {
    padding-top: calc(var(--navbar-height, 60px) + 20px);
    padding-left: 20px;
    padding-right: 20px;
    padding-bottom: 20px;
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
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.07);
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
    gap: 20px;
  }

  .favorite-item {
    flex-direction: row;
    border-radius: 12px;
    border-bottom: none;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.07);
  }

  .favorite-item:hover {
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.12);
  }

  .node-info-section {
    flex: 0 0 350px;
    padding: 20px;
    border-right: 2px solid #e9ecef;
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
  }

  .info-row {
    flex-direction: column;
  }
}

/* Large Desktop Styles */
@media (min-width: 1024px) {
  .favorites-container {
    padding-top: calc(var(--navbar-height, 60px) + 30px);
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

  .info-row {
    flex-direction: column;
  }
}

/* Extra Large Desktop */
@media (min-width: 1400px) {
  .favorites-container {
    padding-top: calc(var(--navbar-height, 70px) + 40px);
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
