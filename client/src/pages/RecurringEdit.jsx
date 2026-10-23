import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import { isSettlement } from '../lib/format.js';
import TransactionForm from '../components/TransactionForm.jsx';
import Spinner from '../components/Spinner.jsx';
import { DepositForm } from './SubscriptionGroup.jsx';
import { PeriodEditor } from './RecurringManage.jsx';

// "반복 수정" — 반복으로 앞으로 자동 등록될 내용(분류/원천/내용/항목/금액/메모 등)을 기록 폼으로 수정.
// 규칙(recurring_rules)만 바뀌고, 이미 등록된 내역은 그대로 둔다. 날짜 칸 자리에는 "반복 주기" 편집을 둔다.
// 일반 기록·그룹 결제는 개인 기록 폼(TransactionForm), 그룹 입금은 입금 폼(DepositForm)을 그대로 쓴다.
const currencyPatch = (p) => ({
  input_currency: p.input_currency || '',
  input_amount: p.input_currency ? (p.input_amount ?? null) : null,
  fx_rate: p.input_currency ? (p.fx_rate ?? null) : null,
});

export default function RecurringEdit() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const [rule, setRule] = useState(null);
  const [error, setError] = useState('');
  // 입금 반복 전용 부가 데이터
  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [sub, setSub] = useState(null);
  const [cats, setCats] = useState([]);
  const [incomeCats, setIncomeCats] = useState([]);
  const [sources, setSources] = useState({ tree: [], flat: [] });

  useEffect(() => {
    db.getRecurringRule(Number(id)).then(setRule).catch((e) => setError(e.message));
  }, [id]);

  const isDeposit = rule?.target === 'subscription_deposit';
  useEffect(() => {
    if (!rule?.group_id) return;
    db.getGroup(rule.group_id).then(({ group: g, members: ms }) => { setGroup(g); setMembers(ms); }).catch(() => {});
    if (!isDeposit) return;
    db.getSubscription(rule.group_id).then(setSub).catch(() => {});
    db.listCategories('expense').then(setCats).catch(() => {});
    db.listCategories('income').then(setIncomeCats).catch(() => {});
    db.listSources().then(setSources).catch(() => {});
  }, [rule?.group_id, isDeposit]);

  const done = () => nav(-1);
  const saveRule = async (patch) => { await db.updateRecurringRule(rule.id, patch); };

  // 일반 기록 · 그룹 결제: 기록 폼의 저장 내용 → 규칙 칸
  const onSubmitTx = async (payload) => {
    const items = Array.isArray(payload.items) && payload.items.length && !payload.items.some((it) => it?.targetId != null) ? payload.items : null;
    await saveRule({
      type: rule.target === 'subscription_payment' ? 'expense' : payload.type,
      amount: payload.amount,
      category_id: payload.category_id || null, category_name: payload.category_name || '',
      category_emoji: payload.category_emoji || '', category_color: payload.category_color || '',
      source_id: payload.source_id || null, source_name: payload.source_name || '',
      ...(payload.type === 'transfer' ? { to_source_id: payload.to_source_id || null, to_source_name: payload.to_source_name || '' } : {}),
      content: (payload.content || '').trim(), memo: (payload.memo || '').trim(),
      items, ...currencyPatch(payload),
      ...(payload.exclude_performance !== undefined ? { exclude_performance: !!payload.exclude_performance } : {}),
    });
  };

  // 그룹 입금: 입금 폼의 저장 내용 → 규칙 칸(멤버/총대 양쪽 분류·원천)
  const onSaveDeposit = async (p) => {
    await saveRule({
      amount: p.amount,
      category_name: p.category_name || '', category_emoji: p.category_emoji || '', source_name: p.source_name || '',
      leader_category_name: p.leader_category_name || '', leader_category_emoji: p.leader_category_emoji || '',
      deposit_source_name: p.deposit_source_name || '',
      content: (p.content || '').trim(), memo: (p.memo || '').trim(),
      ...currencyPatch(p),
      ...(p.exclude_performance !== undefined ? { exclude_performance: !!p.exclude_performance } : {}),
    });
  };

  const header = (
    <div className="simple-topbar flat">
      <button className="tb-icon-btn" onClick={done} aria-label="닫기">
        <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" /></svg>
      </button>
      <div className="title">반복 수정</div>
    </div>
  );

  // 날짜 칸 대신 반복 상세 모달과 같은 "반복 주기" 편집(바꾸는 즉시 저장)
  const periodField = rule ? (
    <PeriodEditor
      rule={rule}
      onSave={async (patch) => {
        try { await db.updateRecurringRule(rule.id, patch); setRule((r) => ({ ...r, ...patch })); } catch (e) { alert(e.message); }
      }}
      rowStyle={{ padding: '6px 0', gap: 12 }}
      labelStyle={{ fontSize: 13.5, fontWeight: 400, color: '#8b8798' }}
    />
  ) : null;

  let body;
  if (error) body = <div className="empty">{error}</div>;
  else if (!rule || (rule.group_id && !group)) body = <Spinner />;
  else if (isDeposit) {
    const isOwner = group.owner_id === user.id;
    const member = members.find((m) => m.id === rule.member_id);
    const initial = {
      id: rule.id, member_id: rule.member_id, member: { nickname: member?.nickname },
      date: rule.start_date, amount: rule.amount, periods: 1,
      category_name: rule.category_name, category_emoji: rule.category_emoji, source_name: rule.source_name,
      leader_category_name: rule.leader_category_name, leader_category_emoji: rule.leader_category_emoji,
      deposit_source_name: rule.deposit_source_name, leader_settlement_target_id: null,
      content: rule.content, memo: rule.memo, items: null,
      input_currency: rule.input_currency, input_amount: rule.input_amount, fx_rate: rule.fx_rate,
      exclude_performance: rule.exclude_performance,
    };
    body = (
      <DepositForm
        templateMode periodField={periodField}
        initial={initial} sub={sub} cats={cats} incomeCats={incomeCats} sources={sources}
        members={member ? [member] : []} recentExpenses={[]}
        isOwner={isOwner} onSave={onSaveDeposit} onSaved={done}
        defaultCategoryName={isSettlement(group.category) ? '정산' : '구독'}
        showPeriods={false} groupName={group.name || ''}
        groupBadge={{ name: group.name, color: group.color || '#e4e2e6' }}
      />
    );
  } else {
    const isPayment = rule.target === 'subscription_payment';
    const initial = {
      id: rule.id, type: isPayment ? 'expense' : rule.type, date: rule.start_date, amount: rule.amount,
      category_id: rule.category_id, category_name: rule.category_name, category_emoji: rule.category_emoji, category_color: rule.category_color,
      source_id: rule.source_id, source_name: rule.source_name, to_source_id: rule.to_source_id, to_source_name: rule.to_source_name,
      content: rule.content, memo: rule.memo, items: rule.items,
      input_currency: rule.input_currency, input_amount: rule.input_amount, fx_rate: rule.fx_rate,
      exclude_performance: rule.exclude_performance,
    };
    body = (
      <TransactionForm
        templateMode periodField={periodField}
        initial={initial} onSubmit={onSubmitTx} onSaved={done} onClose={done}
        groupId={!isPayment ? (rule.group_id || null) : null}
        fixedType={rule.group_id ? (isPayment ? 'expense' : rule.type) : undefined}
        groupBadge={group ? { name: group.name, color: group.color || '#e4e2e6' } : undefined}
      />
    );
  }

  return (
    <div style={{ padding: '44px 0 32px' }}>
      {header}
      <div style={{ padding: '6px 0 0' }}>{body}</div>
    </div>
  );
}
