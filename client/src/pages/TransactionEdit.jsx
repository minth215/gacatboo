import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import { isSubscription, isSettlement, leaderLabel } from '../lib/format.js';
import TransactionForm from '../components/TransactionForm.jsx';
import { DepositForm } from './SubscriptionGroup.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';

// 항목 작성/수정 전용 화면 (하단 시트가 아닌 별도 화면).
// /new                         → 개인 항목 추가
// /new?group=ID                → 그룹 항목 추가
// /new?group=ID&kind=payment   → 그룹(구독) 결제 내역 추가 — 총대 개인 가계부 지출과 자동 동기화
// /new?group=ID&kind=deposit   → 그룹(구독) 입금 내역 추가 — 총대(수입)·멤버(지출) 가계부와 자동 동기화
// /tx/:id                      → 기존 개인 항목 수정
// /tx/:id?group=ID&kind=payment → 기존 결제 내역 수정
// /tx/:id?group=ID&kind=deposit → 기존 입금 내역 수정
export default function TransactionEdit() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const groupId = params.get('group') ? Number(params.get('group')) : null;
  const kind = params.get('kind'); // 'payment' | 'deposit' | null
  const isPayment = kind === 'payment';
  const isDeposit = kind === 'deposit';
  const nav = useNavigate();
  const { user } = useAuth();
  const editing = !!id;

  const [initial, setInitial] = useState(null);
  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(editing);
  const [error, setError] = useState('');

  // 입금 내역 전용 부가 데이터
  const [sub, setSub] = useState(null);
  const [cats, setCats] = useState([]);
  const [incomeCats, setIncomeCats] = useState([]);
  const [sources, setSources] = useState({ tree: [], flat: [] });
  const [recentExpenses, setRecentExpenses] = useState([]);

  useEffect(() => {
    if ((!isPayment && !isDeposit) || !groupId) return;
    db.getGroup(groupId).then(({ group, members }) => { setGroup(group); setMembers(members); }).catch(() => {});
  }, [isPayment, isDeposit, groupId]);

  useEffect(() => {
    if ((!isPayment && !isDeposit) || !groupId) return;
    db.getSubscription(groupId).then(setSub).catch(() => {});
  }, [isPayment, isDeposit, groupId]);

  useEffect(() => {
    if (!isDeposit || !groupId) return;
    db.listCategories('expense').then(setCats).catch(() => {});
    db.listCategories('income').then(setIncomeCats).catch(() => {});
    db.listSources().then(setSources).catch(() => {});
    db.listGroupPaymentExpenses(groupId).then(setRecentExpenses).catch(() => {});
  }, [isDeposit, groupId]);

  useEffect(() => {
    if (!editing) return;
    const fetch = isPayment ? db.getPayment(id) : isDeposit ? db.getDeposit(id) : db.getTransaction(id);
    fetch
      .then((tx) => setInitial(isPayment ? { ...tx, type: 'expense' } : tx))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [editing, id, isPayment, isDeposit]);

  // 저장 후 이동: 원래 보던 페이지로 돌아감.
  const done = () => nav(-1);

  // 결제 내역 저장은 subscription_payments 테이블을 사용(일반 거래와 별도)
  const savePayment = async (payload) => {
    const p = {
      date: payload.date, amount: payload.amount, periods: payload.periods,
      category_name: payload.category_name, category_emoji: payload.category_emoji,
      source_id: payload.source_id, source_name: payload.source_name,
      content: payload.content, memo: payload.memo,
    };
    if (editing) await db.updatePayment(id, p);
    else await db.createPayment(groupId, user.id, p);
  };

  // 입금 내역 저장은 subscription_deposits 테이블을 사용(RPC로 총대/멤버 미러 tx 동기화)
  const saveDeposit = async (p) => {
    if (editing) await db.updateDeposit(id, p);
    else await db.createDeposit({ ...p, group_id: groupId });
  };

  const isOwner = isDeposit && group ? group.owner_id === user.id : false;
  const myMember = members.find((m) => m.user_id === user.id && m.role !== 'owner');
  const memberList = members.filter((m) => m.role !== 'owner');

  return (
    <div style={{ padding: '44px 0 12px' }}>
      <PageHeader title={editing ? '기록 수정' : '기록'} />

      {loading ? (
        <Spinner />
      ) : error ? (
        <div className="empty">{error}</div>
      ) : isDeposit ? (
        <DepositForm
          initial={initial} sub={sub} cats={cats} incomeCats={incomeCats} sources={sources}
          members={isOwner ? memberList : (myMember ? [myMember] : [])} recentExpenses={recentExpenses}
          isOwner={isOwner} onSave={saveDeposit} onSaved={done}
          defaultCategoryName={isSettlement(group?.category) ? '정산' : '구독'}
          topNotice={group && (
            <div className="form-section-group">
              <div style={{ fontSize: 16, fontWeight: 800, color: '#191722' }}>{group.name}</div>
              <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>{leaderLabel(group.category)}(수입)·멤버(지출) 가계부와 자동 동기화됩니다.</p>
            </div>
          )}
        />
      ) : (
        <TransactionForm
          initial={initial} groupId={isPayment ? null : groupId} onSaved={done} onClose={() => nav(-1)}
          fixedType={isPayment ? 'expense' : undefined}
          defaultCategoryName={isPayment ? (isSettlement(group?.category) ? '정산' : '구독') : undefined}
          defaultAmount={isPayment ? sub?.billing_amount : undefined}
          defaultContentTemplate={isPayment ? sub?.payment_content_template : undefined}
          onSubmit={isPayment ? savePayment : undefined}
          showPeriods={isPayment && isSubscription(group?.category)}
          topNotice={isPayment && group && (
            <div className="form-section-group">
              <div style={{ fontSize: 16, fontWeight: 800, color: '#191722' }}>{group.name}</div>
              <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>{leaderLabel(group.category)} 개인 가계부의 지출과 자동 동기화됩니다.</p>
            </div>
          )}
        />
      )}
    </div>
  );
}
