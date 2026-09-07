import { useState, useEffect } from 'react';
import { getLatestDynamicTrend, triggerDynamicTrendCalculation } from '../services/api';
import { INDEX_TYPE } from '../types/index-type';

interface DynamicTrendItem {
  id: string;
  indexId: string;
  calculationTime: string;
  tradeDate: string;
  currentPrice: number;
  ma20: number;
  changePercent: number;
  deviationRate: number | null;
  statusChangeDate: string | null;
  intervalChangePercent: number | null;
  rank: number;
  rankChange: number;
  totalRankCount: number;
  indexType: string | null;
  index?: {
    id: string;
    code: string;
    name: string;
    officialCode?: string;
  };
}

// 动态脉冲圆环组件（牛市红色，慢速动画）
function PulsingDot() {
  return (
    <span className="inline-flex items-center justify-center ml-2" title="实时数据">
      <span className="relative flex h-3 w-3">
        {/* 外圈脉冲动画 - 牛市红色，2秒周期 */}
        <span 
          className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-60"
          style={{
            animation: 'pulse-slow 2s cubic-bezier(0, 0, 0.2, 1) infinite',
          }}
        ></span>
        {/* 内圈实心圆 - 牛市深红色 */}
        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-600"></span>
      </span>
    </span>
  );
}

export function DynamicTrendMonitoring() {
  const [activeTab, setActiveTab] = useState<'core' | 'sector'>('core');
  const [data, setData] = useState<DynamicTrendItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [lastUpdateTime, setLastUpdateTime] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // 根据当前Tab重新排序数据
  const sortedData = data.map((item, index) => ({
    ...item,
    rank: index + 1, // 重新排名，从1开始
  }));
  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getLatestDynamicTrend(activeTab === 'core' ? INDEX_TYPE.INDICES : INDEX_TYPE.SECTORS);
      if (response.success) {
        setData(response.data);
        setLastUpdateTime(response.calculationTime || '');
      } else {
        setError('获取数据失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '网络错误');
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  // 手动触发计算
  const handleCalculate = async () => {
    setCalculating(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await triggerDynamicTrendCalculation();
      if (response.success) {
        setSuccess('计算完成，正在刷新数据...');
        setTimeout(() => {
          loadData();
          setSuccess(null);
        }, 1000);
      } else {
        setError(response.message || '计算失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '计算失败');
    } finally {
      setCalculating(false);
    }
  };

  // 初始加载和Tab切换时加载数据
  useEffect(() => {
    loadData();
  }, [activeTab]);

  // 自动刷新（每10分钟）
  useEffect(() => {
    const interval = setInterval(loadData, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [activeTab]);

  // 格式化日期显示
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
  };

  // 格式化时间显示
  const formatTime = (dateStr: string) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

  // 格式化数字，保留指定小数位
  const formatNumber = (
    num: number | string | null | undefined,
    digits: number = 2,
  ) => {
    if (num === null || num === undefined || num === '') return '-';
    const n = typeof num === 'string' ? parseFloat(num) : num;
    if (isNaN(n)) return '-';
    return n.toFixed(digits);
  };

  // 格式化百分比
  const formatPercent = (
    num: number | string | null | undefined,
    digits: number = 2,
  ) => {
    if (num === null || num === undefined || num === '') return '-';
    const n = typeof num === 'string' ? parseFloat(num) : num;
    if (isNaN(n)) return '-';
    const sign = n > 0 ? '+' : '';
    return `${sign}${n.toFixed(digits)}%`;
  };

  // 获取偏离率背景颜色：正数红色背景，负数绿色背景
  const getDeviationBgClass = (rate: number | string | null | undefined) => {
    if (rate === null || rate === undefined || rate === '') return '';
    const r = typeof rate === 'string' ? parseFloat(rate) : rate;
    if (isNaN(r)) return '';
    return r >= 0 ? 'bg-red-300' : 'bg-green-300';
  };

  // 获取排序变化显示
  const getRankChangeDisplay = (change: number) => {
    if (change === 0) return '0';
    if (change > 0) return `+${change}`;
    return `${change}`;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 页面头部 */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">动态趋势监控</h1>
              <p className="text-sm text-gray-500 mt-1">
                最后更新时间：{lastUpdateTime ? formatTime(lastUpdateTime) : '暂无数据'}
                <PulsingDot />
              </p>
            </div>
            <button
              onClick={handleCalculate}
              disabled={calculating || loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {calculating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  计算中...
                </>
              ) : (
                '手动计算'
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Tab切换 */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex gap-4 mb-6">
          <button
            onClick={() => setActiveTab('core')}
            className={`px-6 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'core'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            核心指数
          </button>
          <button
            onClick={() => setActiveTab('sector')}
            className={`px-6 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'sector'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            行业指数
          </button>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* 成功提示 */}
        {success && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
            {success}
          </div>
        )}

        {/* 数据表格 */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {loading ? (
            <div className="flex justify-center items-center py-20">
              <div className="text-gray-500">加载中...</div>
            </div>
          ) : data.length === 0 ? (
            <div className="flex justify-center items-center py-20">
              <div className="text-gray-500">暂无数据，请手动触发计算或等待定时任务执行</div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      排序
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      代码
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      名称
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      涨幅%
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      现价
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      20日均线
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      偏离率
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      状态转变日
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      区间涨幅%
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      排名变化
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {sortedData.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap text-center font-medium text-sm text-gray-900">
                        {item.rank}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <code className="text-gray-700 bg-gray-100 px-2 py-0.5 rounded">
                          {item.index?.code || '-'}
                        </code>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {item.index?.name || '-'}
                      </td>
                      <td className={`px-4 py-3 whitespace-nowrap text-sm text-right ${item.changePercent >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {formatPercent(item.changePercent)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-mono text-gray-700">
                        {formatNumber(item.currentPrice, 2)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-mono text-gray-700">
                        {formatNumber(item.ma20, 2)}
                      </td>
                      <td className={`px-4 py-3 whitespace-nowrap text-sm text-right font-mono text-black ${getDeviationBgClass(item.deviationRate)}`}>
                        {formatPercent(item.deviationRate)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-center text-gray-700">
                        {formatDate(item.statusChangeDate || '')}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-700">
                        {formatPercent(item.intervalChangePercent)}
                      </td>
                      <td className={`px-4 py-3 whitespace-nowrap text-sm text-center font-medium ${
                        item.rankChange > 0 ? 'text-red-600' : item.rankChange < 0 ? 'text-green-600' : 'text-gray-600'
                      }`}>
                        {getRankChangeDisplay(item.rankChange)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 说明 */}
        <div className="mt-6 text-xs text-gray-500 space-y-1">
          <p>• 动态趋势数据每10分钟自动更新一次（交易时间内）</p>
          <p>• 点击“手动计算”可立即触发数据计算和排名，会覆盖当天的旧数据</p>
          <p>• 数据仅供市场历史风格趋势观察，不提供投资建议</p>
        </div>
      </div>
    </div>
  );
}
