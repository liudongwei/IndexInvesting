import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

interface Account {
  id: string;
  name: string;
}

interface Trade {
  id: string;
  accountId: string;
  instrumentId: string;
  instrument?: {
    code: string;
    name: string;
  };
  tradeType: 'BUY' | 'SELL';
  quantity: number;
  price: number | string;
  amount: number | string;
  commission: number | string;
  profit?: number | string;
  tradeDate: string;
  createdAt: string;
}

/**
 * 模拟交易 - 交易记录页面
 */
export function SimulationTrades() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(false);
  const [tradeTypeFilter, setTradeTypeFilter] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');

  useEffect(() => {
    loadAccounts();
  }, []);

  useEffect(() => {
    if (selectedAccountId) {
      loadTrades();
    }
  }, [selectedAccountId, tradeTypeFilter]);

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

  const loadTrades = async () => {
    if (!selectedAccountId) return;

    try {
      setLoading(true);
      const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
      let url = `${baseUrl}/simulation/portfolio/trades/${selectedAccountId}?limit=100`;
      
      const response = await fetch(url);
      const data = await response.json();
      
      // 前端筛选
      let filteredData = data || [];
      if (tradeTypeFilter !== 'ALL') {
        filteredData = filteredData.filter((t: Trade) => t.tradeType === tradeTypeFilter);
      }
      
      setTrades(filteredData);
    } catch (error) {
      console.error('加载交易记录失败:', error);
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

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTradeTypeLabel = (type: string) => {
    return type === 'BUY' ? '买入' : '卖出';
  };

  const getTradeTypeClass = (type: string) => {
    return type === 'BUY' 
      ? 'bg-red-100 text-red-700' 
      : 'bg-green-100 text-green-700';
  };

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
              <h1 className="text-2xl font-bold text-gray-900">交易记录</h1>
              <p className="text-sm text-gray-500 mt-1">
                模拟交易 - 历史成交
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 主内容 */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* 筛选栏 */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                选择账户
              </label>
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">请选择账户</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:w-48">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                交易类型
              </label>
              <select
                value={tradeTypeFilter}
                onChange={(e) => setTradeTypeFilter(e.target.value as any)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="ALL">全部</option>
                <option value="BUY">买入</option>
                <option value="SELL">卖出</option>
              </select>
            </div>
          </div>
        </div>

        {/* 交易记录列表 */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : trades.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              {selectedAccountId ? '暂无交易记录' : '请选择账户'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">时间</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">类型</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">标的</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">数量</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">价格</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">金额</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">手续费</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">盈亏</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {trades.map((trade) => (
                    <tr key={trade.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatDate(trade.createdAt)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${getTradeTypeClass(trade.tradeType)}`}>
                          {getTradeTypeLabel(trade.tradeType)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{trade.instrument?.name || '-'}</div>
                        <div className="text-xs text-gray-500">{trade.instrument?.code || '-'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                        {trade.quantity}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                        ¥{formatNumber(trade.price, 3)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                        ¥{formatNumber(trade.amount)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-500">
                        ¥{formatNumber(trade.commission)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        {trade.profit !== undefined && trade.profit !== null ? (
                          <div className={`text-sm font-medium ${parseFloat(String(trade.profit)) >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {parseFloat(String(trade.profit)) >= 0 ? '+' : ''}¥{formatNumber(trade.profit)}
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">-</span>
                        )}
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
