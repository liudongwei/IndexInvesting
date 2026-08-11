import { useState, useEffect } from 'react';
import { RankingTable } from './components/RankingTable';
import { EastmoneyImport } from './components/EastmoneyImport';
import { getLatestRanking, getRankingByDate } from './services/api';
import type { TrendRankingItem } from './types/trend';

type Page = 'ranking' | 'eastmoney-import';

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('ranking');
  const [data, setData] = useState<TrendRankingItem[]>([]);
  const [tradeDate, setTradeDate] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>('');

  // 加载最新数据
  const loadLatestData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getLatestRanking();
      if (response.success) {
        setData(response.data);
        setTradeDate(response.tradeDate);
        setSelectedDate(response.tradeDate);
      } else {
        setError('获取数据失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '网络错误');
    } finally {
      setLoading(false);
    }
  };

  // 加载指定日期数据
  const loadDataByDate = async (date: string) => {
    if (!date) return;
    setLoading(true);
    setError(null);
    try {
      const response = await getRankingByDate(date);
      if (response.success) {
        setData(response.data);
        setTradeDate(response.tradeDate);
      } else {
        setError(response.message || '获取数据失败');
        setData([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '网络错误');
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  // 初始加载
  useEffect(() => {
    loadLatestData();
  }, []);

  // 格式化日期显示
  const formatDisplayDate = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
  };

  // 渲染当前页面
  const renderPage = () => {
    switch (currentPage) {
      case 'eastmoney-import':
        return <EastmoneyImport />;
      case 'ranking':
      default:
        return (
          <>
            {/* 头部 */}
            <header className="bg-white shadow-sm border-b border-gray-200">
              <div className="max-w-7xl mx-auto px-4 py-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900">
                      鱼盆趋势模型历史回测数据
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">
                      日期：{formatDisplayDate(tradeDate)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={() => loadDataByDate(selectedDate)}
                      disabled={loading}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      查询
                    </button>
                    <button
                      onClick={loadLatestData}
                      disabled={loading}
                      className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      最新
                    </button>
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  数据仅供市场历史风格趋势观察，不提供投资建议
                </p>
              </div>
            </header>

            {/* 主内容 */}
            <main className="max-w-7xl mx-auto px-4 py-6">
              {error && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {error}
                </div>
              )}

              <div className="bg-white rounded-lg shadow overflow-hidden">
                <RankingTable
                  data={data}
                  tradeDate={tradeDate}
                  loading={loading}
                />
              </div>

              {/* 数据说明 */}
              <div className="mt-6 text-xs text-gray-500 space-y-1">
                <p>
                  本数据来自于同花顺，仅为历史回测与市场风格观察，不构成任何投资建议。市场有风险，投资需谨慎。
                </p>
                <div className="flex gap-4 mt-2">
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 bg-red-200 rounded"></span>
                    偏离率 &gt; 2%
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 bg-red-100 rounded"></span>
                    偏离率 1% ~ 2%
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 bg-yellow-200 rounded"></span>
                    偏离率接近0
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 bg-green-100 rounded"></span>
                    偏离率 -2% ~ -1%
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 bg-green-200 rounded"></span>
                    偏离率 &lt; -2%
                  </span>
                </div>
              </div>
            </main>
          </>
        );
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 导航栏 */}
      <nav className="bg-gray-900 text-white">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center gap-6 h-12">
            <button
              onClick={() => setCurrentPage('ranking')}
              className={`text-sm font-medium transition-colors ${
                currentPage === 'ranking'
                  ? 'text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              趋势排名
            </button>
            <button
              onClick={() => setCurrentPage('eastmoney-import')}
              className={`text-sm font-medium transition-colors ${
                currentPage === 'eastmoney-import'
                  ? 'text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              东财数据导入
            </button>
          </div>
        </div>
      </nav>

      {/* 页面内容 */}
      {renderPage()}
    </div>
  );
}

export default App;
