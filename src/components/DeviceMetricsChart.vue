<template>
  <div class="metrics-chart-container">
    <div v-if="loading" class="loading">載入圖表中...</div>
    <div v-else-if="!metrics || metrics.length === 0" class="no-data">暫無設備指標數據</div>
    <div v-else class="chart-wrapper">
      <canvas :id="canvasId" ref="chartCanvas"></canvas>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { Chart, registerables } from 'chart.js';

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
      pointRadius: 3,
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
      pointRadius: 3,
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
      pointRadius: 3,
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
            text: '電池 (%)',
            font: { size: 10 },
            color: '#4CAF50'
          },
          min: 0,
          max: 100,
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
</style>
