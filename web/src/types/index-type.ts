/**
 * 指数类型常量定义
 * 用于区分大盘指数和行业指数
 */

/**
 * 指数类型枚举值
 */
export const INDEX_TYPE = {
  /** 大盘指数 */
  INDICES: 'indices',
  /** 行业指数 */
  SECTORS: 'sectors',
} as const;

/**
 * 指数类型类型定义
 */
export type IndexType = typeof INDEX_TYPE[keyof typeof INDEX_TYPE];

/**
 * 指数类型显示名称映射
 */
export const INDEX_TYPE_DISPLAY_NAME: Record<IndexType | string, string> = {
  [INDEX_TYPE.INDICES]: '大盘指数',
  [INDEX_TYPE.SECTORS]: '行业指数',
};

/**
 * 判断是否为有效的指数类型
 * @param value 待判断的值
 * @returns 是否为有效的指数类型
 */
export function isValidIndexType(value: string | null | undefined): value is IndexType {
  if (!value) return false;
  return Object.values(INDEX_TYPE).includes(value as IndexType);
}

/**
 * 获取指数类型的显示名称
 * @param type 指数类型
 * @returns 显示名称
 */
export function getIndexTypeDisplayName(type: string | null | undefined): string {
  if (!type) return INDEX_TYPE_DISPLAY_NAME[INDEX_TYPE.INDICES];
  return INDEX_TYPE_DISPLAY_NAME[type] || '未知类型';
}
