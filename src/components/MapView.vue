<template>
  <div class="map-container">
    <div id="map" ref="mapContainer"></div>

    <!-- Node Drawer -->
    <NodeDrawer
      v-model:visible="drawerVisible"
      :node-id="selectedNode.nodeId"
      :node-id-hex="selectedNode.nodeIdHex"
      :node-name="selectedNode.nodeName"
      :hardware-model-name="selectedNode.hardwareModelName"
      :has-connection="selectedNode.hasConnection"
      :latitude="selectedNode.latitude"
      :longitude="selectedNode.longitude"
      :battery-level="selectedNode.batteryLevel"
      :altitude="selectedNode.altitude"
      :last-connected-time="selectedNode.lastConnectedTime"
      :fetch-metrics="fetchDeviceMetrics"
      @close="handleDrawerClose"
    />

    <!-- 狀態欄 -->
    <div class="status-bar">
      <div v-if="loading">載入中...</div>
      <div v-else>
        <div><strong>總節點數:</strong> {{ nodes.length }}</div>
        <div style="color: #00FF00;"><strong>● MQTT:</strong> {{ connectedCount }}</div>
        <div style="color: #3388FF;"><strong>○ 未連接:</strong> {{ disconnectedCount }}</div>
      </div>
    </div>

    <!-- 搜尋欄 -->
    <div class="search-bar">
      <!-- 搜尋結果列表 -->
      <div v-if="searchQuery && filteredNodes.length > 0" class="search-results">
        <div class="results-header">
          找到 {{ filteredNodes.length }} 個節點
        </div>
        <div class="results-list">
          <div
            v-for="node in filteredNodes"
            :key="node.node_id"
            class="result-item"
          >
            <div class="result-info" @click="selectNode(node.node_id)">
              <div class="result-name">{{ node.long_name || node.short_name || '未知節點' }}</div>
              <div class="result-id">{{ node.node_id_hex || node.node_id }}</div>
            </div>
            <button
              class="favorite-toggle-btn"
              :class="{ favorited: isNodeFavorited(node.node_id) }"
              @click.stop="toggleFavoriteFromSearch(node)"
              :title="isNodeFavorited(node.node_id) ? '取消收藏' : '加入最愛'"
            >
              {{ isNodeFavorited(node.node_id) ? '⭐' : '☆' }}
            </button>
          </div>
        </div>
      </div>

      <!-- 無結果提示 -->
      <div v-if="searchQuery && filteredNodes.length === 0" class="search-results no-results">
        <div class="no-results-message">未找到符合的節點</div>
      </div>

      <!-- 搜尋輸入框 -->
      <div class="search-container">
        <input
          type="text"
          v-model="searchQuery"
          @input="handleSearch"
          placeholder="搜尋節點 (ID / 名稱)..."
          class="search-input"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import NodeDrawer from './NodeDrawer.vue';

const mapContainer = ref(null);
const map = ref(null);
const nodes = ref([]);
const loading = ref(true);
const markers = ref([]);
const connectedCount = ref(0);
const disconnectedCount = ref(0);

// Drawer 相關
const drawerVisible = ref(false);
const selectedNode = ref({
  nodeId: null,
  nodeIdHex: '',
  nodeName: '',
  hardwareModelName: '',
  hasConnection: false,
  latitude: 0,
  longitude: 0,
  batteryLevel: null,
  altitude: null,
  lastConnectedTime: null
});

// 搜尋相關
const searchQuery = ref('');
const filteredNodes = ref([]);
const selectedNodeId = ref('');
const nodeMarkerMap = ref(new Map()); // 存儲 node_id 到 marker 的映射

// 收藏相關
const favorites = ref([]);

// 從 API 獲取節點數據
const fetchNodes = async () => {
  try {
    loading.value = true;
    const response = await fetch('/api/v1/nodes');
    const data = await response.json();
    console.log('API 返回數據:', data);
    console.log('節點總數:', data.nodes?.length);
    nodes.value = data.nodes || [];
    renderNodes();
  } catch (error) {
    console.error('獲取節點數據失敗:', error);
  } finally {
    loading.value = false;
  }
};

