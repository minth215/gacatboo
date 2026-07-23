import { fmtWon } from '../lib/format.js';

// 날짜별로 묶어 렌더링. canEdit(tx) 로 수정/삭제 표시 제어.
export default function TransactionList({ transactions, onEdit, onDelete, canEdit }) {
  if (!transactions.length) {
    return <div className="empty">항목이 없습니다.<br />＋ 버튼으로 첫 항목을 추가해 보세요.</div>;
  }

  const groups = {};
  for (const t of transactions) {
    (groups[t.date] ||= []).push(t);
  }
  const dates = Object.keys(groups).sort((a, b) => (a < b ? 1 : -1));

  return (
    <div>
      {dates.map((date) => (
        <div key={date}>
          <div className="tx-group-date">{formatDate(date)}</div>
          {groups[date].map((t) => {
            const editable = canEdit ? canEdit(t) : true;
            const linked = !!t.origin_type; // 구독 결제/입금 연동 항목
            return (
              <div className="tx" key={t.id} onClick={() => editable && onEdit(t)} style={{ cursor: editable ? 'pointer' : 'default' }}>
                {t.category_emoji
                  ? <span className="cat-emoji">{t.category_emoji}</span>
                  : <span className="dot" style={{ background: t.type === 'income' ? 'var(--income)' : 'var(--expense)' }} />}
                <div className="tx-main">
                  <div className="tx-title">
                    {t.content || t.category_name || (t.type === 'income' ? '수입' : '지출')}
                    {t.group_name && <span className="tag-group">{t.group_name}</span>}
                    {linked && <span className="tag-group" style={{ background: '#eef0ff', color: 'var(--primary)' }}>🔁 구독</span>}
                  </div>
                  <div className="tx-sub">
                    {[t.category_name, t.source_name, t.author_name && t.group_name ? `by ${t.author_name}` : null]
                      .filter(Boolean).join(' · ') || '—'}
                  </div>
                </div>
                <div className={`tx-amt ${t.type}`}>
                  {t.type === 'income' ? '+' : '-'}{fmtWon(t.amount)}
                </div>
                {editable && onDelete && (
                  <button
                    className="btn sm ghost"
                    style={{ color: 'var(--muted)' }}
                    onClick={(e) => { e.stopPropagation(); onDelete(t); }}
                    aria-label="삭제"
                  >🗑</button>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function formatDate(d) {
  const dt = new Date(d + 'T00:00:00');
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일 (${days[dt.getDay()]})`;
}
