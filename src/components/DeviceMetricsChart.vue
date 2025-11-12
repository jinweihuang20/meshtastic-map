<template>
  <div class="metrics-chart-container">
    <div v-if="loading" class="loading">載入圖表中...</div>
    <div v-else-if="!metrics || metrics.length === 0" class="no-data">暫無設備指標數據</div>
    <div v-else class="chart-wrapper">
      <!-- 放大按鈕 -->
      <button class="zoom-btn" @click="openFullscreen" title="放大圖表">
        🔍
      </button>
      <canvas :id="canvasId" ref="chartCanvas"></canvas>
    </div>

    <!-- 全屏模式對話框 -->
    <el-dialog
      v-model="fullscreenVisible"
      :title="`${nodeId} - 設備指標趨勢`"
      :width="dialogWidth"
      :fullscreen="isMobile"
      @close="closeFullscreen"
    >
      <div class="fullscreen-chart-container">
        <canvas :id="fullscreenCanvasId" ref="fullscreenCanvas"></canvas>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { Chart, registerables } from 'chart.js';
import { ElDialog } from 'element-plus';

// 註冊 Chart.js 組件
Chart.register(...registerables);

// Props
const props = defineProps({
  nodeId: {
    type: [String, Number],
    required: true
  },
  metrics: {
    type: Array,
    default: () => []
  },
  height: {
    type: String,
    default: '250px'
  },
  showBattery: {
    type: Boolean,
    default: true
  },
  showChannelUtilization: {
    type: Boolean,
    default: true
  },
  showAirUtilTx: {
    type: Boolean,
    default: true
  }
});

const chartCanvas = ref(null);
const chartInstance = ref(null);
const loading = ref(false);
const canvasId = `chart-${props.nodeId}-${Date.now()}`;

// 全屏相關
const fullscreenVisible = ref(false);
const fullscreenCanvas = ref(null);
const fullscreenChartInstance = ref(null);
const fullscreenCanvasId = `fullscreen-chart-${props.nodeId}-${Date.now()}`;

// 響應式設計
const isMobile = computed(() => window.innerWidth < 768);
const dialogWidth = computed(() => {
  if (window.innerWidth < 768) return '100%';
  if (window.innerWidth < 1024) return '90%';
  return '90%';
});