// 獲取節點的設備指標數據
const fetchDeviceMetrics = async (nodeId) => {
  try {
    // 獲取最近30天的數據
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

// 搜尋處理
const handleSearch = () => {
  const query = searchQuery.value.toLowerCase().trim();

  if (!query) {
    filteredNodes.value = [];
    selectedNodeId.value = '';
    return;
  }

  // 過濾節點：比對 id, node_id, short_name, long_name
  filteredNodes.value = nodes.value.filter(node => {
    const id = String(node.id || '').toLowerCase();
    const nodeId = String(node.node_id || '').toLowerCase();
    const nodeIdHex = String(node.node_id_hex || '').toLowerCase();
    const shortName = String(node.short_name || '').toLowerCase();
    const longName = String(node.long_name || '').toLowerCase();

    return id.includes(query) ||
           nodeId.includes(query) ||
           nodeIdHex.includes(query) ||
           shortName.includes(query) ||
           longName.includes(query);
  });

  // 限制最多顯示 50 個結果
  if (filteredNodes.value.length > 50) {
    filteredNodes.value = filteredNodes.value.slice(0, 50);
  }

  console.log(`搜尋 "${query}" 找到 ${filteredNodes.value.length} 個節點`);
};

// 打開節點 drawer
const openNodeDrawer = (node) => {
  const lat = node.latitude / 10000000;
  const lng = node.longitude / 10000000;

  selectedNode.value = {
    nodeId: node.node_id,
    nodeIdHex: node.node_id_hex,
    nodeName: node.long_name || node.short_name || '未知節點',
    hardwareModelName: node.hardware_model_name,
    hasConnection: node.mqtt_connection_state_updated_at !== null &&
                   node.mqtt_connection_state_updated_at !== undefined &&
                   node.mqtt_connection_state_updated_at !== '',
    latitude: lat,
    longitude: lng,
    batteryLevel: node.battery_level,
    altitude: node.altitude,
    lastConnectedTime: node.mqtt_connection_state_updated_at
  };

  drawerVisible.value = true;
};

// 關閉 drawer
const handleDrawerClose = () => {
  drawerVisible.value = false;
};

// 載入收藏列表
const loadFavorites = () => {
  const stored = localStorage.getItem('meshtastic_favorites');
  if (stored) {
    try {
      favorites.value = JSON.parse(stored);
    } catch (error) {
      console.error('讀取收藏失敗:', error);
      favorites.value = [];
    }
  }
};

// 檢查節點是否已收藏
const isNodeFavorited = (nodeId) => {
  return favorites.value.some(node => node.node_id === nodeId);
};

// 從搜尋結果切換收藏狀態
const toggleFavoriteFromSearch = (node) => {
  const nodeId = node.node_id;

  if (isNodeFavorited(nodeId)) {
    // 移除收藏
    favorites.value = favorites.value.filter(n => n.node_id !== nodeId);
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
    favorites.value.push(nodeData);
  }

  // 保存到 localStorage
  localStorage.setItem('meshtastic_favorites', JSON.stringify(favorites.value));
};

// 選擇節點處理（從列表點擊）
const selectNode = (nodeId) => {
  if (!nodeId || !map.value) return;

  const node = nodes.value.find(n => n.node_id === nodeId);
  if (!node) return;

  // 轉換經緯度
  const lat = node.latitude / 10000000;
  const lng = node.longitude / 10000000;

  // 檢查座標是否有效
  if (lat === 0 || lng === 0 || !lat || !lng) {
    alert('此節點沒有有效的位置信息');
    return;
  }

  // 定位到節點
  map.value.setView([lat, lng], 15);

  // 打開 drawer 顯示節點信息
  openNodeDrawer(node);

  // 清空搜尋
  searchQuery.value = '';
  filteredNodes.value = [];

  console.log(`定位到節點: ${node.long_name || node.short_name}`, lat, lng);
};


// 在地圖上渲染節點
const renderNodes = () => {
  if (!map.value) {
    console.log('地圖尚未初始化');
    return;
  }

  // 清除現有標記
  markers.value.forEach(marker => marker.remove());
  markers.value = [];

  console.log('開始過濾節點，總節點數:', nodes.value.length);

  // 過濾並轉換有效的經緯度數據
  const validNodes = nodes.value
    .map(node => {
      // 將整數格式的經緯度轉換為十進制度數（除以 10,000,000）
      const lat = node.latitude / 10000000;
      const lng = node.longitude / 10000000;

      return {
        ...node,
        latitude: lat,
        longitude: lng
      };
    })
    .filter(node => {
      // 過濾有效的經緯度（在合理範圍內）
      const isValid = node.latitude !== 0 &&
        node.longitude !== 0 &&
        node.latitude !== null &&
        node.longitude !== null &&
        !isNaN(node.latitude) &&
        !isNaN(node.longitude) &&
        node.latitude >= -90 &&
        node.latitude <= 90 &&
        node.longitude >= -180 &&
        node.longitude <= 180;
      return isValid;
    });

  console.log(`過濾後有效節點數: ${validNodes.length}`);
  if (validNodes.length > 0) {
    console.log('前3個有效節點樣例:', validNodes.slice(0, 3).map(n => ({
      name: n.long_name,
      lat: n.latitude,
      lng: n.longitude
    })));
  }

  // 為每個節點創建標記
  validNodes.forEach((node, index) => {
    try {
      // 根據 MQTT 連接狀態決定顏色
      const hasConnection = node.mqtt_connection_state_updated_at !== null &&
                           node.mqtt_connection_state_updated_at !== undefined &&
                           node.mqtt_connection_state_updated_at !== '';
      const markerColor = hasConnection ? '#15b500ff' : '#0015d6ff'; // 綠色：有連接，藍色：無連接

      const marker = L.circleMarker([node.latitude, node.longitude], {
        radius: 6,
        fillColor: markerColor,
        color: '#FFFFFF',
        weight: 1,
        opacity: 1,
        fillOpacity: 0.7
      });

      // 點擊標記時打開 drawer
      marker.on('click', () => {
        openNodeDrawer(node);
      });

      marker.addTo(map.value);
      markers.value.push(marker);

      // 保存 node_id 到 marker 的映射，用於搜尋定位
      nodeMarkerMap.value.set(node.node_id, marker);

      if (index === 0) {
        console.log('成功添加第一個標記:', node.latitude, node.longitude);
        console.log('標記對象:', marker);
        console.log('地圖對象:', map.value);
      }
    } catch (error) {
      console.error('創建標記時出錯:', error, node);
    }
  });

  console.log('標記添加完成，總標記數:', markers.value.length);

  // 計算連接和未連接的節點數量
  connectedCount.value = validNodes.filter(node =>
    node.mqtt_connection_state_updated_at !== null &&
    node.mqtt_connection_state_updated_at !== undefined &&
    node.mqtt_connection_state_updated_at !== ''
  ).length;
  disconnectedCount.value = validNodes.length - connectedCount.value;

  console.log(`連接節點: ${connectedCount.value}, 未連接節點: ${disconnectedCount.value}`);

  // 如果有節點，調整地圖視圖以顯示所有節點
  if (validNodes.length > 0) {
    const bounds = L.latLngBounds(validNodes.map(node => [node.latitude, node.longitude]));
    map.value.fitBounds(bounds, { padding: [50, 50] });
    console.log('地圖視圖已調整以顯示所有節點');
  }
};

// 初始化地圖
onMounted(async () => {
  // 創建地圖實例
  map.value = L.map('map').setView([25, 121], 8);

  // 添加 OpenStreetMap 圖層
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
  }).addTo(map.value);

  console.log('地圖已初始化');

  // 載入收藏列表
  loadFavorites();

  // 獲取並渲染節點
  await fetchNodes();
});

