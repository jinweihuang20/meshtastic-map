<template>
  <div class="favorite-item" :class="{ 'card-active': cardIndex === activeIndex }" :style="cardStyle">
    <!-- 移除按鈕 - 右上角浮動按鈕 -->
    <button class="remove-btn-floating" @click="handleRemove" title="移除收藏">
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z"
          fill="currentColor" />
      </svg>
    </button>
    <!-- 左側：節點信息 -->
    <div class="node-info-section">
      <div class="node-header">
        <div class="node-name">
          <div class="node-icon-wrapper">
            <svg class="node-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <!-- 無線網絡節點圖標 -->
              <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2" fill="none" />
              <path d="M12 1V5M12 19V23M1 12H5M19 12H23" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" />
              <path d="M4.93 4.93L7.76 7.76M16.24 16.24L19.07 19.07M4.93 19.07L7.76 16.24M16.24 7.76L19.07 4.93"
                stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            </svg>
          </div>
          <div class="node-name-content">
            <strong>{{ node.long_name || node.short_name || '未知節點' }}</strong>
            <div style="font-size: smaller; color: #666;"> {{ node.role_name || 'CLIENT BASE' }}</div>
          </div>
        </div>
      </div>
      <div class="node-details">
        <div class="info-row">
          <span class="label">Short name</span>
          <span class="value">
            <el-tag :style="getShortNameTagStyle()" effect="dark">{{ node.short_name || '未知' }}</el-tag>
          </span>
        </div>
        <div class="info-row">
          <span class="label">ID</span>
          <span class="value">{{ node.node_id_hex || node.node_id }}</span>
        </div>
        <div class="info-row">
          <span class="label">型號</span>
          <span class="value">{{ node.hardware_model_name || '未知' }}</span>
        </div>

        <div class="info-row">
          <span class="label">位置</span>
          <span class="value">{{ formatCoordinates(node.latitude, node.longitude) }}</span>
        </div>
        <template v-if="latestMetric">
          <div v-if="latestMetric.battery_level !== undefined" class="info-row metric-card">
            <div class="metric-icon battery-icon" :class="getBatteryClass(latestMetric.battery_level)">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <!-- 電池圖標 -->
                <rect x="2" y="7" width="18" height="10" rx="2" stroke="currentColor" stroke-width="2" fill="none" />
                <rect x="20" y="10" width="2" height="4" fill="currentColor" />
                <rect x="4" y="9" :width="(latestMetric.battery_level / 100) * 14" height="6" rx="1"
                  fill="currentColor" />
              </svg>
            </div>
            <div class="metric-content">
              <span class="label">電量</span>
              <span class="value metric-value">{{ latestMetric.battery_level }}%</span>
            </div>
          </div>
          <div v-if="latestMetric.channel_utilization !== undefined" class="info-row metric-card">
            <div class="metric-icon channel-icon">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <!-- 頻道/信號強度圖標 -->
                <path d="M2 12C2 12 5 8 12 8C19 8 22 12 22 12" stroke="currentColor" stroke-width="2"
                  stroke-linecap="round" fill="none" />
                <path d="M5 12C5 12 7 10 12 10C17 10 19 12 19 12" stroke="currentColor" stroke-width="2"
                  stroke-linecap="round" fill="none" />
                <path d="M8 12C8 12 9 11 12 11C15 11 16 12 16 12" stroke="currentColor" stroke-width="2"
                  stroke-linecap="round" fill="none" />
                <circle cx="12" cy="12" r="1.5" fill="currentColor" />
              </svg>
            </div>
            <div class="metric-content">
              <span class="label">頻道利用率</span>
              <span class="value metric-value">{{ parseFloat(latestMetric.channel_utilization || 0).toFixed(1)
              }}%</span>
            </div>
          </div>
          <div v-if="latestMetric.air_util_tx !== undefined" class="info-row metric-card">
            <div class="metric-icon air-icon">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <!-- 空中傳輸/數據流圖標 -->
                <path d="M3 12H21" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                <path d="M6 8L3 12L6 16" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                  stroke-linejoin="round" fill="none" />
                <path d="M18 8L21 12L18 16" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                  stroke-linejoin="round" fill="none" />
                <circle cx="12" cy="12" r="2" fill="currentColor" />
                <path d="M9 9L12 12L9 15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"
                  stroke-linejoin="round" fill="none" />
                <path d="M15 9L12 12L15 15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"
                  stroke-linejoin="round" fill="none" />
              </svg>
            </div>
            <div class="metric-content">
              <span class="label">空中傳輸率</span>
              <span class="value metric-value">{{ parseFloat(latestMetric.air_util_tx || 0).toFixed(1) }}%</span>
            </div>
          </div>
          <div v-if="latestMetric.updated_at" class="info-row metric-card">
            <div class="metric-icon time-icon">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none" />
                <path d="M12 6V12L16 14" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
              </svg>
            </div>
            <div class="metric-content">
              <span class="label">更新時間</span>
              <span class="value metric-value">{{ getRelativeTime(latestMetric.updated_at) }}</span>
            </div>
          </div>
        </template>
      </div>
    </div>
    <!-- 右側：趨勢圖 -->
    <div class="chart-section">
      <!-- {{ node }} -->
      <DeviceMetricsChart v-if="metrics && metrics.length > 0" :node-id="node.node_id" :metrics="metrics"
        :height="chartHeight" />
      <div v-else-if="loadingMetrics" class="chart-placeholder"> 載入圖表中... </div>
      <div v-else class="chart-placeholder"> 暫無設備指標數據 </div>
    </div>
  </div>
