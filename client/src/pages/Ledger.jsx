import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import { currentMonth, shiftMonth, monthLabel, fmtWon } from '../lib/format.js';
import TransactionList from '../components/TransactionList.jsx';

export default function Ledger() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [month, setMonth] = useState(currentMonth());
  const [txs, setTxs] = useState([]);
  const [loading, setLoading] = useState(true);

  const [summary, setSummary] = useState({ income: 0, expense: 0 });

  const load = useCallback(() => {
    setLoading(true);
    db.listLedger({ month })
      .then(async (list) => {
        setTxs(list);
        // 정산 반영: 정산 수입은 수입에서 제외, 대상 지출은 정산액만큼 차감(초과분은 수입으로)
        const exList = list.filter((t) => t.type === 'expense');
        const map = await db.settlementsByTarget(exList.map((t) => t.id));
        const expense = exList.reduce((s, t) => s + Math.max(0, Number(t.amount) - (map[t.id] || 0)), 0);
        const excess = exList.reduce((s, t) => s + Math.max(0, (map[t.id] || 0) - Number(t.amount)), 0);
        const income = list.filter((t) => t.type === 'income' && t.settlement_target_id == null).reduce((s, t) => s + Number(t.amount), 0) + excess;
        setSummary({ income, expense });
      })
      .catch(() => { setTxs([]); setSummary({ income: 0, expense: 0 }); })
      .finally(() => setLoading(false));
  }, [month]);

  useEffect(() => { load(); }, [load]);

  const { income, expense } = summary;

  // 개인 항목은 본인, 그룹 항목은 작성자만 수정. 구독 미러 항목은 그룹 편집기로 연결(항상 클릭 가능).
  const canEdit = (t) => (t.origin_type ? true : t.created_by === user.id);

  const openEdit = (t) => {
    if (t.origin_type) nav(`/groups/${t.origin_group_id}?edit=${t.origin_type}:${t.origin_id}`);
    else nav(`/tx/${t.id}`);
  };

  const remove = async (t) => {
    const linked = !!t.origin_type;
    const msg = linked
      ? '이 항목을 삭제하면 그룹의 결제/입금 내역과 연결된 다른 가계부 항목도 함께 삭제됩니다. 계속할까요?'
      : '이 항목을 삭제할까요?';
    if (!confirm(msg)) return;
    try {
      if (t.origin_type === 'payment') await db.deletePayment(t.origin_id);
      else if (t.origin_type === 'deposit') await db.deleteDeposit(t.origin_id);
      else await db.deleteTransaction(t.id);
      load();
    } catch (e) { alert(e.message); }
  };

  return (
    <div>
      <div className="month-nav">
        <button onClick={() => setMonth(shiftMonth(month, -1))} aria-label="이전 달">‹</button>
        <div className="mlabel">{monthLabel(month)}</div>
        <button onClick={() => setMonth(shiftMonth(month, 1))} aria-label="다음 달">›</button>
      </div>

      <div className="summary" style={{ marginBottom: 16 }}>
        <div className="box"><div className="lbl">수입</div><div className="val income">{fmtWon(income)}</div></div>
        <div className="box"><div className="lbl">지출</div><div className="val expense">{fmtWon(expense)}</div></div>
        <div className="box"><div className="lbl">합계</div><div className="val">{fmtWon(income - expense)}</div></div>
      </div>

      {loading ? (
        <div className="empty">불러오는 중…</div>
      ) : (
        <TransactionList
          transactions={txs}
          canEdit={canEdit}
          onEdit={openEdit}
          onDelete={remove}
        />
      )}

      <button className="fab" onClick={() => nav('/new')} aria-label="추가">＋</button>
    </div>
  );
}
