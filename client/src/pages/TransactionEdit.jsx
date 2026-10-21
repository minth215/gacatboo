import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import { isSubscription, isSettlement } from '../lib/format.js';
import TransactionForm from '../components/TransactionForm.jsx';
import { DepositForm, isLeftoverName } from './SubscriptionGroup.jsx';
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
  // 정산 그룹의 "결제 내역" 탭처럼, 그룹 일반 항목이지만 항상 지출로만 작성돼야 하는 경우
  // (일반 거래 저장 경로는 그대로 쓰고 수입/지출/이체 탭만 숨김 — isGroupKind 에는 포함하지 않음)
  const isGroupExpenseKind = kind === 'expense';
  // 그룹 컨텍스트가 있는 특수 kind 전체(그룹/멤버 정보를 먼저 불러와야 함)
  const isGroupKind = isPayment || isDeposit || isPooledExpense || isPooledTransfer;
  const nav = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const editing = !!id;
  const pendingRecurrence = location.state?.pendingRecurrence || null;
  // 정산 탭에서 "입금 완료" 처리 시 넘어오는 사전 입력값(멤버 고정 + 결제 건별 정산 행)
  const presetMemberId = location.state?.presetMemberId ?? null;
  const presetSettleRows = location.state?.presetSettleRows || null;
  // 가계부 페이지의 촬영 버튼으로 미리 고른 영수증 사진(이미 리사이즈된 base64) → 이 화면에서 자동 인식
  const autoReceiptBase64 = location.state?.autoReceiptBase64 || null;
  const autoReceiptMime = location.state?.autoReceiptMime || null;
  // 즐겨찾기 목록에서 고른 템플릿(신규 작성일 때만) — initial 과 동일한 모양이라 그대로 꽂아주면
  // TransactionForm 의 기존 초기화 로직이 그대로 채워준다(날짜는 담겨 있지 않아 오늘 날짜로 들어감).
  // 입금 내역(DepositForm)은 initial 이 있으면 수정 모드로 보므로 initial 대신 favoritePreset 으로 따로 넘긴다.
  // 즐겨찾기 행의 id/user_id/created_at 은 기록의 것이 아니므로 떼어 낸다(남아 있으면 폼이 수정 모드로
  // 오인해 같은 id 의 기록을 덮어쓸 수 있음).
  const stripFavMeta = (fav) => { if (!fav) return null; const { id: _id, user_id: _u, created_at: _c, ...rest } = fav; return rest; };
  const favoritePreset = (!editing && stripFavMeta(location.state?.favorite)) || null;

  const [initial, setInitial] = useState(isDeposit ? null : favoritePreset);
  // 즐겨찾기 선택/복사로 새 내비게이션이 생길 때마다(location.key 가 매번 새로 발급됨) initial 을
  // 명시적으로 다시 맞춰 준다 — 같은 컴포넌트 인스턴스가 재사용되는 경우에도 이전 화면(수정 중이던
  // 기존 기록)의 값이 남아있지 않고 항상 새로 받은 템플릿으로 덮어써지도록 하기 위함.
  useEffect(() => {
    if (!editing && !isDeposit && location.state?.favorite) setInitial(stripFavMeta(location.state.favorite));
  }, [location.key]);
  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(editing);
  const [error, setError] = useState('');
  const formRef = useRef(null);
  const [scanBusy, setScanBusy] = useState(false);
  // 정산 그룹의 일반 결제 내역(생성 시 URL의 group, 수정 시 기존 항목의 group_id)
  const effectiveGroupId = groupId || initial?.group_id || null;
  // 수정 화면(URL에 kind 없음)도 정산 그룹 결제 내역(그룹 지출)이면 지출 고정 — 탭 숨김
  const isGroupExpense = isGroupExpenseKind
    || (editing && !isGroupKind && !!initial?.group_id && initial?.type === 'expense' && isSettlement(group?.category));
  // 그룹 항목 수정 시 그룹 정보가 오기 전에 탭이 잠깐 보였다 사라지지 않도록 그룹 로딩까지 대기
  const waitingGroup = editing && !isGroupKind && !!initial?.group_id && group === null;
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
    db.getGroup(effectiveGroupId).then(({ group, members }) => { setGroup(group); setMembers(members); }).catch(() => setGroup(false));
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
      .then((tx) => setInitial(
        (isPayment || isPooledExpense) ? { ...tx, type: 'expense' }
        : isPooledTransfer ? { ...tx, type: 'transfer', source_name: tx.from_source_name }
        : tx
      ))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [editing, id, isPayment, isDeposit, isPooledExpense, isPooledTransfer]);

  // 수정 화면: 이체 기록에 연결된 수수료 지출 기록(있으면)
  useEffect(() => {
    if (isGroupKind || !editing || !initial || initial.type !== 'transfer') return;
    db.getLinkedFee(initial.id).then((f) => setInitialLinkedFee(f || null)).catch(() => setInitialLinkedFee(null));
  }, [isGroupKind, editing, initial]);

  // 저장 후 이동: 원래 보던 페이지로 돌아감.
  const done = () => nav(location.state?.closeTo ?? -1);

  // 순수 개인 기록(그룹과 무관) 삭제 — 이체면 연결된 수수료 지출도 함께 지움.
  const deleteTx = async () => {
    if (initial?.type === 'transfer' && initialLinkedFee?.id) await db.deleteLinkedFee(initialLinkedFee.id);
    await db.deleteTransaction(initial.id);
    nav(location.state?.closeTo ?? -1);
  };

  // 결제 내역 저장은 subscription_payments 테이블을 사용(일반 거래와 별도)
  const savePayment = async (payload) => {
    const p = {
      date: payload.date, amount: payload.amount, periods: payload.periods,
      category_name: payload.category_name, category_emoji: payload.category_emoji,
      source_id: payload.source_id, source_name: payload.source_name,
      content: payload.content, memo: payload.memo,
      items: payload.items ?? null,
      input_currency: payload.input_currency || '', input_amount: payload.input_amount ?? null, fx_rate: payload.fx_rate ?? null,
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
      splits: payload.aggregateSplit || [], source_name: payload.source_name,
    };
    if (editing) await db.updatePooledFundExpense(id, p);
    else await db.createPooledFundExpense(p);
  };

  // 공금 그룹 이체 내역 저장은 pooled_fund_transfers 테이블을 사용. 기본값은 입력하는 본인이지만
  // 총무는 다른 멤버로 바꿔서 대신 입력할 수 있음(TransactionForm 의 멤버 선택 참고).
  const myGroupMember = members.find((m) => m.user_id === user.id);
  const savePooledTransfer = async (payload) => {
    const p = { date: payload.date, amount: payload.amount, from_source_name: payload.source_name, content: payload.content, memo: payload.memo };
    let transferId = id;
    if (editing) await db.updatePooledFundTransfer(id, p);
    else transferId = await db.createPooledFundTransfer({ group_id: groupId, member_id: Number(payload.transferMemberId), ...p });
    // 보조 화폐로 입력했으면(또는 수정하며 원화로 바꿨으면) 화폐 정보도 저장 — 개인 기록과 동일하게 복원되도록
    if (transferId && (payload.input_currency || editing)) {
      await db.setPooledFundTransferCurrency(transferId, payload.input_currency || '', payload.input_amount ?? null, payload.fx_rate ?? null);
    }
  };

  const isOwner = isGroupKind && group ? group.owner_id === user.id : false;
  const myMember = members.find((m) => m.user_id === user.id && m.role !== 'owner');
  const memberList = members.filter((m) => m.role !== 'owner');
  // 정산 그룹의 일반 결제 내역: 참여 멤버 체크리스트용(자투리 보관용 가상 멤버 '짤짤이'는 제외).
  // 초대를 아직 수락하지 않은 멤버도 정산 대상에는 포함한다(그룹 데이터를 보는 것과는 별개).
  // 공금 그룹의 사용 내역: 전체 멤버가 참여 대상(제외 없음)
  const settlementSplitMembers = isPooledExpense
    ? members
    : (!isGroupKind && isSettlement(group?.category))
      ? members.filter((m) => !isLeftoverName(m.nickname))
      : undefined;
  // 그룹 결제/입금/공금 내역 상단 배지: 그룹 이모지 배경색과 동일(무색이면 회색)
  const groupBadge = group ? { name: group.name, color: group.color || '#e4e2e6' } : undefined;

  // 공금 그룹 이체 내역: 멤버 선택지(총무는 전체 멤버 중 대신 입력 가능, 일반 멤버는 본인만).
  // 기본값은 수정 중이면 기존 멤버, 신규면 입력하는 본인.
  const transferMembers = isPooledTransfer ? (isOwner ? members : (myGroupMember ? [myGroupMember] : [])) : undefined;
  const defaultTransferMemberId = isPooledTransfer ? (initial?.member_id || myGroupMember?.id) : undefined;

  // 상단바 버튼은 개인/그룹 기록 화면 모두 동일: 영수증으로 채우기 + (신규) 즐겨찾기 / (수정) 복사
  const showReceiptBtn = true;
  const showFavoriteBtn = !editing;
  const showCopyBtn = editing && !!initial;
  // 즐겨찾기 목록에서 항목을 고르면 지금 보고 있는 이 기록 화면(그룹 결제/입금 등 URL 그대로)으로
  // 돌아와 채워지도록 현재 경로를 함께 넘긴다.
  const openFavorites = () => nav('/favorites', { state: { returnTo: location.pathname + location.search } });
  // 복사: 지금 보고 있는 기록과 같은 내용으로 같은 종류의 새 기록 화면을 오늘 날짜로 띄운다(즐겨찾기
  // 선택 때와 같은 location.state.favorite 경로 재사용 — 날짜가 안 담겨 있어 자동으로 오늘 날짜가 됨).
  // 저장 전까진 실제로 생성되지 않고, 저장/닫기 시 수정 화면을 건너뛰고 그 전 화면으로 돌아간다(-2).
  const copyToNew = () => {
    if (!initial) return;
    let snapshot;
    if (isDeposit) {
      // 입금 내역은 보는 사람 입장(총대=수입, 멤버=지출)의 분류/원천으로 옮기고, 멤버·회차도 함께 복사
      snapshot = isOwner ? {
        type: 'income', category_name: initial.leader_category_name, category_emoji: initial.leader_category_emoji,
        source_name: initial.deposit_source_name,
      } : {
        type: 'expense', category_name: initial.category_name, category_emoji: initial.category_emoji,
        source_name: initial.source_name,
      };
      snapshot = { ...snapshot, amount: initial.amount, content: initial.content, memo: initial.memo, member_id: initial.member_id, periods: initial.periods };
    } else {
      snapshot = {
        type: initial.type, amount: initial.amount,
        category_id: initial.category_id, category_name: initial.category_name,
        category_emoji: initial.category_emoji, category_color: initial.category_color,
        source_id: initial.source_id, source_name: initial.source_name,
        to_source_id: initial.to_source_id, to_source_name: initial.to_source_name,
        content: initial.content, memo: initial.memo, items: initial.items || null,
        periods: initial.periods, member_id: initial.member_id,
      };
    }
    // 같은 종류의 신규 작성 화면: 그룹 특수 kind 는 URL 그대로, 그룹 일반 항목은 그 그룹으로
    // (정산 그룹 결제 내역은 지출 고정), 개인 기록은 /new
    let path = '/new';
    if (isGroupKind || isGroupExpenseKind) path = `/new${location.search}`;
    else if (initial.group_id) path = `/new?group=${initial.group_id}${isSettlement(group?.category) ? '&kind=expense' : ''}`;
    nav(path, { state: { favorite: snapshot, toast: '복사되었습니다', closeTo: -2 } });
  };

  return (
    <div style={{ padding: '44px 0 32px' }}>
      <div className="simple-topbar flat">
        <button className="tb-icon-btn" onClick={() => nav(location.state?.closeTo ?? -1)} aria-label="닫기">
          <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" /></svg>
        </button>
        <div className="title">{editing ? '기록 수정' : '기록'}</div>
        {(showReceiptBtn || showFavoriteBtn || showCopyBtn) && (
          <div className="topbar-right" style={{ display: 'flex', gap: 8 }}>
            {showFavoriteBtn && (
              <button type="button" className="tb-icon-btn" onClick={openFavorites} aria-label="즐겨찾기">
                <svg width="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </button>
            )}
            {showCopyBtn && (
              <button type="button" className="tb-icon-btn" onClick={copyToNew} aria-label="복사">
                <svg width="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              </button>
            )}
            {showReceiptBtn && (
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
            )}
          </div>
        )}
      </div>

      <div style={{ padding: '6px 0 0' }}>
        {(loading || waitingGroup) ? (
          <Spinner />
        ) : error ? (
          <div className="empty">{error}</div>
        ) : isDeposit ? (
          <DepositForm
            key={location.key}
            ref={formRef} onScanBusyChange={setScanBusy}
            favoritePreset={favoritePreset} autoToast={location.state?.toast}
            initial={initial} sub={sub} cats={cats} incomeCats={incomeCats} sources={sources}
            members={isOwner ? memberList : (myMember ? [myMember] : [])} recentExpenses={recentExpenses}
            isOwner={isOwner} onSave={saveDeposit} onSaved={done}
            onDelete={editing ? (async () => { await db.deleteDeposit(initial.id); done(); }) : undefined}
            defaultCategoryName={isSettlement(group?.category) ? '정산' : '구독'}
            showPeriods={!isSettlement(group?.category)}
            groupName={group?.name || ''}
            groupBadge={groupBadge}
            presetMemberId={presetMemberId}
            presetSettleRows={presetSettleRows}
          />
        ) : (
          <TransactionForm
            key={location.key}
            ref={formRef} onScanBusyChange={setScanBusy}
            initial={initial} groupId={(isPayment || isPooledExpense || isPooledTransfer) ? null : groupId} onSaved={done} onClose={() => nav(-1)}
            fixedType={(isPayment || isPooledExpense || isGroupExpense) ? 'expense' : isPooledTransfer ? 'transfer' : undefined}
            initialPendingRecurrence={pendingRecurrence}
            defaultCategoryName={isPayment ? (isSettlement(group?.category) ? '정산' : '구독') : undefined}
            defaultAmount={isPayment ? sub?.billing_amount : undefined}
            defaultContentTemplate={isPayment ? sub?.payment_content_template : isPooledTransfer ? `${group?.name || ''} 입금` : undefined}
            defaultTransferToName={isPooledTransfer ? sub?.deposit_source_name : undefined}
            fixedSourceName={isPooledExpense ? sub?.deposit_source_name : undefined}
            transferMembers={transferMembers}
            defaultTransferMemberId={defaultTransferMemberId}
            onSubmit={isPooledExpense ? savePooledExpense : isPooledTransfer ? savePooledTransfer : (isPayment ? savePayment : undefined)}
            showPeriods={isPayment && isSubscription(group?.category)}
            qtyLabel={isPayment && isSubscription(group?.category) ? '회차' : '수량'}
            settlementMembers={settlementSplitMembers}
            initialSettlementSplit={editing ? initialSplit : undefined}
            initialLinkedFee={editing ? initialLinkedFee : undefined}
            groupBadge={(isPayment || effectiveGroupId) ? groupBadge : undefined}
            autoReceiptBase64={autoReceiptBase64}
            autoReceiptMime={autoReceiptMime}
            autoToast={location.state?.toast}
            onDelete={(!groupId && editing) ? deleteTx : undefined}
          />
        )}
      </div>
    </div>
  );
}
