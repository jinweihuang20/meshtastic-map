<template>
  <div class="favorite-item">
    <!-- 左側：節點信息 -->
    <div class="node-info-section">
      <div class="node-header">
        <div class="node-name">
          <span class="node-icon">📡</span>
          <strong>{{ node.long_name || node.short_name || '未知節點' }}</strong>
        </div>
        <button class="remove-btn" @click="handleRemove" title="移除">
          移除收藏
        </button>
      </div>

      <div class="node-details">
        <div class="info-row">
          <span class="label">Short name:</span>
          <span class="value">
           <el-tag effect="dark"  >{{ node.short_name || '未知' }}</el-tag></span>
        </div>
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
        <template v-if="latestMetric">
          <div class="info-row">
            <span class="label">電量:</span>
            <span class="value">{{ latestMetric.battery_level || 'N/A' }}%</span>
          </div>
          <div v-if="latestMetric.channel_utilization !== undefined" class="info-row">
            <span class="label">頻道利用率:</span>
            <span class="value">{{ parseFloat(latestMetric.channel_utilization || 0).toFixed(1) }}%</span>
          </div>
          <div v-if="latestMetric.air_util_tx !== undefined" class="info-row">
            <span class="label">空中傳輸率:</span>
            <span class="value">{{ parseFloat(latestMetric.air_util_tx || 0).toFixed(1) }}%</span>
          </div>
          <div v-if="latestMetric.updated_at" class="info-row">
            <span class="label">更新時間:</span>
            <span class="value">{{ formatDateTime(latestMetric.updated_at) }} ({{
              getRelativeTime(latestMetric.updated_at) }})</span>
          </div>
        </template>
      </div>

      <button class="action-btn" @click="handleViewOnMap">
        🗺️ 在地圖上查看
      </button>
    </div>

    <!-- 右側：趨勢圖 -->
    <div class="chart-section">
      <DeviceMetricsChart v-if="metrics && metrics.length > 0" :node-id="node.node_id" :metrics="metrics"
        :height="chartHeight" />
      <div v-else-if="loadingMetrics" class="chart-placeholder">
        載入圖表中...
      </div>
      <div v-else class="chart-placeholder">
        暫無設備指標數據
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import DeviceMetricsChart from './DeviceMetricsChart.vue';

const props = defineProps({
  node: {
    type: Object,
    required: true
  },
  metrics: {
    type: Array,
    default: () => []
  },
  loadingMetrics: {
    type: Boolean,
    default: false
  },
  chartHeight: {
    type: String,
    default: '280px'
  }
});

const emit = defineEmits(['remove', 'view-on-map']);

// 獲取最新的指標數據
const latestMetric = computed(() => {
  if (props.metrics && props.metrics.length > 0) {
    return props.metrics[props.metrics.length - 1];
  }
  return null;
});

// 格式化座標
const formatCoordinates = (lat, lng) => {
  if (!lat || !lng) return '未知';
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
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

// 處理移除收藏
const handleRemove = () => {
  emit('remove', props.node.node_id);
};

// 處理在地圖上查看
const handleViewOnMap = () => {
  emit('view-on-map', props.node);
};
</script>

<style scoped>
.favorite-item {
  /* iOS 風格：圓角卡片、毛玻璃效果 */
  background: rgba(28, 28, 30, 0.8);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 0.5px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  overflow: hidden;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  flex-direction: column;
  width: calc(100vw - 16px);
  min-width: calc(100vw - 16px);
  max-width: calc(100vw - 16px);
  flex-shrink: 0;
  position: relative;
  margin-bottom: 0;
  /* iOS 風格陰影 */
  box-shadow: 
    0 2px 8px rgba(0, 0, 0, 0.15),
    0 1px 3px rgba(0, 0, 0, 0.1),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
  /* 確保觸摸事件可以正常傳遞 */
  touch-action: pan-x pan-y;
  /* 防止意外觸發縮放 */
  -webkit-user-select: none;
  user-select: none;
  /* 優化渲染性能 */
  will-change: transform;
  /* 啟用硬件加速 */
  transform: translateZ(0);
  /* 確保內容不會溢出 */
  min-height: 0;
}

/* 節點信息區 - 左側 */
.node-info-section {
  padding: 14px;
  background: transparent;
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex-shrink: 0;
}

.node-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 10px;
  border-bottom: 0.5px solid rgba(255, 255, 255, 0.1);
  margin-bottom: 2px;
}

.node-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 18px;
  letter-spacing: -0.3px;
  color: #ffffff;
  font-weight: 600;
  /* iOS 風格字體 */
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  line-height: 1.3;
}

.node-icon {
  font-size: 16px;
}

.remove-btn {
  /* iOS 風格按鈕 */
  background: rgba(255, 59, 48, 0.15);
  border: none;
  color: #ff3b30;
  height: 32px;
  padding: 0 14px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  white-space: nowrap;
  font-weight: 500;
  /* iOS 風格按鈕效果 */
  -webkit-font-smoothing: antialiased;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.remove-btn:hover {
  background: rgba(255, 59, 48, 0.25);
  transform: scale(0.97);
}

.remove-btn:active {
  background: rgba(255, 59, 48, 0.35);
  transform: scale(0.95);
}

.node-details {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-height: 0;
}

.info-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  min-height: 22px;
  padding: 2px 0;
}

