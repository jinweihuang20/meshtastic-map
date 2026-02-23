<template>
  <div class="search-bar" :class="{ 
    'icon-mode': shouldUseIconMode && !isExpanded,
    'theme-dark': theme === 'dark',
    'theme-light': theme === 'light'
  }">
    <!-- 搜尋結果列表 -->
    <div v-show="(!shouldUseIconMode || isExpanded) && searchQuery && (isSearching || filteredNodes.length > 0 || searchQuery)" class="search-results">
      <div class="results-header">
        <span v-if="isSearching">搜尋中...</span>
        <span v-else-if="filteredNodes.length > 0">找到 {{ filteredNodes.length }} 個節點</span>
        <span v-else-if="searchQuery && !isSearching">未找到符合的節點</span>
      </div>
      <div v-if="!isSearching && filteredNodes.length > 0" class="results-list" ref="resultsListRef"
        @scroll="handleScroll">
        <!-- 虛擬滾動：上方占位符 -->
        <div :style="{ height: startOffset + 'px' }"></div>

        <!-- 只渲染可見區域的項目 -->
        <div v-for="node in visibleNodes" :key="node.node_id" class="result-item"
          v-memo="[node.node_id, isNodeFavorited(node.node_id)]">
          <div class="result-info" @click="handleNodeSelect(node)">
            <div class="result-name">
              <div class="result-short-name" v-bind:style="getNodeColorStyle(node.node_id_hex || '')">
                {{ node.short_name }}</div>
              <div> {{ node.long_name || node.short_name || '未知節點' }}
                <div class="result-id">{{ node.node_id_hex || node.node_id }}</div>
              </div>
            </div>
          </div>
          <button class="favorite-toggle-btn" :class="{ favorited: isNodeFavorited(node.node_id) }"
            @click.stop="handleToggleFavorite(node)" :title="isNodeFavorited(node.node_id) ? '取消收藏' : '加入最愛'">
            {{ isNodeFavorited(node.node_id) ? '⭐' : '☆' }}
          </button>
        </div>

        <!-- 虛擬滾動：下方占位符 -->
        <div :style="{ height: endOffset + 'px' }"></div>
      </div>
    </div>

    <!-- 搜尋輸入框 -->
    <div class="search-container" :class="{ 'expanded': isExpanded || !shouldUseIconMode }">
      <!-- 圖標模式：只顯示搜索圖標 -->
      <button v-if="shouldUseIconMode && !isExpanded" class="search-icon-button" @click="toggleExpand"
        :title="'展開搜尋'">
        <el-icon>
          <Search />
        </el-icon>
      </button>

      <!-- 展開的搜尋欄 -->
      <template v-if="!shouldUseIconMode || isExpanded">
        <el-button v-if="showRefreshButton" class="refresh-button" @click="handleRefresh" :title="'重新載入節點數據'">
          <el-icon>
            <Refresh />
          </el-icon>
        </el-button>
        <div class="search-input-wrapper">
          <input type="text" v-model="searchQuery" @input="handleSearch"
            :placeholder="'搜尋節點 (總節點數: ' + totalNodesCount + ')'" class="search-input" />
          <button v-if="searchQuery" class="clear-button" @click="clearSearch" :title="'清除搜尋'">
            <el-icon>
              <Close />
            </el-icon>
          </button>
        </div>
        <!-- 圖標模式：顯示收起按鈕 -->
        <button v-if="shouldUseIconMode && isExpanded" class="collapse-button" @click="toggleCollapse"
          :title="'收起搜尋'">
          <el-icon>
            <Close />
          </el-icon>
        </button>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { Refresh, Close, Search } from '@element-plus/icons-vue';
import { getNodeColorStyle } from '../utils/colorUtils.js';