</template>
<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { ElMessageBox } from 'element-plus';
import { getNodeColorStyle } from '../utils/colorUtils.js';
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
  },
  cardIndex: {
    type: Number,
    default: 0
  },
  activeIndex: {
    type: Number,
    default: 0
  }
});

const emit = defineEmits(['remove', 'view-on-map']);

// 監聽窗口大小變化
const windowWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 768);
const handleResize = () => {
  windowWidth.value = window.innerWidth;
};

onMounted(() => {
  window.addEventListener('resize', handleResize);
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
});

// 獲取最新的指標數據
const latestMetric = computed(() => {
  if (props.metrics && props.metrics.length > 0) {
    return props.metrics[props.metrics.length - 1];
  }
  return null;
});

// 計算卡片與活動卡片的距離
const distanceFromActive = computed(() => {
  return Math.abs(props.cardIndex - props.activeIndex);
});

// 計算卡片的透明度和縮放（僅移動端）
const cardStyle = computed(() => {
  // 桌面端（>= 768px）不應用透明度和縮放效果
  if (windowWidth.value >= 768) {
    return {};
  }

  const distance = distanceFromActive.value;

  if (distance === 0) {
    // 活動卡片：完全不透明，正常大小
    return {
      opacity: 1,
      transform: 'scale(1) translateZ(0)',
      zIndex: 10
    };
  } else if (distance === 1) {
    // 相鄰卡片：稍微透明，稍微縮小
    return {
      opacity: 0.6,
      transform: 'scale(0.92) translateZ(0)',
      zIndex: 5
    };
  } else {
    // 更遠的卡片：更透明，更小
    const opacity = Math.max(0.3, 0.6 - (distance - 1) * 0.15);
    const scale = Math.max(0.85, 0.92 - (distance - 1) * 0.05);
    return {
      opacity: opacity,
      transform: `scale(${scale}) translateZ(0)`,
      zIndex: 1
    };
  }
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

// 處理移除收藏（帶確認對話框）
const handleRemove = async () => {
  try {
    await ElMessageBox.confirm(
      `確定要移除「${props.node.long_name || props.node.short_name || '未知節點'}」的收藏嗎？`,
      '確認移除收藏',
      {
        confirmButtonText: '確定移除',
        cancelButtonText: '取消',
        type: 'warning',
        confirmButtonClass: 'el-button--danger',
        center: true,
        customClass: 'remove-confirm-dialog'
      }
    );
    // 用戶確認後才執行移除
    emit('remove', props.node.node_id);
  } catch (error) {
    // 用戶取消，不執行任何操作
    // console.log('用戶取消了移除操作');
  }
};

// 處理在地圖上查看
const handleViewOnMap = () => {
  emit('view-on-map', props.node);
};

// 根據電量獲取電池狀態類別
const getBatteryClass = (batteryLevel) => {
  if (batteryLevel >= 60) return 'battery-high';
  if (batteryLevel >= 30) return 'battery-medium';
  return 'battery-low';
};

// 根據 node_id_hex 獲取標籤樣式
const getShortNameTagStyle = () => {
  return getNodeColorStyle(props.node.node_id_hex || '');
};
</script>
<style scoped>
.favorite-item {
  /* 現代化設計：漸變背景、毛玻璃效果 */
  background: linear-gradient(135deg, rgba(20, 20, 25, 0.95) 0%, rgba(30, 30, 40, 0.95) 100%);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 14px;
  overflow: visible;
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  flex-direction: column;
  position: relative;
  margin-bottom: 0;
  /* 現代化陰影系統 */
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.3),
    0 2px 8px rgba(0, 0, 0, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
  /* 確保內容不會溢出 */
  min-height: 0;
}

/* 移動端專用樣式 */
@media (max-width: 767px) {
  .favorite-item {
    /* 卡片寬度：容器寬度減去左右各 16px，讓卡片更填滿畫面 */
    width: calc(100vw - 32px);
    min-width: calc(100vw - 32px);
    max-width: calc(100vw - 32px);
    /* 卡片高度：視口高度減去導航欄、搜尋欄、快速導航欄等 */
    height: calc(100vh - var(--navbar-height, 60px) - 48px - 56px - 8px);
    max-height: calc(100vh - var(--navbar-height, 60px) - 48px - 56px - 8px);
    flex-shrink: 0;
    /* 確保觸摸事件可以正常傳遞 */
    touch-action: pan-x pan-y;
    /* 防止意外觸發縮放 */
    -webkit-user-select: none;
    user-select: none;
    /* 優化渲染性能 */
    will-change: transform, opacity;
    /* 啟用硬件加速 */
    transform: translateZ(0);
    /* 翻書效果：默認狀態 */
    opacity: 0.6;
    transform: scale(0.92) translateZ(0);
    /* 確保內容可以垂直滾動 */
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
}

.favorite-item.card-active {
  opacity: 1;
  transform: scale(1) translateZ(0);
  z-index: 10;
  border-color: rgba(255, 255, 255, 0.2);
  box-shadow:
    0 12px 48px rgba(0, 0, 0, 0.4),
    0 4px 16px rgba(0, 0, 0, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.12),
    0 0 0 1px rgba(255, 255, 255, 0.05);
}

/* 節點信息區 - 左側 */
.node-info-section {
  padding: 14px;
  padding-top: 50px;
  background: transparent;
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* 移動端專用：優化節點信息區布局 */
@media (max-width: 767px) {
  .node-info-section {
    padding: 12px 12px 0 12px;
    gap: 8px;
    /* 確保 node-details 能夠填滿剩餘空間 */
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .node-header {
    padding-bottom: 8px;
    margin-bottom: 0;
    flex-shrink: 0;
  }
}

.node-header {
  display: flex;
  align-items: center;
  padding-bottom: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  margin-bottom: 4px;
  flex-shrink: 0;
  padding-right: 0;
}

.node-name {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.node-icon-wrapper {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(139, 92, 246, 0.2) 100%);
  border-radius: 10px;
  border: 1px solid rgba(99, 102, 241, 0.3);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.node-icon-wrapper:hover {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.3) 0%, rgba(139, 92, 246, 0.3) 100%);
  transform: scale(1.05);
}

.node-icon {
  width: 20px;
  height: 20px;
  color: #a78bfa;
}

.node-name-content {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.node-name-content strong {
  font-size: 18px;
  letter-spacing: -0.3px;
  color: #ffffff;
  font-weight: 600;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.battery-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 4px;
  transition: all 0.2s ease;
}

.battery-indicator.battery-high {
  color: #10b981;
  background: rgba(16, 185, 129, 0.15);
}

.battery-indicator.battery-medium {
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.15);
}

.battery-indicator.battery-low {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.15);
}

.battery-icon {
  width: 14px;
  height: 14px;
}

/* 移除按鈕 - 右上角浮動按鈕 */
.remove-btn-floating {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 100;
  /* 現代化浮動按鈕設計 */
  background: rgba(239, 68, 68, 0.15);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #ef4444;
  width: 36px;
  height: 36px;
  padding: 0;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 2px 8px rgba(239, 68, 68, 0.2);
  -webkit-font-smoothing: antialiased;
}

.remove-btn-floating svg {
  width: 18px;
  height: 18px;
  transition: transform 0.3s ease;
}

.remove-btn-floating:hover {
  background: rgba(239, 68, 68, 0.25);
  border-color: rgba(239, 68, 68, 0.5);
  transform: scale(1.1);
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
}

.remove-btn-floating:hover svg {
  transform: rotate(90deg);
}

.remove-btn-floating:active {
  background: rgba(239, 68, 68, 0.35);
  transform: scale(1.05);
}

/* 移動端優化 */
@media (max-width: 767px) {
  .remove-btn-floating {
    top: 10px;
    right: 10px;
    width: 32px;
    height: 32px;
  }

  .remove-btn-floating svg {
    width: 16px;
    height: 16px;
  }
}

.node-details {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
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

/* 移動端專用：固定高度且緊湊的排版 */
@media (max-width: 767px) {
  .node-details {
    /* 使用 flex: 1 填滿剩餘空間，而不是固定高度 */
    flex: 1;
    min-height: 0;
    width: 100%;
    /* 使用網格布局，兩列顯示，更專業 */
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px 10px;
    /* 緊湊的內邊距 */
    padding: 8px 0;
    /* 優化滾動 */
    overflow-y: auto;
    overflow-x: hidden;
    /* 自定義滾動條樣式 */
    scrollbar-width: thin;
    scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
    /* 優化滾動性能 */
    -webkit-overflow-scrolling: touch;
    /* 確保填滿容器 */
    box-sizing: border-box;
  }

  .node-details::-webkit-scrollbar {
    width: 3px;
  }

  .node-details::-webkit-scrollbar-track {
    background: transparent;
  }

  .node-details::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 1px;
  }

  .node-details::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.3);
  }

  .info-row {
    /* 網格布局下，每個 info-row 佔據一個網格單元 */
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: flex-start;
    gap: 4px;
    min-height: auto;
    /* 現代化卡片設計 */
    padding: 12px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    box-sizing: border-box;
    position: relative;
    overflow: hidden;
  }

  .info-row::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
    opacity: 0;
    transition: opacity 0.3s ease;
  }

  .info-row:hover {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(255, 255, 255, 0.15);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  }

  .info-row:hover::before {
    opacity: 1;
  }

  .metric-card {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 12px;
    padding: 14px;
  }

  .metric-icon {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    flex-shrink: 0;
  }

  .metric-icon svg {
    width: 18px;
    height: 18px;
  }

  .battery-icon {
    background: linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(5, 150, 105, 0.2) 100%);
    color: #10b981;
  }

  .battery-icon.battery-high {
    background: linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(5, 150, 105, 0.2) 100%);
    color: #10b981;
  }

  .battery-icon.battery-medium {
    background: linear-gradient(135deg, rgba(245, 158, 11, 0.2) 0%, rgba(217, 119, 6, 0.2) 100%);
    color: #f59e0b;
  }

  .battery-icon.battery-low {
    background: linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(220, 38, 38, 0.2) 100%);
    color: #ef4444;
  }

  .channel-icon {
    background: linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(99, 102, 241, 0.2) 100%);
    color: #60a5fa;
  }

  .air-icon {
    background: linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(168, 85, 247, 0.2) 100%);
    color: #a78bfa;
  }

  .time-icon {
    background: linear-gradient(135deg, rgba(236, 72, 153, 0.2) 0%, rgba(219, 39, 119, 0.2) 100%);
    color: #f472b6;
  }

  .metric-content {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
    min-width: 0;
  }

  .metric-value {
    font-size: 16px;
    font-weight: 600;
    color: #ffffff;
  }

  .time-value {
    font-size: 13px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.9);
  }

  .label {
    /* 更緊湊的字體大小 */
    font-size: 10px;
    color: rgba(255, 255, 255, 0.6);
    font-weight: 600;
    min-width: auto;
    width: 100%;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    line-height: 1.3;
    margin-bottom: 0;
  }

  .value {
    /* 更突出的值顯示 */
    font-size: 13px;
    color: #ffffff;
    font-weight: 500;
    width: 100%;
    line-height: 1.5;
    word-break: break-word;
    overflow-wrap: break-word;
    display: flex;
    align-items: center;
    min-height: 20px;
  }

  .metric-card {
    flex-direction: row;
    align-items: center;
    gap: 10px;
    padding: 12px;
  }

  .metric-icon {
    width: 28px;
    height: 28px;
    flex-shrink: 0;
  }

  .metric-icon svg {
    width: 16px;
    height: 16px;
  }

  .metric-content {
    flex: 1;
    min-width: 0;
  }

  .metric-value {
    font-size: 14px;
    font-weight: 600;
  }

  .time-value {
    font-size: 12px;
  }

  /* 特殊值的樣式優化 */
  .value :deep(.el-tag) {
    font-size: 11px;
    padding: 4px 10px;
    margin-top: 0;
    font-weight: 600;
  }
}

