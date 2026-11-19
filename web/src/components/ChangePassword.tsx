import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { changePassword } from '../services/api';

/** 修改密码页（/admin/change-password）：验证当前密码 → 修改 → 清凭证跳登录页重新登录 */
export function ChangePassword() {
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('请填写全部字段');
      return;
    }
    if (newPassword.length < 6) {
      setError('新密码至少 6 位');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('两次输入的新密码不一致');
      return;
    }
    if (newPassword === currentPassword) {
      setError('新密码不能与当前密码相同');
      return;
    }
    setBusy(true);
    try {
      await changePassword(currentPassword, newPassword);
      // 改密成功：清本地凭证 → 登录页（JWT 旧 token 无法吊销，重新登录拿新 token）
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_user');
      navigate('/admin/login?pwdchanged=1', { replace: true });
    } catch (err: any) {
      setError(err?.message || '修改失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">修改密码</h1>
        <p className="text-sm text-gray-500 mt-1">
          修改成功后将跳转登录页，需使用新密码重新登录
        </p>
      </div>

      <form onSubmit={submit} className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4">
        {error && (
          <div className="px-3 py-2 bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg">
            {error}
          </div>
        )}
        <label className="block">
          <div className="text-xs text-gray-500 mb-1">当前密码</div>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="请输入当前密码"
          />
        </label>
        <label className="block">
          <div className="text-xs text-gray-500 mb-1">新密码（最少 6 位，无复杂度要求）</div>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="请输入新密码"
          />
        </label>
        <label className="block">
          <div className="text-xs text-gray-500 mb-1">确认新密码</div>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="再次输入新密码"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="w-full py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {busy ? '提交中…' : '确认修改'}
        </button>
      </form>
    </div>
  );
}