// 創建圖表
const createChart = () => {
  if (!chartCanvas.value || !props.metrics || props.metrics.length === 0) {
    return;
  }

  // 銷毀舊圖表
  if (chartInstance.value) {
    chartInstance.value.destroy();
  }

  // 準備數據
  const labels = props.metrics.map(m => new Date(m.created_at).toLocaleDateString('zh-TW', {
    month: 'short',
    day: 'numeric'
  }));

  const datasets = [];

  // 電池電量數據集
  if (props.showBattery) {
    const batteryData = props.metrics.map(m => m.battery_level || 0);
    datasets.push({
      label: '電池電量 (%)',
      data: batteryData,
      borderColor: '#4CAF50',
      backgroundColor: 'rgba(76, 175, 80, 0.1)',
      yAxisID: 'y',
      tension: 0.3,
      pointRadius: 0,
      pointHoverRadius: 5
    });
  }

  // 頻道使用率數據集
  if (props.showChannelUtilization) {
    const channelUtilData = props.metrics.map(m => parseFloat(m.channel_utilization) || 0);
    datasets.push({
      label: '頻道使用率 (%)',
      data: channelUtilData,
      borderColor: '#2196F3',
      backgroundColor: 'rgba(33, 150, 243, 0.1)',
      yAxisID: 'y1',
      tension: 0.3,
      pointRadius: 0,
      pointHoverRadius: 5
    });
  }

  // 空中傳輸率數據集
  if (props.showAirUtilTx) {
    const airUtilData = props.metrics.map(m => parseFloat(m.air_util_tx) || 0);
    datasets.push({
      label: '空中傳輸率 (%)',
      data: airUtilData,
      borderColor: '#FF9800',
      backgroundColor: 'rgba(255, 152, 0, 0.1)',
      yAxisID: 'y1',
      tension: 0.3,
      pointRadius: 0,
      pointHoverRadius: 5
    });
  }

  // 創建圖表
  chartInstance.value = new Chart(chartCanvas.value, {
    type: 'line',
    data: {
      labels: labels,
      datasets: datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            font: { size: 10 },
            usePointStyle: true,
            padding: 10
          }
        },
        title: {
          display: true,
          text: '設備指標趨勢',
          font: { size: 14, weight: 'bold' },
          padding: { top: 5, bottom: 10 }
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          titleFont: { size: 12 },
          bodyFont: { size: 11 },
          padding: 10,
          displayColors: true
        }
      },
      scales: {
        x: {
          display: true,
          ticks: {
            maxRotation: 45,
            minRotation: 45,
            font: { size: 9 },
            maxTicksLimit: 10
          },
          grid: {
            display: false
          }
        },
        y: {
          type: 'linear',
          display: props.showBattery,
          position: 'left',
          title: {
            display: props.showBattery,
            text: '電量 (%)',
            font: { size: 10 },
            color: '#4CAF50'
          },
          min: 0,
          max: 110,
          ticks: {
            font: { size: 9 }
          }
        },
        y1: {
          type: 'linear',
          display: props.showChannelUtilization || props.showAirUtilTx,
          position: 'right',
          title: {
            display: props.showChannelUtilization || props.showAirUtilTx,
            text: '使用率 (%)',
            font: { size: 10 },
            color: '#2196F3'
          },
          min: 0,
          max: 100,
          ticks: {
            font: { size: 9 }
          },
          grid: {
            drawOnChartArea: false,
          }
        }
      }
    }
  });
};

// 創建全屏圖表
const createFullscreenChart = () => {
  if (!fullscreenCanvas.value || !props.metrics || props.metrics.length === 0) {
    return;
  }

  // 銷毀舊圖表
  if (fullscreenChartInstance.value) {
    fullscreenChartInstance.value.destroy();
  }

  // 準備數據（與 createChart 相同）
  const labels = props.metrics.map(m => new Date(m.created_at).toLocaleDateString('zh-TW', {
    month: 'short',
    day: 'numeric'
  }));

  const datasets = [];

  if (props.showBattery) {
    const batteryData = props.metrics.map(m => m.battery_level || 0);
    datasets.push({
      label: '電池電量 (%)',
      data: batteryData,
      borderColor: '#4CAF50',
      backgroundColor: 'rgba(76, 175, 80, 0.1)',
      yAxisID: 'y',
      tension: 0.3,
      pointRadius: 0,
      pointHoverRadius: 6
    });
  }

  if (props.showChannelUtilization) {
    const channelUtilData = props.metrics.map(m => parseFloat(m.channel_utilization) || 0);
    datasets.push({
      label: '頻道使用率 (%)',
      data: channelUtilData,
      borderColor: '#2196F3',
      backgroundColor: 'rgba(33, 150, 243, 0.1)',
      yAxisID: 'y1',
      tension: 0.3,
      pointRadius: 0,
      pointHoverRadius: 6
    });
  }

  if (props.showAirUtilTx) {
    const airUtilData = props.metrics.map(m => parseFloat(m.air_util_tx) || 0);
    datasets.push({
      label: '空中傳輸率 (%)',
      data: airUtilData,
      borderColor: '#FF9800',
      backgroundColor: 'rgba(255, 152, 0, 0.1)',
      yAxisID: 'y1',
      tension: 0.3,
      pointRadius: 0,
      pointHoverRadius: 6
    });
  }

  // 創建全屏圖表（字體更大）
  fullscreenChartInstance.value = new Chart(fullscreenCanvas.value, {
    type: 'line',
    data: {
      labels: labels,
      datasets: datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            font: { size: 14 },
            usePointStyle: true,
            padding: 15
          }
        },
        title: {
          display: true,
          text: '設備指標趨勢',
          font: { size: 18, weight: 'bold' },
          padding: { top: 10, bottom: 15 }
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          titleFont: { size: 14 },
          bodyFont: { size: 13 },
          padding: 12,
          displayColors: true
        }
      },
      scales: {
        x: {
          display: true,
          ticks: {
            maxRotation: 45,
            minRotation: 45,
            font: { size: 12 },
            maxTicksLimit: 15
          },
          grid: {
            display: true,
            color: 'rgba(0, 0, 0, 0.05)'
          }
        },
        y: {
          type: 'linear',
          display: props.showBattery,
          position: 'left',
          title: {
            display: props.showBattery,
            text: '電池 (%)',
            font: { size: 13 },
            color: '#4CAF50'
          },
          min: 0,
          max: 100,
          ticks: {
            font: { size: 12 }
          }
        },
        y1: {
          type: 'linear',
          display: props.showChannelUtilization || props.showAirUtilTx,
          position: 'right',
          title: {
            display: props.showChannelUtilization || props.showAirUtilTx,
            text: '使用率 (%)',
            font: { size: 13 },
            color: '#2196F3'
          },
          min: 0,
          max: 100,
          ticks: {
            font: { size: 12 }
          },
          grid: {
            drawOnChartArea: false,
          }
        }
      }
    }
  });
};

