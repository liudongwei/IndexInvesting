import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

interface Account {
  id: string;
  name: string;
  currentBalance: number | string;
  commissionRate?: number | string;
  minCommission?: number | string;
}

interface Instrument {
  id: string;
  code: string;
  name: string;
  type: string;
  exchange: string;
  tencentCode: string;
  lotSize?: number;
  tradingRule: string;
}

/**
 * 模拟交易 - 买入股票页面
 */
export function SimulationBuy() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [selectedInstrumentId, setSelectedInstrumentId] = useState('');
  const [quantity, setQuantity] = useState(100);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [priceInfo, setPriceInfo] = useState<{ price: number; total: number; commission: number } | null>(null);

  useEffect(() => {
    loadAccounts();
    loadInstruments();
  }, []);

  useEffect(() => {
    if (selectedInstrumentId && quantity > 0) {
      calculateCost();
    }
  }, [selectedInstrumentId, quantity]);

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

  const loadInstruments = async () => {
    try {
      const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
      const response = await fetch(`${baseUrl}/admin/trading-instruments?page=1&limit=100`);
      const data = await response.json();
      setInstruments(data.data || []);
      // 不自动选择标的，让用户手动选择
    } catch (error) {
      console.error('加载标的失败:', error);
      showMessage('error', '加载标的失败');
    }
  };

  const calculateCost = async () => {
    if (!selectedInstrumentId) return;

    try {
      const instrument = instruments.find(i => i.id === selectedInstrumentId);
      if (!instrument) return;

      // 获取实时价格
      const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
      const response = await fetch(`${baseUrl}/simulation/portfolio/realtime-price/${instrument.tencentCode}`);
      const priceData = await response.json();
      
      const price = priceData.price || 0;
      const amount = price * quantity;
      
      // 获取账户佣金率
      const account = accounts.find(a => a.id === selectedAccountId);
      const commissionRate = account ? parseFloat(String(account.commissionRate || 0.00006)) : 0.00006;
      const minCommission = account ? parseFloat(String(account.minCommission || 0.2)) : 0.2;
      const commission = Math.max(amount * commissionRate, minCommission);
      
      setPriceInfo({
        price,
        total: amount + commission,
        commission,
      });
    } catch (error) {
      console.error('获取价格失败:', error);
    }
  };

  const handleSubmit = async () => {
    if (!selectedAccountId || !selectedInstrumentId) {
      showMessage('error', '请选择账户和标的');
      return;
    }

    if (quantity <= 0) {
      showMessage('error', '买入数量必须大于0');
      return;
    }

    const instrument = instruments.find(i => i.id === selectedInstrumentId);
    const lotSize = instrument?.lotSize || 100;
    if (quantity % lotSize !== 0) {
      showMessage('error', `买入数量必须是 ${lotSize} 的整数倍`);
      return;
    }

    if (!confirm(`确认买入 ${instrument?.name} ${quantity} 股？`)) {
      return;
    }

    try {
      setLoading(true);
      const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
      const response = await fetch(`${baseUrl}/simulation/portfolio/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: selectedAccountId,
          instrumentCode: instrument?.code,
          quantity: quantity,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || '买入失败');
      }

      showMessage('success', '买入成功');
      setTimeout(() => {
        navigate('/simulation/dashboard');
      }, 1500);
    } catch (error: any) {
      showMessage('error', error.message || '买入失败');
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
              <h1 className="text-2xl font-bold text-gray-900">买入股票</h1>
              <p className="text-sm text-gray-500 mt-1">
                模拟交易 - 买入操作
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

          {/* 标的选择 */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              选择标的 <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedInstrumentId}
              onChange={(e) => setSelectedInstrumentId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">请选择标的</option>
              {instruments.map((instrument) => (
                <option key={instrument.id} value={instrument.id}>
                  {instrument.code} - {instrument.name} ({instrument.type})
                </option>
              ))}
            </select>
          </div>

          {/* 买入数量 */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              买入数量 <span className="text-red-500">*</span>
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
              最小手数: {(instruments.find(i => i.id === selectedInstrumentId)?.lotSize || 100)} 股
            </p>
          </div>

          {/* 费用估算 */}
          {priceInfo && (
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <h3 className="text-sm font-medium text-gray-700 mb-3">费用估算</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">成交价格</span>
                  <span className="font-medium">¥{formatNumber(priceInfo.price, 3)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">成交金额</span>
                  <span className="font-medium">¥{formatNumber(priceInfo.price * quantity)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">手续费</span>
                  <span className="font-medium">¥{formatNumber(priceInfo.commission)}</span>
                </div>
                <div className="border-t border-gray-300 pt-2 flex justify-between">
                  <span className="text-gray-700 font-medium">总计</span>
                  <span className="text-lg font-bold text-blue-600">¥{formatNumber(priceInfo.total)}</span>
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>账户余额</span>
                  <span>¥{formatNumber(getAccountBalance())}</span>
                </div>
              </div>
            </div>
          )}

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
              disabled={loading || !selectedAccountId || !selectedInstrumentId}
              className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? '处理中...' : '确认买入'}
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
