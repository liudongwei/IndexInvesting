import type { TrendRankingItem } from '../types/trend';

interface RankingTableProps {
  data: TrendRankingItem[];
  tradeDate: string;
  loading?: boolean;
  onIndexClick?: (item: TrendRankingItem) => void;
}

// 动态脉冲圆环组件（牛市红色，慢速动画）
function PulsingDot() {
  return (
    <span className="inline-flex items-center justify-center ml-2" title="使用上一交易日数据">
      <span className="relative flex h-3 w-3">
        {/* 外圈脉冲动画 - 牛市红色，2秒周期 */}
        <span 
          className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-60"
          style={{
            animation: 'pulse-slow 2s cubic-bezier(0, 0, 0.2, 1) infinite',
          }}
        ></span>
        {/* 内圈实心圆 - 牛市深红色 */}
        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-600"></span>
      </span>
    </span>
  );
}

export function RankingTable({ data, loading, onIndexClick }: RankingTableProps) {
  // 格式化日期显示
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
  };

  // 格式化数字，保留指定小数位
  const formatNumber = (
    num: number | string | null | undefined,
    digits: number = 2,
  ) => {
    if (num === null || num === undefined || num === '') return '-';
    const n = typeof num === 'string' ? parseFloat(num) : num;
    if (isNaN(n)) return '-';
    return n.toFixed(digits);
  };

  // 格式化百分比
  const formatPercent = (
    num: number | string | null | undefined,
    digits: number = 2,
  ) => {
    if (num === null || num === undefined || num === '') return '-';
    const n = typeof num === 'string' ? parseFloat(num) : num;
    if (isNaN(n)) return '-';
    const sign = n > 0 ? '+' : '';
    return `${sign}${n.toFixed(digits)}%`;
  };

  // 获取偏离率背景颜色：正数红色背景，负数绿色背景
  const getDeviationBgClass = (rate: number | string | null | undefined) => {
    if (rate === null || rate === undefined || rate === '') return '';
    const r = typeof rate === 'string' ? parseFloat(rate) : rate;
    if (isNaN(r)) return '';
    return r >= 0 ? 'bg-red-300' : 'bg-green-300';
  };

  // 判断是否偏离率发生正负转换（需要标黄）
  // 昨天正今天负，或昨天负今天正
  const isDeviationChanged = (current: number, prev: number | null | undefined) => {
    if (prev === null || prev === undefined) return false;
    // 昨天正今天负，或昨天负今天正
    return (prev > 0 && current < 0) || (prev < 0 && current > 0);
  };

  // 获取排序变化显示
  const getRankChangeDisplay = (change: number) => {
    if (change === 0) return '0';
    if (change > 0) return `+${change}`;
    return `${change}`;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="text-gray-500">加载中...</div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="text-gray-500">暂无数据</div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="data-table">
        <thead>
          <tr>
            <th className="w-12 text-center">排序</th>
            <th className="w-20 text-center">代码</th>
            <th className="text-left">名称</th>
            <th className="w-20 text-right">涨幅%</th>
            <th className="w-20 text-right">现价</th>
            <th className="w-20 text-right">20日均线</th>
            <th className="w-20 text-right">偏离率</th>
            <th className="w-16 text-right">量比</th>
            <th className="w-24 text-center">状态转变时间</th>
            <th className="w-20 text-right">区间涨幅%</th>
            <th className="w-16 text-center">排序变化</th>
          </tr>
        </thead>
        <tbody>
          {data.map((item) => (
            <tr key={item.code}>
              <td className="text-center font-medium">{item.rank}</td>
              <td 
                className="text-center font-mono text-xs cursor-pointer hover:text-blue-600 hover:underline"
                onClick={() => onIndexClick?.(item)}
              >
                {item.code}
              </td>
              <td 
                className="font-medium cursor-pointer hover:text-blue-600 hover:underline"
                onClick={() => onIndexClick?.(item)}
              >
                {item.name}
                {/* 使用上一交易日数据的指数显示动态脉冲圆环 */}
                {item.isTodayData === false && <PulsingDot />}
              </td>
              <td className={`text-right ${item.changePercent >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                {formatPercent(item.changePercent)}
              </td>
              <td className="text-right font-mono">{formatNumber(item.closePrice, 2)}</td>
              <td className="text-right font-mono">{formatNumber(item.ma20, 2)}</td>
              <td className={`text-right font-mono text-black ${isDeviationChanged(item.deviationRate, item.prevDeviationRate) ? 'bg-yellow-100' : getDeviationBgClass(item.deviationRate)}`}>
                {formatPercent(item.deviationRate)}
              </td>
              <td className="text-right font-mono">
                {item.volumeRatio ? formatNumber(item.volumeRatio, 2) : '-'}
              </td>
              <td className="text-center text-xs">
                {formatDate(item.statusChangeDate)}
              </td>
              <td className="text-right">
                {formatPercent(item.intervalChangePercent)}
              </td>
              <td className="text-center font-medium text-black">
                {getRankChangeDisplay(item.rankChange)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