// Props
const props = defineProps({
  nodes: {
    type: Array,
    required: true,
    default: () => []
  },
  showRefreshButton: {
    type: Boolean,
    default: false
  },
  mode: {
    type: String,
    default: 'map', // 'map' 或 'favorites'
    validator: (value) => ['map', 'favorites'].includes(value)
  },
  displayMode: {
    type: String,
    default: 'full', // 'full' 或 'icon'
    validator: (value) => ['full', 'icon'].includes(value)
  },
  theme: {
    type: String,
    default: 'light', // 'light' 或 'dark'
    validator: (value) => ['light', 'dark'].includes(value)
  }
});

// Emits
const emit = defineEmits(['node-select', 'toggle-favorite', 'refresh', 'search-change']);

// 搜尋相關
const searchQuery = ref('');
const filteredNodes = ref([]);
const isSearching = ref(false);
let searchTimeout = null;
let searchAbortController = null;
let searchAnimationFrame = null;

// 展開/收起狀態（當 displayMode 為 'icon' 時使用）
const isExpanded = ref(false);
const shouldUseIconMode = computed(() => props.displayMode === 'icon' || (props.mode === 'favorites' && props.displayMode !== 'full'));

// 虛擬滾動相關
const resultsListRef = ref(null);
const itemHeight = ref(72); // 每個結果項目的高度（像素）- 根據實際樣式調整
const visibleCount = 20; // 可見區域顯示的項目數量（增加緩衝以確保流暢）
const startIndex = ref(0);
const endIndex = ref(visibleCount);
let scrollTimeout = null; // 滾動防抖計時器

// 動態計算項目高度（首次渲染後）
const calculateItemHeight = () => {
  if (resultsListRef.value && filteredNodes.value.length > 0) {
    const firstItem = resultsListRef.value.querySelector('.result-item');
    if (firstItem) {
      const height = firstItem.offsetHeight;
      if (height > 0 && height !== itemHeight.value) {
        itemHeight.value = height;
        console.log(`檢測到項目高度: ${height}px`);
      }
    }
  }
};

// 搜索索引：預構建所有節點的搜索字符串
const searchIndex = ref([]);

// 收藏相關
const favorites = ref([]);

// 計算總節點數
const totalNodesCount = computed(() => props.nodes.length);


// 載入收藏列表
const loadFavorites = () => {
  const stored = localStorage.getItem('meshtastic_favorites');
  if (stored) {
    try {
      favorites.value = JSON.parse(stored);
    } catch (error) {
      console.error('讀取收藏失敗:', error);
      favorites.value = [];
    }
  }
};

// 檢查節點是否已收藏
const isNodeFavorited = (nodeId) => {
  return favorites.value.some(node => node.node_id === nodeId);
};

// 構建搜索索引
const buildSearchIndex = () => {
  const startTime = performance.now();
  searchIndex.value = props.nodes.map(node => {
    const searchText = [
      String(node.id || ''),
      String(node.node_id || ''),
      String(node.node_id_hex || ''),
      String(node.short_name || ''),
      String(node.long_name || '')
    ].join('\0').toLowerCase();

    return {
      node,
      searchText
    };
  });
  const endTime = performance.now();
  console.log(`搜索索引構建完成，耗時: ${(endTime - startTime).toFixed(2)}ms，節點數: ${searchIndex.value.length}`);
};

