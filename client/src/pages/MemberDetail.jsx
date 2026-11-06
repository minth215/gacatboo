import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import { fmtNum, dotDate, monthPillLabel } from '../lib/format.js';
import Modal from '../components/Modal.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';
import { tileBg, formatDate, DayCardRow } from '../components/TransactionList.jsx';
import { groupByMonthThenDate, memberNextDepositDate, ownerNextPaymentDate } from './SubscriptionGroup.jsx';
import { periodDetailLabel } from '../lib/recurrence.js';

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
  const [editor, setEditor] = useState(null);    // 카드 수정
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
  const autoNext = nextFn({ ...member, next_due_override: null }, schedule);

  const openEdit = () => setEditor({
    nickname: member.nickname, start_date: member.start_date || '', end_date: member.end_date || '',
    contact: member.contact || '', memo: member.memo || '', next_due_override: member.next_due_override || '',
  });
  const saveEdit = async () => {
    if (!editor.nickname.trim()) return alert('닉네임을 입력하세요.');
    try { await db.updateMember(mid, gid, editor); setEditor(null); loadGroup(); loadDeps(); }
    catch (e) { alert(e.message); }
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
        right={isOwner && (
        <button className="tb-icon-btn" onClick={openEdit} aria-label="멤버 정보 수정">
          <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </button>
      )} />

      {/* 정기 입금 설정(반복) — 총무/총대와 멤버 본인만. 없으면 점선 영역 + 버튼 */}
      {canEditDep && rules && (rules.length === 0 ? (
        <div style={{ marginTop: 14, border: '1.5px dashed var(--k-bd-cfccd4)', borderRadius: 18, padding: '20px 16px 18px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
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
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rules.map((r) => {
            const mine = canEditDep; // 총대·해당 멤버 모두 수정 가능(총대 결제는 총대만)
            return (
              <button
                key={r.id} type="button" disabled={!mine}
                onClick={() => mine && nav(`/settings/recurring/${r.id}/edit`)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', border: 'none', borderRadius: 18, background: 'var(--k-bg-fff)', boxShadow: '0 4px 16px rgb(var(--k-sh) / calc(.05 * var(--k-sha)))', padding: '14px 16px', cursor: mine ? 'pointer' : 'default', fontFamily: 'inherit', color: 'inherit' }}
              >
                <span style={{ flex: 'none', width: 34, height: 34, borderRadius: 12, background: 'var(--k-bg-f2f1f5)', color: 'var(--k-tx-6c6779)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--k-tx-a29ead)' }}>정기 {noun}</span>
                  <span style={{ display: 'block', marginTop: 2, fontSize: 14, fontWeight: 700, color: 'var(--k-tx-191722)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {periodDetailLabel(r)}{r.content ? ` · ${r.content}` : ''}
                  </span>
                </span>
                <span style={{ flex: 'none', fontSize: 14.5, fontWeight: 700, color: ownerMode ? 'var(--expense)' : 'var(--income)' }}>{fmtNum(r.amount)}</span>
                {mine && <svg width="12" viewBox="0 0 24 24" fill="none" stroke="var(--k-tx-c2bfc6)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}><polyline points="9 6 15 12 9 18" /></svg>}
              </button>
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
                          <span style={{ fontSize: 14.5, fontWeight: 700, whiteSpace: 'nowrap', letterSpacing: '-.3px', flex: 'none', color: ownerMode ? 'var(--expense)' : 'var(--income)' }}>{ownerMode ? '-' : '+'}{fmtNum(d.amount)}</span>
                      </DayCardRow>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {editor && (
        <Modal title="멤버 정보 수정" onClose={() => setEditor(null)}>
          <div className="field"><label>닉네임 *</label>
            <input value={editor.nickname} onChange={(e) => setEditor({ ...editor, nickname: e.target.value })} autoFocus />
            <p className="small muted" style={{ margin: '4px 2px 0' }}>변경 시 이 그룹 내 모든 화면에 반영됩니다.</p>
          </div>
          <div className="grid2">
            <div className="field"><label>시작일자</label><input type="date" value={editor.start_date} onChange={(e) => setEditor({ ...editor, start_date: e.target.value })} /></div>
            <div className="field"><label>종료일자</label><input type="date" value={editor.end_date} onChange={(e) => setEditor({ ...editor, end_date: e.target.value })} /></div>
          </div>
          <div className="field"><label>다음 {noun}일 <span className="small muted">(비우면 자동)</span></label>
            <input type="date" value={editor.next_due_override} onChange={(e) => setEditor({ ...editor, next_due_override: e.target.value })} />
            <p className="small muted" style={{ margin: '4px 2px 0' }}>자동 계산: {autoNext || '-'}</p>
          </div>
          <div className="field"><label>메모 <span className="small muted">(총무만 열람)</span></label>
            <textarea value={editor.memo} onChange={(e) => setEditor({ ...editor, memo: e.target.value })} />
          </div>
          <div className="row" style={{ marginTop: 6 }}>
            <button className="btn block" onClick={() => setEditor(null)}>취소</button>
            <button className="btn primary block" onClick={saveEdit}>저장</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
