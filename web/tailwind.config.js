/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'trend-up': '#ef4444',      // 红色 - 上涨 (中国股市)
        'trend-down': '#22c55e',    // 绿色 - 下跌 (中国股市)
        'trend-up-bg': '#fef2f2',
        'trend-down-bg': '#f0fdf4',
        'highlight-yellow': '#fef08a',
      }
    },
  },
  plugins: [],
}
