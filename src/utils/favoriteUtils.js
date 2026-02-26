/**
 * 收藏工具函数
 * 统一管理节点的收藏功能
 */

const FAVORITES_STORAGE_KEY = 'meshtastic_favorites';

/**
 * 获取所有收藏的节点
 * @returns {Array} 收藏节点列表
 */
export const getFavorites = () => {
    const stored = localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (stored) {
        try {
            return JSON.parse(stored);
        } catch (error) {
            console.error('讀取收藏失敗:', error);
            return [];
        }
    }
    return [];
};

/**
 * 保存收藏列表到 localStorage
 * @param {Array} favorites 收藏节点列表
 */
export const saveFavorites = (favorites) => {
    try {
        localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
        // 觸發自定義事件，通知其他組件數據已更新
        window.dispatchEvent(new CustomEvent('favorites-updated'));
    } catch (error) {
        console.error('保存收藏失敗:', error);
    }
};

/**
 * 檢查節點是否已收藏
 * @param {String|Number} nodeId 節點 ID
 * @returns {Boolean} 是否已收藏
 */
export const isNodeFavorited = (nodeId) => {
    const favorites = getFavorites();
    return favorites.some(node => node.node_id === nodeId);
};

/**
 * 將原始節點數據轉換為收藏節點格式
 * @param {Object} node 原始節點數據
 * @returns {Object} 收藏節點數據
 */
const normalizeNodeData = (node) => {
    // 如果節點數據已經包含 latitude 和 longitude（已轉換），直接使用
    // 否則需要從原始數據轉換（原始數據的經緯度需要除以 10000000）
    let lat = node.latitude;
    let lng = node.longitude;

    // 如果經緯度很大（可能是原始格式），需要轉換
    if (lat && Math.abs(lat) > 1000) {
        lat = lat / 10000000;
    }
    if (lng && Math.abs(lng) > 1000) {
        lng = lng / 10000000;
    }

    return {
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
        altitude: node.altitude,
        role_name: node.role_name || null // 添加 role_name 屬性
    };
};

/**
 * 添加節點到收藏
 * @param {Object} node 節點數據（可以是原始 API 數據或已處理的數據）
 * @returns {Boolean} 是否成功添加
 */
export const addFavorite = (node) => {
    const favorites = getFavorites();
    const nodeId = node.node_id;

    // 檢查是否已收藏
    if (favorites.some(n => n.node_id === nodeId)) {
        // 如果已收藏，更新數據（保留 role_name）
        const index = favorites.findIndex(n => n.node_id === nodeId);
        favorites[index] = normalizeNodeData(node);
        saveFavorites(favorites);
        return true;
    }

    // 添加新收藏
    const nodeData = normalizeNodeData(node);
    favorites.push(nodeData);
    saveFavorites(favorites);
    return true;
};

/**
 * 從收藏中移除節點
 * @param {String|Number} nodeId 節點 ID
 * @returns {Boolean} 是否成功移除
 */
export const removeFavorite = (nodeId) => {
    const favorites = getFavorites();
    const filtered = favorites.filter(node => node.node_id !== nodeId);

    if (filtered.length !== favorites.length) {
        saveFavorites(filtered);
        return true;
    }
    return false;
};

/**
 * 切換節點的收藏狀態
 * @param {Object} node 節點數據
 * @returns {Boolean} 切換後的收藏狀態（true = 已收藏，false = 未收藏）
 */
export const toggleFavorite = (node) => {
    const nodeId = node.node_id;
    const isFavorited = isNodeFavorited(nodeId);

    if (isFavorited) {
        removeFavorite(nodeId);
        return false;
    } else {
        addFavorite(node);
        return true;
    }
};
