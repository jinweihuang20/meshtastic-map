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
    <div v-if="loading" class="status-bar">
      <div>載入中...</div>
      <!-- <div v-else>
        <div style="color: rgb(22, 163, 74);"><strong>● MQTT Connected</strong></div>
        <div style="color: #3388FF;"><strong>● MQTT Disconnected</strong></div>
      </div> -->
    </div>

    <!-- 地圖主題切換按鈕 -->
    <div class="theme-toggle-container">
      <button class="theme-toggle-btn" @click="toggleMapTheme" :title="isDarkMode ? '切換到淺色模式' : '切換到深色模式'">
        {{ isDarkMode ? '☀️' : '🌙' }}
      </button>
    </div>

    <!-- 搜尋欄 -->
    <NodeSearchBar display-mode="icon" :theme="isDarkMode ? 'dark' : 'light'" :nodes="nodes" :show-refresh-button="true" mode="map" @node-select="handleNodeSelectFromSearch"
      @toggle-favorite="toggleFavoriteFromSearch" @refresh="refreshNodes" />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick, computed } from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster';
import NodeDrawer from './NodeDrawer.vue';
import NodeSearchBar from './NodeSearchBar.vue';

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

// 地圖標記相關
const nodeMarkerMap = ref(new Map()); // 存儲 node_id 到 marker 的映射

// 收藏相關
const favorites = ref([]);

// 地圖狀態保存相關
const MAP_STATE_KEY = 'meshtastic_map_state';
const MAP_THEME_KEY = 'meshtastic_map_theme';
const NODES_CACHE_KEY = 'meshtastic_nodes_cache';
const NODES_CACHE_TIMESTAMP_KEY = 'meshtastic_nodes_cache_timestamp';
const CACHE_EXPIRY_TIME = 5 * 60 * 1000; // 緩存有效期：5分鐘
let mapStateSaveTimeout = null; // 防抖計時器

// 地圖主題相關
const isDarkMode = ref(false);
const currentTileLayer = ref(null);
const labelsLayer = ref(null); // 標籤圖層（深色模式使用）

// 從 localStorage 讀取緩存的節點數據
const loadCachedNodes = () => {
  try {
    const cachedData = localStorage.getItem(NODES_CACHE_KEY);
    const cachedTimestamp = localStorage.getItem(NODES_CACHE_TIMESTAMP_KEY);

    if (!cachedData || !cachedTimestamp) {
      return null;
    }

    const timestamp = parseInt(cachedTimestamp, 10);
    const now = Date.now();

    // 檢查緩存是否過期
    if (now - timestamp > CACHE_EXPIRY_TIME) {
      console.log('緩存已過期，將從 API 獲取最新數據');
      return null;
    }

    const nodes = JSON.parse(cachedData);
    console.log(`從緩存載入 ${nodes.length} 個節點（緩存時間: ${new Date(timestamp).toLocaleString()}）`);
    return nodes;
  } catch (error) {
    console.error('讀取緩存數據失敗:', error);
    return null;
  }
};

// 保存節點數據到 localStorage
const saveNodesToCache = (nodes) => {
  try {
    const timestamp = Date.now();
    localStorage.setItem(NODES_CACHE_KEY, JSON.stringify(nodes));
    localStorage.setItem(NODES_CACHE_TIMESTAMP_KEY, timestamp.toString());
    console.log(`節點數據已保存到緩存（${nodes.length} 個節點）`);
  } catch (error) {
    console.error('保存緩存數據失敗:', error);
    // 如果存儲空間不足，嘗試清理舊緩存
    if (error.name === 'QuotaExceededError') {
      console.warn('存儲空間不足，嘗試清理舊緩存');
      try {
        localStorage.removeItem(NODES_CACHE_KEY);
        localStorage.removeItem(NODES_CACHE_TIMESTAMP_KEY);
      } catch (e) {
        console.error('清理緩存失敗:', e);
      }
    }
  }
};

