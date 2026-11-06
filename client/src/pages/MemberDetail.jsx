import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import { fmtNum, dotDate, monthPillLabel } from '../lib/format.js';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';
import FxAmount from '../components/FxAmount.jsx';
import { tileBg, formatDate, DayCardRow } from '../components/TransactionList.jsx';
import { groupByMonthThenDate, memberNextDepositDate, ownerNextPaymentDate } from './SubscriptionGroup.jsx';
import { RuleCard, ruleSubLine } from './RecurringManage.jsx';

export default function MemberDetail() {
  const { id, memberId } = useParams();
  const gid = Number(id);
  const mid = Number(memberId);
  const nav = useNavigate();
  const { user } = useAuth();

  const [group, setGroup] = useState(null);
  const [member, setMember] = useState(null);
  const [schedule, setSchedule] = useState([]);   // 그룹 결제/입금 반복 일정(다음 입금일 계산)
  const [rules, setRules] = useState(null);       // 이 멤버의 정기 입금 설정(총대/본인만) · 총대는 정기 결제 설정
  const [deposits, setDeposits] = useState([]);   // 멤버: 입금 내역 / 총대: 그룹 결제 내역
  const [openId, setOpenId] = useState(null);    // 입금 내역: 한 번에 하나의 카드만 스와이프로 열려 있도록
  const [incomeCats, setIncomeCats] = useState([]);
  const [expenseCats, setExpenseCats] = useState([]);

  const loadGroup = useCallback(() => {
    db.getGroup(gid).then(({ group, members }) => {
      setGroup(group);
      const m = members.find((x) => x.id === mid);
      if (!m) { alert('멤버를 찾을 수 없습니다.'); nav(`/groups/${gid}`); return; }
      setMember(m);
      db.listMemberRules(m, gid).then(setRules).catch(() => setRules([]));
    }).catch((e) => { alert(e.message); nav(`/groups/${gid}`); });
  }, [gid, mid, nav]);
  const ownerMode = member?.role === 'owner';
  const loadDeps = useCallback(() => {
    if (!member) return;
    if (member.role === 'owner') db.listPayments(gid).then(setDeposits).catch(() => setDeposits([]));
    else db.listDeposits(gid).then((all) => setDeposits(all.filter((d) => d.member_id === mid))).catch(() => setDeposits([]));
  }, [gid, mid, member?.role]);

  useEffect(() => {
    loadGroup();
    db.listGroupRecurringSchedule(gid).then(setSchedule).catch(() => setSchedule([]));
  }, [loadGroup, gid]);
  useEffect(() => { loadDeps(); }, [loadDeps]);
  useEffect(() => {
    db.listCategories('income').then(setIncomeCats).catch(() => {});
    db.listCategories('expense').then(setExpenseCats).catch(() => {});
  }, []);

  if (!group || !member) return <Spinner />;

  const isOwner = group.owner_id === user.id;
  // 기록/반복 수정 권한: 멤버 입금은 총대와 그 멤버 본인, 총대 결제는 총대만
  const canEditDep = ownerMode ? isOwner : (isOwner || member.user_id === user.id);
  const noun = ownerMode ? '결제' : '입금';

  const cum = deposits.reduce((s, d) => s + Number(d.amount), 0);
  const last = deposits.length ? deposits.map((d) => d.date).sort().slice(-1)[0] : null;
  // 구독 현황 탭과 같은 계산(memberNextDepositDate)을 그대로 사용
  const nextFn = ownerMode ? ownerNextPaymentDate : memberNextDepositDate;
  const nextDue = nextFn(member, schedule);

  const delRule = async (r) => {
    if (!confirm(`'${r.content || '반복'}' 반복을 해제할까요? (이미 기록된 내역은 그대로 남습니다)`)) return;
    try { await db.deleteRecurringRule(r.id); setRules((prev) => prev.filter((x) => x.id !== r.id)); } catch (e) { alert(e.message); }
  };
  const delDeposit = async (d) => {
    if (!confirm(`${noun} 내역을 삭제할까요? (연결된 가계부 항목도 함께 삭제됩니다)`)) return;
    try { await (ownerMode ? db.deletePayment(d.id) : db.deleteDeposit(d.id)); loadDeps(); } catch (e) { alert(e.message); }
  };

  return (
    <div style={{ padding: '44px 0 12px' }}>
      <PageHeader
        flat
        title={(
          // 닉네임 오른쪽: 외부 멤버면 회색 "외부" 배지, 계정 멤버면 가는 회색 "@아이디"
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, maxWidth: '100%', verticalAlign: 'middle' }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{member.nickname}</span>
            {ownerMode ? (
              <span style={{ flex: 'none', fontSize: 10.5, fontWeight: 700, letterSpacing: 0, color: '#FF3B5C', background: 'linear-gradient(90deg,#FDE2E8,#FFE9D6)', borderRadius: 999, padding: '3px 8px' }}>총대</span>
            ) : !member.is_account ? (
              <span style={{ flex: 'none', fontSize: 10.5, fontWeight: 700, letterSpacing: 0, color: 'var(--k-tx-8b8798)', background: 'var(--k-bg-efeef2)', borderRadius: 999, padding: '3px 8px' }}>외부</span>
            ) : member.username ? (
              <span style={{ flex: 'none', fontSize: 13, fontWeight: 400, letterSpacing: 0, color: 'var(--k-tx-a29ead)' }}>@{member.username}</span>
            ) : null}
          </span>
        )}
      />

      {/* 정기 입금 설정(반복) — 총무/총대와 멤버 본인만. 없으면 점선 영역 + 버튼 */}
      {canEditDep && rules && (rules.length === 0 ? (
        <div style={{ border: '1.5px dashed var(--k-bd-cfccd4)', borderRadius: 18, padding: '20px 16px 18px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <button
            type="button" aria-label={`정기 ${noun} 설정`} onClick={() => nav(`/groups/${gid}/member/${mid}/deposit-rule`)}
            style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'var(--k-bg-efeef2)', color: 'var(--k-tx-a29ead)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}
          >
            <svg width="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          </button>
          <div style={{ fontSize: 12, color: 'var(--k-tx-a29ead)', textAlign: 'center', lineHeight: 1.5, whiteSpace: 'pre-line' }}>
            {`정기 ${noun} 정보를 설정해 주세요.\n설정에 따라 ${noun} 기록이 자동 생성됩니다.`}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rules.map((r) => {
            const rr = { ...r, group: { owner_id: group.owner_id } };
            return (
              <div key={r.id} className="tx-daygroup">
                <RuleCard
                  r={rr} userId={user.id} subLine={ruleSubLine(rr, user.id)}
                  isOpen={openId === `r${r.id}`} onOpenChange={(open) => setOpenId(open ? `r${r.id}` : null)}
                  onTap={() => nav(`/settings/recurring/${r.id}/edit`)} onDelete={() => delRule(r)}
                />
              </div>
            );
          })}
        </div>
      ))}

      {/* 요약(구독 현황 탭의 총 금액/사용 금액/잔여 금액 영역과 같은 UI) */}
      <div className="summary-card" style={{ marginTop: 14 }}>
        <div className="col"><div className="lbl">누적 {noun}액</div><div className={`val ${ownerMode ? 'expense' : 'income'}`}>{fmtNum(cum)}</div></div>
        <div className="divider" />
        <div className="col"><div className="lbl">마지막 {noun}일</div><div className="val">{last ? dotDate(last) : '-'}</div></div>
        <div className="divider" />
        <div className="col"><div className="lbl">다음 {noun}일</div><div className="val">{nextDue ? dotDate(nextDue) : '-'}</div></div>
      </div>
      {isOwner && member.memo && (
        <div className="small muted" style={{ margin: '10px 4px 0' }}>
          {isOwner && member.memo && <div style={{ marginTop: 2 }}>📝 {member.memo}</div>}
        </div>
      )}

      {/* 입금 내역 — 가계부 페이지와 동일한 카드 스타일(왼쪽으로 스와이프 시 삭제 버튼) */}
      {deposits.length === 0 ? <div className="empty">{noun} 내역이 없습니다.</div> : groupByMonthThenDate(deposits).map(([mo, dateGroups]) => (
        <div key={mo}>
          <div className="month-pill-wrap" style={{ margin: '16px 0 8px' }}><span className="month-pill">{monthPillLabel(mo)}</span></div>
          {dateGroups.map(([date, items]) => {
            const net = items.reduce((s, d) => s + Number(d.amount), 0);
            return (
              <div key={date}>
                <div style={{ margin: '18px 0 9px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px 0 8px' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--k-tx-191722)' }}>{formatDate(date)}</span>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--k-tx-8b8798)' }}>{ownerMode ? '-' : '+'}{fmtNum(net)}</span>
                </div>
                <div className="tx-daygroup">
                  {items.map((d, i) => {
                    const leaderView = isOwner && !ownerMode;
                    const tileEmoji = leaderView ? d.leader_category_emoji : d.category_emoji;
                    const tileCat = leaderView ? d.leader_category_name : d.category_name;
                    const tileColor = (leaderView ? incomeCats : expenseCats).find((c) => c.name === tileCat)?.color || '';
                    return (
                      <DayCardRow
                        key={d.id} index={i} count={items.length}
                        isOpen={openId === d.id} onOpenChange={(open) => setOpenId(open ? d.id : null)}
                        clickable={canEditDep || ownerMode} onTap={() => (canEditDep || ownerMode) && nav(`/tx/${d.id}?group=${gid}&kind=${ownerMode ? 'payment' : 'deposit'}`)}
                        onDelete={canEditDep ? () => delDeposit(d) : undefined}
                      >
                          <span className="tx-tile" style={{ background: tileColor || (tileEmoji ? tileBg(tileCat) : 'var(--k-bg-f2f1f5)') }}>{tileEmoji || '💸'}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="tx-row-title">
                              <span className="ttext">
                                {d.content || d.category_name || noun}
                                {' '}<span className="tag-periods">{d.periods} 회분</span>
                              </span>
                            </div>
                            <div className="tx-row-sub">{[tileCat, ownerMode ? d.source_name : d.deposit_source_name].filter(Boolean).join(' · ') || '—'}</div>
                          </div>
                          {/* 보조 화폐로 입력한 기록은 보조 화폐 금액 아래 주 화폐 금액(가계부·결제 내역 카드와 동일) */}
                          <FxAmount row={d} sign={ownerMode ? '-' : '+'} color={ownerMode ? 'var(--expense)' : 'var(--income)'} />
                      </DayCardRow>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ))}

    </div>
  );
}
