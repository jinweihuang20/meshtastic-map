<template>
  <div ref="containerRef" class="metrics-chart-container" :style="{ height: height }">
    <div v-if="loading" class="loading">載入圖表中...</div>
    <div v-else-if="!displayMetrics || displayMetrics.length === 0" class="no-data">暫無設備指標數據</div>
    <div v-else class="chart-wrapper">
      <!-- 控制欄 -->
      <div class="chart-controls">
        <!-- 天數選擇下拉選單 -->
        <el-select v-model="selectedDays" size="small" class="days-select" @change="handleDaysChange">
          <el-option v-for="option in dayOptions" :key="option.value" :label="option.label" :value="option.value" />
        </el-select>
        <!-- 放大按鈕 -->
        <button class="zoom-btn" @click="openFullscreen" title="放大圖表">
          🔍
        </button>
      </div>
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
import { ElDialog, ElSelect, ElOption } from 'element-plus';

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

// 內部存儲的 metrics（從 API 獲取）
const internalMetrics = ref([]);

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

// 天數選擇
const selectedDays = ref(7);
const dayOptions = [
  { label: '3 天', value: 3 },
  { label: '5 天', value: 5 },
  { label: '7 天', value: 7 }
];

// 決定使用哪個 metrics（優先使用 props.metrics，否則使用內部從 API 獲取的）
const displayMetrics = computed(() => {
  // 如果父組件提供了 metrics，需要根據選擇的天數過濾
  if (props.metrics && props.metrics.length > 0) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - selectedDays.value);

    return props.metrics.filter(m => {
      const metricDate = new Date(m.created_at);
      return metricDate >= cutoffDate;
    });
  }
  // 否則使用內部從 API 獲取的數據（已經根據天數過濾）
  return internalMetrics.value;
});

// 從 API 獲取設備指標數據
const fetchMetricsFromAPI = async () => {
  if (!props.nodeId) {
    return;
  }

  try {
    loading.value = true;
    // 根據選擇的天數計算 time_from
    const timeFrom = new Date(Date.now() - selectedDays.value * 24 * 60 * 60 * 1000).toISOString();
    const response = await fetch(`/api/v1/nodes/${props.nodeId}/device-metrics?time_from=${timeFrom}`);
    const data = await response.json();
    // 反轉數據陣列以確保時間順序從舊到新
    const metrics = data.device_metrics || [];
    internalMetrics.value = metrics.reverse();
  } catch (error) {
    console.error('獲取設備指標失敗:', error);
    internalMetrics.value = [];
  } finally {
    loading.value = false;
  }
};

// 準備標籤數據
const prepareLabels = () => {
  return displayMetrics.value.map(m => new Date(m.created_at).toLocaleDateString('zh-TW', {
    month: 'short',
    day: 'numeric'
  }));
};

// 創建數據集
const createDatasets = (isFullscreen = false) => {
  const datasets = [];
  const pointRadius = 4;
  const pointHoverRadius = 4;
  const batteryHoverRadius = isFullscreen ? 6 : 5;

  // 電池電量數據集
  if (props.showBattery) {
    const batteryData = displayMetrics.value.map(m => m.battery_level || 0);
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
    const channelUtilData = displayMetrics.value.map(m => parseFloat(m.channel_utilization) || 0);
    datasets.push({
      label: '頻道使用率 (%)',
      data: channelUtilData,
      borderColor: 'rgb(0, 208, 76)',
      backgroundColor: 'rgba(33, 150, 243, 0.1)',
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
    const airUtilData = displayMetrics.value.map(m => parseFloat(m.air_util_tx) || 0);
    datasets.push({
      label: '空中傳輸率 (%)',
      data: airUtilData,
      borderColor: 'rgb(244, 102, 0)',
      backgroundColor: 'transparent', // 不顯示填充
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
    title: { top: 15, bottom: 10 },
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
        min: 0,
        max: isFullscreen ? 100 : 110,
        ticks: {
          font: { size: fontSize.yAxisTicks }
        }
      },
    }
  };
};

// 處理天數變化
const handleDaysChange = async () => {
  // 如果父組件提供了 metrics，則不需要從 API 獲取（保持向後兼容）
  if (props.metrics && props.metrics.length > 0) {
    // 使用 props.metrics，但需要過濾（客戶端過濾）
    await nextTick();
    // 確保 canvas 已準備好
    if (chartCanvas.value) {
      createChart();
    }
    if (fullscreenVisible.value && fullscreenCanvas.value) {
      setTimeout(() => {
        createFullscreenChart();
      }, 100);
    }
  } else {
    // 從 API 重新獲取數據
    await fetchMetricsFromAPI();
    await nextTick();
    // 確保 canvas 已準備好
    if (chartCanvas.value) {
      createChart();
    }
    if (fullscreenVisible.value && fullscreenCanvas.value) {
      setTimeout(() => {
        createFullscreenChart();
      }, 100);
    }
  }
};

// 銷毀 canvas 上的任何現有圖表實例
const destroyExistingChart = (canvas) => {
  if (!canvas) {
    return;
  }

  try {
    // 使用 Chart.js 的方法檢查是否有已存在的圖表實例
    const existingChart = Chart.getChart(canvas);
    if (existingChart) {
      if (!existingChart.destroyed) {
        existingChart.destroy();
      }
    }
  } catch (error) {
    console.warn('銷毀現有圖表實例時出錯:', error);
  }
};

// 創建圖表實例
const createChartInstance = (canvas, isFullscreen = false) => {
  if (!canvas) {
    return null;
  }

  // 檢查 canvas 元素是否有效
  if (!canvas.getContext) {
    console.warn('Canvas 元素無效');
    return null;
  }

  // 先銷毀 canvas 上可能存在的任何圖表實例
  destroyExistingChart(canvas);

  // 嘗試獲取 canvas context 以驗證 canvas 是否可用
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.warn('無法獲取 canvas context');
      return null;
    }
  } catch (error) {
    console.warn('獲取 canvas context 失敗:', error);
    return null;
  }

  // 如果沒有數據，返回 null（但不會銷毀現有圖表）
  if (!displayMetrics.value || displayMetrics.value.length === 0) {
    return null;
  }

  const labels = prepareLabels();
  const datasets = createDatasets(isFullscreen);
  const options = createChartOptions(isFullscreen);

  try {
    return new Chart(canvas, {
      type: 'line',
      data: {
        labels: labels,
        datasets: datasets
      },
      options: options
    });
  } catch (error) {
    console.error('創建圖表實例失敗:', error);
    return null;
  }
};

