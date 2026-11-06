import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import { today } from '../lib/format.js';
import { alignStartDate } from '../lib/recurrence.js';
import Spinner from '../components/Spinner.jsx';
import ConfirmModal from '../components/ConfirmModal.jsx';
import TransactionForm from '../components/TransactionForm.jsx';
import { DepositForm } from './SubscriptionGroup.jsx';
import { PeriodEditor } from './RecurringManage.jsx';

// 구독 그룹 > 구독 현황 > 멤버 상세 > "정기 입금 설정" / 총대 상세 > "정기 결제 설정".
// 반복 수정 페이지와 같은 기록 폼(날짜 칸 자리에 반복 주기)으로 내용·멤버·주기·분류·원천·금액을 미리 채워
// 보여 주고, "저장"하면 기록 없이 반복 규칙만 만든다. 반복 시작일 = 멤버의 그룹 시작일자(고른 일자 유지),
// 종료일 = 멤버 종료일자. 기록이 없는 지난 회차가 있으면 일괄 생성할지 묻는다.
export default function MemberDepositRule() {
  const { id, memberId } = useParams();
  const gid = Number(id);
  const mid = Number(memberId);
  const nav = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [period, setPeriod] = useState(null);
  const [ask, setAsk] = useState(null); // { n, resolve }
  const askRef = useRef(null);

  useEffect(() => {
    Promise.all([
      db.getGroup(gid), db.getSubscription(gid).catch(() => null),
      db.listCategories('expense'), db.listCategories('income'), db.listSources(),
      db.listDeposits(gid).catch(() => []), db.listPayments(gid).catch(() => []),
    ]).then(([{ group, members }, sub, cats, incomeCats, sources, deps, pays]) => {
      const member = members.find((m) => m.id === mid);
      if (!member) { alert('멤버를 찾을 수 없습니다.'); nav(-1); return; }
      const isOwner = group.owner_id === user.id;
      const ownerMode = member.role === 'owner';
      if (ownerMode ? !isOwner : (!isOwner && member.user_id !== user.id)) { alert('설정 권한이 없습니다.'); nav(-1); return; }
      const memberStart = member.start_date || group.start_date || today();
      setPeriod({ start_date: memberStart, end_date: member.end_date || null, freq_unit: 'month', freq_interval: 1, weekdays: [], label: '매월', business_day_rule: 'none' });
      setData({
        group, member, sub, cats, incomeCats, sources, isOwner, ownerMode, memberStart,
        records: ownerMode ? pays : deps.filter((d) => d.member_id === mid),
      });
    }).catch((e) => { alert(e.message); nav(-1); });
  }, [gid, mid, user.id, nav]);

  const done = () => nav(-1);

  // 저장 직전: 시작일 정리 + 지난 회차 일괄 생성 여부
  const prepare = async (p) => {
    const anchor = Number(period.anchor_day) || Number(period.start_date.slice(8, 10));
    const start = alignStartDate(period.start_date, data.memberStart, period.freq_unit, period.freq_interval, anchor);
    const rule = { ...period, start_date: start, end_date: data.member.end_date || null, anchor_day: anchor };
    // 생성될 개수는 서버에서 실제 규칙(영업일 보정·이미 기록된 달 건너뛰기·선입금)대로 계산
    const n = start <= today() ? await db.previewBackfill({
      target: data.ownerMode ? 'subscription_payment' : 'subscription_deposit', group_id: gid,
      member_id: data.ownerMode ? null : mid, type: data.ownerMode ? 'expense' : 'income',
      category_name: p.category_name || '', content: (p.content || '').trim(), amount: p.amount,
      start_date: rule.start_date, end_date: rule.end_date, freq_unit: rule.freq_unit, freq_interval: rule.freq_interval,
      weekdays: rule.weekdays || [], business_day_rule: rule.business_day_rule || 'none', generate_on_start: true, anchor_day: rule.anchor_day,
    }) : 0;
    let backfill = false;
    if (n > 0) backfill = await new Promise((resolve) => { askRef.current = resolve; setAsk({ n }); });
    return {
      start_date: rule.start_date, end_date: rule.end_date, freq_unit: rule.freq_unit, freq_interval: rule.freq_interval,
      weekdays: rule.weekdays || [], label: rule.label, business_day_rule: rule.business_day_rule || 'none', anchor_day: rule.anchor_day, backfill,
    };
  };
  const answer = (v) => { setAsk(null); askRef.current?.(v); };

  let body;
  if (!data || !period) body = <Spinner />;
  else {
    const { group, member, sub, cats, incomeCats, sources, isOwner, ownerMode, records } = data;
    const periodField = (
      <PeriodEditor
        rule={period}
        onSave={(patch) => setPeriod((r) => ({ ...r, ...patch }))}
        rowStyle={{ padding: '6px 0', gap: 12 }}
        labelStyle={{ fontSize: 13.5, fontWeight: 400, color: 'var(--k-tx-8b8798)' }}
      />
    );
    const groupBadge = { name: group.name, color: group.color || 'var(--k-tx-e4e2e6)' };
    // 금액 기본값: 마지막 기록의 1회분 금액
    const last = [...records].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id))[0];
    const lastAmt = last ? Math.round(Number(last.amount) / Math.max(Number(last.periods) || 1, 1)) : '';
    const subCat = cats.find((c) => c.name === '구독');

    if (ownerMode) {
      const initial = {
        type: 'expense', date: today(), amount: lastAmt,
        category_id: subCat?.id || null, category_name: '구독', category_emoji: subCat?.emoji || '', category_color: subCat?.color || '',
        source_id: last?.source_id || null, source_name: last?.source_name || '',
        content: group.name || '', memo: '',
      };
      const onSubmit = async (payload) => {
        const extra = await prepare(payload);
        const items = Array.isArray(payload.items) && payload.items.length && !payload.items.some((it) => it?.targetId != null) ? payload.items : null;
        await db.createGroupPaymentRule({ ...payload, items, group_id: gid, ...extra }, user.id);
      };
      body = (
        <TransactionForm
          templateMode periodField={periodField}
          initial={initial} onSubmit={onSubmit} onSaved={done} onClose={done}
          fixedType="expense" groupBadge={groupBadge}
        />
      );
    } else {
      // 멤버 본인이 설정할 때 원천 기본값 = 그룹에 지정한 내 출금 수단.
      // 총대가 대신 설정하면 멤버 쪽 원천은 비워 두고, 자동 생성 시 멤버의 출금 수단으로 채워진다.
      const myWithdraw = !isOwner && member.withdraw_source_id ? sources.flat.find((s) => s.id === member.withdraw_source_id) : null;
      const settleCat = incomeCats.find((c) => c.name === '정산');
      const initial = {
        id: null, member_id: member.id, member: { nickname: member.nickname },
        date: today(), amount: lastAmt, periods: 1,
        category_name: '구독', category_emoji: subCat?.emoji || '', source_name: myWithdraw?.name || '',
        leader_category_name: '정산', leader_category_emoji: settleCat?.emoji || '',
        deposit_source_name: sub?.deposit_source_name || '', leader_settlement_target_id: null,
        content: group.name || '', memo: '', items: null,
      };
      const onSave = async (p) => {
        const extra = await prepare(p);
        await db.createMemberDepositRule({ ...p, group_id: gid, member_id: member.id, ...extra }, user.id);
      };
      body = (
        <DepositForm
          templateMode submitLabel="저장" periodField={periodField}
          initial={initial} sub={sub} cats={cats} incomeCats={incomeCats} sources={sources}
          members={[member]} recentExpenses={[]}
          isOwner={isOwner} onSave={onSave} onSaved={done}
          defaultCategoryName="구독" showPeriods groupName={group.name || ''} groupBadge={groupBadge}
        />
      );
    }
  }

  return (
    <div style={{ padding: '44px 0 32px' }}>
      <div className="simple-topbar flat">
        <button className="tb-icon-btn" onClick={done} aria-label="닫기">
          <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" /></svg>
        </button>
        <div className="title">{data?.ownerMode ? '정기 결제 설정' : '정기 입금 설정'}</div>
      </div>
      <div style={{ padding: '6px 0 0' }}>{body}</div>
      {ask && (
        <ConfirmModal
          message={`과거의 반복 내역 ${ask.n}개를 일괄 생성할까요?`}
          onYes={() => answer(true)} onNo={() => answer(false)}
        />
      )}
    </div>
  );
}