/* iOS 風格標籤 */
.value :deep(.el-tag) {
  background: rgba(0, 122, 255, 0.15);
  border: 0.5px solid rgba(0, 122, 255, 0.3);
  color: #007aff;
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 12px;
  font-weight: 500;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  transition: all 0.2s ease;
}

/* 桌面端標籤優化 */
@media (min-width: 768px) {
  .value :deep(.el-tag) {
    padding: 4px 10px;
    font-size: 12px;
    font-weight: 600;
    border-radius: 6px;
  }
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
  padding: 16px;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.3) 0%, rgba(0, 0, 0, 0.2) 100%);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  min-height: 240px;
  height: 240px;
  max-height: 240px;
  flex-shrink: 0;
  display: flex;
  align-items: stretch;
  justify-content: stretch;
  border-radius: 0;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  overflow: hidden;
  position: relative;
  box-sizing: border-box;
}

/* 移動端專用：讓圖表與 node-details 更緊湊 */
@media (max-width: 767px) {
  .chart-section {
    padding: 8px 12px 12px 12px;
    border-top: none;
    border-radius: 0;
    margin-top: 0;
  }

  /* 移除 node-details 的底部間距，讓它與圖表更緊密 */
  .node-details {
    margin-bottom: 0;
    padding-bottom: 0;
  }
}