// 創建圖表
const createChart = () => {
  if (!chartCanvas.value) {
    return;
  }

  // 檢查 canvas 元素是否還在 DOM 中
  if (!document.contains(chartCanvas.value)) {
    console.warn('Canvas 元素已從 DOM 中移除');
    return;
  }

  // 如果沒有數據，不銷毀現有圖表，直接返回
  if (!displayMetrics.value || displayMetrics.value.length === 0) {
    return;
  }

  // 銷毀舊圖表實例（通過引用）
  if (chartInstance.value) {
    try {
      if (!chartInstance.value.destroyed) {
        chartInstance.value.destroy();
      }
    } catch (error) {
      console.warn('銷毀圖表時出錯:', error);
    }
    chartInstance.value = null;
  }

  // 等待一小段時間確保舊圖表完全銷毀
  setTimeout(() => {
    if (!chartCanvas.value || !document.contains(chartCanvas.value)) {
      return;
    }

    // createChartInstance 內部會處理 canvas 上可能存在的其他圖表實例
    chartInstance.value = createChartInstance(chartCanvas.value, false);

    // 確保圖表正確調整大小
    if (chartInstance.value) {
      nextTick(() => {
        if (chartInstance.value && !chartInstance.value.destroyed) {
          resizeChart();
        }
      });
    }
  }, 100);
};

// 創建全屏圖表
const createFullscreenChart = () => {
  if (!fullscreenCanvas.value) {
    return;
  }

  // 檢查 canvas 元素是否還在 DOM 中
  if (!document.contains(fullscreenCanvas.value)) {
    console.warn('全屏 Canvas 元素已從 DOM 中移除');
    return;
  }

  // 如果沒有數據，不銷毀現有圖表，直接返回
  if (!displayMetrics.value || displayMetrics.value.length === 0) {
    return;
  }

  // 銷毀舊圖表實例（通過引用）
  if (fullscreenChartInstance.value) {
    try {
      if (!fullscreenChartInstance.value.destroyed) {
        fullscreenChartInstance.value.destroy();
      }
    } catch (error) {
      console.warn('銷毀全屏圖表時出錯:', error);
    }
    fullscreenChartInstance.value = null;
  }

  // 等待一小段時間確保舊圖表完全銷毀
  setTimeout(() => {
    if (!fullscreenCanvas.value || !document.contains(fullscreenCanvas.value)) {
      return;
    }

    // createChartInstance 內部會處理 canvas 上可能存在的其他圖表實例
    fullscreenChartInstance.value = createChartInstance(fullscreenCanvas.value, true);

    // 確保全屏圖表正確調整大小
    if (fullscreenChartInstance.value) {
      nextTick(() => {
        if (fullscreenChartInstance.value && !fullscreenChartInstance.value.destroyed) {
          resizeFullscreenChart();
        }
      });
    }
  }, 100);
};

// 調整圖表大小
const resizeChart = () => {
  if (chartInstance.value && !chartInstance.value.destroyed) {
    try {
      chartInstance.value.resize();
    } catch (error) {
      console.warn('圖表調整大小失敗:', error);
    }
  }
};

// 調整全屏圖表大小
const resizeFullscreenChart = () => {
  if (fullscreenChartInstance.value && !fullscreenChartInstance.value.destroyed) {
    try {
      fullscreenChartInstance.value.resize();
    } catch (error) {
      console.warn('全屏圖表調整大小失敗:', error);
    }
  }
};