// 清理
onUnmounted(() => {
  if (map.value) {
    map.value.remove();
  }
});
</script>

<style scoped>
.map-container {
  width: 100%;
  height: 100vh;
  position: fixed;
  top: 70px;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1;
}

#map {
  width: 100%;
  height: 100%;
  padding-bottom: 120px; /* 為搜尋欄留出空間 */
}

@media (min-width: 768px) {
  #map {
    padding-bottom: 80px; /* 桌面版搜尋欄較矮 */
  }
}

.status-bar {
  position: fixed;
  top: calc(var(--navbar-height, 60px) + 10px);
  right: 8px;
  background: rgba(255, 255, 255, 0.95);
  color:black;
  padding: 8px 12px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  z-index: 1500;
  font-size: 12px;
  line-height: 1.4;
}

.status-bar > div > div {
  margin: 2px 0;
}

/* 平板和桌面優化 */
@media (min-width: 768px) {
  .status-bar {
    top: calc(var(--navbar-height, 60px) + 20px);
    right: 20px;
    padding: 12px 16px;
    font-size: 14px;
    border-radius: 12px;
  }

  .status-bar > div > div {
    margin: 4px 0;
  }
}

/* 搜尋欄 */
.search-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(255, 255, 255, 0.98);
  padding: 12px 8px;
  box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.15);
  z-index: 1500;
  border-top: 2px solid #667eea;
}