.chart-section>* {
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
    border-radius: 14px;
    /* iOS 風格桌面陰影 */
    box-shadow:
      0 4px 16px rgba(0, 0, 0, 0.12),
      0 2px 8px rgba(0, 0, 0, 0.08),
      inset 0 1px 0 rgba(255, 255, 255, 0.05);
    /* 桌面端：不透明，正常大小 */
    opacity: 1;
    transform: none;
  }

  .node-info-section {
    flex: 0 0 320px;
    padding: 18px;
    padding-top: 50px;
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
    border-radius: 0;
    border-top: none;
    overflow: hidden;
    box-sizing: border-box;
  }

  .chart-section>* {
    width: 100%;
    height: 100%;
    min-height: 0;
    max-width: 100%;
    max-height: 100%;
  }

  .node-details {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px 16px;
    padding: 4px 0;
  }

  .info-row {
    flex-direction: column;
    gap: 6px;
    min-height: auto;
    /* 現代化卡片式設計 */
    padding: 16px 18px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    box-sizing: border-box;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    position: relative;
    overflow: hidden;
  }

  .info-row::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.1), transparent);
    opacity: 0;
    transition: opacity 0.3s ease;
  }

  .info-row:hover {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(255, 255, 255, 0.15);
    transform: translateY(-3px);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
  }

  .info-row:hover::before {
    opacity: 1;
  }

  .metric-card {
    flex-direction: row;
    align-items: center;
    gap: 14px;
    padding: 16px 18px;
  }

  .metric-icon {
    width: 36px;
    height: 36px;
  }

  .metric-icon svg {
    width: 20px;
    height: 20px;
  }

  .metric-value {
    font-size: 18px;
  }

  .label {
    min-width: auto;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.5);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    line-height: 1.4;
    margin-bottom: 2px;
  }

  .value {
    font-size: 15px;
    word-break: break-word;
    color: #ffffff;
    font-weight: 500;
    line-height: 1.5;
  }
}

