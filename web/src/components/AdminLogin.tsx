import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

/** 管理后台登录页（/admin/login）：表单登录 → 存 JWT → 跳回原页面 */
export function AdminLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const from = new URLSearchParams(location.search).get('from') || '/admin/indices';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError('请输入用户名和密码');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        setError(typeof data.message === 'string' ? data.message : '登录失败，请检查用户名和密码');
        return;
      }
      localStorage.setItem('admin_token', data.access_token);
      localStorage.setItem('admin_user', JSON.stringify(data.user || { username }));
      navigate(from.startsWith('/admin') ? from : '/admin/indices', { replace: true });
    } catch (err: any) {
      setError(err?.message || '网络错误，请稍后重试');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-3xl mb-2">🔐</div>
          <h1 className="text-xl font-bold text-gray-900">管理后台登录</h1>
          <p className="text-sm text-gray-500 mt-1">鱼盆趋势模型 · 系统配置与数据管理</p>
        </div>

        <form onSubmit={submit} className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
          {error && (
            <div className="px-3 py-2 bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg">
              {error}
            </div>
          )}
          <label className="block">
            <div className="text-xs text-gray-500 mb-1">用户名</div>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="请输入用户名"
            />
          </label>
          <label className="block">
            <div className="text-xs text-gray-500 mb-1">密码</div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="请输入密码"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="w-full py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {busy ? '登录中…' : '登 录'}
          </button>
        </form>

        <div className="text-center mt-4">
          <button
            onClick={() => navigate('/')}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            ← 返回前端展示页
          </button>
        </div>
      </div>
    </div>
  );
}