// 比對並更新節點數據
const compareAndUpdateNodes = (oldNodes, newNodes) => {
  const oldNodesMap = new Map(oldNodes.map(node => [node.node_id, node]));
  const newNodesMap = new Map(newNodes.map(node => [node.node_id, node]));

  let hasChanges = false;
  const updatedNodes = [];
  const addedNodes = [];
  const removedNodes = [];

  // 檢查新增和更新的節點
  for (const newNode of newNodes) {
    const oldNode = oldNodesMap.get(newNode.node_id);
    if (!oldNode) {
      // 新節點
      addedNodes.push(newNode);
      hasChanges = true;
    } else {
      // 檢查是否有更新（比較關鍵字段）
      const isUpdated =
        oldNode.latitude !== newNode.latitude ||
        oldNode.longitude !== newNode.longitude ||
        oldNode.long_name !== newNode.long_name ||
        oldNode.short_name !== newNode.short_name ||
        oldNode.mqtt_connection_state_updated_at !== newNode.mqtt_connection_state_updated_at ||
        oldNode.battery_level !== newNode.battery_level ||
        oldNode.altitude !== newNode.altitude;

      if (isUpdated) {
        updatedNodes.push(newNode);
        hasChanges = true;
      } else {
        // 沒有變化，使用舊節點（保留緩存中的其他字段）
        updatedNodes.push(oldNode);
      }
    }
  }

  // 檢查刪除的節點
  for (const oldNode of oldNodes) {
    if (!newNodesMap.has(oldNode.node_id)) {
      removedNodes.push(oldNode);
      hasChanges = true;
    }
  }

  if (hasChanges) {
    console.log(`數據更新: 新增 ${addedNodes.length} 個，更新 ${updatedNodes.length} 個，刪除 ${removedNodes.length} 個節點`);
  } else {
    console.log('數據無變化，使用緩存數據');
  }

  return {
    nodes: updatedNodes,
    hasChanges,
    addedNodes,
    updatedNodes,
    removedNodes
  };
};

// 更新節點數據並重新渲染
const updateNodesAndRender = (newNodes, showLoading = false) => {
  nodes.value = newNodes;

  // 重新渲染地圖標記
  renderNodes();

  if (showLoading) {
    loading.value = false;
  }
};

// 從 API 獲取節點數據（帶緩存機制）
const fetchNodes = async (useCache = true, showLoading = true) => {
  let cachedNodes = null;

  // 優先從緩存載入數據
  if (useCache) {
    cachedNodes = loadCachedNodes();
    if (cachedNodes && cachedNodes.length > 0) {
      // 立即顯示緩存數據
      updateNodesAndRender(cachedNodes, false); // 不顯示 loading，因為使用緩存

      // 檢查緩存年齡
      const cacheAge = Date.now() - parseInt(localStorage.getItem(NODES_CACHE_TIMESTAMP_KEY) || '0', 10);

      // 如果緩存數據較新（小於1分鐘），在背景靜默更新（不顯示 loading）
      if (cacheAge < 60000) {
        // 緩存很新，在背景靜默更新
        fetchNodesFromAPI(false).catch(err => {
          console.error('背景更新節點數據失敗:', err);
        });
        return;
      } else {
        // 緩存較舊，顯示 loading 並更新
        if (showLoading) {
          loading.value = true;
        }
        await fetchNodesFromAPI(showLoading);
        return;
      }
    }
  }

  // 如果沒有緩存或緩存過期，顯示 loading 並從 API 獲取
  if (showLoading) {
    loading.value = true;
  }

  await fetchNodesFromAPI(showLoading);
};

