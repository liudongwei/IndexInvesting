import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { installFetchInterceptor } from './services/http-interceptor'

// 全局 fetch 拦截器：自动携带 JWT + 401 跳登录（必须在渲染前安装）
installFetchInterceptor()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
