import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

interface Account {
  id: string;
  name: string;
  currentBalance: number | string;
  commissionRate?: number | string;
  minCommission?: number | string;
}

interface Position {
  id: string;
  instrumentId: string;
  instrument?: {
    code: string;
    name: string;
    type: string;
    tradingRule: string;
    tencentCode: string;
    lotSize?: number;
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
 * 模拟交易 - 卖出股票页面
 */
export function SimulationSell() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [selectedPositionId, setSelectedPositionId] = useState('');
  const [quantity, setQuantity] = useState(100);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [priceInfo, setPriceInfo] = useState<{ price: number; total: number; commission: number; netProceeds: number; profit: number } | null>(null);

  useEffect(() => {
    loadAccounts();
  }, []);

  useEffect(() => {
    if (selectedAccountId) {
      loadPositions();
    }
  }, [selectedAccountId]);

  useEffect(() => {
    if (selectedPositionId && quantity > 0) {
      calculateProceeds();
    }
  }, [selectedPositionId, quantity]);

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
      showMessage('error', '加载账户失败');
    }
  };

  const loadPositions = async () => {
    if (!selectedAccountId) return;

    try {
      const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
      const response = await fetch(`${baseUrl}/simulation/portfolio/positions/${selectedAccountId}`);
      const data = await response.json();
      // 显示有实际持仓的标的（quantity>0）。可用数量由后端按 T+1 口径实时返回，
      // 此处不再用 availableQuantity 过滤，避免 T+1 解冻前误判"无可用持仓"。
      const activePositions = (data || []).filter((p: Position) => {
        const q = typeof p.quantity === 'string' ? parseFloat(p.quantity) : Number(p.quantity);
        return q > 0;
      });
      setPositions(activePositions);
      if (activePositions.length > 0) {
        setSelectedPositionId(activePositions[0].id);
      }
    } catch (error) {
      console.error('加载持仓失败:', error);
      showMessage('error', '加载持仓失败');
    }
  };

  const calculateProceeds = async () => {
    if (!selectedPositionId) return;

    try {
      const position = positions.find(p => p.id === selectedPositionId);
      if (!position || !position.instrument) return;

      // 获取实时价格
      const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
      const response = await fetch(`${baseUrl}/simulation/portfolio/realtime-price/${position.instrument.tencentCode}`);
      const priceData = await response.json();
      
      const price = priceData.price || 0;
      const amount = price * quantity;
      
      // 获取账户佣金率
      const account = accounts.find(a => a.id === selectedAccountId);
      const commissionRate = account ? parseFloat(String(account.commissionRate || 0.00006)) : 0.00006;
      const minCommission = account ? parseFloat(String(account.minCommission || 0.2)) : 0.2;
      const commission = Math.max(amount * commissionRate, minCommission);
      const netProceeds = amount - commission;
      
      // 计算盈亏（卖出价格 - 成本价）* 数量 - 佣金
      const avgCost = typeof position.avgCost === 'string' ? parseFloat(position.avgCost) : position.avgCost;
      const profit = (price - avgCost) * quantity - commission;
      
      setPriceInfo({
        price,
        total: amount,
        commission,
        netProceeds,
        profit,
      });
    } catch (error) {
      console.error('获取价格失败:', error);
    }
  };

  const handleSubmit = async () => {
    if (!selectedAccountId || !selectedPositionId) {
      showMessage('error', '请选择账户和持仓');
      return;
    }

    if (quantity <= 0) {
      showMessage('error', '卖出数量必须大于0');
      return;
    }

    const position = positions.find(p => p.id === selectedPositionId);
    if (!position || !position.instrument) {
      showMessage('error', '持仓信息不完整');
      return;
    }

    const lotSize = position.instrument.lotSize || 100;
    if (quantity % lotSize !== 0) {
      showMessage('error', `卖出数量必须是 ${lotSize} 的整数倍`);
      return;
    }

    // 检查可用数量
    const availableQty = typeof position.availableQuantity === 'string' 
      ? parseFloat(position.availableQuantity) 
      : position.availableQuantity;
    
    if (quantity > availableQty) {
      showMessage('error', `可用持仓不足：可用${availableQty}股`);
      return;
    }

    if (!confirm(`确认卖出 ${position.instrument.name} ${quantity} 股？`)) {
      return;
    }

    try {
      setLoading(true);
      const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
      const response = await fetch(`${baseUrl}/simulation/portfolio/sell`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: selectedAccountId,
          instrumentCode: position.instrument.code,
          quantity: quantity,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || '卖出失败');
      }

      showMessage('success', '卖出成功');
      setTimeout(() => {
        navigate('/simulation/dashboard');
      }, 1500);
    } catch (error: any) {
      showMessage('error', error.message || '卖出失败');
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const formatNumber = (num: any, decimals: number = 2): string => {
    if (num === null || num === undefined) return '0.00';
    const numValue = typeof num === 'string' ? parseFloat(num) : num;
    if (isNaN(numValue)) return '0.00';
    return numValue.toFixed(decimals);
  };

  const getAccountBalance = () => {
    const account = accounts.find(a => a.id === selectedAccountId);
    return account ? parseFloat(String(account.currentBalance)) : 0;
  };

  const getPositionInfo = () => {
    return positions.find(p => p.id === selectedPositionId);
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
              <h1 className="text-2xl font-bold text-gray-900">卖出股票</h1>
              <p className="text-sm text-gray-500 mt-1">
                模拟交易 - 卖出操作
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 主内容 */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          {/* 账户选择 */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              选择账户 <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">请选择账户</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} (余额: ¥{formatNumber(account.currentBalance)})
                </option>
              ))}
            </select>
          </div>

          {/* 持仓选择 */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              选择持仓 <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedPositionId}
              onChange={(e) => setSelectedPositionId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">请选择持仓</option>
              {positions.map((position) => (
                <option key={position.id} value={position.id}>
                  {position.instrument?.code} - {position.instrument?.name} 
                  (可用: {typeof position.availableQuantity === 'string' ? parseFloat(position.availableQuantity) : position.availableQuantity}股)
                </option>
              ))}
            </select>
          </div>

          {/* 持仓信息展示 */}
          {selectedPositionId && getPositionInfo() && (
            <div className="mb-6 p-4 bg-blue-50 rounded-lg">
              <h3 className="text-sm font-medium text-gray-700 mb-3">持仓信息</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-600">持仓数量:</span>
                  <span className="ml-2 font-medium">
                    {formatNumber(getPositionInfo()?.quantity, 0)} 股
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">可用数量:</span>
                  <span className="ml-2 font-medium text-green-600">
                    {formatNumber(getPositionInfo()?.availableQuantity, 0)} 股
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">成本价:</span>
                  <span className="ml-2 font-medium">¥{formatNumber(getPositionInfo()?.avgCost, 3)}</span>
                </div>
                <div>
                  <span className="text-gray-600">当前价:</span>
                  <span className="ml-2 font-medium">¥{formatNumber(getPositionInfo()?.currentPrice, 3)}</span>
                </div>
                <div>
                  <span className="text-gray-600">浮动盈亏:</span>
                  <span className={`ml-2 font-medium ${
                    (parseFloat(String(getPositionInfo()?.floatProfit || 0))) >= 0 
                      ? 'text-red-600' 
                      : 'text-green-600'
                  }`}>
                    {formatNumber(getPositionInfo()?.floatProfit)} ({formatNumber(getPositionInfo()?.floatProfitRate)}%)
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">交易规则:</span>
                  <span className="ml-2 font-medium">{getPositionInfo()?.instrument?.tradingRule}</span>
                </div>
              </div>
            </div>
          )}

          {/* 卖出数量 */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              卖出数量 <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
              min="100"
              step="100"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              最小手数: {(positions.find(p => p.id === selectedPositionId)?.instrument?.lotSize || 100)} 股
            </p>
          </div>

          {/* 收益估算 */}
          {priceInfo && (
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <h3 className="text-sm font-medium text-gray-700 mb-3">收益估算</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">成交价格</span>
                  <span className="font-medium">¥{formatNumber(priceInfo.price, 3)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">成交金额</span>
                  <span className="font-medium">¥{formatNumber(priceInfo.total)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">手续费</span>
                  <span className="font-medium text-red-600">-¥{formatNumber(priceInfo.commission)}</span>
                </div>
                <div className="border-t border-gray-300 pt-2 flex justify-between">
                  <span className="text-gray-700 font-medium">实际到账</span>
                  <span className="text-lg font-bold text-green-600">¥{formatNumber(priceInfo.netProceeds)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">预计盈亏</span>
                  <span className={`font-bold ${priceInfo.profit >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {priceInfo.profit >= 0 ? '+' : ''}¥{formatNumber(priceInfo.profit)}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>账户余额</span>
                  <span>¥{formatNumber(getAccountBalance())}</span>
                </div>
              </div>
            </div>
          )}

          {/* 风险提示 */}
          <div className="mb-6 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
            <h4 className="text-sm font-medium text-yellow-800 mb-2">⚠️ 卖出提示</h4>
            <ul className="text-xs text-yellow-700 space-y-1 list-disc list-inside">
              <li>T+1规则：当日买入的份额下一交易日才能卖出</li>
              <li>请确认可用数量足够后再进行卖出操作</li>
              <li>卖出后资金将立即回到账户余额</li>
              <li>盈亏计算已包含交易手续费</li>
            </ul>
          </div>

          {/* 操作按钮 */}
          <div className="flex gap-3">
            <button
              onClick={() => navigate('/simulation/dashboard')}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading || !selectedAccountId || !selectedPositionId}
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? '处理中...' : '确认卖出'}
            </button>
          </div>
        </div>
      </main>

      {/* 消息提示 */}
      {message && (
        <div className={`fixed top-4 right-4 z-50 px-6 py-3 rounded-lg shadow-lg transition-all ${
          message.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
        }`}>
          {message.text}
        </div>
      )}
    </div>
  );
}
