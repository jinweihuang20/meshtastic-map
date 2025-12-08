<template>
  <div class="search-bar">
    <!-- 搜尋結果列表 -->
    <div v-show="searchQuery && (isSearching || filteredNodes.length > 0 || searchQuery)" class="search-results">
      <div class="results-header">
        <span v-if="isSearching">搜尋中...</span>
        <span v-else-if="filteredNodes.length > 0">找到 {{ filteredNodes.length }} 個節點</span>
        <span v-else-if="searchQuery && !isSearching">未找到符合的節點</span>
      </div>
      <div v-if="!isSearching && filteredNodes.length > 0" class="results-list">
        <div v-for="node in displayedNodes" :key="node.node_id" class="result-item"
          v-memo="[node.node_id, isNodeFavorited(node.node_id)]">
          <div class="result-info" @click="handleNodeSelect(node)">
            <div class="result-name">
              <div class="result-short-name"
                v-bind:style="{ backgroundColor: '#' + node.node_id_hex.slice(-6), color: isDarkColor('#' + node.node_id_hex.slice(-6)) ? 'white' : 'black' }">
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
        <div v-if="filteredNodes.length > maxDisplayedResults" class="results-footer">
          顯示前 {{ maxDisplayedResults }} 個結果（共 {{ filteredNodes.length }} 個）
        </div>
      </div>
    </div>

    <!-- 搜尋輸入框 -->
    <div class="search-container">
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
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { Refresh, Close } from '@element-plus/icons-vue';

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
  }
});

// Emits
const emit = defineEmits(['node-select', 'toggle-favorite', 'refresh', 'search-change']);

// 搜尋相關
const searchQuery = ref('');
const filteredNodes = ref([]);
const isSearching = ref(false);
const maxDisplayedResults = ref(50);
let searchTimeout = null;
let searchAbortController = null;
let searchAnimationFrame = null;

// 搜索索引：預構建所有節點的搜索字符串
const searchIndex = ref([]);

// 收藏相關
const favorites = ref([]);

// 計算總節點數
const totalNodesCount = computed(() => props.nodes.length);

// 判斷顏色是否為深色
const isDarkColor = (hexColor) => {
  const c = hexColor.startsWith('#') ? hexColor.slice(1) : hexColor;
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance < 128;
};

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

// 計算要顯示的節點
const displayedNodes = computed(() => {
  return filteredNodes.value.slice(0, maxDisplayedResults.value);
});

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
  border-top: 2px solid #667eea;
}

.search-container {
  max-width: 100%;
  margin: 0 auto;
  display: flex;
  flex-direction: row;
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
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
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
  border: 2px solid #667eea;
  border-radius: 8px;
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.15);
  max-height: 300px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.results-header {
  padding: 10px 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
}

.results-footer {
  padding: 10px 16px;
  background: #f8f9fa;
  color: #666;
  font-size: 12px;
  text-align: center;
  border-top: 1px solid #e9ecef;
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

.result-short-name {
  border: 1px solid #f5f5f5;
  padding: 2px 4px;
  border-radius: 50px;
  width: 50px;
  height: 50px;
  background-color: #667eea;
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
  }

  .search-container {
    max-width: 800px;
    margin: 0 auto;
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
}

/* 大螢幕優化 */
@media (min-width: 1024px) {
  .search-container {
    max-width: 1000px;
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

