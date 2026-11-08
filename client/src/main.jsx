import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './lib/auth.jsx';
import App from './App.jsx';
import { loadStyle, applyStyle } from './lib/style.js';
import './index.css';

// 첫 렌더 전에 저장된 테마/폰트 설정을 body 에 반영(깜빡임 방지)
applyStyle(loadStyle());

// PC(마우스): 날짜/월 입력칸은 칸 오른쪽 끝 달력 아이콘을 눌러야만 선택기가 열려서, 글자 위에 투명하게
// 덮어 둔 입력칸(요일 쪽에 아이콘이 깔림)은 날짜 부분을 눌러도 반응이 없었다 → 칸 어디를 눌러도 선택기를 연다.
// (터치 기기는 원래 칸 전체가 반응하므로 건드리지 않음)
if (typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches) {
  document.addEventListener('click', (e) => {
    const el = e.target;
    if (!(el instanceof HTMLInputElement) || el.disabled || el.readOnly) return;
    if (!['date', 'month', 'week', 'time', 'datetime-local'].includes(el.type)) return;
    try { el.showPicker?.(); } catch { /* 이미 열려 있거나 지원하지 않는 브라우저 */ }
  });
}

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
