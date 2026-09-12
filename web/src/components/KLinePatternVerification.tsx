import { useState, useEffect } from 'react';
import type { IndexItem } from '../types/index';
import { getKlinePatternIndices, calculateKLinePatternVerify } from '../services/api';

interface CalculateResult {
  indexId: string;
  indexName: string;
  indexCode?: string;
  officialCode?: string;
  tradeDate: string;
  success: boolean;
  trendState?: 'uptrend' | 'downtrend' | 'sideways';
  primaryPattern?: {
    patternType: string;
    patternName: string;
    confidence: number;
    signal: 'buy' | 'sell' | 'neutral';
  } | null;
  allPatterns?: Array<{
    patternType: string;
    patternName: string;
    confidence: number;
    signal: 'buy' | 'sell' | 'neutral';
  }>;
  error?: string;
  message?: string;
}

export function KLinePatternVerification() {
  const [indices, setIndices] = useState<IndexItem[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<string[]>([]);
  const [tradeDate, setTradeDate] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<CalculateResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  // 加载参与K线形态计算的指数列表
  const loadIndices = async () => {
    try {
      const response = await getKlinePatternIndices();
      setIndices(response.data);
    } catch (err) {
      console.error('加载指数列表失败:', err);
      setError('加载指数列表失败');
    }
  };

  useEffect(() => {
    loadIndices();
    // 默认设置为今天
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    setTradeDate(dateStr);
  }, []);

  // 处理全选/取消全选
  const handleSelectAll = () => {
    if (selectedIndices.length === indices.length) {
      setSelectedIndices([]);
    } else {
      setSelectedIndices(indices.map(idx => idx.id));
    }
  };

  // 处理单个选择
  const handleSelectIndex = (indexId: string) => {
    if (selectedIndices.includes(indexId)) {
      setSelectedIndices(selectedIndices.filter(id => id !== indexId));
    } else {
      setSelectedIndices([...selectedIndices, indexId]);
    }
  };

  // 执行计算
  const handleCalculate = async () => {
    if (!tradeDate) {
      setError('请选择交易日期');
      return;
    }

    if (selectedIndices.length === 0) {
      setError('请至少选择一个指数');
      return;
    }

    setLoading(true);
    setError(null);
    setResults([]);

    try {
      const data = await calculateKLinePatternVerify({
        tradeDate,
        indexIds: selectedIndices,
      });

      if (data.success) {
        setResults(data.data);
      } else {
        setError(data.message || '计算失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '计算失败');
    } finally {
      setLoading(false);
    }
  };

  // 获取趋势状态文本和样式
  const getTrendStateConfig = (state: string) => {
    switch (state) {
      case 'uptrend':
        return { text: '上升趋势', className: 'bg-green-100 text-green-800' };
      case 'downtrend':
        return { text: '下降趋势', className: 'bg-red-100 text-red-800' };
      case 'sideways':
        return { text: '横盘趋势', className: 'bg-gray-100 text-gray-800' };
      default:
        return { text: state, className: 'bg-gray-100 text-gray-800' };
    }
  };

  // 获取信号文本和样式
  const getSignalConfig = (signal: string) => {
    switch (signal) {
      case 'buy':
        return { text: '看涨', className: 'bg-green-100 text-green-800' };
      case 'sell':
        return { text: '看跌', className: 'bg-red-100 text-red-800' };
      case 'neutral':
        return { text: '中性', className: 'bg-gray-100 text-gray-800' };
      default:
        return { text: signal, className: 'bg-gray-100 text-gray-800' };
    }
  };

  // 格式化日期
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 页面头部 */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">K线形态计算验证</h1>
            <p className="text-sm text-gray-500 mt-1">
              批量计算指定交易日的K线形态，用于验证计算准确性
            </p>
          </div>
        </div>
      </header>

      {/* 主内容 */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* 控制面板 */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                交易日期
              </label>
              <input
                type="date"
                value={tradeDate}
                onChange={(e) => setTradeDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-end">
              <button
                onClick={handleCalculate}
                disabled={loading || !tradeDate || selectedIndices.length === 0}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    计算中...
                  </span>
                ) : (
                  `开始计算 (${selectedIndices.length} 个指数)`
                )}
              </button>
            </div>
          </div>

          {/* 指数选择 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                选择指数（共 {indices.length} 个）
              </label>
              <button
                onClick={handleSelectAll}
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                {selectedIndices.length === indices.length ? '取消全选' : '全选'}
              </button>
            </div>
            <div className="border border-gray-200 rounded-lg p-4 max-h-64 overflow-y-auto">
              {indices.length === 0 ? (
                <div className="text-center text-gray-500 py-4">暂无数据</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {indices.map((index) => (
                    <label
                      key={index.id}
                      className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedIndices.includes(index.id)}
                        onChange={() => handleSelectIndex(index.id)}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">
                        {index.name} ({index.code})
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* 计算结果 */}
        {results.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">计算结果</h2>
              <p className="text-sm text-gray-500 mt-1">
                成功: {results.filter(r => r.success).length} / 失败: {results.filter(r => !r.success).length}
              </p>
            </div>

            <div className="divide-y divide-gray-200">
              {results.map((result, index) => (
                <div key={index} className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-base font-medium text-gray-900">
                        {result.indexName}
                        {result.indexCode && (
                          <span className="ml-2 text-sm text-gray-500">({result.indexCode})</span>
                        )}
                      </h3>
                      <p className="text-sm text-gray-500 mt-1">
                        交易日: {formatDate(result.tradeDate)}
                      </p>
                    </div>
                    <span
                      className={`px-3 py-1 text-xs font-medium rounded-full ${
                        result.success
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {result.success ? '成功' : '失败'}
                    </span>
                  </div>

                  {result.success ? (
                    <div className="space-y-4">
                      {/* 主要形态 */}
                      {result.primaryPattern && (
                        <div className="bg-blue-50 rounded-lg p-4">
                          <h4 className="text-sm font-medium text-blue-900 mb-3">主要形态</h4>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div>
                              <p className="text-xs text-blue-700">趋势状态</p>
                              <span
                                className={`inline-block mt-1 px-2 py-1 text-xs font-medium rounded-full ${
                                  getTrendStateConfig(result.trendState || '').className
                                }`}
                              >
                                {getTrendStateConfig(result.trendState || '').text}
                              </span>
                            </div>
                            <div>
                              <p className="text-xs text-blue-700">形态名称</p>
                              <p className="text-sm font-medium text-gray-900 mt-1">
                                {result.primaryPattern.patternName}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-blue-700">置信度</p>
                              <div className="flex items-center gap-2 mt-1">
                                <div className="flex-1 w-20 bg-gray-200 rounded-full h-2">
                                  <div
                                    className="bg-blue-600 h-2 rounded-full"
                                    style={{ width: `${result.primaryPattern.confidence * 100}%` }}
                                  ></div>
                                </div>
                                <span className="text-sm text-gray-600">
                                  {(result.primaryPattern.confidence * 100).toFixed(1)}%
                                </span>
                              </div>
                            </div>
                            <div>
                              <p className="text-xs text-blue-700">信号</p>
                              <span
                                className={`inline-block mt-1 px-2 py-1 text-xs font-medium rounded-full ${
                                  getSignalConfig(result.primaryPattern.signal).className
                                }`}
                              >
                                {getSignalConfig(result.primaryPattern.signal).text}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 所有检测到的形态 */}
                      {result.allPatterns && result.allPatterns.length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium text-gray-900 mb-2">
                            所有检测到的形态 ({result.allPatterns.length} 个)
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {result.allPatterns.map((pattern, pIndex) => (
                              <div
                                key={pIndex}
                                className="border border-gray-200 rounded-lg p-3"
                              >
                                <p className="text-xs text-gray-500">{pattern.patternType}</p>
                                <p className="text-sm font-medium text-gray-900 mt-1">
                                  {pattern.patternName}
                                </p>
                                <div className="flex items-center justify-between mt-2">
                                  <span
                                    className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                                      getSignalConfig(pattern.signal).className
                                    }`}
                                  >
                                    {getSignalConfig(pattern.signal).text}
                                  </span>
                                  <span className="text-xs text-gray-500">
                                    {(pattern.confidence * 100).toFixed(1)}%
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-sm text-red-600">{result.error}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
