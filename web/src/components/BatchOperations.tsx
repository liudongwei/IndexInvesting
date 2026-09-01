import { useState } from 'react';
import {
  bulkResync,
  updateEastmoneyCookie,
  calculateAllMA,
  recalculateRecentAllMA,
  analyzeIncremental,
  recalculateTrend,
} from '../services/api';
import { INDEX_TYPE } from '../types/index-type';

type OperationTab = 'resync' | 'cookie' | 'ma-calculate' | 'ma-recalculate' | 'trend-incremental' | 'trend-recalculate';

export function BatchOperations() {
  const [activeTab, setActiveTab] = useState<OperationTab>('resync');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 批量重新同步状态
  const [resyncStartDate, setResyncStartDate] = useState('');
  const [resyncEndDate, setResyncEndDate] = useState('');
  const [resyncType, setResyncType] = useState<string>('');
  const [resyncOnlyActive, setResyncOnlyActive] = useState(true);

  // Cookie更新状态
  const [cookieValue, setCookieValue] = useState('');

  // MA计算状态
  const [maType, setMaType] = useState<string>('');

  // MA重新计算状态
  const [maRecalculateDays, setMaRecalculateDays] = useState('5');
  const [maRecalculateType, setMaRecalculateType] = useState<string>('');

  // 趋势分析增量状态
  const [trendIncrementalType, setTrendIncrementalType] = useState<string>('');

  // 趋势分析重新计算状态
  const [trendRecalculateStartDate, setTrendRecalculateStartDate] = useState('');
  const [trendRecalculateEndDate, setTrendRecalculateEndDate] = useState('');
  const [trendRecalculateType, setTrendRecalculateType] = useState<string>('');

  // 清空消息
  const clearMessages = () => {
    setResult(null);
    setError(null);
  };

  // 批量重新同步
  const handleBulkResync = async () => {
    if (!resyncStartDate || !resyncEndDate) {
      setError('请选择开始和结束日期');
      return;
    }

    setLoading(true);
    clearMessages();

    try {
      const response = await bulkResync({
        startDate: resyncStartDate,
        endDate: resyncEndDate,
        type: resyncType || undefined,
        onlyActive: resyncOnlyActive ? 'true' : 'false',
      });
      setResult(response.message || '批量同步完成');
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    } finally {
      setLoading(false);
    }
  };

  // 更新东财Cookie
  const handleUpdateCookie = async () => {
    if (!cookieValue.trim()) {
      setError('请输入Cookie值');
      return;
    }

    setLoading(true);
    clearMessages();

    try {
      const response = await updateEastmoneyCookie(cookieValue);
      setResult(response.message || 'Cookie更新成功');
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    } finally {
      setLoading(false);
    }
  };

  // 批量计算MA
  const handleCalculateAllMA = async () => {
    setLoading(true);
    clearMessages();

    try {
      const response = await calculateAllMA(maType || undefined);
      setResult(`MA计算完成，成功: ${response.successCount}, 失败: ${response.failedCount}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    } finally {
      setLoading(false);
    }
  };

  // 批量重新计算最近N天MA
  const handleRecalculateRecentAllMA = async () => {
    const days = parseInt(maRecalculateDays, 10);
    if (isNaN(days) || days < 1 || days > 100) {
      setError('天数必须在1-100之间');
      return;
    }

    setLoading(true);
    clearMessages();

    try {
      const response = await recalculateRecentAllMA(days, maRecalculateType || undefined);
      setResult(`MA重新计算完成，成功: ${response.successCount}, 失败: ${response.failedCount}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    } finally {
      setLoading(false);
    }
  };

  // 执行增量趋势分析
  const handleAnalyzeIncremental = async () => {
    setLoading(true);
    clearMessages();

    try {
      const response = await analyzeIncremental(trendIncrementalType || undefined);
      setResult(`增量趋势分析完成，新增/更新: ${response.count} 条数据`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    } finally {
      setLoading(false);
    }
  };

  // 按日期范围重新计算趋势分析
  const handleRecalculateTrend = async () => {
    if (!trendRecalculateStartDate || !trendRecalculateEndDate) {
      setError('请选择开始和结束日期');
      return;
    }

    setLoading(true);
    clearMessages();

    try {
      const response = await recalculateTrend({
        startDate: trendRecalculateStartDate,
        endDate: trendRecalculateEndDate,
        type: trendRecalculateType || undefined,
      });
      setResult(`趋势分析重新计算完成，处理: ${response.count} 条数据`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 页面头部 */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">批量操作中心</h1>
            <p className="text-sm text-gray-500 mt-1">
              常用的批量数据处理功能，支持数据同步、均线计算、趋势分析等操作
            </p>
          </div>
        </div>
      </header>

      {/* 主内容 */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* 标签页导航 */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
          <div className="border-b border-gray-200">
            <nav className="flex overflow-x-auto" aria-label="Tabs">
              {[
                { id: 'resync', label: '批量同步', icon: '🔄' },
                { id: 'cookie', label: '东财Cookie', icon: '🍪' },
                { id: 'ma-calculate', label: 'MA全量计算', icon: '📊' },
                { id: 'ma-recalculate', label: 'MA重算最近N天', icon: '📈' },
                { id: 'trend-incremental', label: '趋势增量分析', icon: '📉' },
                { id: 'trend-recalculate', label: '趋势重算', icon: '🔃' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id as OperationTab);
                    clearMessages();
                  }}
                  className={`flex-shrink-0 flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <span>{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {/* 标签页内容 */}
          <div className="p-6">
            {/* 错误提示 */}
            {error && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}

            {/* 成功提示 */}
            {result && (
              <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                {result}
              </div>
            )}

            {/* 批量重新同步 */}
            {activeTab === 'resync' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">批量重新同步所有指数数据</h3>
                  <p className="text-sm text-gray-500 mb-4">
                    按日期范围重新同步所有指数的数据。会先删除该范围内的旧数据，然后从API获取新数据并保存。
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      开始日期 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={resyncStartDate}
                      onChange={(e) => setResyncStartDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      结束日期 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={resyncEndDate}
                      onChange={(e) => setResyncEndDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">指数类型</label>
                  <select
                    value={resyncType}
                    onChange={(e) => setResyncType(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">所有类型</option>
                    <option value={INDEX_TYPE.INDICES}>大盘指数</option>
                    <option value={INDEX_TYPE.SECTORS}>行业指数</option>
                  </select>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="resyncOnlyActive"
                    checked={resyncOnlyActive}
                    onChange={(e) => setResyncOnlyActive(e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="resyncOnlyActive" className="ml-2 block text-sm text-gray-700">
                    只同步启用的指数（isActive=true）
                  </label>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={handleBulkResync}
                    disabled={loading}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {loading ? '执行中...' : '开始同步'}
                  </button>
                </div>
              </div>
            )}

            {/* 东财Cookie更新 */}
            {activeTab === 'cookie' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">更新东财 Cookie</h3>
                  <p className="text-sm text-gray-500 mb-4">
                    当东财API访问受限或Cookie过期时，需要更新Cookie以继续正常获取数据。
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Cookie值 <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={cookieValue}
                    onChange={(e) => setCookieValue(e.target.value)}
                    rows={6}
                    placeholder="请输入完整的Cookie字符串，例如：qgqp_b_id=xxx; st_nvi=xxx; ..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    请从浏览器开发者工具中复制完整的Cookie字符串
                  </p>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={handleUpdateCookie}
                    disabled={loading}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {loading ? '更新中...' : '更新Cookie'}
                  </button>
                </div>
              </div>
            )}

            {/* MA全量计算 */}
            {activeTab === 'ma-calculate' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">批量计算所有指数的MA数据</h3>
                  <p className="text-sm text-gray-500 mb-4">
                    为所有指数计算移动平均线数据（MA5、MA10、MA20、MA60）。如果已有MA数据会被覆盖。
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">指数类型</label>
                  <select
                    value={maType}
                    onChange={(e) => setMaType(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">所有类型</option>
                    <option value={INDEX_TYPE.INDICES}>大盘指数</option>
                    <option value={INDEX_TYPE.SECTORS}>行业指数</option>
                  </select>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={handleCalculateAllMA}
                    disabled={loading}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {loading ? '计算中...' : '开始计算'}
                  </button>
                </div>
              </div>
            )}

            {/* MA重算最近N天 */}
            {activeTab === 'ma-recalculate' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">批量重新计算最近N个交易日MA数据</h3>
                  <p className="text-sm text-gray-500 mb-4">
                    针对所有指数，重新计算最近N个交易日的移动均线。会先删除旧数据再重新计算。
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    交易日天数 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={maRecalculateDays}
                    onChange={(e) => setMaRecalculateDays(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="mt-1 text-xs text-gray-500">请输入1-100之间的整数，默认5天</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">指数类型</label>
                  <select
                    value={maRecalculateType}
                    onChange={(e) => setMaRecalculateType(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">所有类型</option>
                    <option value={INDEX_TYPE.INDICES}>大盘指数</option>
                    <option value={INDEX_TYPE.SECTORS}>行业指数</option>
                  </select>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={handleRecalculateRecentAllMA}
                    disabled={loading}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {loading ? '计算中...' : '开始重算'}
                  </button>
                </div>
              </div>
            )}

            {/* 趋势增量分析 */}
            {activeTab === 'trend-incremental' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">执行增量趋势分析</h3>
                  <p className="text-sm text-gray-500 mb-4">
                    只计算最新趋势日期之后的新增数据，适用于每日定时任务场景。
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">指数类型</label>
                  <select
                    value={trendIncrementalType}
                    onChange={(e) => setTrendIncrementalType(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">所有类型</option>
                    <option value={INDEX_TYPE.INDICES}>大盘指数</option>
                    <option value={INDEX_TYPE.SECTORS}>行业指数</option>
                  </select>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={handleAnalyzeIncremental}
                    disabled={loading}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {loading ? '分析中...' : '开始分析'}
                  </button>
                </div>
              </div>
            )}

            {/* 趋势重算 */}
            {activeTab === 'trend-recalculate' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">按日期范围重新计算趋势分析</h3>
                  <p className="text-sm text-gray-500 mb-4">
                    删除指定日期范围内的旧数据，然后重新计算趋势分析。用于补数据后重新计算。
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      开始日期 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={trendRecalculateStartDate}
                      onChange={(e) => setTrendRecalculateStartDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      结束日期 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={trendRecalculateEndDate}
                      onChange={(e) => setTrendRecalculateEndDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">指数类型</label>
                  <select
                    value={trendRecalculateType}
                    onChange={(e) => setTrendRecalculateType(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">所有类型</option>
                    <option value={INDEX_TYPE.INDICES}>大盘指数</option>
                    <option value={INDEX_TYPE.SECTORS}>行业指数</option>
                  </select>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={handleRecalculateTrend}
                    disabled={loading}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {loading ? '计算中...' : '开始重算'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
