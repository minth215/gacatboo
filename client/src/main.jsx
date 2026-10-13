import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './lib/auth.jsx';
import App from './App.jsx';
import { loadStyle, applyStyle } from './lib/style.js';
import './index.css';

// 첫 렌더 전에 저장된 테마/폰트 설정을 body 에 반영(깜빡임 방지)
applyStyle(loadStyle());

// base('/gacatboo/')를 라우터 basename 으로 사용 (GitHub Pages 프로젝트 페이지 대응)
const basename = import.meta.env.BASE_URL.replace(/\/$/, '');

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename={basename}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);

// PWA 서비스 워커 등록 (프로덕션에서만)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
  });
}
