<template>
  <el-drawer v-model="drawerVisible" :title="nodeName || '節點詳情'" direction="ltr" :size="drawerSize"
    :before-close="handleClose" append-to-body>
    <div class="node-drawer-content">
      <!-- 節點基本信息 -->
      <div class="info-section">
        <h3 class="section-title">基本訊息</h3>
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">節點名稱</span>
            <span class="info-value">{{ nodeName || '未知' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">節點 ID</span>
            <span class="info-value">{{ nodeIdHex || nodeId }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">硬體型號</span>
            <span class="info-value">{{ hardwareModelName || '未知' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">連接狀態</span>
            <span class="info-value" v-html="connectionStatus"></span>
          </div>
          <div class="info-item">
            <span class="info-label">位置座標</span>
            <span class="info-value">{{ latitude.toFixed(6) }}, {{ longitude.toFixed(6) }}</span>
          </div>
          <div v-if="batteryLevel" class="info-item">
            <span class="info-label">電池電量</span>
            <span class="info-value">{{ batteryLevel }}%</span>
          </div>
          <div v-if="altitude" class="info-item">
            <span class="info-label">海拔高度</span>
            <span class="info-value">{{ altitude }}m</span>
          </div>
          <div v-if="lastConnected" class="info-item">
            <span class="info-label">最後連接</span>
            <span class="info-value">{{ lastConnected }}</span>
          </div>
        </div>

        <!-- 收藏按鈕 -->
        <button class="favorite-btn" @click="toggleFavorite" :class="{ favorited: isFavorited }">
          {{ isFavorited ? '⭐ 已收藏' : '☆ 加入最愛' }}
        </button>
      </div>

      <!-- 設備指標圖表 -->
      <div class="chart-section">
        <h3 class="section-title">設備指標趨勢</h3>
        <div class="chart-container">
          <DeviceMetricsChart v-if="!loading && metrics.length > 0" :node-id="nodeId" :metrics="metrics"
            height="350px" />
          <div v-else-if="loading" class="status-message">
            <el-icon class="is-loading">
              <Loading />
            </el-icon>
            <span>載入圖表中...</span>
          </div>
          <div v-else class="status-message">
            <span>暫無設備指標數據</span>
          </div>
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { ElDrawer, ElIcon } from 'element-plus';
import { Loading } from '@element-plus/icons-vue';
import DeviceMetricsChart from './DeviceMetricsChart.vue';

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  nodeId: {
    type: [String, Number],
    required: true
  },
  nodeIdHex: String,
  nodeName: String,
  hardwareModelName: String,
  hasConnection: Boolean,
  latitude: {
    type: Number,
    required: true
  },
  longitude: {
    type: Number,
    required: true
  },
  batteryLevel: Number,
  altitude: Number,
  lastConnectedTime: String,
  fetchMetrics: {
    type: Function,
    required: true
  }
});

const emit = defineEmits(['update:visible', 'close']);

const drawerVisible = ref(props.visible);
const loading = ref(false);
const metrics = ref([]);
const isFavorited = ref(false);

// 響應式 drawer 尺寸
const drawerSize = computed(() => {
  if (window.innerWidth < 768) return '100%';
  if (window.innerWidth < 1024) return '60%';
  return '500px';
});

const connectionStatus = computed(() => {
  return props.hasConnection
    ? '<span style="color: #00FF00;">● 已連接 MQTT</span>'
    : '<span style="color: #3388FF;">○ 未連接 MQTT</span>';
});

const lastConnected = computed(() => {
  if (!props.lastConnectedTime) return null;
  return new Date(props.lastConnectedTime).toLocaleString('zh-TW');
});

// 監聽 visible prop 的變化
watch(() => props.visible, async (newVal) => {
  drawerVisible.value = newVal;
  if (newVal) {
    await loadData();
  }
});

// 監聽 drawerVisible 的變化，同步到父組件
watch(drawerVisible, (newVal) => {
  emit('update:visible', newVal);
  if (!newVal) {
    emit('close');
  }
});

// 檢查是否已收藏
const checkFavorited = () => {
  const stored = localStorage.getItem('meshtastic_favorites');
  if (stored) {
    try {
      const favorites = JSON.parse(stored);
      isFavorited.value = favorites.some(node => node.node_id === props.nodeId);
    } catch (error) {
      console.error('檢查收藏狀態失敗:', error);
    }
  }
};

// 切換收藏狀態
const toggleFavorite = () => {
  const stored = localStorage.getItem('meshtastic_favorites');
  let favorites = [];

  if (stored) {
    try {
      favorites = JSON.parse(stored);
    } catch (error) {
      console.error('讀取收藏失敗:', error);
    }
  }

  if (isFavorited.value) {
    // 移除收藏
    favorites = favorites.filter(node => node.node_id !== props.nodeId);
    isFavorited.value = false;
  } else {
    // 添加收藏
    const nodeData = {
      node_id: props.nodeId,
      node_id_hex: props.nodeIdHex,
      long_name: props.nodeName,
      short_name: props.nodeName,
      hardware_model_name: props.hardwareModelName,
      hasConnection: props.hasConnection,
      latitude: props.latitude,
      longitude: props.longitude,
      battery_level: props.batteryLevel,
      altitude: props.altitude
    };
    favorites.push(nodeData);
    isFavorited.value = true;
  }

  localStorage.setItem('meshtastic_favorites', JSON.stringify(favorites));
};

// 加載數據
const loadData = async () => {
  checkFavorited();

  try {
    loading.value = true;
    metrics.value = await props.fetchMetrics(props.nodeId);
  } catch (error) {
    console.error('加載設備指標失敗:', error);
  } finally {
    loading.value = false;
  }
};

// 關閉前的處理
const handleClose = (done) => {
  done();
};
</script>

<style scoped>
.node-drawer-content {
  padding: 0 4px 20px;
}

.info-section {
  margin-bottom: 30px;
}

.section-title {
  font-size: 18px;
  font-weight: 600;
  color: #2c3e50;
  margin: 0 0 16px 0;
  padding-bottom: 8px;
  border-bottom: 2px solid #e9ecef;
}

.info-grid {
  display: grid;
  gap: 12px;
}

.info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  background: #f8f9fa;
  border-radius: 8px;
}

.info-label {
  font-size: 14px;
  color: #7f8c8d;
  font-weight: 500;
}

.info-value {
  font-size: 14px;
  color: #2c3e50;
  font-weight: 600;
  text-align: right;
}

.favorite-btn {
  width: 100%;
  padding: 12px 16px;
  margin-top: 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
}

.favorite-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.favorite-btn.favorited {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
}

.chart-section {
  margin-top: 30px;
}

.chart-container {
  min-height: 350px;
  position: relative;
}

.status-message {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 350px;
  color: #7f8c8d;
  font-size: 14px;
  gap: 12px;
}

.status-message .el-icon {
  font-size: 32px;
}

/* 移動端優化 */
@media (max-width: 768px) {
  .section-title {
    font-size: 16px;
  }

  .info-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }

  .info-value {
    text-align: left;
  }
}
</style>