// 打開全屏模式
const openFullscreen = async () => {
  fullscreenVisible.value = true;
  // 確保數據是最新的
  if (internalMetrics.value.length === 0) {
    await fetchMetricsFromAPI();
  }
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
    try {
      if (!fullscreenChartInstance.value.destroyed) {
        fullscreenChartInstance.value.destroy();
      }
    } catch (error) {
      console.warn('關閉全屏時銷毀圖表出錯:', error);
    }
    fullscreenChartInstance.value = null;
  }
  // 關閉全屏後，調整主圖表大小
  setTimeout(() => {
    if (chartInstance.value && !chartInstance.value.destroyed) {
      resizeChart();
    }
  }, 100);
};

// 監聽 nodeId 變化，重新獲取數據
watch(() => props.nodeId, async () => {
  // 如果父組件沒有提供 metrics，則從 API 獲取
  if (!props.metrics || props.metrics.length === 0) {
    await fetchMetricsFromAPI();
  }
  nextTick(() => {
    createChart();
  });
});

// 監聽 props.metrics 變化
watch(() => props.metrics, () => {
  nextTick(() => {
    createChart();
    if (fullscreenVisible.value) {
      setTimeout(() => {
        createFullscreenChart();
      }, 50);
    }
  });
}, { deep: true });

// 監聽內部 metrics 變化
watch(internalMetrics, () => {
  nextTick(() => {
    createChart();
    if (fullscreenVisible.value) {
      setTimeout(() => {
        createFullscreenChart();
      }, 50);
    }
  });
}, { deep: true });

// 監聽 displayMetrics 變化
watch(displayMetrics, () => {
  nextTick(() => {
    createChart();
    if (fullscreenVisible.value) {
      setTimeout(() => {
        createFullscreenChart();
      }, 50);
    }
  });
}, { deep: true });

// 監聽窗口大小變化
windowResizeHandler = () => {
  // 使用防抖避免頻繁調用
  if (chartInstance.value && !chartInstance.value.destroyed) {
    resizeChart();
  }
  if (fullscreenVisible.value && fullscreenChartInstance.value && !fullscreenChartInstance.value.destroyed) {
    resizeFullscreenChart();
  }
};

// 組件掛載時創建圖表
onMounted(async () => {
  await nextTick();

  // 如果父組件沒有提供 metrics，則從 API 獲取
  if (!props.metrics || props.metrics.length === 0) {
    await fetchMetricsFromAPI();
  }

  if (displayMetrics.value && displayMetrics.value.length > 0) {
    createChart();
  }

  // 監聽窗口大小變化
  window.addEventListener('resize', windowResizeHandler);

  // 等待 DOM 更新後設置 ResizeObserver
  await nextTick();
  if (containerRef.value && window.ResizeObserver) {
    resizeObserver = new ResizeObserver(() => {
      // 檢查圖表實例是否存在且未銷毀
      if (chartInstance.value && !chartInstance.value.destroyed) {
        resizeChart();
      }
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
    try {
      if (!chartInstance.value.destroyed) {
        chartInstance.value.destroy();
      }
    } catch (error) {
      console.warn('卸載時銷毀圖表出錯:', error);
    }
    chartInstance.value = null;
  }
  if (fullscreenChartInstance.value) {
    try {
      if (!fullscreenChartInstance.value.destroyed) {
        fullscreenChartInstance.value.destroy();
      }
    } catch (error) {
      console.warn('卸載時銷毀全屏圖表出錯:', error);
    }
    fullscreenChartInstance.value = null;
  }
});

// 暴露方法供外部調用
defineExpose({
  refresh: createChart,
  resize: resizeChart,
  destroy: () => {
    if (chartInstance.value) {
      try {
        if (!chartInstance.value.destroyed) {
          chartInstance.value.destroy();
        }
      } catch (error) {
        console.warn('外部調用銷毀圖表出錯:', error);
      }
      chartInstance.value = null;
    }
    if (fullscreenChartInstance.value) {
      try {
        if (!fullscreenChartInstance.value.destroyed) {
          fullscreenChartInstance.value.destroy();
        }
      } catch (error) {
        console.warn('外部調用銷毀全屏圖表出錯:', error);
      }
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

/* 控制欄 */
.chart-controls {
  position: absolute;
  top: 10px;
  right: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  z-index: 10;
}

/* 天數選擇下拉選單 */
.days-select {
  width: 80px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

:deep(.days-select .el-input__wrapper) {
  background: rgba(255, 255, 255, 0.95);
  box-shadow: 0 0 0 1px rgba(102, 126, 234, 0.2) inset;
}

:deep(.days-select .el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px rgba(102, 126, 234, 0.4) inset;
}

:deep(.days-select .el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px #667eea inset;
}

/* 放大按鈕 */
.zoom-btn {
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
  .chart-controls {
    top: 8px;
    right: 8px;
    gap: 6px;
  }

  .days-select {
    width: 70px;
  }

  .zoom-btn {
    width: 32px;
    height: 32px;
    font-size: 14px;
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
