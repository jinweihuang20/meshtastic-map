<template>
  <div ref="containerRef" class="metrics-chart-container" :style="{ height: height }">
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
    <el-dialog v-model="fullscreenVisible" :title="`${nodeId} - 設備指標趨勢`" :width="dialogWidth" :fullscreen="isMobile"
      @close="closeFullscreen" @opened="() => { setTimeout(() => resizeFullscreenChart(), 100); }">
      <div class="fullscreen-chart-container">
        <canvas :id="fullscreenCanvasId" ref="fullscreenCanvas"></canvas>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
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
const containerRef = ref(null);

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

// ResizeObserver 實例
let resizeObserver = null;
let windowResizeHandler = null;

// 準備標籤數據
const prepareLabels = () => {
  return props.metrics.map(m => new Date(m.created_at).toLocaleDateString('zh-TW', {
    month: 'short',
    day: 'numeric'
  }));
};

// 創建數據集
const createDatasets = (isFullscreen = false) => {
  const datasets = [];
  const pointRadius = 2;
  const pointHoverRadius = 4;
  const batteryHoverRadius = isFullscreen ? 6 : 5;

  // 電池電量數據集
  if (props.showBattery) {
    const batteryData = props.metrics.map(m => m.battery_level || 0);
    datasets.push({
      label: '電池電量 (%)',
      data: batteryData,
      borderColor: 'rgb(59, 130, 246)',
      backgroundColor: 'rgba(76, 175, 80, 0.1)',
      yAxisID: 'y',
      tension: 0, // 非圓滑模式
      pointRadius: 0, // 不顯示點
      pointHoverRadius: batteryHoverRadius
    });
  }

  // 頻道使用率數據集
  if (props.showChannelUtilization) {
    const channelUtilData = props.metrics.map(m => parseFloat(m.channel_utilization) || 0);
    datasets.push({
      label: '頻道使用率 (%)',
      data: channelUtilData,
      borderColor: 'rgb(0, 208, 76)',
      backgroundColor: 'rgba(33, 150, 243, 0.1)',
      yAxisID: 'y1',
      tension: 0,
      borderWidth: 0, // 不顯示線
      pointRadius: pointRadius,
      pointHoverRadius: pointHoverRadius,
      pointBackgroundColor: 'rgb(0, 208, 76)',
      pointBorderWidth: 0 // 無外框
    });
  }

  // 空中傳輸率數據集
  if (props.showAirUtilTx) {
    const airUtilData = props.metrics.map(m => parseFloat(m.air_util_tx) || 0);
    datasets.push({
      label: '空中傳輸率 (%)',
      data: airUtilData,
      borderColor: 'rgb(244, 102, 0)',
      backgroundColor: 'transparent', // 不顯示填充
      yAxisID: 'y1',
      tension: 0,
      borderWidth: 0, // 不顯示線
      pointRadius: pointRadius,
      pointHoverRadius: pointHoverRadius,
      pointBackgroundColor: 'rgb(244, 102, 0)', // 點顏色與邊框顏色一致
      pointBorderWidth: 0 // 無外框
    });
  }

  return datasets;
};

// 創建圖表配置選項
const createChartOptions = (isFullscreen = false) => {
  const fontSize = {
    legend: isFullscreen ? 14 : 10,
    title: isFullscreen ? 18 : 14,
    tooltipTitle: isFullscreen ? 14 : 12,
    tooltipBody: isFullscreen ? 13 : 11,
    xAxis: isFullscreen ? 12 : 9,
    yAxis: isFullscreen ? 13 : 10,
    yAxisTicks: isFullscreen ? 12 : 9
  };

  const padding = {
    legend: isFullscreen ? 15 : 10,
    title: isFullscreen ? { top: 10, bottom: 15 } : { top: 5, bottom: 10 },
    tooltip: isFullscreen ? 12 : 10
  };

  return {
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
          font: { size: fontSize.legend },
          usePointStyle: true,
          padding: padding.legend
        }
      },
      title: {
        display: true,
        text: '設備指標趨勢',
        font: { size: fontSize.title, weight: 'bold' },
        padding: padding.title
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleFont: { size: fontSize.tooltipTitle },
        bodyFont: { size: fontSize.tooltipBody },
        padding: padding.tooltip,
        displayColors: true
      }
    },
    scales: {
      x: {
        display: true,
        ticks: {
          maxRotation: 45,
          minRotation: 45,
          font: { size: fontSize.xAxis },
          maxTicksLimit: isFullscreen ? 15 : 10
        },
        grid: {
          display: isFullscreen,
          color: isFullscreen ? 'rgba(0, 0, 0, 0.05)' : undefined
        }
      },
      y: {
        type: 'linear',
        display: props.showBattery,
        position: 'left',
        title: {
          display: props.showBattery,
          text: isFullscreen ? '電池 (%)' : '電量 (%)',
          font: { size: fontSize.yAxis },
          color: '#4CAF50'
        },
        min: 0,
        max: isFullscreen ? 100 : 110,
        ticks: {
          font: { size: fontSize.yAxisTicks }
        }
      },
      y1: {
        type: 'linear',
        display: props.showChannelUtilization || props.showAirUtilTx,
        position: 'right',
        title: {
          display: props.showChannelUtilization || props.showAirUtilTx,
          text: '使用率 (%)',
          font: { size: fontSize.yAxis },
          color: '#2196F3'
        },
        min: 0,
        max: 100,
        ticks: {
          font: { size: fontSize.yAxisTicks }
        },
        grid: {
          drawOnChartArea: false,
        }
      }
    }
  };
};

