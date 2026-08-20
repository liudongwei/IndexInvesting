import { useState, useEffect } from 'react';
import type { IndexItem, IndexFormData } from '../types/index';

interface IndexEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: IndexFormData) => void;
  initialData: IndexItem | null;
  isSubmitting: boolean;
}

// 常用的 metadata key 建议
const COMMON_METADATA_KEYS = [
  'data_source',
  'sync_mode',
  'eastmoneyCode',
  'data_file',
  'firstTradingDay',
  'category',
  'publisher',
  'market',
];

export function IndexEditModal({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  isSubmitting,
}: IndexEditModalProps) {
  const [formData, setFormData] = useState<IndexFormData>({
    code: '',
    officialCode: '',
    name: '',
    exchange: '',
    description: '',
    isActive: true,
    syncStartDate: '',
    metadata: {},
  });

  const [metadataJson, setMetadataJson] = useState('{}');
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'basic' | 'metadata'>('basic');
  const [newMetadataKey, setNewMetadataKey] = useState('');
  const [newMetadataValue, setNewMetadataValue] = useState('');

  // 初始化表单数据
  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setFormData({
          code: initialData.code || '',
          officialCode: initialData.officialCode || '',
          name: initialData.name || '',
          exchange: initialData.exchange || '',
          description: initialData.description || '',
          isActive: initialData.isActive ?? true,
          syncStartDate: initialData.syncStartDate
            ? new Date(initialData.syncStartDate).toISOString().split('T')[0]
            : '',
          metadata: initialData.metadata || {},
        });
        setMetadataJson(JSON.stringify(initialData.metadata || {}, null, 2));
      } else {
        setFormData({
          code: '',
          officialCode: '',
          name: '',
          exchange: '',
          description: '',
          isActive: true,
          syncStartDate: '',
          metadata: {},
        });
        setMetadataJson('{}');
      }
      setMetadataError(null);
      setActiveTab('basic');
      setNewMetadataKey('');
      setNewMetadataValue('');
    }
  }, [isOpen, initialData]);

  // 处理基本字段变更
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  // 处理元数据 JSON 变更
  const handleMetadataJsonChange = (value: string) => {
    setMetadataJson(value);
    try {
      const parsed = JSON.parse(value);
      setFormData((prev) => ({ ...prev, metadata: parsed }));
      setMetadataError(null);
    } catch {
      setMetadataError('JSON 格式错误');
    }
  };

  // 添加元数据键值对
  const handleAddMetadata = () => {
    if (!newMetadataKey.trim()) return;
    const newMetadata = {
      ...formData.metadata,
      [newMetadataKey.trim()]: newMetadataValue.trim() || '',
    };
    setFormData((prev) => ({ ...prev, metadata: newMetadata }));
    setMetadataJson(JSON.stringify(newMetadata, null, 2));
    setNewMetadataKey('');
    setNewMetadataValue('');
  };

  // 删除元数据键值对
  const handleRemoveMetadata = (key: string) => {
    const newMetadata = { ...formData.metadata };
    delete newMetadata[key];
    setFormData((prev) => ({ ...prev, metadata: newMetadata }));
    setMetadataJson(JSON.stringify(newMetadata, null, 2));
  };

  // 提交表单
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (metadataError) {
      setActiveTab('metadata');
      return;
    }
    onSubmit(formData);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* 遮罩层 */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      />

      {/* 弹窗内容 */}
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
          {/* 头部 */}
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              {initialData ? '编辑指数' : '新增指数'}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {initialData
                ? `编辑 ${initialData.name} 的信息`
                : '填写以下信息创建新的指数'}
            </p>
          </div>

          {/* 标签页切换 */}
          <div className="px-6 pt-4 border-b border-gray-200">
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => setActiveTab('basic')}
                className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'basic'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                基本信息
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('metadata')}
                className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'metadata'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                元数据
              </button>
            </div>
          </div>

          {/* 表单内容 */}
          <form onSubmit={handleSubmit}>
            <div className="px-6 py-4 overflow-y-auto max-h-[60vh]">
              {activeTab === 'basic' ? (
                <div className="space-y-4">
                  {/* 指数名称 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      指数名称 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      required
                      placeholder="如：沪深300"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  {/* 代码和官方代码 */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        指数代码 <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="code"
                        value={formData.code}
                        onChange={handleChange}
                        required
                        placeholder="如：sh000300"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        用于API请求，如 sh000300
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        官方标准代码
                      </label>
                      <input
                        type="text"
                        name="officialCode"
                        value={formData.officialCode}
                        onChange={handleChange}
                        placeholder="如：000300.SH"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>

                  {/* 交易所 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      交易所
                    </label>
                    <select
                      name="exchange"
                      value={formData.exchange}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">请选择</option>
                      <option value="上交所">上交所</option>
                      <option value="深交所">深交所</option>
                      <option value="北交所">北交所</option>
                      <option value="港交所">港交所</option>
                      <option value="纳斯达克">纳斯达克</option>
                      <option value="纽交所">纽交所</option>
                      <option value="东京证券交易所">东京证券交易所</option>
                      <option value="韩国交易所">韩国交易所</option>
                      <option value="台湾证券交易所">台湾证券交易所</option>
                      <option value="其他">其他</option>
                    </select>
                  </div>

                  {/* 描述 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      指数描述
                    </label>
                    <textarea
                      name="description"
                      value={formData.description}
                      onChange={handleChange}
                      rows={3}
                      placeholder="输入指数描述信息..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    />
                  </div>

                  {/* 同步起始日期 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      数据同步起始日期
                    </label>
                    <input
                      type="date"
                      name="syncStartDate"
                      value={formData.syncStartDate}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  {/* 是否启用 */}
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      name="isActive"
                      id="isActive"
                      checked={formData.isActive}
                      onChange={handleChange}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <label htmlFor="isActive" className="ml-2 text-sm text-gray-700">
                      启用自动同步
                    </label>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* 元数据说明 */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-sm text-blue-800">
                      元数据用于存储扩展配置，如数据源、同步模式等。支持 JSON 格式编辑。
                    </p>
                  </div>

                  {/* 快速添加元数据 */}
                  <div className="border border-gray-200 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-3">添加元数据</h4>
                    <div className="flex gap-2 mb-3">
                      <input
                        type="text"
                        value={newMetadataKey}
                        onChange={(e) => setNewMetadataKey(e.target.value)}
                        placeholder="键名"
                        list="metadata-keys"
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <datalist id="metadata-keys">
                        {COMMON_METADATA_KEYS.map((key) => (
                          <option key={key} value={key} />
                        ))}
                      </datalist>
                      <input
                        type="text"
                        value={newMetadataValue}
                        onChange={(e) => setNewMetadataValue(e.target.value)}
                        placeholder="值"
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        type="button"
                        onClick={handleAddMetadata}
                        disabled={!newMetadataKey.trim()}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                      >
                        添加
                      </button>
                    </div>

                    {/* 已添加的元数据列表 */}
                    {Object.keys(formData.metadata || {}).length > 0 && (
                      <div className="space-y-2">
                        {Object.entries(formData.metadata || {}).map(([key, value]) => (
                          <div
                            key={key}
                            className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2"
                          >
                            <div className="flex items-center gap-2 overflow-hidden">
                              <span className="text-sm font-medium text-gray-700 truncate">
                                {key}
                              </span>
                              <span className="text-gray-400">:</span>
                              <span className="text-sm text-gray-600 truncate">
                                {typeof value === 'object'
                                  ? JSON.stringify(value)
                                  : String(value)}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveMetadata(key)}
                              className="text-red-600 hover:text-red-800 text-sm ml-2"
                            >
                              删除
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* JSON 编辑器 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      JSON 编辑
                    </label>
                    <textarea
                      value={metadataJson}
                      onChange={(e) => handleMetadataJsonChange(e.target.value)}
                      rows={10}
                      className={`w-full px-3 py-2 border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                        metadataError
                          ? 'border-red-300 bg-red-50'
                          : 'border-gray-300'
                      }`}
                    />
                    {metadataError && (
                      <p className="text-sm text-red-600 mt-1">{metadataError}</p>
                    )}
                  </div>

                  {/* 常用配置示例 */}
                  <div className="border border-gray-200 rounded-lg p-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">常用配置示例</h4>
                    <div className="space-y-2 text-xs">
                      <div className="bg-gray-50 rounded p-2">
                        <p className="font-medium text-gray-600">API 同步模式：</p>
                        <code className="text-gray-700">
                          {`{"sync_mode": "api", "firstTradingDay": "2005-01-01"}`}
                        </code>
                      </div>
                      <div className="bg-gray-50 rounded p-2">
                        <p className="font-medium text-gray-600">东财 JSON 模式：</p>
                        <code className="text-gray-700">
                          {`{"sync_mode": "json", "data_file": "0.399001.json", "eastmoneyCode": "399001"}`}
                        </code>
                      </div>
                      <div className="bg-gray-50 rounded p-2">
                        <p className="font-medium text-gray-600">东财 API 模式：</p>
                        <code className="text-gray-700">
                          {`{"sync_mode": "eastmoney_api", "eastmoneyCode": "932000"}`}
                        </code>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 底部按钮 */}
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !!metadataError}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {isSubmitting && (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
                {isSubmitting ? '保存中...' : initialData ? '保存修改' : '创建指数'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
