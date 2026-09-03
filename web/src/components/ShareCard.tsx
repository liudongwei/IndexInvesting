import { forwardRef } from 'react';
import type { TrendRankingItem } from '../types/trend';

interface ShareCardProps {
  data: TrendRankingItem[];
  tradeDate: string;
  title: string;
}

// 精美的分享卡片组件
export const ShareCard = forwardRef<HTMLDivElement, ShareCardProps>(
  ({ data, tradeDate, title }, ref) => {
    // 格式化日期
    const formatDate = (dateStr: string) => {
      if (!dateStr) return '';
      const date = new Date(dateStr);
      return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
    };

    // 格式化百分比
    const formatPercent = (num: number | string | null | undefined) => {
      if (num === null || num === undefined || num === '') return '-';
      const n = typeof num === 'string' ? parseFloat(num) : num;
      if (isNaN(n)) return '-';
      const sign = n > 0 ? '+' : '';
      return `${sign}${n.toFixed(2)}%`;
    };

    // 格式化数字
    const formatNumber = (num: number | string | null | undefined) => {
      if (num === null || num === undefined || num === '') return '-';
      const n = typeof num === 'string' ? parseFloat(num) : num;
      if (isNaN(n)) return '-';
      return n.toFixed(2);
    };

    // 获取涨跌幅颜色
    const getChangeColor = (value: number) => {
      return value >= 0 ? '#ef4444' : '#22c55e';
    };

    // 获取偏离率背景色
    const getDeviationBg = (rate: number) => {
      return rate >= 0 ? 'rgba(252, 165, 165, 0.3)' : 'rgba(134, 239, 172, 0.3)';
    };

    // 显示所有数据（不再限制前20条）
    const displayData = data;

    return (
      <div
        ref={ref}
        className="bg-white p-8 shadow-2xl"
        style={{
          maxWidth: '1200px',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}
      >
        {/* 头部 */}
        <div className="mb-6 pb-4 border-b-2 border-blue-500">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{title}</h1>
          <p className="text-lg text-gray-600">交易日：{formatDate(tradeDate)}</p>
          <p className="text-sm text-gray-400 mt-2">数据仅供市场历史风格趋势观察，不提供投资建议</p>
        </div>

        {/* 表格 */}
        <div className="overflow-hidden">
          <table className="w-full" cellSpacing="0" cellPadding="0">
            <thead>
              <tr className="bg-gradient-to-r from-blue-500 to-blue-600 text-white">
                <th className="py-3 px-3 text-center font-semibold text-sm w-12">排名</th>
                <th className="py-3 px-3 text-left font-semibold text-sm w-64">名称</th>
                <th className="py-3 px-3 text-right font-semibold text-sm w-24">涨幅%</th>
                <th className="py-3 px-3 text-right font-semibold text-sm w-24">现价</th>
                <th className="py-3 px-3 text-right font-semibold text-sm w-24">20日均线</th>
                <th className="py-3 px-3 text-right font-semibold text-sm w-28">偏离率</th>
                <th className="py-3 px-3 text-center font-semibold text-sm w-32 whitespace-nowrap">状态转变时间</th>
                <th className="py-3 px-3 text-right font-semibold text-sm w-28 whitespace-nowrap">区间涨幅%</th>
                <th className="py-3 px-3 text-center font-semibold text-sm w-20 whitespace-nowrap">排序变化</th>
              </tr>
            </thead>
            <tbody>
              {displayData.map((item, index) => (
                <tr
                  key={item.code}
                  className={`border-b border-gray-200 ${
                    index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                  } hover:bg-blue-50 transition-colors`}
                >
                  <td className="py-2.5 px-3 text-center font-bold text-gray-900">
                    <span
                      className={`inline-flex items-center justify-center w-10 h-10 rounded-full text-white font-bold ${
                        item.rank <= 3
                          ? 'bg-gradient-to-br from-yellow-400 to-orange-500'
                          : 'bg-gray-400'
                      }`}
                      style={{ lineHeight: '1' }}
                    >
                      {item.rank}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-left">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium text-gray-900" style={{ maxWidth: '240px', wordBreak: 'break-word' }} title={item.name}>
                        {item.name}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 font-mono">{item.code}</span>
                        {!item.isTodayData && (
                          <span className="inline-flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-red-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-600"></span>
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td
                    className="py-2.5 px-3 text-right font-semibold font-mono"
                    style={{ color: getChangeColor(item.changePercent) }}
                  >
                    {formatPercent(item.changePercent)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-gray-700">
                    {formatNumber(item.closePrice)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-gray-700">
                    {formatNumber(item.ma20)}
                  </td>
                  <td
                    className="py-2.5 px-3 text-right font-mono font-semibold"
                    style={{ backgroundColor: getDeviationBg(item.deviationRate) }}
                  >
                    {formatPercent(item.deviationRate)}
                  </td>
                  <td className="py-2.5 px-3 text-center text-xs text-gray-600 whitespace-nowrap">
                    {item.statusChangeDate ? formatDate(item.statusChangeDate) : '-'}
                  </td>
                  <td
                    className="py-2.5 px-3 text-right font-mono font-semibold whitespace-nowrap"
                    style={{ color: getChangeColor(item.intervalChangePercent) }}
                  >
                    {formatPercent(item.intervalChangePercent)}
                  </td>
                  <td className="py-2.5 px-3 text-center font-bold whitespace-nowrap">
                    <span
                      className={`inline-flex items-center justify-center min-w-[52px] h-8 px-3 rounded-lg text-sm font-bold ${
                        item.rankChange > 0
                          ? 'bg-red-100 text-red-700'
                          : item.rankChange < 0
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-700'
                      }`}
                      style={{ lineHeight: '1' }}
                    >
                      {item.rankChange > 0 ? `+${item.rankChange}` : item.rankChange}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 页脚 */}
        <div className="mt-6 pt-4 border-t border-gray-200 text-center">
          <p className="text-xs text-gray-400">
            由 IndexInvesting 趋势分析系统生成 · {formatDate(tradeDate)}
          </p>
        </div>
      </div>
    );
  }
);

ShareCard.displayName = 'ShareCard';
