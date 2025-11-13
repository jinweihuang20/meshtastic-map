<template>
  <div class="map-container">
    <div id="map" ref="mapContainer"></div>

    <!-- Node Drawer -->
    <NodeDrawer v-model:visible="drawerVisible" :node-id="selectedNode.nodeId" :node-id-hex="selectedNode.nodeIdHex"
      :node-name="selectedNode.nodeName" :hardware-model-name="selectedNode.hardwareModelName"
      :has-connection="selectedNode.hasConnection" :latitude="selectedNode.latitude" :longitude="selectedNode.longitude"
      :battery-level="selectedNode.batteryLevel" :altitude="selectedNode.altitude"
      :last-connected-time="selectedNode.lastConnectedTime" :fetch-metrics="fetchDeviceMetrics"
      @close="handleDrawerClose" />

    <!-- 狀態欄 -->
    <div class="status-bar">
      <div v-if="loading">載入中...</div>
      <div v-else>
        <div style="color: rgb(22, 163, 74);"><strong>● MQTT Connected</strong></div>
        <div style="color: #3388FF;"><strong>● MQTT Disconnected</strong></div>
      </div>
    </div>

    <!-- 地圖主題切換按鈕 -->
    <div class="theme-toggle-container">
      <button class="theme-toggle-btn" @click="toggleMapTheme" :title="isDarkMode ? '切換到淺色模式' : '切換到深色模式'">
        {{ isDarkMode ? '☀️' : '🌙' }}
      </button>
    </div>

    <!-- 搜尋欄 -->
    <div class="search-bar">
      <!-- 搜尋結果列表 -->
      <div v-if="searchQuery && filteredNodes.length > 0" class="search-results">
        <div class="results-header">
          找到 {{ filteredNodes.length }} 個節點
        </div>
        <div class="results-list">
          <div v-for="node in filteredNodes" :key="node.node_id" class="result-item">
            <div class="result-info" @click="selectNode(node.node_id)">
              <div class="result-name">
                <div class="result-short-name"
                  v-bind:style="{ backgroundColor: '#' + node.node_id_hex.slice(-6), color: isDarkColor('#' + node.node_id_hex.slice(-6)) ? 'white' : 'black' }">
                  {{ node.short_name }}</div>
                <div> {{ node.long_name || node.short_name || '未知節點' }}
                  <div class="result-id">{{ node.node_id_hex || node.node_id }}</div>
                </div>
              </div>

            </div>
            <button class="favorite-toggle-btn" :class="{ favorited: isNodeFavorited(node.node_id) }"
              @click.stop="toggleFavoriteFromSearch(node)" :title="isNodeFavorited(node.node_id) ? '取消收藏' : '加入最愛'">
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
        <el-button class="refresh-button" @click="fetchNodes"> <el-icon>
            <Refresh />
          </el-icon> </el-button>
        <input type="text" v-model="searchQuery" @input="handleSearch"
          :placeholder="'搜尋節點 (總節點數: ' + nodes.length + ')'" class="search-input" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster';
import NodeDrawer from './NodeDrawer.vue';
import { Refresh } from '@element-plus/icons-vue';

const mapContainer = ref(null);
const map = ref(null);
const nodes = ref([]);
const loading = ref(true);
const markers = ref([]);
const markerClusterGroup = ref(null); // MarkerClusterGroup 實例
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
let searchTimeout = null; // 防抖計時器
let searchAbortController = null; // 用於取消正在進行的搜索

// 收藏相關
const favorites = ref([]);

// 地圖狀態保存相關
const MAP_STATE_KEY = 'meshtastic_map_state';
const MAP_THEME_KEY = 'meshtastic_map_theme';
let mapStateSaveTimeout = null; // 防抖計時器

// 地圖主題相關
const isDarkMode = ref(false);
const currentTileLayer = ref(null);
const labelsLayer = ref(null); // 標籤圖層（深色模式使用）

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

