/**
 * 全局 fetch 拦截器（一处安装，全站生效）：
 * 1) 命中本项目 API 的请求，若 localStorage 有 admin_token 则自动附加
 *    Authorization: Bearer <token>（公开访客无 token → 不带，行为与现在完全一致）
 * 2) API 返回 401 → 清除凭证并跳转登录页（登录接口自身除外，避免死循环）
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

export function installFetchInterceptor() {
  const raw = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
    const isApi = url.startsWith(API_BASE) || url.startsWith('/api/');

    let nextInit = init;
    if (isApi && (typeof input === 'string' || input instanceof URL)) {
      const token = localStorage.getItem('admin_token');
      if (token) {
        const headers = new Headers(init?.headers);
        if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
        nextInit = { ...init, headers };
      }
    }

    const res = await raw(input, nextInit);

    if (isApi && res.status === 401 && !url.includes('/auth/login')) {
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_user');
      if (!location.pathname.startsWith('/admin/login')) {
        location.href = `/admin/login?from=${encodeURIComponent(location.pathname + location.search)}`;
      }
    }
    return res;
  };
}
