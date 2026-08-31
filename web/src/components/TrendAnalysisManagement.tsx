import { useState, useEffect, useMemo } from 'react';
import type { TrendAnalysisItem } from '../types/trend';
import type { IndexItem } from '../types/index';
import { getTrendAnalysis, getIndices, deleteTrendAnalysis } from '../services/api';

export function TrendAnalysisManagement() {
  const [indices, setIndices] = useState<IndexItem[]>([]);
  const [selectedIndexId, setSelectedIndexId] = useState<string>('');
  const [trendData, setTrendData] = useState<TrendAnalysisItem[]>([]);
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
        setSelectedIndexId(data[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载指数列表失败');
    } finally {
      setIndicesLoading(false);
    }
  };

  // 加载趋势分析数据（后端分页）
  const loadTrendData = async (page: number = currentPage, size: number = pageSize) => {
    if (!selectedIndexId) return;

    setLoading(true);
    setError(null);
    try {
      const response = await getTrendAnalysis(
        selectedIndexId,
        0,
        0,
        page,
        size
      );
      const dataList = response.data || [];
      setTrendData(dataList);
      setTotal(response.total || 0);
      
      if (response.success && indices.length > 0) {
        const selectedIndex = indices.find((i) => i.id === selectedIndexId);
        if (selectedIndex) {
          setIndexInfo({
            name: selectedIndex.name,
            code: selectedIndex.code,
          });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载趋势分析数据失败');
      setTrendData([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  // 删除单条趋势分析数据
  const handleDelete = async (trendId: string) => {
    if (!confirm('确定要删除这条趋势分析数据吗？删除后需要重新计算才能恢复。')) {
      return;
    }

    setDeletingId(trendId);
    try {
      await deleteTrendAnalysis(trendId);
      await loadTrendData(currentPage, pageSize);
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
      loadTrendData(1, pageSize);
    }
  }, [selectedIndexId]);

  // 当页码或每页条数变化时加载数据
  useEffect(() => {
    if (selectedIndexId) {
      loadTrendData(currentPage, pageSize);
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

  // 格式化偏离率
  const formatDeviationRate = (rate: number | null | string) => {
    if (rate === null || rate === undefined) return '-';
    const r = typeof rate === 'string' ? parseFloat(rate) : rate;
    if (isNaN(r)) return '-';
    const sign = r > 0 ? '+' : '';
    return `${sign}${r.toFixed(2)}%`;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 页面头部 */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">趋势分析管理</h1>
              <p className="text-sm text-gray-500 mt-1">
                查看和管理指数的趋势分析数据（排名、涨跌幅、偏离率等）
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
                onClick={() => loadTrendData(1, pageSize)}
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
                  <div className="text-sm text-gray-500">
                    共 {total} 条趋势分析数据
                  </div>
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
                        收盘价
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        MA20
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        涨跌幅
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        偏离率
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        量比
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        趋势状态
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        排名
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        排名变化
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                        操作
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {loading ? (
                      <tr>
                        <td colSpan={10} className="px-4 py-8 text-center text-gray-500">
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                            加载中...
                          </div>
                        </td>
                      </tr>
                    ) : trendData.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="px-4 py-8 text-center text-gray-500">
                          暂无趋势分析数据
                        </td>
                      </tr>
                    ) : (
                      trendData.map((item: TrendAnalysisItem) => {
                        const changePercentNum =
                          typeof item.changePercent === 'string'
                            ? parseFloat(item.changePercent)
                            : item.changePercent || 0;
                        const deviationRateNum =
                          typeof item.deviationRate === 'string'
                            ? parseFloat(item.deviationRate)
                            : item.deviationRate || 0;
                        const isUp = changePercentNum >= 0;
                        return (
                          <tr key={item.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                              {formatDate(item.tradeDate)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-700">
                              {formatNumber(item.closePrice)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-700">
                              {formatNumber(item.ma20)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right">
                              <span
                                className={isUp ? 'text-red-600' : 'text-green-600'}
                              >
                                {changePercentNum > 0 ? '+' : ''}
                                {formatNumber(item.changePercent)}%
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right">
                              <span
                                className={`inline-flex px-2 py-0.5 text-xs font-medium rounded ${
                                  deviationRateNum >= 0
                                    ? 'bg-red-100 text-red-800'
                                    : 'bg-green-100 text-green-800'
                                }`}
                              >
                                {formatDeviationRate(item.deviationRate)}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-700">
                              {formatNumber(item.volumeRatio)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-center">
                              <span
                                className={`inline-flex px-2 py-0.5 text-xs font-medium rounded ${
                                  item.trendStatus === 'above'
                                    ? 'bg-red-100 text-red-800'
                                    : 'bg-green-100 text-green-800'
                                }`}
                              >
                                {item.trendStatus === 'above' ? '上方' : '下方'}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-700">
                              {item.rank}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right">
                              <span
                                className={item.rankChange >= 0 ? 'text-red-600' : 'text-green-600'}
                              >
                                {item.rankChange > 0 ? '+' : ''}{item.rankChange}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-center">
                              <button
                                onClick={() => handleDelete(item.id)}
                                disabled={deletingId === item.id}
                                className="text-red-600 hover:text-red-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                title="删除此条趋势分析数据"
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
              {trendData.length > 0 && (
                <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
                  <div className="text-sm text-gray-500">
                    共 {total} 条数据，第 {currentPage}/{totalPages} 页
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
            <h3 className="text-lg font-medium text-gray-900 mb-2">选择指数查看趋势分析数据</h3>
            <p className="text-sm text-gray-500">从上方下拉菜单选择一个指数，查看其趋势分析历史数据</p>
          </div>
        )}
      </main>
    </div>
  );
}
