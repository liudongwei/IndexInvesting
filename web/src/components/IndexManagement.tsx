import { useState, useEffect, useMemo } from 'react';
import type { IndexItem, IndexFormData } from '../types/index';
import {
  getIndices,
  createIndex,
  updateIndex,
  deleteIndex,
  syncIndexData,
} from '../services/api';
import { IndexEditModal } from './IndexEditModal';

export function IndexManagement() {
  const [indices, setIndices] = useState<IndexItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{
    key: keyof IndexItem;
    direction: 'asc' | 'desc';
  } | null>(null);

  // 弹窗状态
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<IndexItem | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 同步状态
  const [syncingId, setSyncingId] = useState<string | null>(null);

  // 删除确认
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // 加载数据
  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getIndices();
      setIndices(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // 过滤和排序数据
  const filteredIndices = useMemo(() => {
    let result = [...indices];

    // 搜索过滤
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (item) =>
          item.name.toLowerCase().includes(term) ||
          item.code.toLowerCase().includes(term) ||
          item.officialCode?.toLowerCase().includes(term) ||
          item.exchange?.toLowerCase().includes(term)
      );
    }

    // 排序
    if (sortConfig) {
      result.sort((a, b) => {
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];

        if (aValue === null || aValue === undefined) return 1;
        if (bValue === null || bValue === undefined) return -1;

        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [indices, searchTerm, sortConfig]);

  // 处理排序
  const handleSort = (key: keyof IndexItem) => {
    setSortConfig((current) => {
      if (!current || current.key !== key) {
        return { key, direction: 'asc' };
      }
      if (current.direction === 'asc') {
        return { key, direction: 'desc' };
      }
      return null;
    });
  };

  // 获取排序图标
  const getSortIcon = (key: keyof IndexItem) => {
    if (!sortConfig || sortConfig.key !== key) {
      return <span className="text-gray-300">↕</span>;
    }
    return sortConfig.direction === 'asc' ? (
      <span className="text-blue-600">↑</span>
    ) : (
      <span className="text-blue-600">↓</span>
    );
  };

  // 打开新增弹窗
  const handleAdd = () => {
    setEditingIndex(null);
    setIsModalOpen(true);
  };

  // 打开编辑弹窗
  const handleEdit = (index: IndexItem) => {
    setEditingIndex(index);
    setIsModalOpen(true);
  };

  // 关闭弹窗
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingIndex(null);
  };

  // 提交表单
  const handleSubmit = async (formData: IndexFormData) => {
    setIsSubmitting(true);
    try {
      if (editingIndex) {
        await updateIndex(editingIndex.id, formData);
      } else {
        await createIndex(formData);
      }
      await loadData();
      handleCloseModal();
    } catch (err) {
      alert(err instanceof Error ? err.message : '操作失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 删除指数
  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个指数吗？此操作不可恢复。')) {
      return;
    }
    setDeletingId(id);
    try {
      await deleteIndex(id);
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : '删除失败');
    } finally {
      setDeletingId(null);
    }
  };

  // 同步数据
  const handleSync = async (id: string) => {
    setSyncingId(id);
    try {
      const result = await syncIndexData(id);
      alert(result.message || '同步完成');
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : '同步失败');
    } finally {
      setSyncingId(null);
    }
  };

  // 格式化日期
  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  // 格式化元数据
  const formatMetadata = (metadata: Record<string, any> | null | undefined) => {
    if (!metadata || Object.keys(metadata).length === 0) return '-';
    const entries = Object.entries(metadata).slice(0, 3);
    const text = entries.map(([k, v]) => `${k}: ${v}`).join(', ');
    const hasMore = Object.keys(metadata).length > 3;
    return (
      <span title={JSON.stringify(metadata, null, 2)} className="cursor-help">
        {text}{hasMore ? '...' : ''}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 页面头部 */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">指数管理</h1>
              <p className="text-sm text-gray-500 mt-1">
                管理系统中的所有大盘指数，支持增删改查和数据同步
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleAdd}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                <span>+</span>
                新增指数
              </button>
              <button
                onClick={loadData}
                disabled={loading}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50 transition-colors"
              >
                刷新
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* 主内容 */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* 搜索栏 */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <input
                type="text"
                placeholder="搜索指数名称、代码、交易所..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="text-sm text-gray-500">
              共 <span className="font-medium text-gray-900">{filteredIndices.length}</span> 条记录
            </div>
          </div>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* 数据表格 */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    onClick={() => handleSort('name')}
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                  >
                    <div className="flex items-center gap-1">
                      指数名称
                      {getSortIcon('name')}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('code')}
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                  >
                    <div className="flex items-center gap-1">
                      代码
                      {getSortIcon('code')}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('officialCode')}
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                  >
                    <div className="flex items-center gap-1">
                      官方代码
                      {getSortIcon('officialCode')}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('exchange')}
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                  >
                    <div className="flex items-center gap-1">
                      交易所
                      {getSortIcon('exchange')}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('isActive')}
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                  >
                    <div className="flex items-center gap-1">
                      状态
                      {getSortIcon('isActive')}
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort('lastSyncDate')}
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
                  >
                    <div className="flex items-center gap-1">
                      最后同步
                      {getSortIcon('lastSyncDate')}
                    </div>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    历史数据
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                        加载中...
                      </div>
                    </td>
                  </tr>
                ) : filteredIndices.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                      {searchTerm ? '没有找到匹配的指数' : '暂无数据'}
                    </td>
                  </tr>
                ) : (
                  filteredIndices.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">{item.name}</div>
                        {item.description && (
                          <div className="text-xs text-gray-500 max-w-xs truncate" title={item.description}>
                            {item.description}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <code className="text-sm text-gray-700 bg-gray-100 px-2 py-1 rounded">
                          {item.code}
                        </code>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-sm text-gray-600">
                          {item.officialCode || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-sm text-gray-600">
                          {item.exchange || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                            item.isActive
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {item.isActive ? '启用' : '停用'}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-sm text-gray-600">
                          {formatDate(item.lastSyncDate)}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-sm text-gray-600">
                          {item.historyCount || 0} 条
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleSync(item.id)}
                            disabled={syncingId === item.id}
                            className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 disabled:opacity-50 transition-colors"
                            title="同步数据"
                          >
                            {syncingId === item.id ? '同步中...' : '同步'}
                          </button>
                          <button
                            onClick={() => handleEdit(item)}
                            className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                            title="编辑"
                          >
                            编辑
                          </button>
                          <button
                            onClick={() => handleDelete(item.id)}
                            disabled={deletingId === item.id}
                            className="text-xs px-2 py-1 bg-red-50 text-red-700 rounded hover:bg-red-100 disabled:opacity-50 transition-colors"
                            title="删除"
                          >
                            {deletingId === item.id ? '删除中...' : '删除'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* 编辑弹窗 */}
      <IndexEditModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSubmit={handleSubmit}
        initialData={editingIndex}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}
