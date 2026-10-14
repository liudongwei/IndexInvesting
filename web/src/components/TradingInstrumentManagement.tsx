import { useState, useEffect } from 'react';

interface Instrument {
  id: string;
  code: string;
  name: string;
  fullName?: string;
  type: 'ETF' | 'STOCK' | 'CONVERTIBLE_BOND';
  exchange: string;
  tencentCode: string;
  indexId?: string;
  indexCode?: string;
  indexName?: string;
  lotSize?: number;
  tradingRule: 'T+1' | 'T+0';
  currency?: string;
  issuer?: string;
  status?: string;
  listingDate?: string;
}

/**
 * 交易标的管理页面（Admin）
 */
export function TradingInstrumentManagement() {
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingInstrument, setEditingInstrument] = useState<Instrument | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 表单状态
  const [formData, setFormData] = useState<Partial<Instrument>>({
    code: '',
    name: '',
    fullName: '',
    type: 'ETF',
    exchange: '上交所',
    tencentCode: '',
    lotSize: 100,
    tradingRule: 'T+1',
    currency: 'CNY',
    issuer: '',
    status: 'active',
  });

  const limit = 20;

  useEffect(() => {
    loadInstruments();
  }, [page, filterType]);

  const loadInstruments = async () => {
    try {
      setLoading(true);
      let url = `http://localhost:3000/api/admin/trading-instruments?page=${page}&limit=${limit}`;
      if (filterType) {
        url += `&type=${filterType}`;
      }
      
      const response = await fetch(url);
      const data = await response.json();
      setInstruments(data.data || []);
      setTotal(data.total || 0);
      showMessage('success', '加载成功');
    } catch (error) {
      console.error('加载交易标失败:', error);
      showMessage('error', '加载失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchTerm.trim()) {
      setPage(1);
      loadInstruments();
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`http://localhost:3000/api/admin/trading-instruments/search?keyword=${searchTerm}`);
      const data = await response.json();
      setInstruments(data || []);
      setTotal(data?.length || 0);
      showMessage('success', '搜索完成');
    } catch (error) {
      console.error('搜索失败:', error);
      showMessage('error', '搜索失败');
    } finally {
      setLoading(false);
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'ETF': return 'ETF';
      case 'STOCK': return '股票';
      case 'CONVERTIBLE_BOND': return '可转债';
      default: return type;
    }
  };

  const getTradingRuleLabel = (rule: string) => {
    return rule === 'T+1' ? 'T+1' : 'T+0';
  };

  // 显示消息提示
  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  // 重置表单
  const resetForm = () => {
    setFormData({
      code: '',
      name: '',
      fullName: '',
      type: 'ETF',
      exchange: '上交所',
      tencentCode: '',
      lotSize: 100,
      tradingRule: 'T+1',
      currency: 'CNY',
      issuer: '',
      status: 'active',
    });
  };

  // 打开新增模态框
  const handleAdd = () => {
    resetForm();
    setShowAddModal(true);
  };

  // 打开编辑模态框
  const handleEdit = (instrument: Instrument) => {
    setEditingInstrument(instrument);
    setFormData(instrument);
    setShowEditModal(true);
  };

  // 提交新增
  const handleSubmitAdd = async () => {
    try {
      const response = await fetch('http://localhost:3000/api/admin/trading-instruments', {
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
      loadInstruments();
    } catch (error: any) {
      showMessage('error', error.message || '创建失败');
    }
  };

  // 提交编辑
  const handleSubmitEdit = async () => {
    if (!editingInstrument) return;

    try {
      // 只发送需要更新的字段，排除 id、createdAt、updatedAt
      const updateData = {
        code: formData.code,
        name: formData.name,
        fullName: formData.fullName,
        type: formData.type,
        exchange: formData.exchange,
        tencentCode: formData.tencentCode,
        lotSize: formData.lotSize,
        tradingRule: formData.tradingRule,
        currency: formData.currency,
        issuer: formData.issuer,
        status: formData.status,
      };

      const response = await fetch(`http://localhost:3000/api/admin/trading-instruments/${editingInstrument.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        throw new Error('更新失败');
      }

      showMessage('success', '更新成功');
      setShowEditModal(false);
      setEditingInstrument(null);
      resetForm();
      loadInstruments();
    } catch (error: any) {
      showMessage('error', error.message || '更新失败');
    }
  };

  // 删除标的
  const handleDelete = async (id: string, code: string) => {
    if (!confirm(`确定要删除标的 ${code} 吗？`)) {
      return;
    }

    try {
      const response = await fetch(`http://localhost:3000/api/admin/trading-instruments/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('删除失败');
      }

      showMessage('success', '删除成功');
      loadInstruments();
    } catch (error: any) {
      showMessage('error', error.message || '删除失败');
    }
  };

  return (
    <div className="p-6">
      {/* 标题和操作按钮 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">交易标的池管理</h1>
          <p className="text-sm text-gray-500 mt-1">
            管理所有可交易的ETF、股票、可转债等标的
          </p>
        </div>
        <button
          onClick={handleAdd}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          + 新增标的
        </button>
      </div>

      {/* 搜索和筛选 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
        <div className="flex gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="搜索代码或名称..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={filterType}
            onChange={(e) => {
              setFilterType(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">所有类型</option>
            <option value="ETF">ETF</option>
            <option value="STOCK">股票</option>
            <option value="CONVERTIBLE_BOND">可转债</option>
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
        ) : instruments.length === 0 ? (
          <div className="p-8 text-center text-gray-500">暂无数据</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">代码</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">名称</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">类型</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">交易所</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">交易规则</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">基金公司</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">操作</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {instruments.map((instrument) => (
                    <tr key={instrument.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <code className="text-sm bg-gray-100 px-2 py-1 rounded">{instrument.code}</code>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{instrument.name}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">
                          {getTypeLabel(instrument.type)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        {instrument.exchange}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 rounded text-xs ${
                          instrument.tradingRule === 'T+1' 
                            ? 'bg-orange-100 text-orange-700' 
                            : 'bg-green-100 text-green-700'
                        }`}>
                          {getTradingRuleLabel(instrument.tradingRule)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        {instrument.issuer || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                        <button 
                          onClick={() => handleEdit(instrument)}
                          className="text-blue-600 hover:text-blue-800 mr-3"
                        >
                          编辑
                        </button>
                        <button 
                          onClick={() => handleDelete(instrument.id, instrument.code)}
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
            <h3 className="text-lg font-semibold mb-4">新增交易标的</h3>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    交易代码 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="如：510330"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    标的名称 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="如：沪深300ETF华夏"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">全称</label>
                <input
                  type="text"
                  value={formData.fullName || ''}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="如：华夏沪深300交易型开放式指数证券投资基金"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    标的类型 <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="ETF">ETF</option>
                    <option value="STOCK">股票</option>
                    <option value="CONVERTIBLE_BOND">可转债</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    交易所 <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.exchange}
                    onChange={(e) => setFormData({ ...formData, exchange: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="上交所">上交所</option>
                    <option value="深交所">深交所</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    腾讯API代码 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.tencentCode}
                    onChange={(e) => setFormData({ ...formData, tencentCode: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="如：sh510330"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    交易规则 <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.tradingRule}
                    onChange={(e) => setFormData({ ...formData, tradingRule: e.target.value as any })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="T+1">T+1</option>
                    <option value="T+0">T+0</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">最小手数</label>
                  <input
                    type="number"
                    value={formData.lotSize}
                    onChange={(e) => setFormData({ ...formData, lotSize: parseInt(e.target.value) || 100 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">基金公司</label>
                  <input
                    type="text"
                    value={formData.issuer || ''}
                    onChange={(e) => setFormData({ ...formData, issuer: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="如：华夏基金"
                  />
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
      {showEditModal && editingInstrument && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">编辑交易标的</h3>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    交易代码
                  </label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    标的名称
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">全称</label>
                <input
                  type="text"
                  value={formData.fullName || ''}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">标的类型</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="ETF">ETF</option>
                    <option value="STOCK">股票</option>
                    <option value="CONVERTIBLE_BOND">可转债</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">交易所</label>
                  <select
                    value={formData.exchange}
                    onChange={(e) => setFormData({ ...formData, exchange: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="上交所">上交所</option>
                    <option value="深交所">深交所</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">腾讯API代码</label>
                  <input
                    type="text"
                    value={formData.tencentCode}
                    onChange={(e) => setFormData({ ...formData, tencentCode: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">交易规则</label>
                  <select
                    value={formData.tradingRule}
                    onChange={(e) => setFormData({ ...formData, tradingRule: e.target.value as any })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="T+1">T+1</option>
                    <option value="T+0">T+0</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">最小手数</label>
                  <input
                    type="number"
                    value={formData.lotSize}
                    onChange={(e) => setFormData({ ...formData, lotSize: parseInt(e.target.value) || 100 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">基金公司</label>
                  <input
                    type="text"
                    value={formData.issuer || ''}
                    onChange={(e) => setFormData({ ...formData, issuer: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">状态</label>
                <select
                  value={formData.status || 'active'}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="active">正常</option>
                  <option value="delisted">已退市</option>
                </select>
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
