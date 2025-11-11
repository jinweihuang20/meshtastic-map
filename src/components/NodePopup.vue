<template>
  <div class="node-popup">
    <div class="node-info">
      <strong>{{ nodeName }}</strong><br>
      <small>ID: {{ nodeIdHex || nodeId }}</small><br>
      <small>型號: {{ hardwareModelName || '未知' }}</small><br>
      <small v-html="connectionStatus"></small><br>
      <small>位置: {{ latitude.toFixed(6) }}, {{ longitude.toFixed(6) }}</small>
      <small v-if="batteryLevel"><br>電量: {{ batteryLevel }}%</small>
      <small v-if="altitude"><br>海拔: {{ altitude }}m</small>
      <small v-if="lastConnected"><br>最後連接: {{ lastConnected }}</small>
    </div>

    <hr style="margin: 10px 0;">

    <div class="chart-section" :style="{ height: chartHeight }">
      <DeviceMetricsChart
        v-if="!loading && metrics.length > 0"
        :node-id="nodeId"
        :metrics="metrics"
        :height="chartHeight"
      />
      <div v-else-if="loading" class="loading-message">載入圖表中...</div>
      <div v-else class="no-data-message">暫無設備指標數據</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import DeviceMetricsChart from './DeviceMetricsChart.vue';

const props = defineProps({
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
  chartHeight: {
    type: String,
    default: '250px'
  },
  fetchMetrics: {
    type: Function,
    required: true
  }
});

const loading = ref(true);
const metrics = ref([]);

const connectionStatus = computed(() => {
  return props.hasConnection
    ? '<span style="color: #00FF00;">● 已連接 MQTT</span>'
    : '<span style="color: #3388FF;">○ 未連接 MQTT</span>';
});

const lastConnected = computed(() => {
  if (!props.lastConnectedTime) return null;
  return new Date(props.lastConnectedTime).toLocaleString('zh-TW');
});

// 加載指標數據
onMounted(async () => {
  try {
    loading.value = true;
    metrics.value = await props.fetchMetrics(props.nodeId);
  } catch (error) {
    console.error('加載設備指標失敗:', error);
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.node-popup {
  min-width: 400px;
}

.node-info {
  line-height: 1.6;
}

.chart-section {
  position: relative;
  width: 100%;
}

.loading-message,
.no-data-message {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #999;
  font-size: 14px;
  text-align: center;
}
</style>
