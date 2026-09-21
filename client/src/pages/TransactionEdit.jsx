import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { db } from '../lib/db.js';
import TransactionForm from '../components/TransactionForm.jsx';
import PageHeader from '../components/PageHeader.jsx';

// 항목 작성/수정 전용 화면 (하단 시트가 아닌 별도 화면).
// /new            → 개인 항목 추가
// /new?group=ID   → 그룹 항목 추가
// /tx/:id         → 기존 항목 수정
export default function TransactionEdit() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const groupId = params.get('group') ? Number(params.get('group')) : null;
  const nav = useNavigate();
  const editing = !!id;

  const [initial, setInitial] = useState(null);
  const [loading, setLoading] = useState(editing);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!editing) return;
    db.getTransaction(id)
      .then((tx) => setInitial(tx))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [editing, id]);

  // 저장 후 이동: 그룹 항목이면 그룹으로, 아니면 가계부로.
  const done = () => {
    const target = groupId || initial?.group_id;
    nav(target ? `/groups/${target}` : '/');
  };

  return (
    <div style={{ padding: '0 0 12px' }}>
      <PageHeader title={editing ? '기록 수정' : '기록'} />

      {loading ? (
        <div className="empty">불러오는 중…</div>
      ) : error ? (
        <div className="empty">{error}</div>
      ) : (
        <TransactionForm initial={initial} groupId={groupId} onSaved={done} onClose={() => nav(-1)} />
      )}
    </div>
  );
}