// 優化的節點過濾函數（預處理節點數據以提升性能）
const preprocessNodeForSearch = (node) => {
  // 預處理並緩存搜索相關的字符串，避免重複轉換
  if (!node._searchCache) {
    node._searchCache = {
      id: String(node.id || '').toLowerCase(),
      nodeId: String(node.node_id || '').toLowerCase(),
      nodeIdHex: String(node.node_id_hex || '').toLowerCase(),
      shortName: String(node.short_name || '').toLowerCase(),
      longName: String(node.long_name || '').toLowerCase()
    };
  }
  return node._searchCache;
};

// 實際執行搜索的函數
const performSearch = async (query) => {
  // 取消之前的搜索（如果還在進行）
  if (searchAbortController) {
    searchAbortController.abort();
  }
  searchAbortController = new AbortController();

  // 如果查詢為空，立即清空結果
  if (!query) {
    filteredNodes.value = [];
    selectedNodeId.value = '';
    return;
  }

  const queryLower = query.toLowerCase();
  const results = [];

  // 使用 requestIdleCallback 或 setTimeout 將搜索推遲到下一個事件循環
  // 這樣可以讓 UI 先響應用戶輸入
  await nextTick();

  // 檢查是否已被取消
  if (searchAbortController.signal.aborted) {
    return;
  }

  // 分批處理節點，避免長時間阻塞主線程
  const batchSize = 100;
  const totalNodes = nodes.value.length;

  for (let i = 0; i < totalNodes; i += batchSize) {
    // 檢查是否已被取消
    if (searchAbortController.signal.aborted) {
      return;
    }

    const batch = nodes.value.slice(i, i + batchSize);

    for (const node of batch) {
      const cache = preprocessNodeForSearch(node);

      // 快速匹配檢查
      if (cache.id.includes(queryLower) ||
        cache.nodeId.includes(queryLower) ||
        cache.nodeIdHex.includes(queryLower) ||
        cache.shortName.includes(queryLower) ||
        cache.longName.includes(queryLower)) {
        results.push(node);
      }
    }

    // 每處理一批後，讓出控制權給瀏覽器，避免阻塞 UI
    if (i + batchSize < totalNodes) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  // 檢查是否已被取消
  if (searchAbortController.signal.aborted) {
    return;
  }

  // 排序結果（只在有結果時才排序）
  if (results.length > 0) {
    // 使用更高效的排序方式
    results.sort((a, b) => {
      const aName = a.long_name || a.short_name || '';
      const bName = b.long_name || b.short_name || '';
      return aName.localeCompare(bName);
    });
  }

  // 更新結果
  filteredNodes.value = results;
  console.log(`搜尋 "${query}" 找到 ${results.length} 個節點`);
};

// 搜尋處理（帶防抖）
const handleSearch = () => {
  const query = searchQuery.value.trim();

  // 清除之前的計時器
  if (searchTimeout) {
    clearTimeout(searchTimeout);
  }

  // 如果查詢為空，立即清空結果（不需要防抖）
  if (!query) {
    filteredNodes.value = [];
    selectedNodeId.value = '';
    if (searchAbortController) {
      searchAbortController.abort();
    }
    return;
  }

  // 設置防抖：等待用戶停止輸入 300ms 後才執行搜索
  searchTimeout = setTimeout(() => {
    performSearch(query);
  }, 300);
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

  // 清除現有的 MarkerClusterGroup
  if (markerClusterGroup.value) {
    map.value.removeLayer(markerClusterGroup.value);
    markerClusterGroup.value.clearLayers();
    markerClusterGroup.value = null;
  }

  // 清除現有標記
  markers.value.forEach(marker => {
    if (marker.remove) {
      marker.remove();
    }
  });
  markers.value = [];
  nodeMarkerMap.value.clear();

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

  // 創建 MarkerClusterGroup
  markerClusterGroup.value = L.markerClusterGroup({
    chunkedLoading: true,
    maxClusterRadius: 80, // 聚類半徑（像素），值越大聚合越積極
    disableClusteringAtZoom: 8, // 在縮放級別 15 及以上時禁用聚類，直接顯示所有標記（街道級別）
    spiderfyOnMaxZoom: true, // 在最大縮放級別時展開
    showCoverageOnHover: false, // 懸停時顯示覆蓋範圍
    zoomToBoundsOnClick: true, // 點擊時縮放到邊界
    removeOutsideVisibleBounds: true, // 移除可見範圍外的標記以提升性能
    iconCreateFunction: function (cluster) {
      const count = cluster.getChildCount();
      let backgroundColor;

      // 根據數量設定背景顏色
      if (count >= 1 && count <= 50) {
        backgroundColor = 'rgba(22, 163, 74, 0.8)'; // 綠色
      } else if (count > 50 && count <= 100) {
        backgroundColor = 'rgba(220, 38, 38, 0.8)'; // 紅色
      } else {
        backgroundColor = 'rgba(249, 115, 22, 0.8)'; // 橘色
      }

      return L.divIcon({
        html: `<div style="background-color: ${backgroundColor}; color: white; border-radius: 50%; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; font-weight: bold; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${count}</div>`,
        className: 'marker-cluster',
        iconSize: L.point(40, 40)
      });
    }
  });

  // 為每個節點創建標記
  validNodes.forEach((node, index) => {
    try {
      // 根據 MQTT 連接狀態決定顏色
      const hasConnection = node.mqtt_connection_state_updated_at !== null &&
        node.mqtt_connection_state_updated_at !== undefined &&
        node.mqtt_connection_state_updated_at !== '';
      const markerColor = hasConnection ? '#15b500ff' : '#0015d6ff'; // 綠色：有連接，藍色：無連接

      const marker = L.circleMarker([node.latitude, node.longitude], {
        radius: 7,
        fillColor: markerColor,
        color: '#FFFFFF',
        weight: 1,
        opacity: 1,
        fillOpacity: 1
      });

      // 點擊標記時打開 drawer
      marker.on('click', () => {
        openNodeDrawer(node);
      });

      // 將標記添加到 MarkerClusterGroup
      markerClusterGroup.value.addLayer(marker);
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

  // 將 MarkerClusterGroup 添加到地圖
  markerClusterGroup.value.addTo(map.value);

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
  // if (validNodes.length > 0) {
  //   const bounds = L.latLngBounds(validNodes.map(node => [node.latitude, node.longitude]));
  //   map.value.fitBounds(bounds, { padding: [50, 50] });
  //   console.log('地圖視圖已調整以顯示所有節點');
  // }
};

const isDarkColor = (hexColor) => {
  // 去掉 #
  const c = hexColor.startsWith('#') ? hexColor.slice(1) : hexColor;

  // 解析 RGB
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);

  // 計算亮度（根據人眼敏感度加權）
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

  // 小於 128 → 視為「暗色背景」
  return luminance < 128;
};

// 保存地圖狀態到 localStorage（帶防抖）
const saveMapState = () => {
  if (!map.value) return;

  // 清除之前的計時器
  if (mapStateSaveTimeout) {
    clearTimeout(mapStateSaveTimeout);
  }

  // 設置防抖：等待 500ms 後才保存
  mapStateSaveTimeout = setTimeout(() => {
    try {
      const center = map.value.getCenter();
      const zoom = map.value.getZoom();
      const mapState = {
        center: {
          lat: center.lat,
          lng: center.lng
        },
        zoom: zoom
      };
      localStorage.setItem(MAP_STATE_KEY, JSON.stringify(mapState));
      console.log('地圖狀態已保存:', mapState);
    } catch (error) {
      console.error('保存地圖狀態失敗:', error);
    }
  }, 500);
};

// 從 localStorage 讀取地圖狀態
const loadMapState = () => {
  try {
    const stored = localStorage.getItem(MAP_STATE_KEY);
    if (stored) {
      const mapState = JSON.parse(stored);
      if (mapState.center && mapState.zoom !== undefined) {
        return {
          center: [mapState.center.lat, mapState.center.lng],
          zoom: mapState.zoom
        };
      }
    }
  } catch (error) {
    console.error('讀取地圖狀態失敗:', error);
  }
  return null;
};

// 從 localStorage 讀取地圖主題
const loadMapTheme = () => {
  try {
    const stored = localStorage.getItem(MAP_THEME_KEY);
    if (stored !== null) {
      return stored === 'dark';
    }
  } catch (error) {
    console.error('讀取地圖主題失敗:', error);
  }
  return false; // 默認淺色模式
};

// 保存地圖主題到 localStorage
const saveMapTheme = (theme) => {
  try {
    localStorage.setItem(MAP_THEME_KEY, theme ? 'dark' : 'light');
  } catch (error) {
    console.error('保存地圖主題失敗:', error);
  }
};

// 切換地圖主題
const toggleMapTheme = () => {
  if (!map.value) return;

  isDarkMode.value = !isDarkMode.value;
  saveMapTheme(isDarkMode.value);

  // 移除當前圖層
  if (currentTileLayer.value) {
    map.value.removeLayer(currentTileLayer.value);
  }
  if (labelsLayer.value) {
    map.value.removeLayer(labelsLayer.value);
    labelsLayer.value = null;
  }

  // 添加新圖層
  if (isDarkMode.value) {
    // 深色模式：使用 CartoDB Dark No Labels + Light Labels（顯示更多細節）
    currentTileLayer.value = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19
    });

    // 添加標籤圖層以顯示更多細節（道路名稱、地點名稱等）
    labelsLayer.value = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
      pane: 'overlayPane'
    });
    labelsLayer.value.addTo(map.value);
  } else {
    // 淺色模式：使用 OpenStreetMap
    currentTileLayer.value = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    });
  }

  currentTileLayer.value.addTo(map.value);
  console.log('地圖主題已切換為:', isDarkMode.value ? '深色模式' : '淺色模式');
};

