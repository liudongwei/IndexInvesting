import { useState, useEffect } from 'react';
import type { CronConfig as CronConfigType } from '../types/cron';
import { getCronConfigs, updateCronConfig, toggleCronConfig, runCronTaskOnce } from '../services/api';

// Cron 表达式说明
const CRON_HELP = `
Cron 表达式格式: 分 时 日 月 周

示例:
- 0 2 * * *    每天凌晨 2:00
- 0 6 * * 0    每周日凌晨 6:00
- 0 */6 * * *  每 6 小时执行一次
- 30 9 * * 1-5 工作日 9:30

当前配置说明:
- A股: 5 15 * * * (15:05)
- 港股: 15 16 * * * (16:15)
- 台湾: 35 13 * * * (13:35)
- 日韩: 35 14 * * * (14:35)
- 欧洲: 35 0 * * * (00:35)
- 美股: 5 5 * * * (05:05)
- 贵金属: 5 7 * * * (07:05)
`;

export function CronConfig() {
  const [configs, setConfigs] = useState<CronConfigType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingConfig, setEditingConfig] = useState<CronConfigType | null>(null);
  const [runningTask, setRunningTask] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  // 加载配置
  const loadConfigs = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getCronConfigs();
      setConfigs(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载配置失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfigs();
  }, []);

  // 切换启用状态
  const handleToggle = async (taskName: string) => {
    try {
      await toggleCronConfig(taskName);
      await loadConfigs();
    } catch (err) {
      setError(err instanceof Error ? err.message : '切换失败');
    }
  };

  // 保存编辑
  const handleSave = async () => {
    if (!editingConfig) return;

    try {
      await updateCronConfig(editingConfig.taskName, {
        cronExpression: editingConfig.cronExpression,
        displayName: editingConfig.displayName,
        description: editingConfig.description,
      });
      setEditingConfig(null);
      await loadConfigs();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    }
  };

  // 立即执行
  const handleRunNow = async (taskName: string) => {
    setRunningTask(taskName);
    try {
      const result = await runCronTaskOnce(taskName);
      alert(result.message);
      await loadConfigs();
    } catch (err) {
      setError(err instanceof Error ? err.message : '执行失败');
    } finally {
      setRunningTask(null);
    }
  };

  // 格式化日期
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

  // 按分类分组
  const groupedConfigs = configs.reduce((acc, config) => {
    const category = config.category || '其他';
    if (!acc[category]) acc[category] = [];
    acc[category].push(config);
    return acc;
  }, {} as Record<string, CronConfigType[]>);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 页面头部 */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">定时任务配置</h1>
              <p className="text-sm text-gray-500 mt-1">
                管理数据同步和计算的定时任务，修改后即时生效
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowHelp(!showHelp)}
                className="px-4 py-2 text-gray-600 hover:text-gray-900 text-sm font-medium"
              >
                {showHelp ? '隐藏帮助' : 'Cron 帮助'}
              </button>
              <button
                onClick={loadConfigs}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? '刷新中...' : '刷新'}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* 主内容 */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* 帮助信息 */}
        {showHelp && (
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <pre className="text-sm text-blue-800 whitespace-pre-wrap">{CRON_HELP}</pre>
          </div>
        )}

        {/* 错误提示 */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* 配置列表 */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedConfigs).map(([category, categoryConfigs]) => (
              <div key={category} className="bg-white rounded-lg shadow-sm border border-gray-200">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 rounded-t-lg">
                  <h2 className="text-lg font-semibold text-gray-900">{category}</h2>
                </div>
                <div className="divide-y divide-gray-200">
                  {categoryConfigs.map((config) => (
                    <div key={config.taskName} className="p-4">
                      {editingConfig?.taskName === config.taskName ? (
                        // 编辑模式
                        <div className="space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              显示名称
                            </label>
                            <input
                              type="text"
                              value={editingConfig.displayName}
                              onChange={(e) =>
                                setEditingConfig({ ...editingConfig, displayName: e.target.value })
                              }
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Cron 表达式
                            </label>
                            <input
                              type="text"
                              value={editingConfig.cronExpression}
                              onChange={(e) =>
                                setEditingConfig({ ...editingConfig, cronExpression: e.target.value })
                              }
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                              placeholder="分 时 日 月 周"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              描述
                            </label>
                            <textarea
                              value={editingConfig.description || ''}
                              onChange={(e) =>
                                setEditingConfig({ ...editingConfig, description: e.target.value })
                              }
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              rows={2}
                            />
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={handleSave}
                              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
                            >
                              保存
                            </button>
                            <button
                              onClick={() => setEditingConfig(null)}
                              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200"
                            >
                              取消
                            </button>
                          </div>
                        </div>
                      ) : (
                        // 显示模式
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3">
                              <h3 className="text-base font-medium text-gray-900">
                                {config.displayName}
                              </h3>
                              <span
                                className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                                  config.isEnabled
                                    ? 'bg-green-100 text-green-800'
                                    : 'bg-gray-100 text-gray-600'
                                }`}
                              >
                                {config.isEnabled ? '已启用' : '已禁用'}
                              </span>
                            </div>
                            <p className="text-sm text-gray-500 mt-1">{config.description}</p>
                            <div className="flex items-center gap-4 mt-2 text-sm">
                              <code className="bg-gray-100 px-2 py-1 rounded text-gray-700 font-mono">
                                {config.cronExpression}
                              </code>
                              <span className="text-gray-400">|</span>
                              <span className="text-gray-500">
                                上次执行: {formatDate(config.lastExecutedAt)}
                              </span>
                              <span className="text-gray-400">|</span>
                              <span className="text-gray-500">
                                执行次数: {config.executionCount}
                              </span>
                            </div>
                            {config.lastError && (
                              <p className="text-sm text-red-600 mt-2">
                                上次错误: {config.lastError}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 ml-4">
                            <button
                              onClick={() => handleRunNow(config.taskName)}
                              disabled={runningTask === config.taskName}
                              className="px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-50"
                            >
                              {runningTask === config.taskName ? '执行中...' : '立即执行'}
                            </button>
                            <button
                              onClick={() => handleToggle(config.taskName)}
                              className={`px-3 py-1.5 text-sm font-medium rounded-lg ${
                                config.isEnabled
                                  ? 'text-orange-600 hover:bg-orange-50'
                                  : 'text-green-600 hover:bg-green-50'
                              }`}
                            >
                              {config.isEnabled ? '禁用' : '启用'}
                            </button>
                            <button
                              onClick={() => setEditingConfig(config)}
                              className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg"
                            >
                              编辑
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
