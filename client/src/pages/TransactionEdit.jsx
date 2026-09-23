import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import TransactionForm from '../components/TransactionForm.jsx';
import PageHeader from '../components/PageHeader.jsx';

// 항목 작성/수정 전용 화면 (하단 시트가 아닌 별도 화면).
// /new                         → 개인 항목 추가
// /new?group=ID                → 그룹 항목 추가
// /new?group=ID&kind=payment   → 그룹(구독) 결제 내역 추가 — 총대 개인 가계부 지출과 자동 동기화
// /tx/:id                      → 기존 개인 항목 수정
// /tx/:id?group=ID&kind=payment → 기존 결제 내역 수정
export default function TransactionEdit() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const groupId = params.get('group') ? Number(params.get('group')) : null;
  const kind = params.get('kind'); // 'payment' | null
  const isPayment = kind === 'payment';
  const nav = useNavigate();
  const { user } = useAuth();
  const editing = !!id;

  const [initial, setInitial] = useState(null);
  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(editing);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isPayment || !groupId) return;
    db.getGroup(groupId).then(({ group }) => setGroup(group)).catch(() => {});
  }, [isPayment, groupId]);

  useEffect(() => {
    if (!editing) return;
    const fetch = isPayment ? db.getPayment(id) : db.getTransaction(id);
    fetch
      .then((tx) => setInitial(isPayment ? { ...tx, type: 'expense' } : tx))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [editing, id, isPayment]);

  // 저장 후 이동: 그룹 항목이면 그룹으로, 아니면 원래 보던 페이지(가계부 등)로 돌아감.
  const done = () => {
    const target = groupId || initial?.group_id;
    if (target) nav(`/groups/${target}`);
    else nav(-1);
  };

  // 결제 내역 저장은 subscription_payments 테이블을 사용(일반 거래와 별도)
  const savePayment = async (payload) => {
    const p = {
      date: payload.date, amount: payload.amount,
      category_name: payload.category_name, category_emoji: payload.category_emoji,
      source_id: payload.source_id, source_name: payload.source_name,
      content: payload.content, memo: payload.memo,
    };
    if (editing) await db.updatePayment(id, p);
    else await db.createPayment(groupId, user.id, p);
  };

  return (
    <div style={{ padding: '44px 0 12px' }}>
      <PageHeader title={editing ? '기록 수정' : '기록'} />

      {loading ? (
        <div className="empty">불러오는 중…</div>
      ) : error ? (
        <div className="empty">{error}</div>
      ) : (
        <TransactionForm
          initial={initial} groupId={isPayment ? null : groupId} onSaved={done} onClose={() => nav(-1)}
          fixedType={isPayment ? 'expense' : undefined}
          defaultCategoryName={isPayment ? '구독' : undefined}
          onSubmit={isPayment ? savePayment : undefined}
          topNotice={isPayment && group && (
            <div className="form-section">
              <div className="form-section-title">{group.name}</div>
              <p className="small muted" style={{ margin: 0 }}>총대 개인 가계부의 지출과 자동 동기화됩니다.</p>
            </div>
          )}
        />
      )}
    </div>
  );
}
