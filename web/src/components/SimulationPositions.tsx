import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

interface Account {
  id: string;
  name: string;
}

interface Position {
  id: string;
  instrumentId: string;
  instrument?: {
    code: string;
    name: string;
  };
  quantity: number;
  availableQuantity: number;
  avgCost: number | string;
  currentPrice: number | string;
  marketValue: number | string;
  floatProfit: number | string;
  floatProfitRate: number | string;
}

/**
 * 模拟交易 - 查看持仓页面
 */
export function SimulationPositions() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadAccounts();
  }, []);

  useEffect(() => {
    if (selectedAccountId) {
      loadPositions();
    }
  }, [selectedAccountId]);

  const loadAccounts = async () => {
    try {
      const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
      const response = await fetch(`${baseUrl}/simulation/portfolio/accounts`);
      const data = await response.json();
      setAccounts(data);
      if (data.length > 0) {
        setSelectedAccountId(data[0].id);
      }
    } catch (error) {
      console.error('加载账户失败:', error);
    }
  };

  const loadPositions = async () => {
    if (!selectedAccountId) return;

    try {
      setLoading(true);
      const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
      const response = await fetch(`${baseUrl}/simulation/portfolio/positions/${selectedAccountId}`);
      const data = await response.json();
      setPositions(data || []);
    } catch (error) {
      console.error('加载持仓失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num: any, decimals: number = 2): string => {
    if (num === null || num === undefined) return '0.00';
    const numValue = typeof num === 'string' ? parseFloat(num) : num;
    if (isNaN(numValue)) return '0.00';
    return numValue.toFixed(decimals);
  };

  const isPositive = (num: any): boolean => {
    if (num === null || num === undefined) return true;
    const numValue = typeof num === 'string' ? parseFloat(num) : num;
    return numValue >= 0;
  };

  // 计算总持仓市值和总盈亏
  const totalMarketValue = positions.reduce((sum, p) => sum + parseFloat(String(p.marketValue)), 0);
  const totalFloatProfit = positions.reduce((sum, p) => sum + parseFloat(String(p.floatProfit)), 0);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部标题 */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/simulation/dashboard')}
              className="text-gray-600 hover:text-gray-900"
            >
              ← 返回
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">查看持仓</h1>
              <p className="text-sm text-gray-500 mt-1">
                模拟交易 - 持仓管理
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 主内容 */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* 账户选择 */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            选择账户
          </label>
          <select
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
            className="w-full md:w-96 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">请选择账户</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </div>

        {/* 持仓统计 */}
        {selectedAccountId && positions.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <p className="text-sm text-gray-500">持仓数量</p>
              <p className="text-2xl font-bold text-gray-900">{positions.length}</p>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <p className="text-sm text-gray-500">总持仓市值</p>
              <p className="text-2xl font-bold text-blue-600">¥{formatNumber(totalMarketValue)}</p>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <p className="text-sm text-gray-500">总浮动盈亏</p>
              <p className={`text-2xl font-bold ${isPositive(totalFloatProfit) ? 'text-red-600' : 'text-green-600'}`}>
                {isPositive(totalFloatProfit) ? '+' : ''}¥{formatNumber(totalFloatProfit)}
              </p>
            </div>
          </div>
        )}

        {/* 持仓列表 */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : positions.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              {selectedAccountId ? '暂无持仓' : '请选择账户'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">代码</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">名称</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">持仓数量</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">可用数量</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">成本价</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">现价</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">市值</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">浮动盈亏</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {positions.map((position) => (
                    <tr key={position.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <code className="text-sm bg-gray-100 px-2 py-1 rounded">{position.instrument?.code || '-'}</code>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{position.instrument?.name || '-'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                        {position.quantity}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                        <span className={position.availableQuantity < position.quantity ? 'text-orange-600' : 'text-gray-900'}>
                          {position.availableQuantity}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                        ¥{formatNumber(position.avgCost, 3)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                        ¥{formatNumber(position.currentPrice, 3)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                        ¥{formatNumber(position.marketValue)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <div className={`text-sm font-medium ${isPositive(position.floatProfit) ? 'text-red-600' : 'text-green-600'}`}>
                          {isPositive(position.floatProfit) ? '+' : ''}¥{formatNumber(position.floatProfit)}
                        </div>
                        <div className={`text-xs ${isPositive(position.floatProfitRate) ? 'text-red-500' : 'text-green-500'}`}>
                          ({formatNumber(position.floatProfitRate)}%)
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
