<template>
  <div class="favorites-wrapper">
    <!-- 搜尋欄 -->
    <NodeSearchBar :nodes="allNodes" :show-refresh-button="false" mode="favorites" display-mode="icon" theme="dark"
      @toggle-favorite="handleToggleFavoriteFromSearch" />

    <div v-if="favoriteNodes.length === 0" class="empty-state">
      <div class="empty-icon">⭐</div>
      <h3>尚未收藏任何節點</h3>
      <p>在地圖上點擊節點，或使用上方搜尋功能將它們添加到最愛清單</p>
    </div>

    <template v-else>
      <!-- 快速導航條（僅移動端顯示） -->
      <div v-if="windowWidth < 768" class="quick-nav">
        <div ref="quickNavScroll" class="quick-nav-scroll">
          <template v-for="(node, index) in favoriteNodes" :key="node.node_id">
            <!-- 插入位置指示器（在項目前面） -->
            <div v-if="dragOverIndex === index && insertPosition === 'before' && draggedIndex !== index"
              class="drop-indicator"></div>
            
            <button :ref="el => setNavItemRef(el, index)"
              class="quick-nav-item" :class="{ 
                active: activeIndex === index,
                dragging: draggedIndex === index,
                'drag-over': dragOverIndex === index
              }"
              draggable="true"
              @click="handleNavItemClick(index, $event)"
              @dragstart="handleDragStart(index, $event)"
              @dragend="handleDragEnd"
              @dragover="handleDragOver(index, $event)"
              @dragenter="handleDragEnter(index, $event)"
              @dragleave="handleDragLeave"
              @drop="handleDrop(index, $event)"
              @touchstart="handleNavTouchStart(index, $event)"
              @touchmove="handleNavTouchMove($event)"
              @touchend="handleNavTouchEnd($event)">
              <span class="drag-handle">☰</span>
              <span class="nav-item-name">{{ node.long_name || node.short_name || '未知節點' }}</span>
            </button>
            
            <!-- 插入位置指示器（在項目後面） -->
            <div v-if="dragOverIndex === index && insertPosition === 'after' && draggedIndex !== index"
              class="drop-indicator"></div>
          </template>
          
          <!-- 插入到最後的指示器 -->
          <div v-if="dragOverIndex === favoriteNodes.length - 1 && insertPosition === 'after' && draggedIndex !== favoriteNodes.length - 1"
            class="drop-indicator"></div>
        </div>
      </div>

      <div ref="listContainer" class="favorites-container" @scroll="handleScroll" @touchstart="handleTouchStart" @touchend="handleTouchEnd" @touchmove="handleTouchMove">
        <div class="favorites-list">
          <FavoriteNodeCard v-for="(node, index) in favoriteNodes" :key="node.node_id" :ref="el => setCardRef(el, index)"
            :node="node" :metrics="nodeMetrics[node.node_id] || []" :loading-metrics="loadingMetrics[node.node_id] || false"
            :chart-height="chartHeight" @remove="removeFavorite" @view-on-map="viewOnMap" />
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, onActivated, defineEmits, nextTick } from 'vue';
import NodeSearchBar from './NodeSearchBar.vue';
import FavoriteNodeCard from './FavoriteNodeCard.vue';

const emit = defineEmits(['view-on-map']);

const favoriteNodes = ref([]);
const allNodes = ref([]); // 所有節點數據（用於搜索）
const nodeMetrics = ref({});
const loadingMetrics = ref({});
const windowWidth = ref(window.innerWidth);
const listContainer = ref(null);
const quickNavScroll = ref(null);
const cardRefs = ref([]);
const navItemRefs = ref([]);
const activeIndex = ref(0);
const isScrolling = ref(false);
const isScrollingNav = ref(false);
const touchStartX = ref(0);
const touchStartY = ref(0);
const touchStartTime = ref(0);
const touchLastX = ref(0);
const touchLastTime = ref(0);
const isTouching = ref(false);
const scrollTimeout = ref(null);
const scrollAnimationFrame = ref(null);
// 拖曳相關
const draggedIndex = ref(null);
const dragOverIndex = ref(null);
const insertPosition = ref(null); // 'before' 或 'after'
const touchDragStartIndex = ref(null);
const touchDragStartX = ref(0);
const touchDragStartY = ref(0);
const isDragging = ref(false);
const navTouchStartTime = ref(0);

// 監聽窗口大小變化
const handleResize = () => {
  windowWidth.value = window.innerWidth;
};

