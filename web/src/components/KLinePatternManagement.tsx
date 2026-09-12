import { useState, useEffect } from 'react';
import type { KLinePattern } from '../types/kline-pattern';
import type { IndexItem } from '../types/index';
import { queryKLinePatterns, getKlinePatternIndices } from '../services/api';

export function KLinePatternManagement() {
  const [patterns, setPatterns] = useState<KLinePattern[]>([]);
  const [indices, setIndices] = useState<IndexItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // 查询条件
  const [selectedindexId, setSelectedIndexId] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [isRealtime, setIsRealtime] = useState<boolean | undefined>(undefined);
  const [trendState, setTrendState] = useState<string>('');
  const [patternName, setPatternName] = useState<string>('');
  const [signal, setSignal] = useState<string>('');
  
  // 分页
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  
  // 加载指数列表
  const loadIndices = async () => {
    try {
      const response = await getKlinePatternIndices();
      setIndices(response.data);
    } catch (err) {
      console.error('加载指数列表失败:', err);
    }
  };

  // 加载K线形态数据
  const loadPatterns = async () => {
    setLoading(true);
    setError(null);
    try {
      const params: any = {
        page,
        pageSize,
      };
      
      if (selectedindexId) params.indexId = selectedindexId;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      if (isRealtime !== undefined) params.isRealtime = isRealtime;
      if (trendState) params.trendState = trendState;
      if (patternName) params.patternName = patternName;
      if (signal) params.signal = signal;
      
      const response = await queryKLinePatterns(params);
      setPatterns(response.data);
      setTotal(response.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadIndices();
  }, []);

  useEffect(() => {
    loadPatterns();
  }, [page, selectedindexId, startDate, endDate, isRealtime, trendState, patternName, signal]);

  // 格式化日期
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  // 获取指数名称
  const getIndexName = (indexId: string) => {
    const index = indices.find(i => i.id === indexId);
    return index ? index.name : indexId;
  };

  // 获取趋势状态文本
  const getTrendStateText = (state: string) => {
    switch (state) {
      case 'uptrend': return '上升趋势';
      case 'downtrend': return '下降趋势';
      case 'sideways': return '横盘趋势';
      default: return state;
    }
  };

  // 获取信号文本
  const getSignalText = (signal: string) => {
    switch (signal) {
      case 'buy': return '看涨';
      case 'sell': return '看跌';
      case 'neutral': return '中性';
      default: return signal;
    }
  };

  // 计算总页数
  const totalPages = Math.ceil(total / pageSize);

  // 处理搜索
  const handleSearch = () => {
    setPage(1);
    loadPatterns();
  };

  // 处理重置
  const handleReset = () => {
    setSelectedIndexId('');
    setStartDate('');
    setEndDate('');
    setIsRealtime(undefined);
    setTrendState('');
    setPatternName('');
    setSignal('');
    setPage(1);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 页面头部 */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">K线形态管理</h1>
              <p className="text-sm text-gray-500 mt-1">
                查看和分析指数的K线形态数据
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={loadPatterns}
                disabled={loading}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50 transition-colors"
              >
                刷新
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* 主内容 */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* 搜索栏 */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">选择指数</label>
              <select
                value={selectedindexId}
                onChange={(e) => setSelectedIndexId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">全部指数</option>
                {indices.map((index) => (
                  <option key={index.id} value={index.id}>
                    {index.name} ({index.code})
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">开始日期</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">结束日期</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">数据类型</label>
              <select
                value={isRealtime === undefined ? '' : isRealtime.toString()}
                onChange={(e) => {
                  const value = e.target.value;
                  setIsRealtime(value === '' ? undefined : value === 'true');
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">全部</option>
                <option value="true">实时数据</option>
                <option value="false">静态数据</option>
              </select>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">趋势状态</label>
              <select
                value={trendState}
                onChange={(e) => setTrendState(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">全部</option>
                <option value="uptrend">上升趋势</option>
                <option value="downtrend">下降趋势</option>
                <option value="sideways">横盘趋势</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">形态名称</label>
              <input
                type="text"
                value={patternName}
                onChange={(e) => setPatternName(e.target.value)}
                placeholder="支持模糊搜索"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">信号类型</label>
              <select
                value={signal}
                onChange={(e) => setSignal(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">全部</option>
                <option value="buy">看涨</option>
                <option value="sell">看跌</option>
                <option value="neutral">中性</option>
              </select>
            </div>
          </div>
          
          <div className="mt-4 flex items-center justify-between">
            <div className="text-sm text-gray-500">
              共 <span className="font-medium text-gray-900">{total}</span> 条记录
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSearch}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                查询
              </button>
              <button
                onClick={handleReset}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
              >
                重置
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

        {/* 数据表格 */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    指数
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    交易日期
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    趋势状态
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    形态名称
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    置信度
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    信号
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    数据类型
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                        加载中...
                      </div>
                    </td>
                  </tr>
                ) : patterns.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                      暂无数据
                    </td>
                  </tr>
                ) : (
                  patterns.map((pattern) => (
                    <tr key={pattern.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {getIndexName(pattern.indexId)}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-sm text-gray-600">
                          {formatDate(pattern.tradeDate)}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                            pattern.trendState === 'uptrend'
                              ? 'bg-green-100 text-green-800'
                              : pattern.trendState === 'downtrend'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {getTrendStateText(pattern.trendState)}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{pattern.patternName}</div>
                        <div className="text-xs text-gray-500">{pattern.patternType}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 w-16 bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full"
                              style={{ width: `${pattern.confidence * 100}%` }}
                            ></div>
                          </div>
                          <span className="text-sm text-gray-600">
                            {(pattern.confidence * 100).toFixed(1)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                            pattern.signal === 'buy'
                              ? 'bg-green-100 text-green-800'
                              : pattern.signal === 'sell'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {getSignalText(pattern.signal)}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                            pattern.isRealtime
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {pattern.isRealtime ? '实时' : '静态'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* 分页控件 */}
          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
              <div className="text-sm text-gray-700">
                第 {page} 页，共 {totalPages} 页
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1 || loading}
                  className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  上一页
                </button>
                <button
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages || loading}
                  className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  下一页
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}