// 創建圖表實例
const createChartInstance = (canvas, isFullscreen = false) => {
  if (!canvas || !props.metrics || props.metrics.length === 0) {
    return null;
  }

  const labels = prepareLabels();
  const datasets = createDatasets(isFullscreen);
  const options = createChartOptions(isFullscreen);

  return new Chart(canvas, {
    type: 'line',
    data: {
      labels: labels,
      datasets: datasets
    },
    options: options
  });
};

// 創建圖表
const createChart = () => {
  if (!chartCanvas.value) {
    return;
  }

  // 銷毀舊圖表
  if (chartInstance.value) {
    chartInstance.value.destroy();
  }

  chartInstance.value = createChartInstance(chartCanvas.value, false);

  // 確保圖表正確調整大小
  if (chartInstance.value) {
    nextTick(() => {
      resizeChart();
    });
  }
};

// 創建全屏圖表
const createFullscreenChart = () => {
  if (!fullscreenCanvas.value) {
    return;
  }

  // 銷毀舊圖表
  if (fullscreenChartInstance.value) {
    fullscreenChartInstance.value.destroy();
  }

  fullscreenChartInstance.value = createChartInstance(fullscreenCanvas.value, true);

  // 確保全屏圖表正確調整大小
  if (fullscreenChartInstance.value) {
    nextTick(() => {
      resizeFullscreenChart();
    });
  }
};

// 調整圖表大小
const resizeChart = () => {
  if (chartInstance.value) {
    try {
      chartInstance.value.resize();
    } catch (error) {
      console.warn('圖表調整大小失敗:', error);
    }
  }
};

// 調整全屏圖表大小
const resizeFullscreenChart = () => {
  if (fullscreenChartInstance.value) {
    try {
      fullscreenChartInstance.value.resize();
    } catch (error) {
      console.warn('全屏圖表調整大小失敗:', error);
    }
  }
};

// 打開全屏模式
const openFullscreen = () => {
  fullscreenVisible.value = true;
  // 等待 DOM 更新後創建圖表
  setTimeout(() => {
    createFullscreenChart();
    // 確保圖表正確調整大小
    setTimeout(() => {
      resizeFullscreenChart();
    }, 50);
  }, 100);
};

// 關閉全屏模式
const closeFullscreen = () => {
  if (fullscreenChartInstance.value) {
    fullscreenChartInstance.value.destroy();
    fullscreenChartInstance.value = null;
  }
  // 關閉全屏後，調整主圖表大小
  setTimeout(() => {
    resizeChart();
  }, 100);
};

// 監聽 metrics 變化
watch(() => props.metrics, () => {
  createChart();
}, { deep: true });

// 監聽窗口大小變化
windowResizeHandler = () => {
  resizeChart();
  if (fullscreenVisible.value) {
    resizeFullscreenChart();
  }
};

// 組件掛載時創建圖表
onMounted(async () => {
  if (props.metrics && props.metrics.length > 0) {
    createChart();
  }

  // 監聽窗口大小變化
  window.addEventListener('resize', windowResizeHandler);

  // 等待 DOM 更新後設置 ResizeObserver
  await nextTick();
  if (containerRef.value && window.ResizeObserver) {
    resizeObserver = new ResizeObserver(() => {
      resizeChart();
    });
    resizeObserver.observe(containerRef.value);
  }
});

// 組件卸載時銷毀圖表
onUnmounted(() => {
  // 移除窗口大小監聽
  if (windowResizeHandler) {
    window.removeEventListener('resize', windowResizeHandler);
  }

  // 移除 ResizeObserver
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }

  // 銷毀圖表實例
  if (chartInstance.value) {
    chartInstance.value.destroy();
    chartInstance.value = null;
  }
  if (fullscreenChartInstance.value) {
    fullscreenChartInstance.value.destroy();
    fullscreenChartInstance.value = null;
  }
});

// 暴露方法供外部調用
defineExpose({
  refresh: createChart,
  resize: resizeChart,
  destroy: () => {
    if (chartInstance.value) {
      chartInstance.value.destroy();
      chartInstance.value = null;
    }
    if (fullscreenChartInstance.value) {
      fullscreenChartInstance.value.destroy();
      fullscreenChartInstance.value = null;
    }
  }
});
</script>

<style scoped>
.metrics-chart-container {
  width: 100%;
  min-height: 200px;
  position: relative;
  display: flex;
  flex-direction: column;
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
  flex: 1;
  position: relative;
  min-height: 0;
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
