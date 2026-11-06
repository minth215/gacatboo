import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import { today } from '../lib/format.js';
import { nextRuleDate } from '../lib/recurrence.js';
import Spinner from '../components/Spinner.jsx';
import { DepositForm } from './SubscriptionGroup.jsx';
import { PeriodEditor } from './RecurringManage.jsx';

// 구독 그룹 > 구독 현황 > 멤버 상세 > "정기 입금 설정".
// 반복 수정 페이지와 같은 입금 폼(DepositForm, 날짜 칸 자리에 반복 주기)으로 내용·멤버·주기·분류·원천·
// 내용/회차/금액을 미리 채워 보여 주고, "저장"하면 입금 기록 없이 반복 규칙만 만든다.
// 이후 회차(시작일 포함)는 서버가 자동으로 입금 내역을 만든다.
export default function MemberDepositRule() {
  const { id, memberId } = useParams();
  const gid = Number(id);
  const mid = Number(memberId);
  const nav = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [period, setPeriod] = useState(() => {
    const t = today();
    return { start_date: t, freq_unit: 'month', freq_interval: 1, weekdays: [], label: '매월', business_day_rule: 'none' };
  });

  useEffect(() => {
    Promise.all([
      db.getGroup(gid), db.getSubscription(gid).catch(() => null),
      db.listCategories('expense'), db.listCategories('income'), db.listSources(),
      db.listDeposits(gid).catch(() => []),
    ]).then(([{ group, members }, sub, cats, incomeCats, sources, deps]) => {
      const member = members.find((m) => m.id === mid);
      if (!member) { alert('멤버를 찾을 수 없습니다.'); nav(-1); return; }
      const isOwner = group.owner_id === user.id;
      if (!isOwner && member.user_id !== user.id) { alert('설정 권한이 없습니다.'); nav(-1); return; }
      setData({ group, member, sub, cats, incomeCats, sources, deps: deps.filter((d) => d.member_id === mid), isOwner });
    }).catch((e) => { alert(e.message); nav(-1); });
  }, [gid, mid, user.id, nav]);

  const done = () => nav(-1);

  let body;
  if (!data) body = <Spinner />;
  else {
    const { group, member, sub, cats, incomeCats, sources, deps, isOwner } = data;
    // 금액 기본값: 마지막 입금의 1회분 금액
    const lastDep = [...deps].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id))[0];
    const lastAmt = lastDep ? Math.round(Number(lastDep.amount) / Math.max(Number(lastDep.periods) || 1, 1)) : '';
    // 멤버 본인이 설정할 때 원천 기본값 = 그룹에 지정한 내 출금 수단
    const myWithdraw = !isOwner && member.withdraw_source_id ? sources.flat.find((s) => s.id === member.withdraw_source_id) : null;
    const memberCat = cats.find((c) => c.name === '구독');
    const settleCat = incomeCats.find((c) => c.name === '정산');
    const initial = {
      id: null, member_id: member.id, member: { nickname: member.nickname },
      date: today(), amount: lastAmt, periods: 1,
      category_name: '구독', category_emoji: memberCat?.emoji || '', source_name: myWithdraw?.name || '',
      leader_category_name: '정산', leader_category_emoji: settleCat?.emoji || '',
      deposit_source_name: sub?.deposit_source_name || '', leader_settlement_target_id: null,
      content: group.name || '', memo: '', items: null,
    };
    const onSave = async (p) => {
      // 시작일이 이미 지났으면 같은 주기의 다음 회차(오늘 포함)를 시작일로
      const t = today();
      const start = period.start_date < t ? (nextRuleDate(period, t) || t) : period.start_date;
      await db.createMemberDepositRule({
        ...p, group_id: gid, member_id: member.id, amount: p.amount,
        start_date: start, freq_unit: period.freq_unit, freq_interval: period.freq_interval,
        weekdays: period.weekdays || [], label: period.label, business_day_rule: period.business_day_rule || 'none',
      }, user.id);
    };
    body = (
      <DepositForm
        templateMode submitLabel="저장"
        periodField={(
          <PeriodEditor
            rule={period}
            onSave={(patch) => setPeriod((r) => ({ ...r, ...patch }))}
            rowStyle={{ padding: '6px 0', gap: 12 }}
            labelStyle={{ fontSize: 13.5, fontWeight: 400, color: 'var(--k-tx-8b8798)' }}
          />
        )}
        initial={initial} sub={sub} cats={cats} incomeCats={incomeCats} sources={sources}
        members={[member]} recentExpenses={[]}
        isOwner={isOwner} onSave={onSave} onSaved={done}
        defaultCategoryName="구독" showPeriods groupName={group.name || ''}
        groupBadge={{ name: group.name, color: group.color || 'var(--k-tx-e4e2e6)' }}
      />
    );
  }

  return (
    <div style={{ padding: '44px 0 32px' }}>
      <div className="simple-topbar flat">
        <button className="tb-icon-btn" onClick={done} aria-label="닫기">
          <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" /></svg>
        </button>
        <div className="title">정기 입금 설정</div>
      </div>
      <div style={{ padding: '6px 0 0' }}>{body}</div>
    </div>
  );
}
