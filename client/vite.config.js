import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages 프로젝트 페이지(minth215.github.io/gacatboo) 배포를 위한 base 경로.
// 로컬 개발(dev)에서는 '/', 빌드 시에는 '/gacatboo/'.
// 다른 저장소명으로 배포하려면 VITE_BASE 환경변수로 덮어쓸 수 있습니다.
export default defineConfig(({ command }) => ({
  base: process.env.VITE_BASE || (command === 'build' ? '/gacatboo/' : '/'),
  plugins: [react()],
  server: { port: 5173 },
}));
