import { useEffect, useState, useCallback } from 'react';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import { currentMonth, shiftMonth, monthLabel, fmtWon } from '../lib/format.js';
import Modal from '../components/Modal.jsx';
import TransactionForm from '../components/TransactionForm.jsx';
import TransactionList from '../components/TransactionList.jsx';

export default function Ledger() {
  const { user } = useAuth();
  const [month, setMonth] = useState(currentMonth());
  const [txs, setTxs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | {tx?}

  const load = useCallback(() => {
    setLoading(true);
    db.listLedger({ month })
      .then(setTxs)
      .catch(() => setTxs([]))
      .finally(() => setLoading(false));
  }, [month]);

  useEffect(() => { load(); }, [load]);

  const income = txs.filter((t) => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const expense = txs.filter((t) => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);

  // 개인 항목은 본인, 그룹 항목은 작성자만 수정
  const canEdit = (t) => t.created_by === user.id;

  const remove = async (t) => {
    if (!confirm('이 항목을 삭제할까요?')) return;
    try { await db.deleteTransaction(t.id); load(); }
    catch (e) { alert(e.message); }
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
          onEdit={(t) => setModal({ tx: t })}
          onDelete={remove}
        />
      )}

      <button className="fab" onClick={() => setModal({})} aria-label="추가">＋</button>

      {modal && (
        <Modal title={modal.tx ? '항목 수정' : '항목 추가'} onClose={() => setModal(null)}>
          <TransactionForm
            initial={modal.tx}
            onSaved={() => { setModal(null); load(); }}
            onClose={() => setModal(null)}
          />
        </Modal>
      )}
    </div>
  );
}