/* Large Desktop Styles */
@media (min-width: 1024px) {
  .node-info-section {
    flex: 0 0 360px;
    padding: 20px;
  }

  .chart-section {
    min-height: 360px;
    height: 360px;
    max-height: 360px;
  }

  .node-details {
    grid-template-columns: 1fr 1fr;
    gap: 14px 20px;
    padding: 6px 0;
  }

  .info-row {
    padding: 16px 18px;
    border-radius: 10px;
  }

  .label {
    font-size: 11px;
    letter-spacing: 1px;
  }

  .value {
    font-size: 16px;
    font-weight: 500;
  }

  /* 優化標籤樣式 */
  .value :deep(.el-tag) {
    font-size: 12px;
    padding: 4px 12px;
    font-weight: 600;
  }
}

/* Extra Large Desktop */
@media (min-width: 1400px) {
  .node-info-section {
    flex: 0 0 400px;
    padding: 24px;
    padding-top: 50px;
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

  .node-details {
    gap: 16px 24px;
    padding: 8px 0;
  }

  .info-row {
    flex-direction: column;
    padding: 18px 20px;
    border-radius: 10px;
  }

  .label {
    font-size: 12px;
    letter-spacing: 1.2px;
  }

  .value {
    font-size: 17px;
    font-weight: 500;
  }

  /* 超大螢幕優化標籤 */
  .value :deep(.el-tag) {
    font-size: 13px;
    padding: 5px 14px;
  }
}

/* 確認移除對話框自定義樣式 */
:deep(.remove-confirm-dialog) {
  background: rgba(20, 20, 25, 0.98);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  color: #ffffff;
}

:deep(.remove-confirm-dialog .el-message-box__title) {
  color: #ffffff;
  font-weight: 600;
}

:deep(.remove-confirm-dialog .el-message-box__message) {
  color: rgba(255, 255, 255, 0.9);
}

:deep(.remove-confirm-dialog .el-button--primary) {
  background: #ef4444;
  border-color: #ef4444;
}

:deep(.remove-confirm-dialog .el-button--primary:hover) {
  background: #dc2626;
  border-color: #dc2626;
}
</style>