// 響應式圖表高度
const chartHeight = computed(() => {
  // 移動端（直立螢幕）
  if (windowWidth.value < 768) {
    return '216px'; // 240px - 24px padding
  }
  // 平板
  if (windowWidth.value < 1024) {
    return '288px'; // 320px - 32px padding
  }
  // 桌面
  if (windowWidth.value < 1400) {
    return '328px'; // 360px - 32px padding
  }
  // 超大桌面
  return '368px'; // 400px - 32px padding
});

// 獲取設備指標數據
const fetchDeviceMetrics = async (nodeId) => {
  try {
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

// 載入所有節點數據（用於搜索）
const loadAllNodes = async () => {
  try {
    // 先嘗試從緩存載入
    const cachedData = localStorage.getItem('meshtastic_nodes_cache');
    if (cachedData) {
      try {
        allNodes.value = JSON.parse(cachedData);
        console.log(`從緩存載入 ${allNodes.value.length} 個節點用於搜索`);
        return;
      } catch (error) {
        console.error('讀取緩存失敗:', error);
      }
    }

    // 如果沒有緩存，從 API 獲取
    const response = await fetch('/api/v1/nodes');
    const data = await response.json();
    allNodes.value = data.nodes || [];
    console.log(`從 API 載入 ${allNodes.value.length} 個節點用於搜索`);
  } catch (error) {
    console.error('載入節點數據失敗:', error);
    allNodes.value = [];
  }
};

// 加載收藏的節點
const loadFavorites = async () => {
  const stored = localStorage.getItem('meshtastic_favorites');
  if (stored) {
    try {
      favoriteNodes.value = JSON.parse(stored);

      // 為每個節點加載指標數據
      for (const node of favoriteNodes.value) {
        loadingMetrics.value[node.node_id] = true;
        const metrics = await fetchDeviceMetrics(node.node_id);
        nodeMetrics.value[node.node_id] = metrics;
        loadingMetrics.value[node.node_id] = false;
      }
    } catch (error) {
      console.error('加載收藏失敗:', error);
      favoriteNodes.value = [];
    }
  }
};

// 處理從搜索組件切換收藏
const handleToggleFavoriteFromSearch = (node) => {
  const nodeId = node.node_id;
  const isFavorited = favoriteNodes.value.some(n => n.node_id === nodeId);

  if (isFavorited) {
    // 移除收藏
    favoriteNodes.value = favoriteNodes.value.filter(n => n.node_id !== nodeId);
    delete nodeMetrics.value[nodeId];
    delete loadingMetrics.value[nodeId];
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
    favoriteNodes.value.push(nodeData);

    // 為新節點加載指標數據
    (async () => {
      loadingMetrics.value[nodeId] = true;
      const metrics = await fetchDeviceMetrics(nodeId);
      nodeMetrics.value[nodeId] = metrics;
      loadingMetrics.value[nodeId] = false;
    })();
  }

  // 保存到 localStorage
  localStorage.setItem('meshtastic_favorites', JSON.stringify(favoriteNodes.value));

  // 觸發自定義事件
  window.dispatchEvent(new CustomEvent('favorites-updated'));
};

// 移除收藏
const removeFavorite = (nodeId) => {
  favoriteNodes.value = favoriteNodes.value.filter(node => node.node_id !== nodeId);
  localStorage.setItem('meshtastic_favorites', JSON.stringify(favoriteNodes.value));

  // 清除該節點的指標數據
  delete nodeMetrics.value[nodeId];
  delete loadingMetrics.value[nodeId];
};


// 在地圖上查看節點
const viewOnMap = (node) => {
  emit('view-on-map', node);
};

// 設置卡片 ref（處理組件實例）
const setCardRef = (el, index) => {
  if (el) {
    // el 是組件實例，使用 $el 獲取根 DOM 元素
    cardRefs.value[index] = el.$el || el;
  }
};

// 設置導航項 ref
const setNavItemRef = (el, index) => {
  if (el) {
    navItemRefs.value[index] = el;
  }
};

// 滾動到指定卡片（居中顯示）
const scrollToCard = async (index) => {
  if (!listContainer.value || !cardRefs.value[index] || windowWidth.value >= 768) return;

  isScrolling.value = true;
  const container = listContainer.value;
  const containerWidth = container.clientWidth;
  const cardWidth = containerWidth - 32; // calc(100vw - 32px)
  const gap = 12;
  const cardTotalWidth = cardWidth + gap;
  
  // 計算該卡片應該居中的位置
  const targetScrollLeft = index * cardTotalWidth;

  container.scrollTo({
    left: targetScrollLeft,
    behavior: 'smooth'
  });

  // 更新活動索引
  activeIndex.value = index;

  // 同時滾動快速導航條，使對應的導航項顯示在最左方
  scrollNavToItem(index);

  // 等待滾動完成後重置標記
  setTimeout(() => {
    isScrolling.value = false;
  }, 500);
};

// 滾動快速導航條，使指定索引的導航項顯示在最左方
const scrollNavToItem = (index) => {
  if (!quickNavScroll.value || !navItemRefs.value[index] || isScrollingNav.value) return;

  isScrollingNav.value = true;
  const navItem = navItemRefs.value[index];
  const navScroll = quickNavScroll.value;

  // 計算導航項在滾動容器中的位置
  const itemRect = navItem.getBoundingClientRect();
  const scrollRect = navScroll.getBoundingClientRect();
  const scrollLeft = navScroll.scrollLeft + (itemRect.left - scrollRect.left);

  navScroll.scrollTo({
    left: scrollLeft,
    behavior: 'smooth'
  });

  // 等待滾動完成後重置標記
  setTimeout(() => {
    isScrollingNav.value = false;
  }, 300);
};

// 處理導航項點擊（區分拖曳和點擊）
const handleNavItemClick = (index, event) => {
  // 如果正在拖曳或剛剛完成拖曳，不觸發點擊
  if (isDragging.value || draggedIndex.value !== null) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  
  // 檢查是否在短時間內（可能是拖曳開始）
  const timeSinceTouchStart = Date.now() - navTouchStartTime.value;
  if (timeSinceTouchStart < 300) {
    // 可能是拖曳開始，不觸發點擊
    return;
  }
  
  scrollToCard(index);
};

// 拖曳開始
const handleDragStart = (index, event) => {
  draggedIndex.value = index;
  isDragging.value = true;
  dragOverIndex.value = null;
  insertPosition.value = null;
  
  // 設置拖曳數據
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/html', index.toString());
    event.dataTransfer.setData('text/plain', index.toString());
  }
  
  // 設置拖曳圖像
  const target = event.currentTarget || event.target;
  if (target) {
    target.style.opacity = '0.5';
    // 創建自定義拖曳圖像
    const dragImage = target.cloneNode(true);
    dragImage.style.position = 'absolute';
    dragImage.style.top = '-1000px';
    document.body.appendChild(dragImage);
    if (event.dataTransfer) {
      event.dataTransfer.setDragImage(dragImage, 0, 0);
    }
    setTimeout(() => document.body.removeChild(dragImage), 0);
  }
};

// 拖曳結束
const handleDragEnd = (event) => {
  const target = event.currentTarget || event.target;
  if (target) {
    target.style.opacity = '1';
  }
  
  // 延遲重置狀態，避免與 drop 事件衝突
  setTimeout(() => {
    draggedIndex.value = null;
    dragOverIndex.value = null;
    insertPosition.value = null;
    isDragging.value = false;
  }, 100);
};

// 拖曳經過
const handleDragOver = (index, event) => {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  if (draggedIndex.value !== null && draggedIndex.value !== index) {
    const rect = event.currentTarget.getBoundingClientRect();
    const midpoint = rect.left + rect.width / 2;
    const mouseX = event.clientX;
    
    dragOverIndex.value = index;
    // 根據鼠標位置決定插入位置
    if (mouseX > midpoint) {
      insertPosition.value = 'after';
    } else {
      insertPosition.value = 'before';
    }
  }
};

// 拖曳進入
const handleDragEnter = (index, event) => {
  event.preventDefault();
  if (draggedIndex.value !== null && draggedIndex.value !== index) {
    const rect = event.currentTarget.getBoundingClientRect();
    const midpoint = rect.left + rect.width / 2;
    const mouseX = event.clientX || (event.touches && event.touches[0]?.clientX) || midpoint;
    
    dragOverIndex.value = index;
    // 根據鼠標位置決定插入位置
    if (mouseX > midpoint) {
      insertPosition.value = 'after';
    } else {
      insertPosition.value = 'before';
    }
  }
};

// 拖曳離開
const handleDragLeave = (event) => {
  // 檢查是否真的離開了元素（而不是進入子元素）
  const relatedTarget = event.relatedTarget;
  if (relatedTarget && event.currentTarget.contains(relatedTarget)) {
    // 進入了子元素，不清除狀態
    return;
  }
  // 只有在真正離開時才清除（但保留一點延遲，避免閃爍）
  // 不立即清除，讓 drop 事件有機會觸發
};

// 拖曳放下
const handleDrop = (index, event) => {
  event.preventDefault();
  event.stopPropagation();

  if (draggedIndex.value === null) {
    dragOverIndex.value = null;
    insertPosition.value = null;
    return;
  }

  // 如果拖曳到相同位置，不處理
  if (draggedIndex.value === index && insertPosition.value === 'before') {
    dragOverIndex.value = null;
    insertPosition.value = null;
    return;
  }

  // 根據插入位置計算目標索引
  let targetIndex = index;
  if (insertPosition.value === 'after') {
    targetIndex = index + 1;
  } else {
    targetIndex = index;
  }

  // 重新排序節點
  reorderNodes(draggedIndex.value, targetIndex);
  
  // 延遲重置狀態，確保動畫完成
  setTimeout(() => {
    draggedIndex.value = null;
    dragOverIndex.value = null;
    insertPosition.value = null;
    isDragging.value = false;
  }, 100);
};

// 觸摸拖曳開始
const handleNavTouchStart = (index, event) => {
  if (windowWidth.value >= 768) return;
  
  // 重置所有拖曳相關狀態
  touchDragStartIndex.value = index;
  touchDragStartX.value = event.touches[0].clientX;
  touchDragStartY.value = event.touches[0].clientY;
  navTouchStartTime.value = Date.now();
  isDragging.value = false;
  draggedIndex.value = null;
  dragOverIndex.value = null;
  insertPosition.value = null;
  
  // 防止快速導航條滾動干擾
  if (quickNavScroll.value) {
    quickNavScroll.value.style.scrollBehavior = 'auto';
  }
};

// 觸摸拖曳移動
const handleNavTouchMove = (event) => {
  if (windowWidth.value >= 768 || touchDragStartIndex.value === null) return;
  
  const touch = event.touches[0];
  if (!touch) return;
  
  const deltaX = Math.abs(touch.clientX - touchDragStartX.value);
  const deltaY = Math.abs(touch.clientY - touchDragStartY.value);
  
  // 降低觸發閾值，提高響應性（從10px改為5px）
  if (deltaX > 5 && deltaX > deltaY * 1.5) {
    // 防止快速導航條滾動
    if (quickNavScroll.value) {
      quickNavScroll.value.style.overflowX = 'hidden';
    }
    
    if (!isDragging.value) {
      isDragging.value = true;
      draggedIndex.value = touchDragStartIndex.value;
      
      // 設置拖曳項目的樣式
      if (navItemRefs.value[touchDragStartIndex.value]) {
        navItemRefs.value[touchDragStartIndex.value].style.opacity = '0.5';
      }
    }
    
    // 找到當前觸摸位置下的元素
    const touchElement = document.elementFromPoint(touch.clientX, touch.clientY);
    if (touchElement) {
      const navItem = touchElement.closest('.quick-nav-item');
      if (navItem) {
        // 找到對應的索引 - 使用更可靠的方法
        const allNavItems = Array.from(quickNavScroll.value?.querySelectorAll('.quick-nav-item') || []);
        const currentIndex = allNavItems.indexOf(navItem);
        
        if (currentIndex !== -1 && currentIndex !== draggedIndex.value) {
          const rect = navItem.getBoundingClientRect();
          const midpoint = rect.left + rect.width / 2;
          const touchX = touch.clientX;
          
          dragOverIndex.value = currentIndex;
          // 根據觸摸位置決定插入位置
          if (touchX > midpoint) {
            insertPosition.value = 'after';
          } else {
            insertPosition.value = 'before';
          }
        }
      }
    }
    
    event.preventDefault();
    event.stopPropagation();
  }
};

// 觸摸拖曳結束
const handleNavTouchEnd = (event) => {
  if (windowWidth.value >= 768 || touchDragStartIndex.value === null) return;
  
  // 恢復快速導航條滾動
  if (quickNavScroll.value) {
    quickNavScroll.value.style.overflowX = 'auto';
    quickNavScroll.value.style.scrollBehavior = 'smooth';
  }
  
  // 恢復拖曳項目的樣式
  if (draggedIndex.value !== null && navItemRefs.value[draggedIndex.value]) {
    navItemRefs.value[draggedIndex.value].style.opacity = '1';
  }
  
  if (isDragging.value && draggedIndex.value !== null && dragOverIndex.value !== null && draggedIndex.value !== dragOverIndex.value) {
    // 根據插入位置計算目標索引
    let targetIndex = dragOverIndex.value;
    if (insertPosition.value === 'after') {
      targetIndex = dragOverIndex.value + 1;
    } else {
      targetIndex = dragOverIndex.value;
    }
    
    // 重新排序節點
    reorderNodes(draggedIndex.value, targetIndex);
  }
  
  // 延遲重置狀態，確保動畫完成
  setTimeout(() => {
    touchDragStartIndex.value = null;
    draggedIndex.value = null;
    dragOverIndex.value = null;
    insertPosition.value = null;
    isDragging.value = false;
  }, 150);
};

// 重新排序節點
const reorderNodes = (fromIndex, toIndex) => {
  // 確保索引在有效範圍內
  const maxIndex = favoriteNodes.value.length - 1;
  const clampedToIndex = Math.max(0, Math.min(toIndex, maxIndex));
  
  // 如果 fromIndex 和 toIndex 相同，不需要重新排序
  if (fromIndex === clampedToIndex) {
    return;
  }
  
  const newNodes = [...favoriteNodes.value];
  const [movedNode] = newNodes.splice(fromIndex, 1);
  
  // 如果目標索引大於原索引，需要減1（因為已經移除了元素）
  const adjustedToIndex = fromIndex < clampedToIndex ? clampedToIndex - 1 : clampedToIndex;
  newNodes.splice(adjustedToIndex, 0, movedNode);
  
  favoriteNodes.value = newNodes;
  
  // 保存到 localStorage
  localStorage.setItem('meshtastic_favorites', JSON.stringify(favoriteNodes.value));
  
  // 觸發自定義事件
  window.dispatchEvent(new CustomEvent('favorites-updated'));
  
  // 更新活動索引（如果受影響）
  if (activeIndex.value === fromIndex) {
    activeIndex.value = adjustedToIndex;
  } else if (activeIndex.value > fromIndex && activeIndex.value <= clampedToIndex) {
    activeIndex.value--;
  } else if (activeIndex.value < fromIndex && activeIndex.value >= clampedToIndex) {
    activeIndex.value++;
  }
  
  // 等待 DOM 更新後重新滾動到當前卡片
  nextTick(() => {
    if (activeIndex.value !== null) {
      scrollToCard(activeIndex.value);
    }
  });
};

// 處理觸摸開始
const handleTouchStart = (e) => {
  if (windowWidth.value >= 768) return;
  isTouching.value = true;
  const touch = e.touches[0];
  touchStartX.value = touch.clientX;
  touchStartY.value = touch.clientY;
  touchLastX.value = touch.clientX;
  touchStartTime.value = Date.now();
  touchLastTime.value = Date.now();
  
  // 清除自動滾動計時器和動畫幀
  if (scrollTimeout.value) {
    clearTimeout(scrollTimeout.value);
    scrollTimeout.value = null;
  }
  if (scrollAnimationFrame.value) {
    cancelAnimationFrame(scrollAnimationFrame.value);
    scrollAnimationFrame.value = null;
  }
};

// 處理觸摸移動
const handleTouchMove = (e) => {
  if (windowWidth.value >= 768) return;
  const touch = e.touches[0];
  touchLastX.value = touch.clientX;
  touchLastTime.value = Date.now();
  
  // 清除自動滾動計時器和動畫幀
  if (scrollTimeout.value) {
    clearTimeout(scrollTimeout.value);
    scrollTimeout.value = null;
  }
  if (scrollAnimationFrame.value) {
    cancelAnimationFrame(scrollAnimationFrame.value);
    scrollAnimationFrame.value = null;
  }
};

// 處理觸摸結束 - 自動居中最近的卡片
const handleTouchEnd = (e) => {
  if (windowWidth.value >= 768 || !listContainer.value) return;
  
  isTouching.value = false;
  
  // 計算滑動距離和速度
  const touchEndX = e.changedTouches[0].clientX;
  const touchEndY = e.changedTouches[0].clientY;
  const deltaX = touchEndX - touchStartX.value;
  const deltaY = touchEndY - touchStartY.value;
  const deltaTime = Date.now() - touchLastTime.value;
  
  // 如果是垂直滑動為主，不處理
  if (Math.abs(deltaY) > Math.abs(deltaX)) {
    return;
  }
  
  // 計算滑動速度 (px/ms)
  const velocity = deltaTime > 0 ? Math.abs(deltaX) / deltaTime : 0;
  
  // 使用 requestAnimationFrame 優化性能，減少延遲
  scrollAnimationFrame.value = requestAnimationFrame(() => {
    // 根據速度決定延遲時間，快速滑動時減少延遲
    const delay = velocity > 1 ? 50 : 80;
    scrollTimeout.value = setTimeout(() => {
      snapToNearestCard(deltaX, velocity);
      scrollTimeout.value = null;
    }, delay);
    scrollAnimationFrame.value = null;
  });
};

// 自動居中最近的卡片（支持根據滑動方向和速度調整目標）
const snapToNearestCard = (deltaX = 0, velocity = 0) => {
  if (!listContainer.value || isScrolling.value || windowWidth.value >= 768) return;
  
  const container = listContainer.value;
  const scrollLeft = container.scrollLeft;
  const containerWidth = container.clientWidth;
  const cardWidth = containerWidth - 32; // calc(100vw - 32px)
  const gap = 12;
  const cardTotalWidth = cardWidth + gap;
  
  // 計算當前滾動位置對應的卡片索引
  let currentIndex = Math.round(scrollLeft / cardTotalWidth);
  
  // 根據滑動方向和速度調整目標索引
  // 如果快速向右滑動（deltaX > 0），優先選擇下一個卡片
  // 如果快速向左滑動（deltaX < 0），優先選擇上一個卡片
  if (Math.abs(deltaX) > 30 || velocity > 0.5) {
    if (deltaX > 0 && currentIndex < favoriteNodes.value.length - 1) {
      // 向右滑動，選擇下一個卡片
      currentIndex = Math.min(currentIndex + 1, favoriteNodes.value.length - 1);
    } else if (deltaX < 0 && currentIndex > 0) {
      // 向左滑動，選擇上一個卡片
      currentIndex = Math.max(currentIndex - 1, 0);
    }
  }
  
  const clampedIndex = Math.max(0, Math.min(currentIndex, favoriteNodes.value.length - 1));
  
  // 計算該卡片應該居中的位置
  const targetScrollLeft = clampedIndex * cardTotalWidth;
  
  // 如果已經接近目標位置（容差增大），不需要滾動
  if (Math.abs(scrollLeft - targetScrollLeft) < 10) {
    activeIndex.value = clampedIndex;
    scrollNavToItem(clampedIndex);
    return;
  }
  
  // 平滑滾動到居中位置
  isScrolling.value = true;
  
  // 使用自定義動畫實現更流暢的滾動
  const startScrollLeft = scrollLeft;
  const distance = targetScrollLeft - startScrollLeft;
  const duration = Math.min(Math.abs(distance) * 0.5, 400); // 根據距離調整時長，最多400ms
  const startTime = Date.now();
  
  const animateScroll = () => {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // 使用 ease-out 緩動函數，讓滾動更自然
    const easeOut = 1 - Math.pow(1 - progress, 3);
    const currentScrollLeft = startScrollLeft + distance * easeOut;
    
    container.scrollLeft = currentScrollLeft;
    
    if (progress < 1) {
      requestAnimationFrame(animateScroll);
    } else {
      isScrolling.value = false;
      // 確保最終位置精確
      container.scrollLeft = targetScrollLeft;
    }
  };
  
  requestAnimationFrame(animateScroll);
  
  // 更新活動索引
  activeIndex.value = clampedIndex;
  scrollNavToItem(clampedIndex);
};

// 處理滾動事件，更新活動索引
const handleScroll = () => {
  if (isScrolling.value || !listContainer.value || windowWidth.value >= 768) return;

  const container = listContainer.value;
  const scrollLeft = container.scrollLeft;
  const containerWidth = container.clientWidth;
  const cardWidth = containerWidth - 32; // calc(100vw - 32px)
  const gap = 12;
  const cardTotalWidth = cardWidth + gap;

  // 計算當前可見的卡片索引
  const currentIndex = Math.round(scrollLeft / cardTotalWidth);
  const clampedIndex = Math.max(0, Math.min(currentIndex, favoriteNodes.value.length - 1));

  if (activeIndex.value !== clampedIndex) {
    activeIndex.value = clampedIndex;
    // 當活動索引變化時，自動滾動快速導航條，使對應的導航項顯示在最左方
    scrollNavToItem(clampedIndex);
  }
  
  // 如果不是觸摸狀態，在滾動停止後自動居中（使用 requestAnimationFrame 優化）
  if (!isTouching.value) {
    if (scrollTimeout.value) {
      clearTimeout(scrollTimeout.value);
    }
    if (scrollAnimationFrame.value) {
      cancelAnimationFrame(scrollAnimationFrame.value);
    }
    scrollAnimationFrame.value = requestAnimationFrame(() => {
      scrollTimeout.value = setTimeout(() => {
        snapToNearestCard();
        scrollTimeout.value = null;
      }, 100); // 減少延遲時間
      scrollAnimationFrame.value = null;
    });
  }
};

onMounted(async () => {
  await loadAllNodes(); // 載入所有節點用於搜索
  loadFavorites();
  window.addEventListener('resize', handleResize);

  // 監聽 localStorage 變化（跨標籤頁同步）
  window.addEventListener('storage', handleStorageChange);

  // 監聽自定義事件（同一窗口內同步）
  window.addEventListener('favorites-updated', handleFavoritesUpdated);
});

onActivated(() => {
  // 當組件被 keep-alive 激活時，重新載入最愛數據
  // 這樣可以確保從其他頁面切換回來時數據是最新的
  loadFavorites();
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  window.removeEventListener('storage', handleStorageChange);
  window.removeEventListener('favorites-updated', handleFavoritesUpdated);
  
  // 清理計時器和動畫幀
  if (scrollTimeout.value) {
    clearTimeout(scrollTimeout.value);
    scrollTimeout.value = null;
  }
  if (scrollAnimationFrame.value) {
    cancelAnimationFrame(scrollAnimationFrame.value);
    scrollAnimationFrame.value = null;
  }
});

// 處理 localStorage 變化事件（跨標籤頁）
const handleStorageChange = (e) => {
  if (e.key === 'meshtastic_favorites') {
    console.log('檢測到最愛數據變化（跨標籤頁），重新載入...');
    loadFavorites();
  }
};

// 處理自定義事件（同一窗口內）
const handleFavoritesUpdated = () => {
  console.log('檢測到最愛數據變化（同窗口），重新載入...');
  loadFavorites();
};

// 暴露方法供外部調用
defineExpose({
  refresh: loadFavorites
});
</script>

<style scoped>
.favorites-wrapper {
  width: 100%;
  min-height: calc(100vh - var(--navbar-height, 60px));
  padding-top: calc(var(--navbar-height, 60px));
  background: #0f0f0f;
  box-sizing: border-box;
  position: relative;
  display: flex;
  flex-direction: column;
}

.favorites-container {
  width: 100%;
  flex: 1;
  margin-top: 8px;
  padding-left: 0;
  padding-right: 0;
  padding-bottom: 16px;
  box-sizing: border-box;
  position: relative;
  /* 移動端允許水平滾動 */
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  /* 允許水平滾動 */
  touch-action: pan-x;
  /* 確保可以滾動 */
  overscroll-behavior: contain;
  /* 優化滾動性能 */
  will-change: scroll-position;
  /* 平滑滾動 */
  scroll-behavior: smooth;
}

.favorites-header {
  text-align: center;
  margin-bottom: 20px;
  padding: 20px 16px 10px;
}

.favorites-header h2 {
  margin: 0 0 8px 0;
  font-size: 24px;
  color: #2c3e50;
  font-weight: 700;
}

.subtitle {
  margin: 0;
  color: #7f8c8d;
  font-size: 14px;
}

/* Empty State */
.empty-state {
  text-align: center;
  padding: 60px 16px;
  background: #1a1a1a;
  border-radius: 12px;
  box-shadow: none;
  margin: 16px auto;
  max-width: 100%;
  border: 1px solid #2a2a2a;
}

.empty-icon {
  font-size: 60px;
  margin-bottom: 16px;
  opacity: 0.6;
  filter: brightness(0.9);
}

.empty-state h3 {
  margin: 0 0 8px 0;
  font-size: 20px;
  color: #e0e0e0;
  font-weight: 600;
}

.empty-state p {
  margin: 0;
  color: #888888;
  font-size: 14px;
}

/* 快速導航條（僅移動端） */
.quick-nav {
  position: sticky;
  top: calc(var(--navbar-height, 60px));
  z-index: 100;
  background: #0f0f0f;
  padding: 12px 0;
  border-bottom: 1px solid #2a2a2a;
  margin-bottom: 0;
  flex-shrink: 0;
}

.quick-nav-scroll {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 0 16px;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  /* Firefox */
  -ms-overflow-style: none;
  /* IE and Edge */
  position: relative;
  align-items: center;
}

.quick-nav-scroll::-webkit-scrollbar {
  display: none;
  /* Chrome, Safari, Opera */
}

.quick-nav-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: #1a1a1a;
  border: 1px solid #2a2a2a;
  border-radius: 20px;
  color: #888888;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  cursor: move;
  cursor: grab;
  transition: all 0.2s ease;
  flex-shrink: 0;
  position: relative;
  user-select: none;
  -webkit-user-select: none;
  touch-action: pan-x;
  -webkit-touch-callout: none;
}

