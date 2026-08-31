import { useState, useEffect, useMemo } from 'react';
import type { IndexHistoryItem } from '../types/history';
import type { IndexItem } from '../types/index';
import { getIndexHistory, getIndices, deleteHistoryItem } from '../services/api';

export function IndexHistory() {
  const [indices, setIndices] = useState<IndexItem[]>([]);
  const [selectedIndexId, setSelectedIndexId] = useState<string>('');
  const [historyData, setHistoryData] = useState<IndexHistoryItem[]>([]);
  const [indexInfo, setIndexInfo] = useState<{ name: string; code: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [indicesLoading, setIndicesLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // 分页（后端分页）
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(20);
  const [total, setTotal] = useState<number>(0);

  // 加载指数列表
  useEffect(() => {
    loadIndices();
  }, []);

  const loadIndices = async () => {
    setIndicesLoading(true);
    setError(null);
    try {
      const data = await getIndices();
      setIndices(data);
      
      // 默认选择上证指数（sh000001）
      const defaultIndex = data.find(index => index.code === 'sh000001');
      if (defaultIndex) {
        setSelectedIndexId(defaultIndex.id);
      } else if (data.length > 0) {
        // 如果找不到上证指数，默认选择第一个
        setSelectedIndexId(data[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载指数列表失败');
    } finally {
      setIndicesLoading(false);
    }
  };

  // 加载历史数据（后端分页）
  const loadHistory = async (page: number = currentPage, size: number = pageSize) => {
    if (!selectedIndexId) return;

    setLoading(true);
    setError(null);
    try {
      const response = await getIndexHistory(
        selectedIndexId,
        0, // limit 设为 0，使用分页参数
        undefined,
        undefined,
        page,
        size
      );
      // 处理 API 响应，确保数据存在
      const historyList = response.data || [];
      setHistoryData(historyList);
      setTotal(response.total || 0);
      if (response.index) {
        setIndexInfo({
          name: response.index.name,
          code: response.index.code,
        });
      } else {
        // 如果没有返回指数信息，从已加载的列表中查找
        const selectedIndex = indices.find((i) => i.id === selectedIndexId);
        if (selectedIndex) {
          setIndexInfo({
            name: selectedIndex.name,
            code: selectedIndex.code,
          });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载历史数据失败');
      setHistoryData([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  // 删除单条历史数据
  const handleDelete = async (historyId: string) => {
    if (!selectedIndexId) return;

    if (!confirm('确定要删除这条历史数据吗？删除后需要重新同步才能恢复。')) {
      return;
    }

    setDeletingId(historyId);
    try {
      await deleteHistoryItem(selectedIndexId, historyId);
      // 删除成功后刷新当前页
      await loadHistory(currentPage, pageSize);
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setDeletingId(null);
    }
  };

  // 当选择指数变化时重置分页并加载数据
  useEffect(() => {
    if (selectedIndexId) {
      setCurrentPage(1);
      loadHistory(1, pageSize);
    }
  }, [selectedIndexId]);

  // 当页码或每页条数变化时加载数据
  useEffect(() => {
    if (selectedIndexId) {
      loadHistory(currentPage, pageSize);
    }
  }, [currentPage, pageSize]);

  // 总页数
  const totalPages = useMemo(() => {
    return Math.ceil(total / pageSize);
  }, [total, pageSize]);

  // 格式化日期
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  // 格式化数字
  const formatNumber = (num: number | null | string, decimals: number = 2) => {
    if (num === null || num === undefined) return '-';
    const n = typeof num === 'string' ? parseFloat(num) : num;
    if (isNaN(n)) return '-';
    return n.toFixed(decimals);
  };

  // 格式化成交量
  const formatVolume = (volume: number | null | string) => {
    if (volume === null || volume === undefined) return '-';
    const v = typeof volume === 'string' ? parseFloat(volume) : volume;
    if (isNaN(v)) return '-';
    if (v >= 100000000) {
      return (v / 100000000).toFixed(2) + '亿';
    }
    if (v >= 10000) {
      return (v / 10000).toFixed(2) + '万';
    }
    return v.toString();
  };

  // 计算统计数据
  const stats = useMemo(() => {
    // 1. 防御性编程：确保 historyData 存在且为数组
    if (
      !historyData ||
      !Array.isArray(historyData) ||
      historyData.length === 0
    ) {
      return null;
    }

    let highest = -Infinity;
    let lowest = Infinity;
    let volumeSum = 0;
    let validVolumeCount = 0;
    let upDays = 0;
    let downDays = 0;
    let hasValidPrice = false;

    for (const d of historyData) {
      // 处理涨跌幅
      const changePercent =
        typeof d.changePercent === 'string'
          ? parseFloat(d.changePercent)
          : d.changePercent;
      const cpNum = changePercent || 0;
      if (cpNum > 0) upDays++;
      else if (cpNum < 0) downDays++;

      // 处理成交量
      if (d.volume !== null && d.volume !== undefined) {
        const vol =
          typeof d.volume === 'string' ? parseFloat(d.volume) : d.volume;
        if (!isNaN(vol)) {
          volumeSum += vol;
          validVolumeCount++;
        }
      }

      // 处理价格
      const high =
        typeof d.highPrice === 'string' ? parseFloat(d.highPrice) : d.highPrice;
      const low =
        typeof d.lowPrice === 'string' ? parseFloat(d.lowPrice) : d.lowPrice;

      if (high > 0 && low > 0) {
        hasValidPrice = true;
        if (high > highest) highest = high;
        if (low < lowest) lowest = low;
      }
    }

    if (!hasValidPrice) return null;

    return {
      highest,
      lowest,
      avgVolume: validVolumeCount > 0 ? volumeSum / validVolumeCount : 0,
      totalDays: historyData.length,
      upDays,
      downDays,
    };
  }, [historyData]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 页面头部 */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">指数历史数据</h1>
              <p className="text-sm text-gray-500 mt-1">
                查看指数的每日交易数据，包括开盘、收盘、最高、最低、成交量等
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* 主内容 */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* 控制面板 */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* 指数选择 */}
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">选择指数</label>
              <select
                value={selectedIndexId}
                onChange={(e) => setSelectedIndexId(e.target.value)}
                disabled={indicesLoading}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">
                  {indicesLoading ? '加载中...' : '请选择指数'}
                </option>
                {indices.map((index) => (
                  <option key={index.id} value={index.id}>
                    {index.name} ({index.code})
                  </option>
                ))}
              </select>
            </div>

            {/* 查询按钮 */}
            <div className="flex items-end">
              <button
                onClick={() => loadHistory(1, pageSize)}
                disabled={!selectedIndexId || loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? '加载中...' : '查询'}
              </button>
            </div>
          </div>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* 数据展示 */}
        {selectedIndexId && (
          <>
            {/* 指数信息卡片 */}
            {indexInfo && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">{indexInfo.name}</h2>
                    <p className="text-sm text-gray-500">代码: {indexInfo.code}</p>
                  </div>
                  {stats && (
                    <div className="flex gap-6 text-sm">
                      <div className="text-center">
                        <p className="text-gray-500">区间最高</p>
                        <p className="font-semibold text-red-600">{formatNumber(stats.highest)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-gray-500">区间最低</p>
                        <p className="font-semibold text-green-600">{formatNumber(stats.lowest)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-gray-500">上涨天数</p>
                        <p className="font-semibold text-red-600">{stats.upDays}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-gray-500">下跌天数</p>
                        <p className="font-semibold text-green-600">{stats.downDays}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-gray-500">总交易日</p>
                        <p className="font-semibold text-gray-900">{stats.totalDays}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}



            {/* 数据表格 */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        日期
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        开盘
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        收盘
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        最高
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        最低
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        涨跌额
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        涨跌幅
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        成交量
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        成交额
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        操作
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {loading ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                            加载中...
                          </div>
                        </td>
                      </tr>
                    ) : historyData.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                          暂无数据
                        </td>
                      </tr>
                    ) : (
                      historyData.map((item: IndexHistoryItem) => {
                        const changePercentNum =
                          typeof item.changePercent === 'string'
                            ? parseFloat(item.changePercent)
                            : item.changePercent || 0;
                        const changeAmountNum =
                          typeof item.changeAmount === 'string'
                            ? parseFloat(item.changeAmount)
                            : item.changeAmount || 0;
                        const isUp = changePercentNum >= 0;
                        return (
                          <tr key={item.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                              {formatDate(item.tradeDate)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-700">
                              {formatNumber(item.openPrice)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right">
                              <span
                                className={
                                  isUp ? 'text-red-600' : 'text-green-600'
                                }
                              >
                                {formatNumber(item.closePrice)}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-700">
                              {formatNumber(item.highPrice)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-700">
                              {formatNumber(item.lowPrice)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right">
                              <span
                                className={
                                  isUp ? 'text-red-600' : 'text-green-600'
                                }
                              >
                                {changeAmountNum > 0 ? '+' : ''}
                                {formatNumber(item.changeAmount)}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right">
                              <span
                                className={`inline-flex px-2 py-0.5 text-xs font-medium rounded ${
                                  isUp
                                    ? 'bg-red-100 text-red-800'
                                    : 'bg-green-100 text-green-800'
                                }`}
                              >
                                {changePercentNum > 0 ? '+' : ''}
                                {formatNumber(item.changePercent)}%
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-600">
                              {formatVolume(item.volume)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-600">
                              {formatVolume(item.turnover)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-center">
                              <button
                                onClick={() => handleDelete(item.id)}
                                disabled={deletingId === item.id}
                                className="text-red-600 hover:text-red-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                title="删除此条数据"
                              >
                                {deletingId === item.id ? '删除中...' : '🗑️'}
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* 分页控件 */}
              {historyData.length > 0 && (
                <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
                  <div className="text-sm text-gray-500">
                    共 {historyData.length} 条数据，第 {currentPage}/{totalPages} 页
                  </div>
                  <div className="flex items-center gap-2">
                    {/* 每页条数选择 */}
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value={10}>10条/页</option>
                      <option value={20}>20条/页</option>
                      <option value={50}>50条/页</option>
                      <option value={100}>100条/页</option>
                    </select>

                    {/* 分页按钮 */}
                    <button
                      onClick={() => setCurrentPage(1)}
                      disabled={currentPage === 1}
                      className="px-3 py-1 border border-gray-300 rounded text-sm bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      首页
                    </button>
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="px-3 py-1 border border-gray-300 rounded text-sm bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      上一页
                    </button>

                    {/* 页码显示 */}
                    <span className="px-3 py-1 text-sm text-gray-600">
                      {currentPage} / {totalPages}
                    </span>

                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="px-3 py-1 border border-gray-300 rounded text-sm bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      下一页
                    </button>
                    <button
                      onClick={() => setCurrentPage(totalPages)}
                      disabled={currentPage === totalPages}
                      className="px-3 py-1 border border-gray-300 rounded text-sm bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      末页
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* 空状态 */}
        {!selectedIndexId && !indicesLoading && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <div className="text-6xl mb-4">📊</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">选择指数查看历史数据</h3>
            <p className="text-sm text-gray-500">从上方下拉菜单选择一个指数，查看其历史交易数据</p>
          </div>
        )}
      </main>
    </div>
  );
}
