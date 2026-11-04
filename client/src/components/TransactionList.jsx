import { useState, useEffect } from 'react';
import { db } from '../lib/db.js';
import { fmtNum, fmtForeign, monthPillLabel } from '../lib/format.js';
import { getPrimary, fmtP } from '../lib/primaryCurrency.js';
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

// 같은 날짜 묶음(.tx-daygroup) 안의 한 행. 묶음은 하나의 흰 박스처럼 보이지만(첫 행 위·마지막 행 아래만
// 둥글고 가운데는 각짐) 각 행이 흰 배경·그림자를 가진 독립 카드라서 개별로 밀린다. 묶음 자체엔 배경이 없어
// 밀린 자리엔 페이지 배경 위에 삭제 버튼만 보이고, 밀린 카드는 왼쪽 화면 끝까지 이어진다.
// onInvite: (그룹 멤버 카드) 삭제 아이콘 왼쪽의 초대 버튼
// deleteBlocked: 삭제할 수 없는 카드 — 휴지통 버튼에 빗금(누르면 onDelete 로 안내만)
// dimmed: 내용을 옅은 회색으로(지출 합계에 포함되지 않는 기록 등)
export function DayCardRow({ dimmed = false, index, count, isOpen, onOpenChange, onTap, onDelete, deleteBlocked = false, onCopy, onInvite, onTravel, onLongPress, clickable, background = 'var(--k-bg-fff)', children }) {
  const first = index === 0;
  const last = index === count - 1;
  return (
    <SwipeRow
      onTap={onTap} onLongPress={onLongPress} isOpen={isOpen} onOpenChange={onOpenChange} actionsWidth={52 * ([onCopy, onInvite, onTravel, onDelete].filter(Boolean).length || 1)}
      actions={(onDelete || onCopy || onInvite || onTravel) ? (progress) => (
        <div className="tx-swipe-actions" style={{ opacity: progress }}>
          {onCopy && (
            <button type="button" className="settle-icon-btn" onClick={onCopy} aria-label="복사">
              <svg width="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </button>
          )}
          {onInvite && (
            <button type="button" className="settle-icon-btn" onClick={onInvite} aria-label="초대">
              <svg width="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="5" width="18" height="14" rx="2" /><polyline points="3 7 12 13 21 7" />
              </svg>
            </button>
          )}
          {onTravel && (
            // 여행 중(비행기)
            <button type="button" className="settle-icon-btn" onClick={onTravel} aria-label="여행 중">
              <svg width="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
              </svg>
            </button>
          )}
          {onDelete && (
            <button type="button" className={`settle-icon-btn danger${deleteBlocked ? ' blocked' : ''}`} onClick={onDelete} aria-label={deleteBlocked ? '삭제할 수 없음' : '삭제'}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
            </button>
          )}
        </div>
      ) : undefined}
    >
      <div
        className={`tx-row${dimmed ? ' tx-row-dimmed' : ''}`}
        style={{
          borderTop: index > 0 ? '1px solid var(--k-divider)' : 'none',
          cursor: clickable ? 'pointer' : 'default',
          background,
          borderRadius: `${first ? 20 : 0}px ${first ? 20 : 0}px ${last ? 20 : 0}px ${last ? 20 : 0}px`,
          boxShadow: '0 4px 16px rgb(var(--k-sh) / calc(.05 * var(--k-sha)))',
          // 그림자는 행마다 두되 이웃 행 쪽으로는 번지지 않게 잘라서, 모아 놓으면 하나의 박스 그림자처럼 보임
          clipPath: `inset(${first ? -20 : 0}px -20px ${last ? -20 : 0}px -20px)`,
        }}
      >
        {children}
      </div>
    </SwipeRow>
  );
}

