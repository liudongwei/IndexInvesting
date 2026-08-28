import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { RankingTable } from './components/RankingTable';
import { EastmoneyImport } from './components/EastmoneyImport';
import { IndexDetail } from './components/IndexDetail';
import { IndexManagement } from './components/IndexManagement';
import { IndexHistory } from './components/IndexHistory';
import { CronConfig } from './components/CronConfig';
import { getLatestRanking, getRankingByDate } from './services/api';
import type { TrendRankingItem } from './types/trend';
import { INDEX_TYPE, type IndexType } from './types/index-type';

// 导航栏组件
function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();

  const isIndexRanking = location.pathname === '/' || location.pathname === '/ranking';
  const isSectorRanking = location.pathname === '/sectors';
  const isEastmoney = location.pathname === '/eastmoney-import';
  const isAdmin = location.pathname.startsWith('/admin');

  return (
    <nav className="bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-12">
          <div className="flex items-center gap-6">
            <button
              onClick={() => navigate('/')}
              className={`text-sm font-medium transition-colors ${
                isIndexRanking ? 'text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              核心指数
            </button>
            <button
              onClick={() => navigate('/sectors')}
              className={`text-sm font-medium transition-colors ${
                isSectorRanking ? 'text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              行业指数
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
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/admin/indices')}
              className={`text-sm font-medium transition-colors flex items-center gap-1 ${
                isAdmin ? 'text-white' : 'text-gray-400 hover:text-white'
              }`}
              title="管理后台"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              管理
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}

// 趋势排名页面
function RankingPage({ type = INDEX_TYPE.INDICES }: { type?: IndexType }) {
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
      const response = await getLatestRanking(type);
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
      const response = await getRankingByDate(date, type);
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
  }, [type]);

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
                鱼盆趋势模型{type === INDEX_TYPE.SECTORS ? '行业指数' : '核心指数'}
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

// 管理后台布局
function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    { path: '/admin/indices', label: '指数管理', icon: '📊' },
    { path: '/admin/history', label: '历史数据', icon: '📜' },
    { path: '/admin/moving-averages', label: '均线管理', icon: '📈' },
    { path: '/admin/cron-configs', label: '定时任务', icon: '⏰' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* 侧边栏 */}
      <aside className="w-64 bg-white shadow-sm border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">管理后台</h2>
          <p className="text-xs text-gray-500 mt-1">系统配置与数据管理</p>
        </div>
        <nav className="p-2 flex-1">
          {menuItems.map((item) => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-colors mb-1 ${
                location.pathname === item.path
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <span className="mr-2">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        {/* 跳转到前端页面 */}
        <div className="p-4 border-t border-gray-200">
          <button
            onClick={() => navigate('/')}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
            title="返回前端展示页面"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            返回前端页面
          </button>
        </div>
      </aside>

      {/* 内容区域 */}
      <div className="flex-1">
        <Routes>
          <Route path="indices" element={<IndexManagement />} />
          <Route path="history" element={<IndexHistory />} />
          <Route path="moving-averages" element={<div className="p-8 text-gray-500">均线管理功能开发中...</div>} />
          <Route path="cron-configs" element={<CronConfig />} />
          <Route path="*" element={<Navigate to="/admin/indices" replace />} />
        </Routes>
      </div>
    </div>
  );
}

// 主应用组件
function AppContent() {
  const location = useLocation();
  const isAdmin = location.pathname.startsWith('/admin');

  return (
    <div className="min-h-screen bg-gray-50">
      {!isAdmin && <Navbar />}
      <Routes>
        <Route path="/" element={<RankingPage type={INDEX_TYPE.INDICES} />} />
        <Route path="/ranking" element={<Navigate to="/" replace />} />
        <Route path="/sectors" element={<RankingPage type={INDEX_TYPE.SECTORS} />} />
        <Route path="/eastmoney-import" element={<EastmoneyImportPage />} />
        <Route path="/index/:indexId" element={<IndexDetail />} />
        <Route path="/admin/*" element={<AdminLayout />} />
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