// 打開全屏模式
const openFullscreen = () => {
  fullscreenVisible.value = true;
  // 等待 DOM 更新後創建圖表
  setTimeout(() => {
    createFullscreenChart();
  }, 100);
};

// 關閉全屏模式
const closeFullscreen = () => {
  if (fullscreenChartInstance.value) {
    fullscreenChartInstance.value.destroy();
    fullscreenChartInstance.value = null;
  }
};

// 監聽 metrics 變化
watch(() => props.metrics, () => {
  createChart();
}, { deep: true });

// 組件掛載時創建圖表
onMounted(() => {
  if (props.metrics && props.metrics.length > 0) {
    createChart();
  }
});

// 組件卸載時銷毀圖表
onUnmounted(() => {
  if (chartInstance.value) {
    chartInstance.value.destroy();
  }
});

// 暴露方法供外部調用
defineExpose({
  refresh: createChart,
  destroy: () => {
    if (chartInstance.value) {
      chartInstance.value.destroy();
    }
  }
});
</script>

<style scoped>
.metrics-chart-container {
  width: 100%;
  height: 100%;
  min-height: 200px;
  position: relative;
}

.loading,
.no-data {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #999;
  font-size: 14px;
  text-align: center;
  padding: 20px;
}

.chart-wrapper {
  width: 100%;
  height: 100%;
  position: relative;
}

canvas {
  max-width: 100%;
  max-height: 100%;
}

/* 放大按鈕 */
.zoom-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 36px;
  height: 36px;
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid #667eea;
  border-radius: 50%;
  cursor: pointer;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
  z-index: 10;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.zoom-btn:hover {
  background: #667eea;
  transform: scale(1.1);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.zoom-btn:active {
  transform: scale(0.95);
}

/* 全屏圖表容器 */
.fullscreen-chart-container {
  width: 100%;
  height: 70vh;
  min-height: 400px;
  position: relative;
  padding: 10px;
}

/* 移動端優化 */
@media (max-width: 768px) {
  .zoom-btn {
    width: 32px;
    height: 32px;
    font-size: 14px;
    top: 8px;
    right: 8px;
  }

  .fullscreen-chart-container {
    height: 60vh;
    min-height: 300px;
    padding: 5px;
  }
}

/* 平板優化 */
@media (min-width: 768px) and (max-width: 1024px) {
  .fullscreen-chart-container {
    height: 65vh;
    min-height: 450px;
  }
}

/* 大屏優化 */
@media (min-width: 1024px) {
  .fullscreen-chart-container {
    height: 75vh;
    min-height: 500px;
  }
}
</style>
