import type { TrendRankingItem } from '../types/trend';

interface RankingTableProps {
  data: TrendRankingItem[];
  tradeDate: string;
  loading?: boolean;
}

export function RankingTable({ data, loading }: RankingTableProps) {
  // 格式化日期显示
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
  };

  // 格式化数字，保留指定小数位
  const formatNumber = (num: number | null, digits: number = 2) => {
    if (num === null || num === undefined) return '-';
    return num.toFixed(digits);
  };

  // 格式化百分比
  const formatPercent = (num: number | null, digits: number = 2) => {
    if (num === null || num === undefined) return '-';
    const sign = num > 0 ? '+' : '';
    return `${sign}${num.toFixed(digits)}%`;
  };

  // 获取涨跌样式
  const getTrendClass = (num: number | null) => {
    if (num === null || num === undefined) return '';
    return num >= 0 ? 'trend-up' : 'trend-down';
  };

  // 获取偏离率背景色
  const getDeviationBgClass = (rate: number) => {
    if (rate >= 2) return 'bg-red-200';
    if (rate >= 1) return 'bg-red-100';
    if (rate >= 0) return 'bg-orange-50';
    if (rate >= -1) return 'bg-green-50';
    if (rate >= -2) return 'bg-green-100';
    return 'bg-green-200';
  };

  // 获取排序变化显示
  const getRankChangeDisplay = (change: number) => {
    if (change === 0) return '0';
    if (change > 0) return `+${change}`;
    return `${change}`;
  };

  // 获取排序变化样式
  const getRankChangeClass = (change: number) => {
    if (change === 0) return 'text-gray-500';
    if (change > 0) return 'trend-up'; // 排名上升是好事
    return 'trend-down';
  };

  // 判断是否高亮显示（偏离率在0附近）
  const shouldHighlight = (rate: number) => {
    return rate >= -0.2 && rate <= 0.2;
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
            <tr
              key={item.code}
              className={shouldHighlight(item.deviationRate) ? 'bg-highlight-yellow' : ''}
            >
              <td className="text-center font-medium">{item.rank}</td>
              <td className="text-center font-mono text-xs">{item.code}</td>
              <td className="font-medium">{item.name}</td>
              <td className={`text-right ${getTrendClass(item.changePercent)}`}>
                {formatPercent(item.changePercent)}
              </td>
              <td className="text-right font-mono">{formatNumber(item.closePrice, 2)}</td>
              <td className="text-right font-mono">{formatNumber(item.ma20, 2)}</td>
              <td className={`text-right font-mono ${getDeviationBgClass(item.deviationRate)}`}>
                {formatPercent(item.deviationRate)}
              </td>
              <td className="text-right font-mono">
                {item.volumeRatio ? formatNumber(item.volumeRatio, 2) : '-'}
              </td>
              <td className="text-center text-xs">
                {formatDate(item.statusChangeDate)}
              </td>
              <td className={`text-right ${getTrendClass(item.intervalChangePercent)}`}>
                {formatPercent(item.intervalChangePercent)}
              </td>
              <td className={`text-center font-medium ${getRankChangeClass(item.rankChange)}`}>
                {getRankChangeDisplay(item.rankChange)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