// 初始化地圖
onMounted(async () => {
  // 從 localStorage 讀取地圖狀態和主題
  const savedState = loadMapState();
  const initialCenter = savedState ? savedState.center : [25, 121];
  const initialZoom = savedState ? savedState.zoom : 8;
  isDarkMode.value = loadMapTheme();

  // 創建地圖實例
  map.value = L.map('map').setView(initialCenter, initialZoom);

  // 根據保存的主題添加對應的圖層
  if (isDarkMode.value) {
    // 深色模式：使用 CartoDB Dark No Labels + Light Labels（顯示更多細節）
    currentTileLayer.value = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19
    });

    // 添加標籤圖層以顯示更多細節
    labelsLayer.value = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
      pane: 'overlayPane'
    });
    labelsLayer.value.addTo(map.value);
  } else {
    // 淺色模式：使用 OpenStreetMap
    currentTileLayer.value = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    });
  }

  currentTileLayer.value.addTo(map.value);

  console.log('地圖已初始化', savedState ? '（已恢復上次狀態）' : '（使用默認狀態）', isDarkMode.value ? '（深色模式）' : '（淺色模式）');

  // 監聽地圖移動和縮放事件
  map.value.on('moveend', () => {
    saveMapState();
  });

  map.value.on('zoomend', () => {
    saveMapState();
  });

  // 載入收藏列表
  loadFavorites();

  // 獲取並渲染節點
  await fetchNodes();
});

