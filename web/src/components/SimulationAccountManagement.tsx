import { useState, useEffect } from 'react';

interface SimulationAccount {
  id: string;
  name: string;
  strategyType: 'grid' | 'trend_right' | 'trend_left' | 'custom';
  description?: string;
  initialCapital: number | string;
  currentBalance: number | string;
  frozenBalance: number | string;
  positionValue: number | string;
  totalAssets: number | string;
  totalProfit: number | string;
  totalProfitRate: number | string;
  todayProfit: number | string;
  todayProfitRate: number | string;
  totalBuyCount: number;
  totalSellCount: number;
  totalCommission: number | string;
  commissionRate: number | string;
  minCommission: number | string;
  status: 'active' | 'paused' | 'closed';
  startDate: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 交易账户管理页面（Admin）
 */
export function SimulationAccountManagement() {
  const [accounts, setAccounts] = useState<SimulationAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<SimulationAccount | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 表单状态
  const [formData, setFormData] = useState<Partial<SimulationAccount>>({
    name: '',
    strategyType: 'grid',
    description: '',
    initialCapital: 20000,
    commissionRate: 0.00006,
    minCommission: 0.2,
    status: 'active',
  });

  const limit = 20;

  useEffect(() => {
    loadAccounts();
  }, [page, filterStatus]);

  const loadAccounts = async () => {
    try {
      setLoading(true);
      const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
      let url = `${baseUrl}/admin/simulation-accounts?page=${page}&limit=${limit}`;
      if (filterStatus) {
        url += `&status=${filterStatus}`;
      }

      const response = await fetch(url);
      const data = await response.json();
      setAccounts(data.data || []);
      setTotal(data.total || 0);
      showMessage('success', '加载成功');
    } catch (error) {
      console.error('加载交易账户失败:', error);
      showMessage('error', '加载失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchTerm.trim()) {
      setPage(1);
      loadAccounts();
      return;
    }

    try {
      setLoading(true);
      const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
      // 简单过滤：在前端搜索
      const response = await fetch(`${baseUrl}/admin/simulation-accounts?page=1&limit=100`);
      const data = await response.json();
      const allAccounts = data.data || [];
      const filtered = allAccounts.filter((account: SimulationAccount) =>
        account.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        account.id.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setAccounts(filtered);
      setTotal(filtered.length);
      showMessage('success', '搜索完成');
    } catch (error) {
      console.error('搜索失败:', error);
      showMessage('error', '搜索失败');
    } finally {
      setLoading(false);
    }
  };

  const getStrategyTypeLabel = (type: string) => {
    switch (type) {
      case 'grid': return '网格交易';
      case 'trend_right': return '右侧趋势';
      case 'trend_left': return '左侧逆向';
      case 'custom': return '自定义策略';
      default: return type;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active': return '运行中';
      case 'paused': return '已暂停';
      case 'closed': return '已关闭';
      default: return status;
    }
  };

  const getStatusClass = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-700';
      case 'paused': return 'bg-yellow-100 text-yellow-700';
      case 'closed': return 'bg-gray-100 text-gray-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  // 显示消息提示
  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  // 重置表单
  const resetForm = () => {
    setFormData({
      name: '',
      strategyType: 'grid',
      description: '',
      initialCapital: 20000,
      commissionRate: 0.00006,
      minCommission: 0.2,
      status: 'active',
    });
  };

  // 打开新增模态框
  const handleAdd = () => {
    resetForm();
    setShowAddModal(true);
  };

  // 打开编辑模态框
  const handleEdit = (account: SimulationAccount) => {
    setEditingAccount(account);
    // 确保数值字段是数字类型
    setFormData({
      ...account,
      initialCapital: typeof account.initialCapital === 'string' ? parseFloat(account.initialCapital) : account.initialCapital,
      commissionRate: typeof account.commissionRate === 'string' ? parseFloat(account.commissionRate) : account.commissionRate,
      minCommission: typeof account.minCommission === 'string' ? parseFloat(account.minCommission) : account.minCommission,
    });
    setShowEditModal(true);
  };

  // 提交新增
  const handleSubmitAdd = async () => {
    try {
      const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
      const response = await fetch(`${baseUrl}/admin/simulation-accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        throw new Error('创建失败');
      }

      showMessage('success', '创建成功');
      setShowAddModal(false);
      resetForm();
      loadAccounts();
    } catch (error: any) {
      showMessage('error', error.message || '创建失败');
    }
  };

  // 提交编辑
  const handleSubmitEdit = async () => {
    if (!editingAccount) return;

    try {
      const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
      // 只发送需要更新的字段
      const updateData = {
        name: formData.name,
        strategyType: formData.strategyType,
        description: formData.description,
        initialCapital: formData.initialCapital,
        commissionRate: formData.commissionRate,
        minCommission: formData.minCommission,
        status: formData.status,
      };

      const response = await fetch(`${baseUrl}/admin/simulation-accounts/${editingAccount.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        throw new Error('更新失败');
      }

      showMessage('success', '更新成功');
      setShowEditModal(false);
      setEditingAccount(null);
      resetForm();
      loadAccounts();
    } catch (error: any) {
      showMessage('error', error.message || '更新失败');
    }
  };

  // 删除账户
  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`确定要删除账户 "${name}" 吗？`)) {
      return;
    }

    try {
      const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
      const response = await fetch(`${baseUrl}/admin/simulation-accounts/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('删除失败');
      }

      showMessage('success', '删除成功');
      loadAccounts();
    } catch (error: any) {
      showMessage('error', error.message || '删除失败');
    }
  };

  // 格式化数字（支持字符串和数字类型）
  const formatNumber = (num: number | string, decimals: number = 2) => {
    const numValue = typeof num === 'string' ? parseFloat(num) : num;
    if (isNaN(numValue)) return '0.00';
    return numValue.toFixed(decimals);
  };

  return (
    <div className="p-6">
      {/* 标题和操作按钮 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">交易账户管理</h1>
          <p className="text-sm text-gray-500 mt-1">
            管理模拟交易账户，支持多策略独立核算
          </p>
        </div>
        <button
          onClick={handleAdd}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          + 新增账户
        </button>
      </div>

      {/* 搜索和筛选 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
        <div className="flex gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="搜索账户名称或ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => {
              setFilterStatus(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">所有状态</option>
            <option value="active">运行中</option>
            <option value="paused">已暂停</option>
            <option value="closed">已关闭</option>
          </select>
          <button
            onClick={handleSearch}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
          >
            搜索
          </button>
        </div>
      </div>

      {/* 表格 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : accounts.length === 0 ? (
          <div className="p-8 text-center text-gray-500">暂无数据</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">账户名称</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">策略类型</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">初始资金</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">总资产</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">总盈亏</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">状态</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">操作</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {accounts.map((account) => (
                    <tr key={account.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{account.name}</div>
                        <div className="text-xs text-gray-500 mt-1">{account.id.substring(0, 8)}...</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs">
                          {getStrategyTypeLabel(account.strategyType)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ¥{formatNumber(account.initialCapital)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ¥{formatNumber(account.totalAssets)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className={`text-sm font-medium ${
                          parseFloat(String(account.totalProfit)) >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          ¥{formatNumber(account.totalProfit)}
                        </div>
                        <div className={`text-xs ${
                          parseFloat(String(account.totalProfitRate)) >= 0 ? 'text-green-500' : 'text-red-500'
                        }`}>
                          ({formatNumber(account.totalProfitRate)}%)
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 rounded text-xs ${getStatusClass(account.status)}`}>
                          {getStatusLabel(account.status)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                        <button
                          onClick={() => handleEdit(account)}
                          className="text-blue-600 hover:text-blue-800 mr-3"
                        >
                          编辑
                        </button>
                        <button
                          onClick={() => handleDelete(account.id, account.name)}
                          className="text-red-600 hover:text-red-800"
                        >
                          删除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 分页 */}
            {total > limit && (
              <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                <div className="text-sm text-gray-500">
                  共 {total} 条记录，第 {page} / {Math.ceil(total / limit)} 页
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page === 1}
                    className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50"
                  >
                    上一页
                  </button>
                  <button
                    onClick={() => setPage(Math.min(Math.ceil(total / limit), page + 1))}
                    disabled={page >= Math.ceil(total / limit)}
                    className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50"
                  >
                    下一页
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* 消息提示 */}
      {message && (
        <div className={`fixed top-4 right-4 z-50 px-6 py-3 rounded-lg shadow-lg transition-all ${
          message.type === 'success'
            ? 'bg-green-500 text-white'
            : 'bg-red-500 text-white'
        }`}>
          {message.text}
        </div>
      )}

      {/* 添加模态框 */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">新增交易账户</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  账户名称 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="如：网格交易策略A"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  策略类型 <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.strategyType}
                  onChange={(e) => setFormData({ ...formData, strategyType: e.target.value as any })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="grid">网格交易</option>
                  <option value="trend_right">右侧趋势交易</option>
                  <option value="trend_left">左侧逆向交易</option>
                  <option value="custom">自定义策略</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">账户描述</label>
                <textarea
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="账户描述信息..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    初始资金
                  </label>
                  <input
                    type="number"
                    value={typeof formData.initialCapital === 'string' ? parseFloat(formData.initialCapital) : formData.initialCapital}
                    onChange={(e) => setFormData({ ...formData, initialCapital: parseFloat(e.target.value) || 20000 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    佣金率
                  </label>
                  <input
                    type="number"
                    step="0.00001"
                    value={typeof formData.commissionRate === 'string' ? parseFloat(formData.commissionRate) : formData.commissionRate}
                    onChange={(e) => setFormData({ ...formData, commissionRate: parseFloat(e.target.value) || 0.00006 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    最低佣金
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={typeof formData.minCommission === 'string' ? parseFloat(formData.minCommission) : formData.minCommission}
                    onChange={(e) => setFormData({ ...formData, minCommission: parseFloat(e.target.value) || 0.2 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    账户状态
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="active">运行中</option>
                    <option value="paused">已暂停</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 border border-gray-300 rounded text-sm hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleSubmitAdd}
                className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
              >
                确认新增
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑模态框 */}
      {showEditModal && editingAccount && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">编辑交易账户</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  账户名称
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  策略类型
                </label>
                <select
                  value={formData.strategyType}
                  onChange={(e) => setFormData({ ...formData, strategyType: e.target.value as any })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="grid">网格交易</option>
                  <option value="trend_right">右侧趋势交易</option>
                  <option value="trend_left">左侧逆向交易</option>
                  <option value="custom">自定义策略</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">账户描述</label>
                <textarea
                  value={formData.description || ''}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    初始资金
                  </label>
                  <input
                    type="number"
                    value={typeof formData.initialCapital === 'string' ? parseFloat(formData.initialCapital) : formData.initialCapital}
                    onChange={(e) => setFormData({ ...formData, initialCapital: parseFloat(e.target.value) || 20000 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    佣金率
                  </label>
                  <input
                    type="number"
                    step="0.00001"
                    value={typeof formData.commissionRate === 'string' ? parseFloat(formData.commissionRate) : formData.commissionRate}
                    onChange={(e) => setFormData({ ...formData, commissionRate: parseFloat(e.target.value) || 0.00006 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    最低佣金
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={typeof formData.minCommission === 'string' ? parseFloat(formData.minCommission) : formData.minCommission}
                    onChange={(e) => setFormData({ ...formData, minCommission: parseFloat(e.target.value) || 0.2 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    账户状态
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="active">运行中</option>
                    <option value="paused">已暂停</option>
                    <option value="closed">已关闭</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowEditModal(false)}
                className="px-4 py-2 border border-gray-300 rounded text-sm hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleSubmitEdit}
                className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
              >
                保存修改
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
