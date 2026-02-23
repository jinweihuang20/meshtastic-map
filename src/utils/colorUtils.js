/**
 * 顏色工具函數
 * 用於根據節點的 node_id_hex 生成顏色和樣式
 */

/**
 * 判斷顏色是否為深色
 * @param {string} hexColor - 十六進制顏色值（如 '#ffffff' 或 'ffffff'）
 * @returns {boolean} - 如果為深色返回 true，否則返回 false
 */
export const isDarkColor = (hexColor) => {
  // 去掉 #
  const c = hexColor.startsWith('#') ? hexColor.slice(1) : hexColor;

  // 解析 RGB
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);

  // 計算亮度（根據人眼敏感度加權）
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

  // 小於 128 → 視為「暗色背景」
  return luminance < 128;
};

/**
 * 根據 node_id_hex 獲取背景顏色
 * @param {string} nodeIdHex - 節點的 node_id_hex
 * @returns {string} - 十六進制顏色值（如 '#ffffff'）
 */
export const getNodeBackgroundColor = (nodeIdHex) => {
  if (!nodeIdHex || nodeIdHex.length < 6) {
    return '#ffffff';
  }
  return '#' + nodeIdHex.slice(-6);
};

/**
 * 根據 node_id_hex 獲取文字顏色
 * @param {string} nodeIdHex - 節點的 node_id_hex
 * @returns {string} - 文字顏色（'#ffffff' 或 '#333333'）
 */
export const getNodeTextColor = (nodeIdHex) => {
  const bgColor = getNodeBackgroundColor(nodeIdHex);
  const isDarkBg = isDarkColor(bgColor);
  return isDarkBg ? '#ffffff' : '#333333';
};

/**
 * 根據 node_id_hex 獲取完整的標籤樣式對象
 * @param {string} nodeIdHex - 節點的 node_id_hex
 * @returns {Object} - 包含 backgroundColor, color, borderColor 的樣式對象
 */
export const getNodeColorStyle = (nodeIdHex) => {
  const bgColor = getNodeBackgroundColor(nodeIdHex);
  const textColor = getNodeTextColor(nodeIdHex);

  return {
    backgroundColor: bgColor,
    color: textColor,
    borderColor: bgColor
  };
};