// 清理
onUnmounted(() => {
  // 清除搜索計時器
  if (searchTimeout) {
    clearTimeout(searchTimeout);
  }

  // 清除地圖狀態保存計時器
  if (mapStateSaveTimeout) {
    clearTimeout(mapStateSaveTimeout);
  }

  // 取消正在進行的搜索
  if (searchAbortController) {
    searchAbortController.abort();
  }

  // 在卸載前保存地圖狀態（立即保存，不等待防抖）
  if (map.value) {
    try {
      const center = map.value.getCenter();
      const zoom = map.value.getZoom();
      const mapState = {
        center: {
          lat: center.lat,
          lng: center.lng
        },
        zoom: zoom
      };
      localStorage.setItem(MAP_STATE_KEY, JSON.stringify(mapState));
      console.log('組件卸載前保存地圖狀態:', mapState);
    } catch (error) {
      console.error('卸載前保存地圖狀態失敗:', error);
    }

    // 移除事件監聽器
    map.value.off('moveend');
    map.value.off('zoomend');

    // 清理 MarkerClusterGroup
    if (markerClusterGroup.value) {
      map.value.removeLayer(markerClusterGroup.value);
      markerClusterGroup.value.clearLayers();
      markerClusterGroup.value = null;
    }

    // 清理標籤圖層
    if (labelsLayer.value) {
      map.value.removeLayer(labelsLayer.value);
      labelsLayer.value = null;
    }

    // 清理地圖
    map.value.remove();
  }

  // 清理節點的搜索緩存
  nodes.value.forEach(node => {
    if (node._searchCache) {
      delete node._searchCache;
    }
  });
});
</script>

