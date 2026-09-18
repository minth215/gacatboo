import { fmtNum } from '../lib/format.js';
import SwipeRow from './SwipeRow.jsx';

// 분류명 → 부드러운 타일 배경 (시안의 파스텔 톤)
const TILE_BG = ['#fff1e6', '#eef1fb', '#e8f6ee', '#fde8ee', '#f3ecff', '#e7f5fb', '#fdf3e0'];
const tileBg = (key) => {
  const s = key || '';
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return TILE_BG[h % TILE_BG.length];
};

export default function TransactionList({ transactions, onEdit, onDelete, canEdit }) {
  if (!transactions.length) {
    return <div className="empty">항목이 없습니다.<br />＋ 버튼으로 첫 항목을 추가해 보세요.</div>;
  }

  const groups = {};
  for (const t of transactions) (groups[t.date] ||= []).push(t);
  const dates = Object.keys(groups).sort((a, b) => (a < b ? 1 : -1));

  return (
    <div>
      {dates.map((date) => {
        const items = groups[date];
        const net = items.reduce((s, t) => s + (t.type === 'income' ? Number(t.amount) : -Number(t.amount)), 0);
        return (
          <div key={date}>
            <div style={{ margin: '18px 0 9px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px 0 8px' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#191722' }}>{formatDate(date)}</span>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: '#8b8798' }}>{net >= 0 ? '+' : '-'}{fmtNum(Math.abs(net))}</span>
            </div>
            <div className="tx-daycard">
              {items.map((t, i) => {
                const editable = canEdit ? canEdit(t) : true;
                const linked = !!t.origin_type;
                const sub = [t.category_name, t.source_name, t.author_name && t.group_name ? `by ${t.author_name}` : null].filter(Boolean).join(' · ') || '—';
                return (
                  <SwipeRow key={t.id} deletable={editable && !!onDelete} onDelete={() => onDelete(t)} onTap={() => editable && onEdit(t)}>
                    <div className="tx-row" style={{ borderTop: i > 0 ? '1px solid #f2f1f5' : 'none', cursor: editable ? 'pointer' : 'default' }}>
                      <span className="tx-tile" style={{ background: t.category_emoji ? tileBg(t.category_name) : '#f2f1f5' }}>
                        {t.category_emoji || (t.type === 'income' ? '💰' : '💸')}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="tx-row-title">
                          {t.content || t.category_name || (t.type === 'income' ? '수입' : '지출')}
                          {t.group_name && <span className="tag-group">{t.group_name}</span>}
                          {linked && <span className="tag-group" style={{ background: '#eef0ff', color: '#7363e8' }}>🔁 구독</span>}
                        </div>
                        <div className="tx-row-sub">{sub}</div>
                      </div>
                      <span style={{ fontSize: 14.5, fontWeight: 700, whiteSpace: 'nowrap', letterSpacing: '-.3px', color: t.type === 'income' ? '#2CDDB9' : '#FF4358' }}>
                        {t.type === 'income' ? '+' : '-'}{fmtNum(t.amount)}
                      </span>
                    </div>
                  </SwipeRow>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function formatDate(d) {
  const dt = new Date(d + 'T00:00:00');
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${Number(d.slice(8, 10))} 일 ${days[dt.getDay()]}요일`;
}