// 實際執行搜索的函數
const performSearch = async (query) => {
  if (searchAbortController) {
    searchAbortController.abort();
  }
  if (searchAnimationFrame) {
    cancelAnimationFrame(searchAnimationFrame);
    searchAnimationFrame = null;
  }

  searchAbortController = new AbortController();

  if (!query) {
    isSearching.value = false;
    filteredNodes.value = [];
    return;
  }

  if (searchIndex.value.length === 0 && props.nodes.length > 0) {
    buildSearchIndex();
  }

  isSearching.value = true;
  const queryLower = query.toLowerCase();
  const queryLength = queryLower.length;
  const results = [];
  const startTime = performance.now();

  await nextTick();

  if (searchAbortController.signal.aborted) {
    isSearching.value = false;
    return;
  }

  const totalItems = searchIndex.value.length;
  const useBatching = totalItems > 10000;
  const batchSize = 2000;

  if (useBatching) {
    const processBatch = (startIndex) => {
      if (searchAbortController.signal.aborted) {
        isSearching.value = false;
        return;
      }

      const endIndex = Math.min(startIndex + batchSize, totalItems);
      const index = searchIndex.value;

      for (let i = startIndex; i < endIndex; i++) {
        if (searchAbortController.signal.aborted) {
          isSearching.value = false;
          return;
        }
        if (index[i].searchText.indexOf(queryLower) !== -1) {
          results.push(index[i].node);
        }
      }

      if (endIndex < totalItems) {
        searchAnimationFrame = requestAnimationFrame(() => {
          processBatch(endIndex);
        });
      } else {
        finishSearch(results, query, startTime);
      }
    };

    processBatch(0);
  } else {
    const index = searchIndex.value;
    const len = totalItems;

    for (let i = 0; i < len; i++) {
      if (searchAbortController.signal.aborted) {
        isSearching.value = false;
        return;
      }
      if (index[i].searchText.indexOf(queryLower) !== -1) {
        results.push(index[i].node);
      }
    }

    finishSearch(results, query, startTime);
  }
};

// 完成搜索並更新結果
const finishSearch = (results, query, startTime) => {
  if (searchAbortController.signal.aborted) {
    isSearching.value = false;
    return;
  }

  if (results.length > 0) {
    results.sort((a, b) => {
      const aName = a.long_name || a.short_name || '';
      const bName = b.long_name || b.short_name || '';
      return aName.localeCompare(bName, 'zh-CN', { numeric: true });
    });
  }

  searchAnimationFrame = requestAnimationFrame(() => {
    filteredNodes.value = results;
    isSearching.value = false;

    // 重置虛擬滾動位置
    startIndex.value = 0;
    endIndex.value = Math.min(visibleCount + 6, results.length);

    // 重置滾動位置並計算項目高度
    nextTick(() => {
      if (resultsListRef.value) {
        resultsListRef.value.scrollTop = 0;
        calculateItemHeight();
      }
    });

    const endTime = performance.now();
    const duration = (endTime - startTime).toFixed(2);
    console.log(`搜尋 "${query}" 找到 ${results.length} 個節點，耗時: ${duration}ms`);
    searchAnimationFrame = null;
    emit('search-change', results);
  });
};

// 搜尋處理（帶防抖）
const handleSearch = () => {
  const query = searchQuery.value.trim();

  if (searchTimeout) {
    clearTimeout(searchTimeout);
  }

  if (!query) {
    filteredNodes.value = [];
    isSearching.value = false;
    if (searchAbortController) {
      searchAbortController.abort();
    }
    if (searchAnimationFrame) {
      cancelAnimationFrame(searchAnimationFrame);
      searchAnimationFrame = null;
    }
    emit('search-change', []);
    return;
  }

  const debounceTime = query.length <= 1 ? 100 : query.length <= 2 ? 150 : 200;

  searchTimeout = setTimeout(() => {
    performSearch(query);
  }, debounceTime);
};

// 清除搜尋
const clearSearch = () => {
  searchQuery.value = '';
  filteredNodes.value = [];
  isSearching.value = false;

  // 重置虛擬滾動
  startIndex.value = 0;
  endIndex.value = visibleCount + 5;

  if (searchTimeout) {
    clearTimeout(searchTimeout);
    searchTimeout = null;
  }

  if (searchAbortController) {
    searchAbortController.abort();
  }

  if (searchAnimationFrame) {
    cancelAnimationFrame(searchAnimationFrame);
    searchAnimationFrame = null;
  }

  emit('search-change', []);
};

// 虛擬滾動：計算可見的節點
const visibleNodes = computed(() => {
  return filteredNodes.value.slice(startIndex.value, endIndex.value);
});

