import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { RankingTable } from './components/RankingTable';
import { EastmoneyImport } from './components/EastmoneyImport';
import { IndexDetail } from './components/IndexDetail';
import { getLatestRanking, getRankingByDate } from './services/api';
import type { TrendRankingItem } from './types/trend';

// 导航栏组件
function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  
  const isRanking = location.pathname === '/' || location.pathname === '/ranking';
  const isEastmoney = location.pathname === '/eastmoney-import';
 
  return (
    <nav className="bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center gap-6 h-12">
          <button
            onClick={() => navigate('/')}
            className={`text-sm font-medium transition-colors ${
              isRanking ? 'text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            趋势排名
          </button>
          <button
            onClick={() => navigate('/eastmoney-import')}
            className={`text-sm font-medium transition-colors ${
              isEastmoney ? 'text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            东财数据导入
          </button>
        </div>
      </div>
    </nav>
  );
}

// 趋势排名页面
function RankingPage() {
  const [data, setData] = useState<TrendRankingItem[]>([]);
  const [tradeDate, setTradeDate] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const navigate = useNavigate();

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

  // 处理指数点击
  const handleIndexClick = (item: TrendRankingItem) => {
    // 从 data 中找到对应的 indexId
    // 注意：TrendRankingItem 中没有 indexId，需要通过其他方式获取
    // 这里我们使用 code 作为路由参数，然后在详情页通过 API 获取数据
    navigate(`/index/${item.code}`);
  };

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
            onIndexClick={handleIndexClick}
          />
        </div>

        {/* 数据说明 */}
        <div className="mt-6 text-xs text-gray-500 space-y-1">
          <p>
            本数据来自腾讯和东方财富，仅为历史回测与市场风格观察，不构成任何投资建议。市场有风险，投资需谨慎。
          </p>
        </div>
      </main>
    </>
  );
}

// 东财数据导入页面包装器
function EastmoneyImportPage() {
  return (
    <main className="max-w-7xl mx-auto px-4 py-6">
      <EastmoneyImport />
    </main>
  );
}

// 主应用组件
function AppContent() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <Routes>
        <Route path="/" element={<RankingPage />} />
        <Route path="/ranking" element={<Navigate to="/" replace />} />
        <Route path="/eastmoney-import" element={<EastmoneyImportPage />} />
        <Route path="/index/:indexId" element={<IndexDetail />} />
      </Routes>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;
