import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import { isSubscription, isSettlement } from '../lib/format.js';
import TransactionForm from '../components/TransactionForm.jsx';
import { DepositForm, isLeftoverName } from './SubscriptionGroup.jsx';
import { PooledTransferForm } from './PooledFundGroup.jsx';
import Spinner from '../components/Spinner.jsx';

// 항목 작성/수정 전용 화면 (하단 시트가 아닌 별도 화면).
// /new                         → 개인 항목 추가
// /new?group=ID                → 그룹 항목 추가
// /new?group=ID&kind=payment   → 그룹(구독) 결제 내역 추가 — 총대 개인 가계부 지출과 자동 동기화
// /new?group=ID&kind=deposit   → 그룹(구독) 입금 내역 추가 — 총대(수입)·멤버(지출) 가계부와 자동 동기화
// /new?group=ID&kind=pooled-expense → 공금 그룹 사용 내역 추가 — 참여 멤버 가계부에 지출로 미러링
// /new?group=ID&kind=pooled-transfer → 공금 그룹 이체 내역 추가 — 해당 멤버 본인 가계부에만 미러링
// /tx/:id                      → 기존 개인 항목 수정
// /tx/:id?group=ID&kind=payment → 기존 결제 내역 수정
// /tx/:id?group=ID&kind=deposit → 기존 입금 내역 수정
export default function TransactionEdit() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const groupId = params.get('group') ? Number(params.get('group')) : null;
  const kind = params.get('kind'); // 'payment' | 'deposit' | 'pooled-expense' | 'pooled-transfer' | null
  const isPayment = kind === 'payment';
  const isDeposit = kind === 'deposit';
  const isPooledExpense = kind === 'pooled-expense';
  const isPooledTransfer = kind === 'pooled-transfer';
  // 그룹 컨텍스트가 있는 특수 kind 전체(그룹/멤버 정보를 먼저 불러와야 함)
  const isGroupKind = isPayment || isDeposit || isPooledExpense || isPooledTransfer;
  const nav = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const editing = !!id;
  const pendingRecurrence = location.state?.pendingRecurrence || null;

  const [initial, setInitial] = useState(null);
  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(editing);
  const [error, setError] = useState('');
  const formRef = useRef(null);
  const [scanBusy, setScanBusy] = useState(false);
  // 정산 그룹의 일반 결제 내역(생성 시 URL의 group, 수정 시 기존 항목의 group_id)
  const effectiveGroupId = groupId || initial?.group_id || null;
  const [initialSplit, setInitialSplit] = useState(undefined); // undefined=아직 조회 전, []=저장된 분담 없음(레거시)
  const [initialLinkedFee, setInitialLinkedFee] = useState(undefined); // undefined=아직 조회 전, null=연결된 수수료 없음

  // 입금 내역 전용 부가 데이터
  const [sub, setSub] = useState(null);
  const [cats, setCats] = useState([]);
  const [incomeCats, setIncomeCats] = useState([]);
  const [sources, setSources] = useState({ tree: [], flat: [] });
  const [recentExpenses, setRecentExpenses] = useState([]);

  useEffect(() => {
    if (!isGroupKind || !groupId) return;
    db.getGroup(groupId).then(({ group, members }) => { setGroup(group); setMembers(members); }).catch(() => {});
  }, [isGroupKind, groupId]);

  // 정산 그룹의 일반 결제 내역(신규/수정 모두): 멤버 체크리스트/분담액 UI에 필요한 그룹·멤버 정보.
  // 신규는 URL의 group, 수정은 기존 항목이 로드된 뒤 그 group_id 로 가져온다.
  useEffect(() => {
    if (isGroupKind || !effectiveGroupId) return;
    db.getGroup(effectiveGroupId).then(({ group, members }) => { setGroup(group); setMembers(members); }).catch(() => {});
  }, [isGroupKind, effectiveGroupId]);

  // 수정 화면: 이 결제 건에 이미 저장된 참여 멤버/분담액(없으면 이 기능 이전에 등록된 결제)
  useEffect(() => {
    if (isGroupKind || !editing || !id) return;
    db.listSettlementSplits([Number(id)]).then(setInitialSplit).catch(() => setInitialSplit([]));
  }, [isGroupKind, editing, id]);

  // 수정 화면: 공금 사용 내역에 이미 저장된 참여 멤버별 몫
  useEffect(() => {
    if (!isPooledExpense || !editing || !id) return;
    db.listPooledFundExpenseMembers([Number(id)])
      .then((rows) => setInitialSplit(rows.map((r) => ({ member_id: r.member_id, amount: r.amount }))))
      .catch(() => setInitialSplit([]));
  }, [isPooledExpense, editing, id]);

  useEffect(() => {
    if (!isGroupKind || !groupId) return;
    db.getSubscription(groupId).then(setSub).catch(() => {});
  }, [isGroupKind, groupId]);

  useEffect(() => {
    if (!isDeposit || !groupId || !group) return;
    db.listCategories('expense').then(setCats).catch(() => {});
    db.listCategories('income').then(setIncomeCats).catch(() => {});
    db.listSources().then(setSources).catch(() => {});
    // 정산 그룹은 결제 내역이 일반 거래(transactions)이므로 그룹 전체 거래에서 지출만 뽑아 정산 대상 후보로 사용
    if (isSettlement(group.category)) {
      db.listGroupTransactionsAll(groupId).then((rows) => setRecentExpenses(rows.filter((t) => t.type === 'expense'))).catch(() => {});
    } else {
      db.listGroupPaymentExpenses(groupId).then(setRecentExpenses).catch(() => {});
    }
  }, [isDeposit, groupId, group]);

  useEffect(() => {
    if (!editing) return;
    const fetch = isPayment ? db.getPayment(id)
      : isDeposit ? db.getDeposit(id)
      : isPooledExpense ? db.getPooledFundExpense(id)
      : isPooledTransfer ? db.getPooledFundTransfer(id)
      : db.getTransaction(id);
    fetch
      .then((tx) => setInitial((isPayment || isPooledExpense) ? { ...tx, type: 'expense' } : tx))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [editing, id, isPayment, isDeposit, isPooledExpense, isPooledTransfer]);

  // 수정 화면: 이체 기록에 연결된 수수료 지출 기록(있으면)
  useEffect(() => {
    if (isGroupKind || !editing || !initial || initial.type !== 'transfer') return;
    db.getLinkedFee(initial.id).then((f) => setInitialLinkedFee(f || null)).catch(() => setInitialLinkedFee(null));
  }, [isGroupKind, editing, initial]);

  // 저장 후 이동: 원래 보던 페이지로 돌아감.
  const done = () => nav(-1);

  // 결제 내역 저장은 subscription_payments 테이블을 사용(일반 거래와 별도)
  const savePayment = async (payload) => {
    const p = {
      date: payload.date, amount: payload.amount, periods: payload.periods,
      category_name: payload.category_name, category_emoji: payload.category_emoji,
      source_id: payload.source_id, source_name: payload.source_name,
      content: payload.content, memo: payload.memo,
      recurrence: payload.recurrence, backfillPast: payload.backfillPast,
    };
    if (editing) await db.updatePayment(id, p, user.id);
    else await db.createPayment(groupId, user.id, p);
  };

  // 입금 내역 저장은 subscription_deposits 테이블을 사용(RPC로 총대/멤버 미러 tx 동기화)
  const saveDeposit = async (p) => {
    if (editing) await db.updateDeposit(id, p, user.id);
    else await db.createDeposit({ ...p, group_id: groupId }, user.id);
  };

  // 공금 그룹 사용 내역 저장은 pooled_fund_expenses 테이블을 사용
  // (RPC로 참여 멤버 각자의 가계부에 지출로 미러링)
  const savePooledExpense = async (payload) => {
    const p = {
      group_id: groupId, date: payload.date, amount: payload.amount,
      content: payload.content, memo: payload.memo, items: payload.items,
      splits: payload.aggregateSplit || [],
    };
    if (editing) await db.updatePooledFundExpense(id, p);
    else await db.createPooledFundExpense(p);
  };

  const isOwner = isGroupKind && group ? group.owner_id === user.id : false;
  const myMember = members.find((m) => m.user_id === user.id && m.role !== 'owner');
  const memberList = members.filter((m) => m.role !== 'owner');
  // 정산 그룹의 일반 결제 내역: 참여 멤버 체크리스트용(자투리 보관용 가상 멤버 '짤짤이'는 제외)
  // 공금 그룹의 사용 내역: 전체 멤버가 참여 대상(제외 없음)
  const settlementSplitMembers = isPooledExpense
    ? members
    : (!isGroupKind && isSettlement(group?.category))
      ? members.filter((m) => !isLeftoverName(m.nickname))
      : undefined;
  // 그룹 결제/입금/공금 내역 상단 배지: 그룹 이모지 배경색과 동일(무색이면 회색)
  const groupBadge = group ? { name: group.name, color: group.color || '#e4e2e6' } : undefined;

  // 영수증으로 채우기: 일반 개인/그룹 항목 + 공금 사용 내역(신규 작성·수정 모두, 결제·입금·이체 내역 제외)
  const showReceiptBtn = !isPayment && !isDeposit && !isPooledTransfer;

  return (
    <div style={{ padding: '56px 0 32px' }}>
      <div className="simple-topbar flat">
        <button className="tb-icon-btn" onClick={() => nav(-1)} aria-label="닫기">
          <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" /></svg>
        </button>
        <div className="title">{editing ? '기록 수정' : '기록'}</div>
        {showReceiptBtn && (
          <div className="topbar-right">
            <button
              type="button" className="tb-icon-btn" disabled={scanBusy}
              onClick={() => formRef.current?.openReceiptPicker()} aria-label="영수증으로 채우기"
            >
              {scanBusy ? (
                <span style={{ width: 13, height: 13, border: '2px solid #d8d5d0', borderTopColor: '#191722', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              ) : (
                <svg width="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              )}
            </button>
          </div>
        )}
      </div>

      <div style={{ padding: '6px 0 0' }}>
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
            showPeriods={!isSettlement(group?.category)}
            groupName={group?.name || ''}
            groupBadge={groupBadge}
          />
        ) : isPooledTransfer ? (
          <PooledTransferForm
            initial={initial} group={group} members={members} sub={sub} isOwner={isOwner}
            onSaved={done} groupBadge={groupBadge}
          />
        ) : (
          <TransactionForm
            ref={formRef} onScanBusyChange={setScanBusy}
            initial={initial} groupId={(isPayment || isPooledExpense) ? null : groupId} onSaved={done} onClose={() => nav(-1)}
            fixedType={(isPayment || isPooledExpense) ? 'expense' : undefined}
            initialPendingRecurrence={pendingRecurrence}
            defaultCategoryName={isPayment ? (isSettlement(group?.category) ? '정산' : '구독') : undefined}
            defaultAmount={isPayment ? sub?.billing_amount : undefined}
            defaultContentTemplate={isPayment ? sub?.payment_content_template : undefined}
            onSubmit={isPooledExpense ? savePooledExpense : (isPayment ? savePayment : undefined)}
            showPeriods={isPayment && isSubscription(group?.category)}
            qtyLabel={isPayment && isSubscription(group?.category) ? '회차' : '수량'}
            settlementMembers={settlementSplitMembers}
            initialSettlementSplit={editing ? initialSplit : undefined}
            initialLinkedFee={editing ? initialLinkedFee : undefined}
            groupBadge={(isPayment || effectiveGroupId) ? groupBadge : undefined}
          />
        )}
      </div>
    </div>
  );
}
