import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getIndexTrendHistory, getIndexByCode, getIndexByOfficialCode } from '../services/api';
import type { IndexTrendHistoryItem } from '../services/api';

interface IndexInfo {
  id: string;
  code: string;
  name: string;
  officialCode?: string;
}

export function IndexDetail() {
  const { indexId } = useParams<{ indexId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<IndexTrendHistoryItem[]>([]);
  const [indexInfo, setIndexInfo] = useState<IndexInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!indexId) {
      setError('未提供指数代码');
      setLoading(false);
      return;
    }
    loadIndexData(indexId);
  }, [indexId]);

  const loadIndexData = async (code: string) => {
    setLoading(true);
    setError(null);
    try {
      // 首先尝试通过 code 查询指数
      let index = await getIndexByCode(code);
      
      // 如果没找到，尝试通过 officialCode 查询
      if (!index) {
        index = await getIndexByOfficialCode(code);
      }
      
      if (!index) {
        setError(`未找到代码为 ${code} 的指数`);
        setLoading(false);
        return;
      }

      setIndexInfo(index);

      // 获取趋势历史数据
      const response = await getIndexTrendHistory(index.id, 20);
      if (response.success && response.data.length > 0) {
        // 按交易日期正序排列（从早到晚）
        const sortedData = [...response.data].sort(
          (a, b) => new Date(a.tradeDate).getTime() - new Date(b.tradeDate).getTime()
        );
        setData(sortedData);
      } else {
        setError('暂无趋势数据');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取数据失败');
    } finally {
      setLoading(false);
    }
  };

  // 格式化日期显示
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
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

  // 获取偏离率背景颜色
  const getDeviationBgClass = (rate: number | string | null | undefined) => {
    if (rate === null || rate === undefined || rate === '') return '';
    const r = typeof rate === 'string' ? parseFloat(rate) : rate;
    if (isNaN(r)) return '';
    return r >= 0 ? 'bg-red-300' : 'bg-green-300';
  };

  // 判断是否偏离率发生正负转换
  const isDeviationChanged = (current: number, prev: number | null | undefined) => {
    if (prev === null || prev === undefined) return false;
    return (prev > 0 && current < 0) || (prev < 0 && current > 0);
  };

  // 获取排序变化显示
  const getRankChangeDisplay = (change: number) => {
    if (change === 0) return '0';
    if (change > 0) return `+${change}`;
    return `${change}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="flex justify-center items-center py-20">
          <div className="text-gray-500">加载中...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="flex flex-col justify-center items-center py-20 gap-4">
          <div className="text-red-500">{error}</div>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            返回趋势排名
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 头部 */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {indexInfo?.name} ({indexInfo?.officialCode || indexInfo?.code})
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                近20天趋势数据
              </p>
            </div>
            <button
              onClick={() => navigate('/')}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
            >
              返回趋势排名
            </button>
          </div>
        </div>
      </header>

      {/* 主内容 */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="text-center">交易日期</th>
                  <th className="w-12 text-center">排序</th>
                  <th className="w-20 text-right">涨幅%</th>
                  <th className="w-20 text-right">现价</th>
                  <th className="w-20 text-right">20日均线</th>
                  <th className="w-20 text-right">偏离率</th>
                  <th className="w-16 text-right">量比</th>
                  <th className="w-24 text-center">状态转变时间</th>
                  <th className="w-20 text-right">区间涨幅%</th>
                  <th className="w-16 text-center">排序变化</th>
                </tr>
              </thead>
              <tbody>
                {data.map((item, index) => {
                  // 获取前一条数据的偏离率用于判断转换
                  const prevItem = index > 0 ? data[index - 1] : null;
                  const prevDeviationRate = prevItem ? prevItem.deviationRate : null;
                  
                  return (
                    <tr key={item.tradeDate}>
                      <td className="text-center font-mono text-xs">
                        {formatDate(item.tradeDate)}
                      </td>
                      <td className="text-center font-medium">{item.rank}</td>
                      <td className={`text-right ${item.changePercent >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {formatPercent(item.changePercent)}
                      </td>
                      <td className="text-right font-mono">{formatNumber(item.closePrice, 2)}</td>
                      <td className="text-right font-mono">{formatNumber(item.ma20, 2)}</td>
                      <td className={`text-right font-mono text-black ${isDeviationChanged(item.deviationRate, prevDeviationRate) ? 'bg-yellow-100' : getDeviationBgClass(item.deviationRate)}`}>
                        {formatPercent(item.deviationRate)}
                      </td>
                      <td className="text-right font-mono">
                        {item.volumeRatio ? formatNumber(item.volumeRatio, 2) : '-'}
                      </td>
                      <td className="text-center text-xs">
                        {formatDate(item.statusChangeDate)}
                      </td>
                      <td className="text-right">
                        {formatPercent(item.intervalChangePercent)}
                      </td>
                      <td className="text-center font-medium text-black">
                        {getRankChangeDisplay(item.rankChange)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* 数据说明 */}
        <div className="mt-6 text-xs text-gray-500 space-y-1">
          <p>
            本数据来自腾讯和东方财富，仅为历史回测与市场风格观察，不构成任何投资建议。市场有风险，投资需谨慎。
          </p>
        </div>
      </main>
    </div>
  );
}
