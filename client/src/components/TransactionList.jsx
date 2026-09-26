import { useState } from 'react';
import { fmtNum, monthPillLabel } from '../lib/format.js';
import SwipeRow from './SwipeRow.jsx';

// 분류명 → 부드러운 타일 배경 (시안의 파스텔 톤)
export const TILE_BG = ['#fff1e6', '#eef1fb', '#e8f6ee', '#fde8ee', '#f3ecff', '#e7f5fb', '#fdf3e0'];
export const tileBg = (key) => {
  const s = key || '';
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return TILE_BG[h % TILE_BG.length];
};

// PC 마우스 오버 시 내용이 잘렸으면 텍스트를 흐르게(marquee) 표시
const marqueeOn = (e) => {
  const el = e.currentTarget;
  const t = el.querySelector('.ttext');
  if (!t) return;
  const over = t.scrollWidth - t.clientWidth;
  if (over > 1) { el.style.setProperty('--sw', `${over}px`); el.classList.add('marquee'); }
};
const marqueeOff = (e) => {
  const el = e.currentTarget;
  el.classList.remove('marquee');
  el.style.removeProperty('--sw');
};

export default function TransactionList({ transactions, onEdit, onDelete, canEdit, dateFormat, emptyText, groupByMonth, groupTint = true, emptyCenter = false }) {
  // 한 번에 하나의 행만 스와이프로 열려 있도록: 새로 열리는 행의 id 를 기록하고,
  // 나머지 행은 SwipeRow 의 isOpen 이 false 가 되면서 자동으로 닫힌다.
  const [openId, setOpenId] = useState(null);

  if (!transactions.length) {
    return <div className={`empty${emptyCenter ? ' empty-center' : ''}`}>{emptyText || <>항목이 없습니다.<br />＋ 버튼으로 첫 항목을 추가해 보세요.</>}</div>;
  }

  const groups = {};
  for (const t of transactions) (groups[t.date] ||= []).push(t);
  const dates = Object.keys(groups).sort((a, b) => (a < b ? 1 : -1));

  const renderDateGroup = (date) => {
    const items = groups[date];
    const net = items.reduce((s, t) => s + (t.type === 'income' ? Number(t.amount) : -Number(t.amount)), 0);
    return (
      <div key={date}>
        <div style={{ margin: '18px 0 9px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px 0 8px' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#191722' }}>{formatDate(date, dateFormat)}</span>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: '#8b8798' }}>{net >= 0 ? '+' : '-'}{fmtNum(Math.abs(net))}</span>
        </div>
        {/* 같은 날짜 항목들은 하나의 흰 박스처럼 보이지만(가운데 행은 각진 모서리) 각 행이 독립된 카드라서
            하나만 밀 수 있다. 박스 자체엔 배경/그림자가 없어 밀린 자리엔 페이지 배경 위에 버튼만 보인다. */}
        <div className="tx-daygroup">
          {items.map((t, i) => {
            const editable = canEdit ? canEdit(t) : true;
            const isGroup = groupTint && !!(t.group_name || t.origin_type); // 그룹에서 입력/반영된 항목(그룹 자체 화면에서는 강조 생략)
            const sub = [t.category_name, t.source_name].filter(Boolean).join(' · ') || '—';
            const first = i === 0;
            const last = i === items.length - 1;
            return (
              <SwipeRow
                key={t.id} onTap={() => editable && onEdit(t)}
                isOpen={openId === t.id} onOpenChange={(open) => setOpenId(open ? t.id : null)}
                actionsWidth={52}
                actions={editable && onDelete ? (progress) => (
                  <div className="tx-swipe-actions" style={{ opacity: progress }}>
                    <button type="button" className="settle-icon-btn danger" onClick={() => onDelete(t)} aria-label="삭제">
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        <line x1="10" y1="11" x2="10" y2="17" />
                        <line x1="14" y1="11" x2="14" y2="17" />
                      </svg>
                    </button>
                  </div>
                ) : undefined}
              >
                <div
                  className="tx-row"
                  style={{
                    borderTop: i > 0 ? '1px solid #f2f1f5' : 'none',
                    cursor: editable ? 'pointer' : 'default',
                    background: isGroup ? 'linear-gradient(135deg, #FFF1F3 0%, #FFF6EA 100%)' : '#fff',
                    borderRadius: `${first ? 20 : 0}px ${first ? 20 : 0}px ${last ? 20 : 0}px ${last ? 20 : 0}px`,
                    boxShadow: '0 4px 16px rgba(25,23,34,.05)',
                    // 그림자는 행마다 두되 이웃 행 쪽으로는 번지지 않게 잘라서, 모아 놓으면 하나의 박스 그림자처럼 보임
                    clipPath: `inset(${first ? -20 : 0}px -20px ${last ? -20 : 0}px -20px)`,
                  }}
                >
                  <span className="tx-tile" style={{ background: t.category_emoji ? (t.category_color || (isGroup ? 'rgba(255,255,255,.7)' : tileBg(t.category_name))) : (isGroup ? 'rgba(255,255,255,.7)' : '#f2f1f5') }}>
                    {t.category_emoji || (t.type === 'income' ? '💰' : '💸')}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="tx-row-title" onMouseEnter={marqueeOn} onMouseLeave={marqueeOff}>
                      <span className="ttext">{t.content || t.category_name || (t.type === 'income' ? '수입' : '지출')}</span>
                    </div>
                    <div className="tx-row-sub">{sub}</div>
                  </div>
                  <span style={{ fontSize: 14.5, fontWeight: 700, whiteSpace: 'nowrap', letterSpacing: '-.3px', flex: 'none', color: t.type === 'income' ? '#2CDDB9' : '#FF4358' }}>
                    {t.type === 'income' ? '+' : '-'}{fmtNum(t.amount)}
                  </span>
                </div>
              </SwipeRow>
            );
          })}
        </div>
      </div>
    );
  };

  if (!groupByMonth) {
    return <div>{dates.map(renderDateGroup)}</div>;
  }

  const monthMap = {};
  for (const d of dates) (monthMap[d.slice(0, 7)] ||= []).push(d);
  const months = Object.keys(monthMap).sort((a, b) => (a < b ? 1 : -1));

  return (
    <div>
      {months.map((mo) => (
        <div key={mo}>
          <div className="month-pill-wrap" style={{ margin: '16px 0 8px' }}><span className="month-pill">{monthPillLabel(mo)}</span></div>
          {monthMap[mo].map(renderDateGroup)}
        </div>
      ))}
    </div>
  );
}

export function formatDate(d, fmt) {
  const dt = new Date(d + 'T00:00:00');
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const w = `${days[dt.getDay()]}요일`;
  if (fmt === 'full') return `${d.slice(0, 4)} 년 ${Number(d.slice(5, 7))} 월 ${Number(d.slice(8, 10))} 일 ${w}`;
  return `${Number(d.slice(8, 10))} 일 ${w}`;
}