// 從 API 獲取節點數據（實際的 API 調用）
const fetchNodesFromAPI = async (showLoading = true) => {
  try {
    const response = await fetch('/api/v1/nodes');
    const data = await response.json();
    console.log('API 返回數據:', data);
    console.log('節點總數:', data.nodes?.length);

    const newNodes = data.nodes || [];

    // 如果有現有數據，進行比對更新
    if (nodes.value.length > 0 && newNodes.length > 0) {
      const comparison = compareAndUpdateNodes(nodes.value, newNodes);

      if (comparison.hasChanges) {
        // 有變化，更新數據
        updateNodesAndRender(comparison.nodes, showLoading);
        // 保存到緩存
        saveNodesToCache(comparison.nodes);
      } else {
        // 無變化，只更新緩存時間戳（表示數據仍然有效）
        const timestamp = Date.now();
        localStorage.setItem(NODES_CACHE_TIMESTAMP_KEY, timestamp.toString());
        console.log('數據無變化，更新緩存時間戳');
        if (showLoading) {
          loading.value = false;
        }
      }
    } else {
      // 首次載入或數據為空，直接使用新數據
      updateNodesAndRender(newNodes, showLoading);
      // 保存到緩存
      saveNodesToCache(newNodes);
    }
  } catch (error) {
    console.error('獲取節點數據失敗:', error);

    // 如果 API 失敗但有現有數據，繼續使用現有數據
    if (nodes.value.length > 0) {
      console.log('API 請求失敗，繼續使用現有數據');
      if (showLoading) {
        loading.value = false;
      }
    } else {
      // 沒有數據且 API 失敗，顯示錯誤
      console.error('無法載入節點數據，請檢查網絡連接');
      if (showLoading) {
        loading.value = false;
      }
    }
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

// 從搜索組件處理節點選擇
const handleNodeSelectFromSearch = (node) => {
  if (!node || !map.value) return;

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

  console.log(`定位到節點: ${node.long_name || node.short_name}`, lat, lng);
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

  // 觸發自定義事件，通知其他組件（如同窗口的 Favorites 組件）數據已更新
  window.dispatchEvent(new CustomEvent('favorites-updated'));
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


// 緩存圖標創建函數，避免重複計算
const createNodeIcon = (node) => {
  // 根據地圖主題設置標記顏色：深色模式使用亮綠色，淺色模式使用藍色
  const markerColor = isDarkMode.value ? '#00ff88' : '#0015d6ff';
  const shortName = node.short_name || '';
  const nodeIdHex = node.node_id_hex || '';
  const bgColorHex = nodeIdHex.length >= 6 ? '#' + nodeIdHex.slice(-6) : '#ffffff';
  const isDarkBg = isDarkColor(bgColorHex);
  const textColor = isDarkBg ? '#ffffff' : '#333333';
  const hasShortName = shortName && shortName.trim() !== '';

  const textHtml = hasShortName ? `
    <div style="
      font-size: 12px; 
      color: ${textColor}; 
      background: ${bgColorHex}; 
      padding: 1px 4px; 
      border-radius: 3px; 
      margin-bottom: 2px;
      white-space: nowrap;
      text-shadow: ${isDarkBg ? '0 0 2px rgba(0,0,0,0.5)' : '0 0 2px white, 0 0 2px white'};
      font-weight: 500;
      line-height: 1.2;
      max-width: 60px;
      overflow: hidden;
      text-overflow: ellipsis;
    ">${shortName}</div>
  ` : '';

  return L.divIcon({
    className: 'custom-node-marker',
    html: `
      <div style="display: flex; flex-direction: column; align-items: center; pointer-events: none;">
        ${textHtml}
        <div style="
          width: 5px; 
          height: 5px; 
          border-radius: 50%; 
          background-color: ${markerColor}; 
          box-shadow: 0 1px 3px rgba(0,0,0,0.3);
        "></div>
      </div>
    `,
    iconSize: [50, 50],
    iconAnchor: hasShortName ? [25, 22] : [10, 10]
  });
};

// 更新所有標記的顏色（性能優化：更新圖標，包括視圖外的標記）
const updateMarkersColor = () => {
  const newColor = isDarkMode.value ? '#00ff88' : '#0015d6ff';
  let updatedCount = 0;
  
  // 遍歷所有節點，通過 nodeMarkerMap 找到對應的標記並更新圖標
  nodes.value.forEach(node => {
    const marker = nodeMarkerMap.value.get(node.node_id);
    if (marker) {
      try {
        // 重新創建圖標（使用當前主題顏色）
        const newIcon = createNodeIcon(node);
        marker.setIcon(newIcon);
        updatedCount++;
      } catch (error) {
        // 忽略個別標記的錯誤，繼續處理其他標記
        console.warn('更新標記顏色時出錯:', error);
      }
    }
  });
  
  console.log(`標記顏色已更新: ${updatedCount} 個標記，顏色: ${newColor} (${isDarkMode.value ? '深色模式' : '淺色模式'})`);
};

// 在地圖上渲染節點（優化版本 - 使用分批處理）
const renderNodes = () => {
  if (!map.value) {
    console.log('地圖尚未初始化');
    return;
  }

  const startTime = performance.now();

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

  // 優化：合併 map 和 filter，減少一次遍歷
  const validNodes = [];
  const nodesArray = nodes.value;
  const nodesLength = nodesArray.length;

  for (let i = 0; i < nodesLength; i++) {
    const node = nodesArray[i];
    const lat = node.latitude / 10000000;
    const lng = node.longitude / 10000000;

    // 過濾有效的經緯度
    if (lat !== 0 && lng !== 0 &&
      lat !== null && lng !== null &&
      !isNaN(lat) && !isNaN(lng) &&
      lat >= -90 && lat <= 90 &&
      lng >= -180 && lng <= 180) {
      validNodes.push({
        ...node,
        latitude: lat,
        longitude: lng
      });
    }
  }

  console.log(`過濾後有效節點數: ${validNodes.length}`);

  // 創建 MarkerClusterGroup（優化配置）
  markerClusterGroup.value = L.markerClusterGroup({
    chunkedLoading: true,
    chunkDelay: 50, // 每批處理延遲，減少阻塞
    maxClusterRadius: 80,
    disableClusteringAtZoom: 10,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    zoomToBoundsOnClick: true,
    removeOutsideVisibleBounds: true,
    // 優化：使用緩存的圖標創建函數
    iconCreateFunction: function (cluster) {
      const count = cluster.getChildCount();
      let backgroundColor;
      if (count >= 1 && count <= 50) {
        backgroundColor = 'rgba(22, 163, 74, 0.8)';
      } else if (count > 50 && count <= 100) {
        backgroundColor = 'rgba(220, 38, 38, 0.8)';
      } else {
        backgroundColor = 'rgba(249, 115, 22, 0.8)';
      }
      return L.divIcon({
        html: `<div style="background-color: ${backgroundColor}; color: white; border-radius: 50%; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; font-weight: bold; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">${count}</div>`,
        className: 'marker-cluster',
        iconSize: L.point(40, 40)
      });
    }
  });

  // 使用 requestAnimationFrame 分批創建標記，避免阻塞主線程
  const batchSize = 500; // 每批處理 500 個節點
  let currentIndex = 0;
  const totalNodes = validNodes.length;

  const createMarkerBatch = () => {
    const endIndex = Math.min(currentIndex + batchSize, totalNodes);

    for (let i = currentIndex; i < endIndex; i++) {
      const node = validNodes[i];
      try {
        const icon = createNodeIcon(node);
        const marker = L.marker([node.latitude, node.longitude], { icon });

        marker.on('click', () => {
          openNodeDrawer(node);
        });

        markerClusterGroup.value.addLayer(marker);
        markers.value.push(marker);
        nodeMarkerMap.value.set(node.node_id, marker);
      } catch (error) {
        console.error('創建標記時出錯:', error, node);
      }
    }

    currentIndex = endIndex;

    if (currentIndex < totalNodes) {
      // 繼續處理下一批
      requestAnimationFrame(createMarkerBatch);
    } else {
      // 所有標記創建完成，添加到地圖
      markerClusterGroup.value.addTo(map.value);

      // 計算連接和未連接的節點數量
      let connected = 0;
      for (let i = 0; i < totalNodes; i++) {
        const node = validNodes[i];
        if (node.mqtt_connection_state_updated_at !== null &&
          node.mqtt_connection_state_updated_at !== undefined &&
          node.mqtt_connection_state_updated_at !== '') {
          connected++;
        }
      }
      connectedCount.value = connected;
      disconnectedCount.value = totalNodes - connected;

      const endTime = performance.now();
      console.log(`標記添加完成，總標記數: ${markers.value.length}，耗時: ${(endTime - startTime).toFixed(2)}ms`);
      console.log(`連接節點: ${connectedCount.value}, 未連接節點: ${disconnectedCount.value}`);
    }
  };

  // 開始第一批處理
  if (totalNodes > 0) {
    createMarkerBatch();
  } else {
    // 沒有節點，直接添加到地圖
    markerClusterGroup.value.addTo(map.value);
  }
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
  
  // 直接更新標記顏色（性能優化：不重新渲染）
  updateMarkersColor();
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

  // 獲取並渲染節點（使用緩存機制）
  await fetchNodes(true, true);
});

// 手動刷新節點數據（強制從 API 獲取最新數據）
const refreshNodes = async () => {
  console.log('手動刷新節點數據...');
  await fetchNodes(false, true); // 不使用緩存，強制從 API 獲取
};

// 清理
onUnmounted(() => {
  // 清除地圖狀態保存計時器
  if (mapStateSaveTimeout) {
    clearTimeout(mapStateSaveTimeout);
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
  bottom: 70px;
  /* 位於搜尋欄上方，避免遮蔽縮放按鈕 */
  right: 10px;
  z-index: 1500;
}

.theme-toggle-btn {
  width: 45px;
  height: 45px;
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

.search-input-wrapper {
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
}

.search-input {
  width: 100%;
  padding: 12px 40px 12px 16px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 15px;
  outline: none;
  transition: all 0.3s ease;
  background: white;
  color: #000000;
}

.clear-button {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: #999;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.2s ease;
  padding: 0;
  z-index: 10;
}

.clear-button:hover {
  background: rgba(0, 0, 0, 0.05);
  color: #666;
}

.clear-button:active {
  background: rgba(0, 0, 0, 0.1);
  transform: translateY(-50%) scale(0.95);
}

.clear-button .el-icon {
  font-size: 16px;
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
  /* 優化滾動性能 */
  will-change: scroll-position;
  contain: layout style paint;
}

.results-footer {
  padding: 10px 16px;
  background: #f8f9fa;
  color: #666;
  font-size: 12px;
  text-align: center;
  border-top: 1px solid #e9ecef;
}

.result-item {
  padding: 12px 16px;
  border-bottom: 1px solid #e9ecef;
  transition: background-color 0.15s ease;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  /* 優化渲染性能 */
  contain: layout style;
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
    padding: 14px 45px 14px 18px;
  }

  .clear-button {
    right: 10px;
    width: 30px;
    height: 30px;
  }

  .clear-button .el-icon {
    font-size: 18px;
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
    padding: 14px 45px 14px 18px;
  }

}

/* 自定義節點標記樣式 */
:deep(.custom-node-marker) {
  background: transparent !important;
  border: none !important;
  text-align: center;
}

:deep(.custom-node-marker div) {
  pointer-events: none;
}
</style>