// 虛擬滾動：計算上方占位符高度
const startOffset = computed(() => {
  return startIndex.value * itemHeight.value;
});

// 虛擬滾動：計算下方占位符高度
const endOffset = computed(() => {
  const total = filteredNodes.value.length;
  const remaining = Math.max(0, total - endIndex.value);
  return remaining * itemHeight.value;
});

// 處理滾動事件，更新可見區域（帶防抖優化）
const handleScroll = () => {
  if (!resultsListRef.value) return;

  // 清除之前的計時器
  if (scrollTimeout) {
    cancelAnimationFrame(scrollTimeout);
  }

  // 使用 requestAnimationFrame 優化滾動性能
  scrollTimeout = requestAnimationFrame(() => {
    const scrollTop = resultsListRef.value.scrollTop;
    const newStartIndex = Math.max(0, Math.floor(scrollTop / itemHeight.value) - 3); // 提前3個項目開始渲染
    const newEndIndex = Math.min(
      newStartIndex + visibleCount + 6, // 多渲染6個項目作為緩衝
      filteredNodes.value.length
    );

    // 只在索引變化時更新，避免不必要的重新渲染
    if (newStartIndex !== startIndex.value || newEndIndex !== endIndex.value) {
      startIndex.value = newStartIndex;
      endIndex.value = newEndIndex;
    }

    scrollTimeout = null;
  });
};

// 處理節點選擇
const handleNodeSelect = (node) => {
  emit('node-select', node);
  // 選擇後清空搜尋（可選）
  if (props.mode === 'map') {
    clearSearch();
  }
};

// 處理切換收藏
const handleToggleFavorite = (node) => {
  emit('toggle-favorite', node);
  // 重新載入收藏列表以更新狀態
  loadFavorites();
};

// 處理刷新
const handleRefresh = () => {
  emit('refresh');
};

// 切換展開/收起
const toggleExpand = () => {
  isExpanded.value = true;
  // 展開後自動聚焦到輸入框
  nextTick(() => {
    const input = document.querySelector('.search-input');
    if (input) {
      input.focus();
    }
  });
};

const toggleCollapse = () => {
  isExpanded.value = false;
  // 收起時清空搜尋
  clearSearch();
};

// 監聽 nodes 變化，重建索引
watch(() => props.nodes, () => {
  if (props.nodes.length > 0) {
    buildSearchIndex();
  }
}, { immediate: true });

// 監聽收藏變化事件
const handleFavoritesUpdated = () => {
  loadFavorites();
};

onMounted(() => {
  loadFavorites();
  window.addEventListener('favorites-updated', handleFavoritesUpdated);
});

onUnmounted(() => {
  if (searchTimeout) {
    clearTimeout(searchTimeout);
  }
  if (searchAnimationFrame) {
    cancelAnimationFrame(searchAnimationFrame);
  }
  if (scrollTimeout) {
    cancelAnimationFrame(scrollTimeout);
  }
  if (searchAbortController) {
    searchAbortController.abort();
  }
  window.removeEventListener('favorites-updated', handleFavoritesUpdated);
});
</script>

<style scoped>
.search-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(255, 255, 255, 0.98);
  padding: 12px 8px;
  box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.15);
  z-index: 1500;
  border-top: 2px solid #48a167;
  transition: all 0.3s ease;
}

.search-bar.icon-mode {
  background: transparent;
  box-shadow: none;
  border-top: none;
  padding: 12px 8px;
}

/* 深色主題 */
.search-bar.theme-dark {
  background: rgba(15, 15, 15, 0.98);
  border-top: 2px solid #48a167;
}

.search-bar.theme-dark.icon-mode {
  background: transparent;
  border-top: none;
}

.search-bar.theme-dark .search-input {
  background: #1a1a1a;
  border-color: #2a2a2a;
  color: #e0e0e0;
}

.search-bar.theme-dark .search-input:focus {
  border-color: #48a167;
  box-shadow: 0 0 0 3px rgba(72, 161, 103, 0.2);
}

