import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// 格式化数字（支持字符串和数字类型）
const formatNumber = (num: any, decimals: number = 2): string => {
  if (num === null || num === undefined) return '0.00';
  const numValue = typeof num === 'string' ? parseFloat(num) : num;
  if (isNaN(numValue)) return '0.00';
  return numValue.toFixed(decimals);
};

// 判断数值是否大于等于0（支持字符串和数字类型）
const isPositive = (num: any): boolean => {
  if (num === null || num === undefined) return true;
  const numValue = typeof num === 'string' ? parseFloat(num) : num;
  return numValue >= 0;
};

/**
 * 模拟交易仪表盘
 * 展示多账户概览和快速操作
 */
export function SimulationDashboard() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      setLoading(true);
      const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
      const response = await fetch(`${baseUrl}/simulation/portfolio/accounts`);
      const data = await response.json();
      setAccounts(data);
      if (data.length > 0 && !selectedAccountId) {
        setSelectedAccountId(data[0].id);
      }
    } catch (error) {
      console.error('加载账户失败:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部标题 */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">模拟交易</h1>
              <p className="text-sm text-gray-500 mt-1">
                多策略模拟盘交易系统 - 实时跟踪投资收益
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 主内容 */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* 加载中 */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}

        {/* 账户列表 */}
        {!loading && accounts.length === 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
            <p className="text-gray-500">暂无账户数据</p>
          </div>
        )}

        {/* 账户卡片 */}
        {!loading && accounts.length > 0 && (
          <div className="space-y-6">
            {/* 账户切换标签 */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="flex gap-2 overflow-x-auto">
                {accounts.map((account) => (
                  <button
                    key={account.id}
                    onClick={() => setSelectedAccountId(account.id)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                      selectedAccountId === account.id
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {account.name}
                  </button>
                ))}
              </div>
            </div>

            {/* 选中账户的详情 */}
            {selectedAccountId && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {accounts
                  .filter((a) => a.id === selectedAccountId)
                  .map((account) => (
                    <div key={account.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-gray-900">{account.name}</h3>
                        <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">
                          {account.status === 'active' ? '运行中' : '已暂停'}
                        </span>
                      </div>

                      <div className="space-y-3">
                        <div>
                          <p className="text-sm text-gray-500">总资产</p>
                          <p className={`text-2xl font-bold ${
                            parseFloat(String(account.totalAssets)) > 0 ? 'text-gray-900' : 'text-gray-400'
                          }`}>
                            ¥{formatNumber(account.totalAssets)}
                          </p>
                          {parseFloat(String(account.totalAssets)) === 0 && (
                            <p className="text-xs text-gray-400 mt-1">暂无交易数据</p>
                          )}
                        </div>
                      
                        <div>
                          <p className="text-sm text-gray-500">今日盈亏</p>
                          <p className={`text-xl font-semibold ${
                            isPositive(account.todayProfit) ? 'text-red-600' : 'text-green-600'
                          }`}>
                            {isPositive(account.todayProfit) ? '+' : ''}
                            ¥{formatNumber(account.todayProfit)}
                            <span className="text-sm ml-1">
                              ({formatNumber(account.todayProfitRate)}%)
                            </span>
                          </p>
                        </div>
                      
                        <div>
                          <p className="text-sm text-gray-500">累计盈亏</p>
                          <p className={`text-lg font-semibold ${
                            isPositive(account.totalProfit) ? 'text-red-600' : 'text-green-600'
                          }`}>
                            {isPositive(account.totalProfit) ? '+' : ''}
                            ¥{formatNumber(account.totalProfit)}
                            <span className="text-sm ml-1">
                              ({formatNumber(account.totalProfitRate)}%)
                            </span>
                          </p>
                        </div>
                      
                        <div className="pt-3 border-t border-gray-200">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-500">现金余额</span>
                            <span className="font-medium">¥{formatNumber(account.currentBalance)}</span>
                          </div>
                          <div className="flex justify-between text-sm mt-1">
                            <span className="text-gray-500">持仓市值</span>
                            <span className={`font-medium ${
                              parseFloat(String(account.positionValue)) > 0 ? 'text-gray-900' : 'text-gray-400'
                            }`}>
                              ¥{formatNumber(account.positionValue)}
                            </span>
                          </div>
                          {parseFloat(String(account.positionValue)) === 0 && (
                            <p className="text-xs text-gray-400 mt-1">当前无持仓</p>
                          )}
                        </div>

                        {/* 新增：交易统计 */}
                        <div className="pt-3 border-t border-gray-200">
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <p className="text-gray-500">买入次数</p>
                              <p className="font-medium text-gray-900">{account.totalBuyCount || 0}</p>
                            </div>
                            <div>
                              <p className="text-gray-500">卖出次数</p>
                              <p className="font-medium text-gray-900">{account.totalSellCount || 0}</p>
                            </div>
                            <div>
                              <p className="text-gray-500">累计佣金</p>
                              <p className="font-medium text-gray-900">¥{formatNumber(account.totalCommission)}</p>
                            </div>
                            <div>
                              <p className="text-gray-500">初始资金</p>
                              <p className="font-medium text-gray-900">¥{formatNumber(account.initialCapital)}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            )}

            {/* 快捷操作 */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">快捷操作</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button
                  onClick={() => navigate('/simulation/buy')}
                  className="px-6 py-4 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
                >
                  💰 买入股票
                </button>
                <button
                  onClick={() => navigate('/simulation/positions')}
                  className="px-6 py-4 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
                >
                  📊 查看持仓
                </button>
                <button
                  onClick={() => navigate('/simulation/trades')}
                  className="px-6 py-4 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
                >
                  📜 交易记录
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