.quick-nav-item:active {
  cursor: grabbing;
}

.quick-nav-item[draggable="true"] {
  -webkit-user-drag: element;
}

.quick-nav-item.dragging {
  opacity: 0.5;
  transform: scale(0.95);
  z-index: 1000;
}

.quick-nav-item.drag-over {
  border-color: rgb(72, 161, 103);
  background: rgba(72, 161, 103, 0.2);
  transform: scale(1.05);
}

.drag-handle {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.4);
  cursor: grab;
  margin-right: 2px;
  display: flex;
  align-items: center;
  line-height: 1;
}

.quick-nav-item:active .drag-handle {
  cursor: grabbing;
}

/* 插入位置指示器 */
.drop-indicator {
  width: 3px;
  height: 32px;
  background: linear-gradient(180deg, rgb(72, 161, 103) 0%, rgba(72, 161, 103, 0.8) 100%);
  border-radius: 2px;
  flex-shrink: 0;
  margin: 0 2px;
  animation: dropIndicatorPulse 1s ease-in-out infinite;
  box-shadow: 0 0 8px rgba(72, 161, 103, 0.6);
  position: relative;
  z-index: 10;
}

.drop-indicator::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 8px;
  height: 8px;
  background: rgb(72, 161, 103);
  border-radius: 50%;
  box-shadow: 0 0 12px rgba(72, 161, 103, 0.8);
}