.search-bar.theme-dark .search-input::placeholder {
  color: #666;
}

.search-bar.theme-dark .search-icon-button {
  background: rgba(26, 26, 26, 0.3);
  border-color: rgba(72, 161, 103, 0.4);
  color: #48a167;
  box-shadow: 0 2px 8px rgba(72, 161, 103, 0.2);
}

.search-bar.theme-dark .search-icon-button:hover {
  background: rgba(72, 161, 103, 0.25);
  border-color: rgba(72, 161, 103, 0.6);
  color: #48a167;
  box-shadow: 0 4px 12px rgba(72, 161, 103, 0.3);
}

.search-bar.theme-dark .search-icon-button:active {
  background: rgba(72, 161, 103, 0.35);
}

.search-bar.theme-dark .collapse-button {
  background: #1a1a1a;
  border-color: #2a2a2a;
  color: #888;
}

.search-bar.theme-dark .collapse-button:hover {
  background: #2a2a2a;
  border-color: #48a167;
  color: #48a167;
}

.search-bar.theme-dark .clear-button {
  color: #888;
}

.search-bar.theme-dark .clear-button:hover {
  color: #e0e0e0;
  background: rgba(255, 255, 255, 0.1);
}

.search-container {
  max-width: 100%;
  margin: 0 auto;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  transition: all 0.3s ease;
}

.search-container:not(.expanded) {
  justify-content: flex-end;
}

.search-icon-button {
  width: 48px;
  height: 48px;
  border: 1px solid rgba(72, 161, 103, 0.3);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  color: #48a167;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(72, 161, 103, 0.15);
}

.search-icon-button:hover {
  background: rgba(72, 161, 103, 0.2);
  border-color: rgba(72, 161, 103, 0.5);
  color: #48a167;
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(72, 161, 103, 0.25);
}

.search-icon-button:active {
  transform: scale(0.95);
  background: rgba(72, 161, 103, 0.3);
}

.search-icon-button .el-icon {
  font-size: 20px;
  opacity: 0.9;
}

.collapse-button {
  width: 48px;
  height: 48px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  background: white;
  color: #666;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
  flex-shrink: 0;
  margin-left: 8px;
}

.collapse-button:hover {
  background: #f8f9fa;
  border-color: #48a167;
  color: #48a167;
  transform: scale(1.05);
}

.collapse-button:active {
  transform: scale(0.95);
}

.collapse-button .el-icon {
  font-size: 18px;
}

.refresh-button {
  margin-right: 12px;
  margin-left: 22px;
  padding: 12px 16px;
  height: 100%;
}

.search-input-wrapper {
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
}

.search-input {
  width: 100%;
  padding: 12px 40px 12px 16px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 15px;
  outline: none;
  transition: all 0.3s ease;
  background: white;
  color: #000000;
}

.search-input:focus {
  border-color: #48a167;
  box-shadow: 0 0 0 3px rgba(72, 161, 103, 0.1);
}

.search-input::placeholder {
  color: #999;
}

.clear-button {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: #999;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.2s ease;
  padding: 0;
  z-index: 10;
}

.clear-button:hover {
  background: rgba(0, 0, 0, 0.05);
  color: #666;
}

.clear-button:active {
  background: rgba(0, 0, 0, 0.1);
  transform: translateY(-50%) scale(0.95);
}

.clear-button .el-icon {
  font-size: 16px;
}

/* 搜尋結果列表 */
.search-results {
  position: absolute;
  bottom: 100%;
  left: 8px;
  right: 8px;
  margin-bottom: 8px;
  background: white;
  border: 2px solid #48a167;
  border-radius: 8px;
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.15);
  max-height: 300px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.search-bar.theme-dark .search-results {
  background: #1a1a1a;
  border-color: #48a167;
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.5);
}

