import { useState, useEffect, useMemo } from 'react';
import type { IndexHistoryItem } from '../types/history';
import type { IndexItem } from '../types/index';
import { getIndexHistory, getIndices } from '../services/api';

// 简易K线图组件
function MiniKLine({ data }: { data: IndexHistoryItem[] }) {
  if (data.length === 0) return null;

  // 过滤有效数据（价格必须大于0）
  const validData = data.filter(
    (d) => d.highPrice > 0 && d.lowPrice > 0 && d.openPrice > 0 && d.closePrice > 0
  );
  if (validData.length === 0) return null;

  // 计算价格范围
  const prices = validData.flatMap((d) => [d.highPrice, d.lowPrice]);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const range = maxPrice - minPrice || 1;

  // 取最近30条数据展示
  const displayData = validData.slice(0, 30).reverse();

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
      <h3 className="text-sm font-medium text-gray-700 mb-3">价格走势（最近30个交易日）</h3>
      <div className="h-40 flex items-end gap-1">
        {displayData.map((item, index) => {
          const isUp = item.closePrice >= item.openPrice;
          const top = ((maxPrice - item.highPrice) / range) * 100;
          const height = ((item.highPrice - item.lowPrice) / range) * 100;
          const bodyTop = ((maxPrice - Math.max(item.openPrice, item.closePrice)) / range) * 100;
          const bodyHeight =
            (Math.abs(item.closePrice - item.openPrice) / range) * 100 || 2;

          return (
            <div
              key={item.id}
              className="flex-1 flex flex-col items-center relative"
              title={`${item.tradeDate} 开:${item.openPrice} 收:${item.closePrice} 高:${item.highPrice} 低:${item.lowPrice}`}
            >
              {/* 上影线 */}
              <div
                className={`absolute w-0.5 ${isUp ? 'bg-red-500' : 'bg-green-500'}`}
                style={{
                  top: `${top}%`,
                  height: `${height}%`,
                }}
              />
              {/* 实体 */}
              <div
                className={`absolute w-full max-w-3 ${isUp ? 'bg-red-500' : 'bg-green-500'}`}
                style={{
                  top: `${bodyTop}%`,
                  height: `${Math.max(bodyHeight, 2)}%`,
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-xs text-gray-400 mt-2">
        <span>{displayData[0]?.tradeDate}</span>
        <span>{displayData[displayData.length - 1]?.tradeDate}</span>
      </div>
    </div>
  );
}

export function IndexHistory() {
  const [indices, setIndices] = useState<IndexItem[]>([]);
  const [selectedIndexId, setSelectedIndexId] = useState<string>('');
  const [historyData, setHistoryData] = useState<IndexHistoryItem[]>([]);
  const [indexInfo, setIndexInfo] = useState<{ name: string; code: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [indicesLoading, setIndicesLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 日期范围
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [limit, setLimit] = useState<number>(100);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载指数列表失败');
    } finally {
      setIndicesLoading(false);
    }
  };

  // 加载历史数据
  const loadHistory = async () => {
    if (!selectedIndexId) return;

    setLoading(true);
    setError(null);
    try {
      const response = await getIndexHistory(
        selectedIndexId,
        limit,
        startDate || undefined,
        endDate || undefined
      );
      // 处理 API 响应，确保数据存在
      const historyList = response.data || [];
      setHistoryData(historyList);
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
    } finally {
      setLoading(false);
    }
  };

  // 当选择指数时自动加载数据
  useEffect(() => {
    if (selectedIndexId) {
      loadHistory();
    }
  }, [selectedIndexId]);

  // 格式化日期
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  // 格式化数字
  const formatNumber = (num: number | null, decimals: number = 2) => {
    if (num === null || num === undefined) return '-';
    return num.toFixed(decimals);
  };

  // 格式化成交量
  const formatVolume = (volume: number | null) => {
    if (volume === null || volume === undefined) return '-';
    if (volume >= 100000000) {
      return (volume / 100000000).toFixed(2) + '亿';
    }
    if (volume >= 10000) {
      return (volume / 10000).toFixed(2) + '万';
    }
    return volume.toString();
  };

  // 计算统计数据
  const stats = useMemo(() => {
    if (historyData.length === 0) return null;

    // 过滤有效价格数据
    const validPrices = historyData.filter((d) => d.highPrice > 0 && d.lowPrice > 0);
    if (validPrices.length === 0) return null;

    const volumes = historyData.filter((d) => d.volume !== null && d.volume !== undefined).map((d) => d.volume!);

    return {
      highest: Math.max(...validPrices.map((d) => d.highPrice)),
      lowest: Math.min(...validPrices.map((d) => d.lowPrice)),
      avgVolume: volumes.length > 0 ? volumes.reduce((a, b) => a + b, 0) / volumes.length : 0,
      totalDays: historyData.length,
      upDays: historyData.filter((d) => (d.changePercent || 0) > 0).length,
      downDays: historyData.filter((d) => (d.changePercent || 0) < 0).length,
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

            {/* 开始日期 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">开始日期</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* 结束日期 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">结束日期</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* 数据条数 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">显示条数</label>
              <select
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value={30}>最近30条</option>
                <option value={50}>最近50条</option>
                <option value={100}>最近100条</option>
                <option value={200}>最近200条</option>
                <option value={500}>最近500条</option>
              </select>
            </div>

            {/* 查询按钮 */}
            <div className="flex items-end">
              <button
                onClick={loadHistory}
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

            {/* 简易K线图 */}
            {historyData.length > 0 && <MiniKLine data={historyData} />}

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
                      historyData.map((item) => {
                        const isUp = (item.changePercent || 0) >= 0;
                        return (
                          <tr key={item.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                              {formatDate(item.tradeDate)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-700">
                              {formatNumber(item.openPrice)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right">
                              <span className={isUp ? 'text-red-600' : 'text-green-600'}>
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
                              <span className={isUp ? 'text-red-600' : 'text-green-600'}>
                                {item.changeAmount && item.changeAmount > 0 ? '+' : ''}
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
                                {item.changePercent && item.changePercent > 0 ? '+' : ''}
                                {formatNumber(item.changePercent)}%
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-600">
                              {formatVolume(item.volume)}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-600">
                              {formatVolume(item.turnover)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
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