<style scoped>
.map-container {
  width: 100%;
  height: calc(100vh - var(--navbar-height, 60px));
  position: fixed;
  top: var(--navbar-height, 60px);
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1;
}

#map {
  width: 100%;
  height: 100%;
  padding-bottom: 120px;
  /* 為搜尋欄留出空間 */
}

@media (min-width: 768px) {
  #map {
    padding-bottom: 80px;
    /* 桌面版搜尋欄較矮 */
  }
}

.status-bar {
  position: fixed;
  top: calc(var(--navbar-height, 60px) + 10px);
  right: 8px;
  background: rgba(255, 255, 255, 0.95);
  color: black;
  padding: 8px 12px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  z-index: 1500;
  font-size: 12px;
  line-height: 1.4;
  backdrop-filter: blur(10px);
}

.status-bar>div>div {
  margin: 2px 0;
}

/* 地圖主題切換按鈕 */
.theme-toggle-container {
  position: fixed;
  bottom: 140px;
  /* 位於搜尋欄上方，避免遮蔽縮放按鈕 */
  right: 10px;
  z-index: 1500;
}

.theme-toggle-btn {
  width: 40px;
  height: 40px;
  background: rgba(255, 255, 255, 0.95);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
  backdrop-filter: blur(10px);
  padding: 0;
}

.theme-toggle-btn:hover {
  background: rgba(255, 255, 255, 1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
  transform: translateY(-2px);
}

.theme-toggle-btn:active {
  transform: translateY(0);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
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

  .status-bar>div>div {
    margin: 4px 0;
  }

  .theme-toggle-container {
    bottom: 100px;
    /* 桌面版調整位置 */
    right: 20px;
  }

  .theme-toggle-btn {
    width: 44px;
    height: 44px;
    font-size: 22px;
    border-radius: 10px;
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
  display: flex;
  flex-direction: row;
}

.refresh-button {
  margin-right: 12px;
  margin-left: 22px;
  padding: 12px 16px;
  height: 100%;
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
  display: flex;
  flex-direction: row;
  gap: 10px;
}

.result-short-name {
  border: 1px solid #f5f5f5;
  padding: 2px 4px;
  border-radius: 50px;
  width: 50px;
  height: 50px;
  background-color: #667eea;
  text-align: center;
  justify-content: center;
  align-items: center;
  display: flex;
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

  .refresh-button {
    font-size: 21px;
    margin-left: 0;
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