.search-container {
  max-width: 100%;
  margin: 0 auto;
}

.search-input {
  width: 100%;
  padding: 12px 16px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 15px;
  outline: none;
  transition: all 0.3s ease;
  background: white;
  color: #000000;
}

.search-input:focus {
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.search-input::placeholder {
  color: #999;
}

/* 搜尋結果列表 */
.search-results {
  position: absolute;
  bottom: 100%;
  left: 8px;
  right: 8px;
  margin-bottom: 8px;
  background: white;
  border: 2px solid #667eea;
  border-radius: 8px;
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.15);
  max-height: 300px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.search-results.no-results {
  max-height: auto;
  padding: 20px;
}

.results-header {
  padding: 10px 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  font-size: 13px;
  font-weight: 600;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
}

.results-list {
  overflow-y: auto;
  flex: 1;
}

.result-item {
  padding: 12px 16px;
  border-bottom: 1px solid #e9ecef;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.result-item:hover {
  background: #f8f9fa;
}

.result-item:last-child {
  border-bottom: none;
}

.result-info {
  flex: 1;
  cursor: pointer;
  text-align: left;
  min-width: 0;
}

.result-info:active {
  opacity: 0.7;
}

.result-name {
  font-size: 14px;
  font-weight: 600;
  color: #000000;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-id {
  font-size: 12px;
  color: #666666;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 收藏按鈕 */
.favorite-toggle-btn {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  background: white;
  /* border: 2px solid #e0e0e0; */
  /* border-radius: 50%; */
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  color: #999;
}

.favorite-toggle-btn:hover {
  border-color: #667eea;
  background: #f8f9fa;
  transform: scale(1.1);
}

.favorite-toggle-btn:active {
  transform: scale(0.95);
}

.favorite-toggle-btn.favorited {
  border-color: #f5576c;
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  color: white;
}

.no-results-message {
  text-align: center;
  color: #666666;
  font-size: 14px;
}

/* 平板和桌面優化 */
@media (min-width: 768px) {
  .search-bar {
    padding: 16px 20px;
  }

  .search-container {
    max-width: 800px;
    margin: 0 auto;
  }

  .search-input {
    font-size: 16px;
    padding: 14px 18px;
  }

  .search-results {
    left: 50%;
    right: auto;
    transform: translateX(-50%);
    width: 800px;
    max-width: calc(100vw - 40px);
    max-height: 400px;
  }

  .results-header {
    padding: 12px 18px;
    font-size: 14px;
  }

  .result-item {
    padding: 14px 18px;
  }

  .result-name {
    font-size: 15px;
  }

  .result-id {
    font-size: 13px;
  }
}

/* 大螢幕優化 */
@media (min-width: 1024px) {
  .search-container {
    max-width: 1000px;
  }

  .search-results {
    width: 1000px;
  }

  .search-input {
    font-size: 17px;
  }
}
</style>