.results-header {
  padding: 10px 16px;
  background: linear-gradient(135deg, rgb(43, 107, 66) 0%, rgb(72, 161, 103) 100%);
  color: white;
  font-size: 13px;
  font-weight: 600;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
}

.results-list {
  overflow-y: auto;
  flex: 1;
  will-change: scroll-position;
  contain: layout style paint;
  /* 優化滾動性能 */
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}

.result-item {
  padding: 12px 16px;
  border-bottom: 1px solid #e9ecef;
  transition: background-color 0.15s ease;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  contain: layout style;
}

.result-item:hover {
  background: #f8f9fa;
}

.search-bar.theme-dark .result-item {
  border-bottom: 1px solid #2a2a2a;
}

.search-bar.theme-dark .result-item:hover {
  background: #2a2a2a;
}

.result-item:last-child {
  border-bottom: none;
}

.result-info {
  flex: 1;
  cursor: pointer;
  text-align: left;
  min-width: 0;
}

.result-info:active {
  opacity: 0.7;
}

.result-name {
  font-size: 14px;
  font-weight: 600;
  color: #000000;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: flex;
  flex-direction: row;
  gap: 10px;
}

.search-bar.theme-dark .result-name {
  color: #e0e0e0;
}

.result-short-name {
  border: 1px solid #f5f5f5;
  padding: 2px 4px;
  border-radius: 50px;
  width: 50px;
  height: 50px;
  background-color: #48a167;
  text-align: center;
  justify-content: center;
  align-items: center;
  display: flex;
}

.result-id {
  font-size: 12px;
  color: #666666;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search-bar.theme-dark .result-id {
  color: #888;
}

/* 收藏按鈕 */
.favorite-toggle-btn {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  background: white;
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  color: #999;
}

.search-bar.theme-dark .favorite-toggle-btn {
  background: #1a1a1a;
  color: #666;
}

.search-bar.theme-dark .favorite-toggle-btn:hover {
  background: #2a2a2a;
}

.favorite-toggle-btn:hover {
  background: #f8f9fa;
  transform: scale(1.1);
}

.favorite-toggle-btn:active {
  transform: scale(0.95);
}

.favorite-toggle-btn.favorited {
  border-color: #f5576c;
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  color: white;
}

/* 平板和桌面優化 */
@media (min-width: 768px) {
  .search-bar {
    padding: 16px 20px;
    display: flex;
    justify-content: center;
  }

  .search-container {
    max-width: 800px;
    margin: 0 auto;
    width: 100%;
  }

  .search-container:not(.expanded) {
    justify-content: center;
  }

  .search-input {
    font-size: 16px;
    padding: 14px 45px 14px 18px;
  }

  .clear-button {
    right: 10px;
    width: 30px;
    height: 30px;
  }

  .clear-button .el-icon {
    font-size: 18px;
  }

  .search-results {
    left: 50%;
    right: auto;
    transform: translateX(-50%);
    width: 800px;
    max-width: calc(100vw - 40px);
    max-height: 400px;
  }

  .results-header {
    padding: 12px 18px;
    font-size: 14px;
  }

  .result-item {
    padding: 14px 18px;
  }

  .result-name {
    font-size: 15px;
  }

  .result-id {
    font-size: 13px;
  }

  .refresh-button {
    font-size: 21px;
    margin-left: 0;
  }

  .search-icon-button {
    width: 52px;
    height: 52px;
  }

  .search-icon-button .el-icon {
    font-size: 22px;
  }

  .collapse-button {
    width: 52px;
    height: 52px;
  }

  .collapse-button .el-icon {
    font-size: 20px;
  }
}

/* 大螢幕優化 */
@media (min-width: 1024px) {
  .search-container {
    max-width: 1000px;
    margin: 0 auto;
    width: 100%;
  }

  .search-container:not(.expanded) {
    justify-content: center;
  }

  .search-results {
    width: 1000px;
  }

  .search-input {
    font-size: 17px;
    padding: 14px 45px 14px 18px;
  }
}
</style>
