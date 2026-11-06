import { useEffect, useRef, useState } from 'react';

// 라벨 옆 회색 물음표(원) 아이콘 — 누르면 아래에 설명이 담긴 흰색 박스(바깥을 누르면 닫힘). text 의 개행 그대로 표시
export default function HelpTip({ text, label = '설명 보기' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle' }}>
      <button
        type="button" aria-label={label} aria-expanded={open}
        // label 안에 있어도 입력칸으로 포커스가 넘어가지 않게
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); }}
        style={{ width: 18, height: 18, border: 'none', background: 'transparent', padding: 0, margin: '0 0 0 2px', cursor: 'pointer', color: 'var(--k-tx-b0b0b8)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4.5" />
          <line x1="12" y1="17.6" x2="12" y2="17.6" />
        </svg>
      </button>
      {open && (
        <span
          role="tooltip" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: -8, zIndex: 30, width: 'max-content', maxWidth: 'min(300px, calc(100vw - 48px))',
            background: 'var(--k-bg-fff)', borderRadius: 12, boxShadow: '0 6px 20px rgb(var(--k-sh) / calc(.14 * var(--k-sha)))',
            padding: '11px 13px', fontSize: 12, fontWeight: 400, lineHeight: 1.55, color: 'var(--k-tx-4a4652)', whiteSpace: 'pre-line', textAlign: 'left', cursor: 'default',
          }}
        >{text}</span>
      )}
    </span>
  );
}
