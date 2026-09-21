import { useNavigate } from 'react-router-dom';

// 가계부 페이지와 동일한 스타일의 고정(fixed) 상단바.
// 좌측 끝 "‹" 버튼은 기본적으로 브라우저 히스토리를 한 단계 뒤로 이동(nav(-1))해,
// 어느 화면에서 진입했든 원래 있던 페이지로 정확히 돌아갑니다.
export default function PageHeader({ title, onBack, right }) {
  const nav = useNavigate();
  return (
    <div className="simple-topbar">
      <button className="back-btn" onClick={onBack || (() => nav(-1))} aria-label="뒤로">
        <svg width="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 6 9 12 15 18" /></svg>
      </button>
      <div className="title">{title}</div>
      {right && <div className="topbar-right">{right}</div>}
    </div>
  );
}