.label {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
  font-weight: 400;
  min-width: 90px;
  flex-shrink: 0;
  flex-grow: 0;
  line-height: 1.5;
  /* iOS 風格字體 */
  -webkit-font-smoothing: antialiased;
  letter-spacing: -0.1px;
}

.value {
  font-size: 13px;
  color: #ffffff;
  font-weight: 400;
  flex: 1;
  word-break: break-word;
  line-height: 1.5;
  overflow-wrap: break-word;
  /* iOS 風格字體 */
  -webkit-font-smoothing: antialiased;
  letter-spacing: -0.1px;
}

/* iOS 風格標籤 */
.value :deep(.el-tag) {
  background: rgba(0, 122, 255, 0.15);
  border: 0.5px solid rgba(0, 122, 255, 0.3);
  color: #007aff;
  border-radius: 6px;
  padding: 2px 8px;
  font-size: 12px;
  font-weight: 500;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}

.action-btn {
  /* iOS 風格主要按鈕 */
  width: 100%;
  padding: 10px 14px;
  background: rgba(0, 122, 255, 0.15);
  color: #007aff;
  border: 0.5px solid rgba(0, 122, 255, 0.3);
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  /* iOS 風格按鈕效果 */
  -webkit-font-smoothing: antialiased;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  margin-top: 2px;
  flex-shrink: 0;
}

.action-btn:hover {
  background: rgba(0, 122, 255, 0.25);
  border-color: rgba(0, 122, 255, 0.5);
  transform: scale(0.98);
}

.action-btn:active {
  background: rgba(0, 122, 255, 0.35);
  transform: scale(0.96);
}

/* 圖表區 - 右側 */
.chart-section {
  padding: 12px;
  background: rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  min-height: 240px;
  height: 240px;
  max-height: 240px;
  display: flex;
  align-items: stretch;
  justify-content: stretch;
  border-radius: 0 0 16px 16px;
  border-top: 0.5px solid rgba(255, 255, 255, 0.1);
  overflow: hidden;
  position: relative;
  box-sizing: border-box;
}

.chart-section > * {
  width: 100%;
  height: 100%;
  min-height: 0;
  flex-shrink: 0;
}

/* 確保圖表組件能正確顯示 */
.chart-section :deep(canvas),
.chart-section :deep(svg) {
  max-width: 100%;
  max-height: 100%;
  width: 100% !important;
  height: 100% !important;
}

.chart-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.5);
  font-size: 14px;
  font-weight: 400;
  -webkit-font-smoothing: antialiased;
}

/* Tablet and Desktop Styles - 左右佈局 */
@media (min-width: 768px) {
  .favorite-item {
    flex-direction: row;
    width: 100%;
    min-width: auto;
    max-width: none;
    margin-bottom: 0;
    border-radius: 16px;
    /* iOS 風格桌面陰影 */
    box-shadow: 
      0 4px 16px rgba(0, 0, 0, 0.12),
      0 2px 8px rgba(0, 0, 0, 0.08),
      inset 0 1px 0 rgba(255, 255, 255, 0.05);
  }

  .node-info-section {
    flex: 0 0 320px;
    padding: 18px;
    border-right: 0.5px solid rgba(255, 255, 255, 0.1);
    border-bottom: none;
    max-height: 100%;
    overflow-y: auto;
  }

  .node-name {
    font-size: 17px;
  }

  .node-icon {
    font-size: 22px;
  }

  .chart-section {
    flex: 1;
    padding: 16px;
    min-height: 320px;
    height: 320px;
    max-height: 320px;
    border-radius: 0 16px 16px 0;
    border-top: none;
    overflow: hidden;
    box-sizing: border-box;
  }
  
  .chart-section > * {
    width: 100%;
    height: 100%;
    min-height: 0;
    max-width: 100%;
    max-height: 100%;
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
    font-size: 12px;
    color: rgba(255, 255, 255, 0.6);
  }

  .value {
    font-size: 14px;
    word-break: break-word;
    color: #ffffff;
  }
}

/* Large Desktop Styles */
@media (min-width: 1024px) {
  .node-info-section {
    flex: 0 0 360px;
  }

  .chart-section {
    min-height: 360px;
    height: 360px;
    max-height: 360px;
  }

  .node-details {
    grid-template-columns: 1fr 1fr;
    gap: 12px 20px;
  }

  .label {
    font-size: 13px;
  }

  .value {
    font-size: 15px;
  }
}

/* Extra Large Desktop */
@media (min-width: 1400px) {
  .node-info-section {
    flex: 0 0 400px;
  }

  .chart-section {
    min-height: 400px;
    height: 400px;
    max-height: 400px;
  }

  .node-name {
    font-size: 19px;
  }

  .node-icon {
    font-size: 26px;
  }

  .info-row {
    flex-direction: column;
  }
}
</style>

