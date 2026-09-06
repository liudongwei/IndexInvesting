import { useState, useEffect } from 'react';
import { getIndices } from '../services/api';
import type { IndexItem } from '../types/index';

interface DataSourceCodeConfig {
  enabled: boolean;
  code?: string;
}

interface DataSourceConfig {
  tencent: DataSourceCodeConfig | boolean;
  eastmoney: DataSourceCodeConfig | boolean;
  sina: DataSourceCodeConfig | boolean;
}

interface IndexMetadata {
  type?: string;
  calcTrend?: number;
  participateInDynamicTrend?: boolean;
  participateInKlinePattern?: boolean;
  dataSources?: DataSourceConfig;
  [key: string]: any;
}

export function IndexConfigManagement() {
  const [indices, setIndices] = useState<IndexItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // 加载指数列表
  useEffect(() => {
    loadIndices();
  }, []);

  const loadIndices = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getIndices();
      setIndices(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载指数列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 更新指数配置
  const handleUpdateConfig = async (indexId: string, updates: Partial<IndexMetadata>) => {
    setSaving(indexId);
    setError(null);
    setSuccess(null);
    
    try {
      const index = indices.find(i => i.id === indexId);
      if (!index) return;

      const updatedMetadata = {
        ...index.metadata,
        ...updates,
      };

      // 只更新metadata字段，不更新其他必需字段
      await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'}/indices/${indexId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metadata: updatedMetadata }),
      });

      // 更新本地状态
      setIndices(prev => prev.map(i => 
        i.id === indexId 
          ? { ...i, metadata: updatedMetadata }
          : i
      ));

      setSuccess(`指数 ${index.name} 配置已更新`);
      
      // 3秒后清除成功消息
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新配置失败');
    } finally {
      setSaving(null);
    }
  };

  // 切换参与趋势计算
  const toggleParticipateInTrend = (indexId: string, currentValue: number | undefined) => {
    const newValue = currentValue === 1 ? 0 : 1;
    handleUpdateConfig(indexId, { calcTrend: newValue });
  };

  // 切换参与动态趋势计算
  const toggleParticipateInDynamicTrend = (indexId: string, currentValue: boolean | undefined) => {
    handleUpdateConfig(indexId, { participateInDynamicTrend: !currentValue });
  };

  // 切换参与K线形态计算
  const toggleParticipateInKlinePattern = (indexId: string, currentValue: boolean | undefined) => {
    handleUpdateConfig(indexId, { participateInKlinePattern: !currentValue });
  };

  // 获取数据源配置（兼容旧格式）
  const getDataSourceConfig = (dataSource: keyof DataSourceConfig, metadata: IndexMetadata): DataSourceCodeConfig => {
    const config = metadata.dataSources?.[dataSource];
    
    // 如果是旧格式（boolean），转换为新格式
    if (typeof config === 'boolean') {
      return {
        enabled: config,
        code: undefined,
      };
    }
    
    // 如果已经是新格式但缺少某些字段
    if (typeof config === 'object') {
      return {
        enabled: config.enabled ?? false,
        code: config.code,
      };
    }
    
    // 默认值
    return { enabled: false, code: undefined };
  };

  // 切换数据源启用状态
  const toggleDataSource = (indexId: string, source: keyof DataSourceConfig) => {
    const index = indices.find(i => i.id === indexId);
    if (!index) return;

    const currentConfig = getDataSourceConfig(source, index.metadata as IndexMetadata || {});
    const newDataSources = {
      ...index.metadata?.dataSources,
      [source]: {
        ...currentConfig,
        enabled: !currentConfig.enabled,
      },
    };

    handleUpdateConfig(indexId, { dataSources: newDataSources });
  };

  // 更新数据源代码
  const updateDataSourceCode = (indexId: string, source: keyof DataSourceConfig, code: string) => {
    const index = indices.find(i => i.id === indexId);
    if (!index) return;

    const currentConfig = getDataSourceConfig(source, index.metadata as IndexMetadata || {});
    const newDataSources = {
      ...index.metadata?.dataSources,
      [source]: {
        ...currentConfig,
        code: code || undefined,
      },
    };

    handleUpdateConfig(indexId, { dataSources: newDataSources });
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 页面头部 */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-gray-900">指数配置管理</h1>
          <p className="text-sm text-gray-500 mt-1">
            配置指数的计算参数和数据源
          </p>
        </div>
      </header>

      {/* 主内容 */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* 错误提示 */}
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* 成功提示 */}
        {success && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
            {success}
          </div>
        )}

        {/* 配置表格 */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    代码
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    名称
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    参与趋势计算
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    参与动态趋势计算
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    参与K线形态计算
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    腾讯数据源
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    东财数据源
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    新浪数据源
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {indices.map((index) => {
                  const metadata = index.metadata as IndexMetadata || {};
                  const isSaving = saving === index.id;
                  
                  return (
                    <tr key={index.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <code className="text-gray-700 bg-gray-100 px-2 py-0.5 rounded">
                          {index.code}
                        </code>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {index.name}
                      </td>
                      
                      {/* 参与趋势计算 */}
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <button
                          onClick={() => toggleParticipateInTrend(index.id, metadata.calcTrend)}
                          disabled={isSaving}
                          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                            metadata.calcTrend === 1
                              ? 'bg-green-100 text-green-800 hover:bg-green-200'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                          {metadata.calcTrend === 1 ? '✓' : '✗'}
                        </button>
                      </td>

                      {/* 参与动态趋势计算 */}
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <button
                          onClick={() => toggleParticipateInDynamicTrend(index.id, metadata.participateInDynamicTrend)}
                          disabled={isSaving}
                          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                            metadata.participateInDynamicTrend
                              ? 'bg-blue-100 text-blue-800 hover:bg-blue-200'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                          {metadata.participateInDynamicTrend ? '✓' : '✗'}
                        </button>
                      </td>

                      {/* 参与K线形态计算 */}
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <button
                          onClick={() => toggleParticipateInKlinePattern(index.id, metadata.participateInKlinePattern)}
                          disabled={isSaving}
                          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                            metadata.participateInKlinePattern
                              ? 'bg-purple-100 text-purple-800 hover:bg-purple-200'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                          {metadata.participateInKlinePattern ? '✓' : '✗'}
                        </button>
                      </td>

                      {/* 腾讯数据源 */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => toggleDataSource(index.id, 'tencent')}
                            disabled={isSaving}
                            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                              getDataSourceConfig('tencent', metadata).enabled
                                ? 'bg-orange-100 text-orange-800 hover:bg-orange-200'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                          >
                            {getDataSourceConfig('tencent', metadata).enabled ? '✓' : '✗'}
                          </button>
                          <input
                            type="text"
                            placeholder="代码"
                            defaultValue={getDataSourceConfig('tencent', metadata).code || ''}
                            onBlur={(e) => updateDataSourceCode(index.id, 'tencent', e.target.value.trim())}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.currentTarget.blur();
                              }
                            }}
                            disabled={isSaving}
                            className="w-24 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:opacity-50"
                          />
                        </div>
                      </td>

                      {/* 东财数据源 */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => toggleDataSource(index.id, 'eastmoney')}
                            disabled={isSaving}
                            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                              getDataSourceConfig('eastmoney', metadata).enabled
                                ? 'bg-red-100 text-red-800 hover:bg-red-200'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                          >
                            {getDataSourceConfig('eastmoney', metadata).enabled ? '✓' : '✗'}
                          </button>
                          <input
                            type="text"
                            placeholder="代码"
                            defaultValue={getDataSourceConfig('eastmoney', metadata).code || ''}
                            onBlur={(e) => updateDataSourceCode(index.id, 'eastmoney', e.target.value.trim())}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.currentTarget.blur();
                              }
                            }}
                            disabled={isSaving}
                            className="w-24 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-50"
                          />
                        </div>
                      </td>

                      {/* 新浪数据源 */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => toggleDataSource(index.id, 'sina')}
                            disabled={isSaving}
                            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                              getDataSourceConfig('sina', metadata).enabled
                                ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                          >
                            {getDataSourceConfig('sina', metadata).enabled ? '✓' : '✗'}
                          </button>
                          <input
                            type="text"
                            placeholder="代码"
                            defaultValue={getDataSourceConfig('sina', metadata).code || ''}
                            onBlur={(e) => updateDataSourceCode(index.id, 'sina', e.target.value.trim())}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.currentTarget.blur();
                              }
                            }}
                            disabled={isSaving}
                            className="w-24 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-yellow-500 disabled:opacity-50"
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* 说明 */}
        <div className="mt-6 text-xs text-gray-500 space-y-1">
          <p>• 参与趋势计算：是否参与每日趋势排名分析</p>
          <p>• 参与动态趋势计算：是否参与实时动态偏离率计算（每10分钟更新）</p>
          <p>• 参与K线形态计算：是否参与K线形态识别和分析</p>
          <p>• 数据源配置：选择该指数使用哪些数据源获取实时数据，可配置对应数据源的指数代码</p>
          <p>• 数据源代码：如不填写则使用上方"代码"列的默认代码；不同数据源代码格式可能不同</p>
          <p className="mt-2 text-gray-400">示例：</p>
          <p className="text-gray-400">  - 沪深300: 腾讯=`sh000300`, 东财=`1.000300`, 新浪=`sh000300`</p>
          <p className="text-gray-400">  - 纳斯达克: 腾讯=`gb_nsdaq`, 东财=`100.NDX100`, 新浪=`ndx`</p>
        </div>
      </main>
    </div>
  );
}
