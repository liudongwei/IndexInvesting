import { useState, useEffect } from 'react';
import {
  getEastmoneyIndices,
  importEastmoneyJson,
  type EastmoneyIndex,
} from '../services/api';

export function EastmoneyImport() {
  const [indices, setIndices] = useState<EastmoneyIndex[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<EastmoneyIndex | null>(
    null,
  );
  const [jsonText, setJsonText] = useState('');
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    imported?: number;
    skipped?: number;
    total?: number;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 加载指数列表
  useEffect(() => {
    loadIndices();
  }, []);

  const loadIndices = async () => {
    setLoading(true);
    try {
      const response = await getEastmoneyIndices();
      if (response.success) {
        setIndices(response.data);
      }
    } catch (err) {
      console.error('加载指数列表失败:', err);
    } finally {
      setLoading(false);
    }
  };

  // 打开东财网页
  const openEastmoneyPage = (url: string) => {
    window.open(url, '_blank');
  };

  // 提交JSON数据
  const handleSubmit = async () => {
    if (!selectedIndex) {
      setResult({ success: false, message: '请先选择一个指数' });
      return;
    }
    if (!jsonText.trim()) {
      setResult({ success: false, message: '请输入JSON数据' });
      return;
    }

    setSubmitting(true);
    setResult(null);

    try {
      // 解析JSON
      const jsonData = JSON.parse(jsonText);

      // 提交到后端
      const response = await importEastmoneyJson(jsonData, selectedIndex.id);
      setResult({
        success: response.success,
        message: response.message,
        imported: response.imported,
        skipped: response.skipped,
        total: response.total,
      });

      // 清空输入
      if (response.success) {
        setJsonText('');
        // 刷新列表以更新同步日期
        loadIndices();
      }
    } catch (err) {
      setResult({
        success: false,
        message: err instanceof Error ? err.message : '提交失败',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // 格式化日期
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '未同步';
    const date = new Date(dateStr);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* 标题 */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">东财数据导入</h1>
          <p className="text-sm text-gray-500 mt-1">
            从东方财富网页复制JSON数据，手动导入指数历史数据
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 左侧：指数列表 */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-4 py-3 bg-gray-100 border-b border-gray-200">
              <h2 className="font-semibold text-gray-700">
                指数列表 ({indices.length})
              </h2>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {loading ? (
                <div className="p-4 text-center text-gray-500">加载中...</div>
              ) : indices.length === 0 ? (
                <div className="p-4 text-center text-gray-500">
                  暂无配置东财数据源的指数
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left">名称</th>
                      <th className="px-3 py-2 text-left">代码</th>
                      <th className="px-3 py-2 text-left">最后同步</th>
                      <th className="px-3 py-2 text-center">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {indices.map((index) => (
                      <tr
                        key={index.id}
                        className={`border-t border-gray-100 cursor-pointer hover:bg-gray-50 ${
                          selectedIndex?.id === index.id ? 'bg-blue-50' : ''
                        }`}
                        onClick={() => setSelectedIndex(index)}
                      >
                        <td className="px-3 py-2 font-medium">{index.name}</td>
                        <td className="px-3 py-2 text-gray-500 font-mono text-xs">
                          {index.code}
                        </td>
                        <td className="px-3 py-2 text-gray-500 text-xs">
                          {formatDate(index.lastSyncDate)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openEastmoneyPage(index.eastmoneyUrl);
                            }}
                            className="text-blue-600 hover:text-blue-800 text-xs underline"
                          >
                            打开东财
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* 右侧：数据导入 */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-4 py-3 bg-gray-100 border-b border-gray-200">
              <h2 className="font-semibold text-gray-700">数据导入</h2>
            </div>
            <div className="p-4 space-y-4">
              {/* 选中的指数 */}
              {selectedIndex ? (
                <div className="p-3 bg-blue-50 rounded-lg">
                  <div className="text-sm font-medium text-blue-900">
                    当前选择：{selectedIndex.name} ({selectedIndex.code})
                  </div>
                  <div className="text-xs text-blue-700 mt-1">
                    东财代码：{selectedIndex.eastmoneyCode}
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-yellow-50 rounded-lg text-sm text-yellow-800">
                  请从左侧列表选择一个指数
                </div>
              )}

              {/* 操作步骤 */}
              <div className="text-sm text-gray-600 space-y-2">
                <p className="font-medium">操作步骤：</p>
                <ol className="list-decimal list-inside space-y-1 text-xs">
                  <li>点击左侧"打开东财"进入东方财富网页</li>
                  <li>按 F12 打开开发者工具 → Network 标签</li>
                  <li>刷新页面，找到 kline/get 接口请求</li>
                  <li>右键 → Copy → Copy response</li>
                  <li>粘贴到下方文本框，点击提交</li>
                </ol>
              </div>

              {/* JSON输入框 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  JSON数据
                </label>
                <textarea
                  value={jsonText}
                  onChange={(e) => setJsonText(e.target.value)}
                  placeholder={`{"rc":0,"rt":17,"svr":181669690,...}`}
                  className="w-full h-48 px-3 py-2 border border-gray-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  disabled={submitting}
                />
              </div>

              {/* 提交按钮 */}
              <button
                onClick={handleSubmit}
                disabled={submitting || !selectedIndex || !jsonText.trim()}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {submitting
                  ? '提交中...'
                  : !selectedIndex
                    ? '请先选择指数'
                    : !jsonText.trim()
                      ? '请粘贴JSON数据'
                      : '提交导入'}
              </button>

              {/* 结果提示 */}
              {result && (
                <div
                  className={`p-3 rounded-lg text-sm ${
                    result.success
                      ? 'bg-green-50 text-green-800 border border-green-200'
                      : 'bg-red-50 text-red-800 border border-red-200'
                  }`}
                >
                  <div className="font-medium">
                    {result.success ? '导入成功' : '导入失败'}
                  </div>
                  <div className="mt-1">{result.message}</div>
                  {result.success && result.total !== undefined && (
                    <div className="mt-2 text-xs">
                      总计：{result.total} 条 | 导入：{result.imported} 条 |
                      跳过：{result.skipped} 条
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 说明 */}
        <div className="mt-6 p-4 bg-white rounded-lg shadow text-xs text-gray-500">
          <p className="font-medium mb-2">说明：</p>
          <ul className="list-disc list-inside space-y-1">
            <li>此功能用于手动导入东财K线数据，适用于API自动同步受限的情况</li>
            <li>系统会自动去重，已存在的数据不会重复导入</li>
            <li>
              请确保复制的JSON数据完整，包含 rc/rt/svr/lt/full/dlmkts/dsc/data
              等字段
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
