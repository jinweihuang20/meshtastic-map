<template>
  <div class="map-container">
    <div id="map" ref="mapContainer"></div>
    <div class="status-bar">
      <div v-if="loading">載入中...</div>
      <div v-else>
        <div><strong>總節點數:</strong> {{ nodes.length }}</div>
        <div style="color: #00FF00;"><strong>● MQTT:</strong> {{ connectedCount }}</div>
        <div style="color: #3388FF;"><strong>○ 未連接:</strong> {{ disconnectedCount }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, createApp } from 'vue';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import NodePopup from './NodePopup.vue';
import DeviceMetricsChart from './DeviceMetricsChart.vue';

const mapContainer = ref(null);
const map = ref(null);
const nodes = ref([]);
const loading = ref(true);
const markers = ref([]);
const connectedCount = ref(0);
const disconnectedCount = ref(0);

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
    return data.device_metrics || [];
  } catch (error) {
    console.error('獲取設備指標失敗:', error);
    return [];
  }
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

      // 創建彈出窗口容器
      const popupDiv = document.createElement('div');
      popupDiv.id = `popup-${node.node_id}`;

      // 綁定彈出窗口
      const popup = L.popup({
        maxWidth: 450,
        minWidth: 400
      }).setContent(popupDiv);

      marker.bindPopup(popup);

      // 監聽彈出窗口打開事件，動態掛載 Vue 組件
      marker.on('popupopen', () => {
        // 創建 Vue 應用實例並掛載 NodePopup 組件
        const popupApp = createApp(NodePopup, {
          nodeId: node.node_id,
          nodeIdHex: node.node_id_hex,
          nodeName: node.long_name || node.short_name || '未知節點',
          hardwareModelName: node.hardware_model_name,
          hasConnection: hasConnection,
          latitude: node.latitude,
          longitude: node.longitude,
          batteryLevel: node.battery_level,
          altitude: node.altitude,
          lastConnectedTime: node.mqtt_connection_state_updated_at,
          fetchMetrics: fetchDeviceMetrics
        });

        // 掛載組件
        popupApp.mount(popupDiv);

        // 保存實例以便後續清理
        marker._popupApp = popupApp;
      });

      // 監聽彈出窗口關閉事件，卸載 Vue 組件
      marker.on('popupclose', () => {
        if (marker._popupApp) {
          marker._popupApp.unmount();
          marker._popupApp = null;
        }
      });
      marker.addTo(map.value);
      markers.value.push(marker);

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
  position: relative;
}

#map {
  width: 100%;
  height: 100%;
}

.status-bar {
  position: absolute;
  top: 10px;
  right: 10px;
  background: grey;
  padding: 10px 15px;
  border-radius: 4px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
  z-index: 1000;
  font-size: 14px;
}
</style>