export default function TransactionList({
  transactions, onEdit, onDelete, onCopy, canEdit, dateFormat, emptyText, groupByMonth, groupTint = true, emptyCenter = false,
  selectionMode = false, selectedIds, onToggleSelect, onLongPress,
}) {
  // 한 번에 하나의 행만 스와이프로 열려 있도록: 새로 열리는 행의 id 를 기록하고,
  // 나머지 행은 SwipeRow 의 isOpen 이 false 가 되면서 자동으로 닫힌다.
  const [openId, setOpenId] = useState(null);
  // 그룹 정산 입금의 총무 수입 항목은 category_color 스냅샷이 없으므로, 표시 시점에
  // 이 계정이 수입 분류 관리에서 지정한 색을 찾아 타일 배경에 반영한다.
  // 그룹 결제(구독 결제의 미러 지출) 등 색 스냅샷이 없는 항목도 같은 방식으로 지출 분류 색을 찾는다.
  const [incomeCatColors, setIncomeCatColors] = useState({});
  const [expenseCatColors, setExpenseCatColors] = useState({});
  useEffect(() => {
    db.listCategories().then((cs) => {
      const inc = {}; const exp = {};
      for (const c of cs) (c.type === 'income' ? inc : exp)[c.name] = c.color || '';
      setIncomeCatColors(inc);
      setExpenseCatColors(exp);
    }).catch(() => {});
  }, []);

  if (!transactions.length) {
    // emptyCenter: true=상단바+탭 줄(100px) 기준, 'notabs'=상단바만(56px) 있는 화면 기준
    const centerClass = emptyCenter === 'notabs' ? ' empty-center-notabs' : emptyCenter ? ' empty-center' : '';
    return <div className={`empty${centerClass}`}>{emptyText || <>항목이 없습니다.<br />＋ 버튼으로 첫 항목을 추가해 보세요.</>}</div>;
  }

  const groups = {};
  for (const t of transactions) (groups[t.date] ||= []).push(t);
  const dates = Object.keys(groups).sort((a, b) => (a < b ? 1 : -1));

  const renderDateGroup = (date) => {
    const items = groups[date];
    // 이체는 수입/지출이 아니라 통계(일별 합계)에 잡히지 않음
    const net = items.reduce((s, t) => s + (t.type === 'transfer' ? 0 : t.type === 'income' ? Number(t.amount) : -Number(t.amount)), 0);
    return (
      <div key={date}>
        <div style={{ margin: '18px 0 9px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px 0 8px' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--k-tx-191722)' }}>{formatDate(date, dateFormat)}</span>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--k-tx-8b8798)' }}>{net >= 0 ? '+' : '-'}{fmtP(Math.abs(net))}</span>
        </div>
        {/* 같은 날짜 항목들은 하나의 흰 박스처럼 보이지만(가운데 행은 각진 모서리) 각 행이 독립된 카드라서
            하나만 밀 수 있다. 박스 자체엔 배경/그림자가 없어 밀린 자리엔 페이지 배경 위에 버튼만 보인다. */}
        <div className="tx-daygroup">
          {items.map((t, i) => {
            const editable = canEdit ? canEdit(t) : true;
            const isGroup = groupTint && !!(t.group_name || t.origin_type); // 그룹에서 입력/반영된 항목(그룹 자체 화면에서는 강조 생략)
            // 그룹 정산 입금의 총무 수입 미러 항목: 색 스냅샷이 없어도 이 계정의 정산 분류 색을 따른다.
            const depositIncomeColor = (t.type === 'income' && t.origin_type === 'deposit') ? incomeCatColors[t.category_name]
              : (t.type === 'expense' && t.origin_type) ? expenseCatColors[t.category_name] : '';
            const sub = t.type === 'transfer'
              ? [t.category_name || '이체', (t.source_name && t.to_source_name) ? `${t.source_name} → ${t.to_source_name}` : ''].filter(Boolean).join(' · ') || '—'
              // 일부라도 디지털 온누리에서 차감된 온누리 가맹점 결제: 원천 옆에 "(디지털 온누리)" — 예: 식당 · 롯데카드(디지털 온누리)
              : [t.category_name, t.source_name ? `${t.source_name}${t.onnuri_deduct > 0 ? '(디지털 온누리)' : ''}${t.exclude_performance ? ' (실적 제외)' : ''}` : ''].filter(Boolean).join(' · ') || '—';
            const selected = selectionMode && selectedIds?.has(t.id);
            return (
              <DayCardRow
                key={t.id} index={i} count={items.length}
                isOpen={openId === t.id} onOpenChange={(open) => setOpenId(open ? t.id : null)}
                clickable={editable}
                onTap={() => { if (!editable) return; selectionMode ? onToggleSelect?.(t.id) : onEdit(t); }}
                onDelete={!selectionMode && editable && onDelete ? () => onDelete(t) : undefined}
                onCopy={!selectionMode && onCopy ? () => onCopy(t) : undefined}
                onLongPress={!selectionMode && editable && onLongPress ? () => onLongPress(t.id) : undefined}
                background={isGroup ? 'linear-gradient(135deg, var(--k-bg-fff1f3) 0%, var(--k-bg-fff6ea) 100%)' : 'var(--k-bg-fff)'}
                // "집계 포함" OFF 원천의 기록(합계에 안 잡힘): 옅은 회색
                // 집계 제외 디지털 온누리로 전액 차감된 결제도 같은 회색(일부라도 카드 결제면 그대로)
                dimmed={!!t.excluded || (!!t.onnuri_deduct_excluded && Number(t.onnuri_deduct) >= Number(t.amount))}
              >
                  <span style={{ position: 'relative', flex: 'none', width: 38, height: 38 }}>
                    {selected && <span className="tile-select-ring" />}
                    <span
                      className="tx-tile"
                      style={{ position: 'relative', zIndex: 1, background: t.category_emoji ? (t.category_color || depositIncomeColor || (isGroup ? 'rgba(255,255,255,.7)' : tileBg(t.category_name))) : (isGroup ? 'rgba(255,255,255,.7)' : 'var(--k-bg-f2f1f5)') }}
                    >
                      <span style={{ opacity: selected ? 0.25 : 1, transition: 'opacity 0.15s ease' }}>
                        {t.category_emoji || (t.type === 'income' ? '💰' : '💸')}
                      </span>
                    </span>
                    {selected && (
                      <span style={{ position: 'absolute', inset: 0, zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--k-tx-191722)' }}>
                        <svg width="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                      </span>
                    )}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="tx-row-title" onMouseEnter={marqueeOn} onMouseLeave={marqueeOff}>
                      <span className="ttext">
                        {t.content || t.category_name || (t.type === 'income' ? '수입' : t.type === 'transfer' ? '이체' : '지출')}
                        {/* 할부 회차 */}
                        {t.installment_total ? ` (${t.installment_no}/${t.installment_total})` : ''}
                        {/* 구독 그룹 결제/입금이 반영된 항목: 몇 회분인지 배지(그룹 화면과 동일) */}
                        {t.periods != null && (
                          <>{' '}<span className="tag-periods" style={isGroup ? { background: 'var(--k-bg-fff)' } : undefined}>{t.periods} 회분</span></>
                        )}
                      </span>
                    </div>
                    <div className="tx-row-sub">{sub}</div>
                  </div>
                  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flex: 'none' }}>
                    <span style={{ fontSize: 14.5, fontWeight: 700, whiteSpace: 'nowrap', letterSpacing: '-.3px', color: t.type === 'income' ? '#2CDDB9' : t.type === 'transfer' ? 'var(--k-tx-4b4752)' : '#FF4358' }}>
                      {t.type === 'transfer' ? '' : (t.type === 'income' ? '+' : '-')}{amountMain(t)}
                    </span>
                    {amountSub(t) && <span style={{ fontSize: 10.5, color: 'var(--k-tx-a29ead)', marginTop: 1 }}>{t.type === 'transfer' ? '' : (t.type === 'income' ? '+' : '-')}{amountSub(t)}</span>}
                  </span>
              </DayCardRow>
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

// 카드 금액: 기록을 입력한 화폐 그대로(주 화폐와 같으면 단위 생략) + 주 화폐와 다르면 주 화폐 환산 금액(회색)
function amountMain(t) {
  const P = getPrimary().code;
  const rc = t.input_currency || 'KRW';
  if (rc !== 'KRW') return fmtForeign(t.input_amount, rc);
  return P === 'KRW' ? fmtNum(t.amount) : fmtForeign(t.amount, 'KRW');
}
function amountSub(t) {
  const P = getPrimary().code;
  const rc = t.input_currency || 'KRW';
  if (rc === P) return null;
  return P === 'KRW' ? `${fmtNum(t.amount)} KRW` : `${fmtP(t.amount)} ${P}`;
}