.drop-indicator-last {
  order: 9999;
}

@keyframes dropIndicatorPulse {
  0%, 100% {
    opacity: 1;
    transform: scaleY(1);
  }
  50% {
    opacity: 0.7;
    transform: scaleY(1.1);
  }
}

.quick-nav-item:hover {
  background: #2a2a2a;
  border-color: #3a3a3a;
  color: #e0e0e0;
}

.quick-nav-item.active {
  background: linear-gradient(135deg, rgb(43, 107, 66) 0%, rgb(72, 161, 103) 100%);
  border-color: rgb(72, 161, 103);
  color: white;
  box-shadow: 0 2px 8px rgba(72, 161, 103, 0.3);
}

.nav-item-icon {
  font-size: 14px;
}

.nav-item-name {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Favorites List - 移動端水平滾動 */
.favorites-list {
  display: flex;
  flex-direction: row;
  gap: 12px;
  width: max-content;
  padding-left: 16px;
  padding-right: 16px;
  min-width: 100%;
  /* 優化滾動性能 */
  will-change: transform;
}

/* Tablet and Desktop Styles - 左右佈局 */
@media (min-width: 768px) {
  .favorites-wrapper {
    padding-top: calc(var(--navbar-height, 60px) + 20px);
  }

  .quick-nav {
    display: none;
  }

  .favorites-container {
    padding-left: 20px;
    padding-right: 20px;
    padding-bottom: 20px;
    overflow-x: hidden;
    overflow-y: auto;
    touch-action: pan-y;
  }

  .favorites-header {
    margin-bottom: 30px;
    padding: 20px 0;
  }

  .favorites-header h2 {
    font-size: 32px;
  }

  .subtitle {
    font-size: 16px;
  }

  .empty-state {
    padding: 80px 20px;
    border-radius: 16px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    border: 1px solid #2a2a2a;
    max-width: 500px;
    margin: 0 auto;
  }

  .empty-icon {
    font-size: 80px;
    margin-bottom: 20px;
  }

  .empty-state h3 {
    font-size: 24px;
  }

  .empty-state p {
    font-size: 16px;
  }

  .favorites-list {
    flex-direction: column;
    gap: 20px;
    width: 100%;
    padding-left: 0;
    padding-right: 0;
  }
}

/* Large Desktop Styles */
@media (min-width: 1024px) {
  .favorites-wrapper {
    padding-top: calc(var(--navbar-height, 60px) + 30px);
  }

  .favorites-container {
    padding-left: 30px;
    padding-right: 30px;
    padding-bottom: 30px;
  }

  .favorites-header h2 {
    font-size: 36px;
  }

  .favorites-list {
    gap: 24px;
  }
}

/* Extra Large Desktop */
@media (min-width: 1400px) {
  .favorites-wrapper {
    padding-top: calc(var(--navbar-height, 70px) + 40px);
  }

  .favorites-container {
    padding-left: 40px;
    padding-right: 40px;
    padding-bottom: 40px;
  }

  .favorites-list {
    gap: 28px;
  }
}
</style>
