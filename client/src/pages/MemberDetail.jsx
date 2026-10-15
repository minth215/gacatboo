import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import { fmtWon, fmtNum, addInterval, monthPillLabel } from '../lib/format.js';
import Modal from '../components/Modal.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';
import { tileBg, formatDate, DayCardRow } from '../components/TransactionList.jsx';
import { groupByMonthThenDate } from './SubscriptionGroup.jsx';

export default function MemberDetail() {
  const { id, memberId } = useParams();
  const gid = Number(id);
  const mid = Number(memberId);
  const nav = useNavigate();
  const { user } = useAuth();

  const [group, setGroup] = useState(null);
  const [member, setMember] = useState(null);
  const [sub, setSub] = useState(null);
  const [deposits, setDeposits] = useState([]);
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
    }).catch((e) => { alert(e.message); nav(`/groups/${gid}`); });
  }, [gid, mid, nav]);
  const loadDeps = useCallback(() => {
    db.listDeposits(gid).then((all) => setDeposits(all.filter((d) => d.member_id === mid))).catch(() => setDeposits([]));
  }, [gid, mid]);

  useEffect(() => { loadGroup(); loadDeps(); db.getSubscription(gid).then(setSub).catch(() => {}); }, [loadGroup, loadDeps, gid]);
  useEffect(() => {
    db.listCategories('income').then(setIncomeCats).catch(() => {});
    db.listCategories('expense').then(setExpenseCats).catch(() => {});
  }, []);

  if (!group || !member) return <Spinner />;

  const isOwner = group.owner_id === user.id;
  const canEditDep = isOwner || member.user_id === user.id;

  const cum = deposits.reduce((s, d) => s + Number(d.amount), 0);
  const periods = deposits.reduce((s, d) => s + Number(d.periods || 0), 0);
  const last = deposits.length ? deposits.map((d) => d.date).sort().slice(-1)[0] : null;
  const base = member.start_date || (deposits.length ? deposits.map((d) => d.date).sort()[0] : null);
  const autoNext = base && sub ? addInterval(base, sub.period_unit, sub.period_count, periods) : (base || null);
  const nextDue = member.next_due_override || autoNext;

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
    if (!confirm('입금 내역을 삭제할까요? (연결된 가계부 항목도 함께 삭제됩니다)')) return;
    try { await db.deleteDeposit(d.id); loadDeps(); } catch (e) { alert(e.message); }
  };

  return (
    <div style={{ padding: '44px 0 12px' }}>
      <PageHeader title={member.nickname} flat right={isOwner && (
        <button className="tb-icon-btn" onClick={openEdit} aria-label="멤버 정보 수정">
          <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </button>
      )} />

      {/* 상단 카드 */}
      <div className="card">
        {!member.is_account && <div style={{ marginBottom: 10 }}><span className="badge pending">외부</span></div>}
        <div className="summary">
          <div className="box"><div className="lbl">누적 입금액</div><div className="val income">{fmtWon(cum)}</div></div>
          <div className="box"><div className="lbl">마지막 입금일</div><div className="val" style={{ fontSize: 14 }}>{last || '-'}</div></div>
          <div className="box"><div className="lbl">다음 입금일</div><div className="val" style={{ fontSize: 14 }}>{nextDue || '-'}</div></div>
        </div>
        {(member.contact || (isOwner && member.memo)) && (
          <div className="small muted" style={{ marginTop: 10 }}>
            {member.contact && <div>📞 {member.contact}</div>}
            {isOwner && member.memo && <div style={{ marginTop: 2 }}>📝 {member.memo}</div>}
          </div>
        )}
      </div>

      {/* 입금 내역 — 가계부 페이지와 동일한 카드 스타일(왼쪽으로 스와이프 시 삭제 버튼) */}
      <h3 style={{ margin: '18px 2px 10px', fontSize: 16 }}>입금 내역</h3>
      {deposits.length === 0 ? <div className="empty">입금 내역이 없습니다.</div> : groupByMonthThenDate(deposits).map(([mo, dateGroups]) => (
        <div key={mo}>
          <div className="month-pill-wrap" style={{ margin: '16px 0 8px' }}><span className="month-pill">{monthPillLabel(mo)}</span></div>
          {dateGroups.map(([date, items]) => {
            const net = items.reduce((s, d) => s + Number(d.amount), 0);
            return (
              <div key={date}>
                <div style={{ margin: '18px 0 9px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px 0 8px' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#191722' }}>{formatDate(date)}</span>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: '#8b8798' }}>+{fmtNum(net)}</span>
                </div>
                <div className="tx-daygroup">
                  {items.map((d, i) => {
                    const tileEmoji = isOwner ? d.leader_category_emoji : d.category_emoji;
                    const tileCat = isOwner ? d.leader_category_name : d.category_name;
                    const tileColor = (isOwner ? incomeCats : expenseCats).find((c) => c.name === tileCat)?.color || '';
                    return (
                      <DayCardRow
                        key={d.id} index={i} count={items.length}
                        isOpen={openId === d.id} onOpenChange={(open) => setOpenId(open ? d.id : null)}
                        clickable={canEditDep} onTap={() => canEditDep && nav(`/tx/${d.id}?group=${gid}&kind=deposit`)}
                        onDelete={canEditDep ? () => delDeposit(d) : undefined}
                      >
                          <span className="tx-tile" style={{ background: tileColor || (tileEmoji ? tileBg(tileCat) : '#f2f1f5') }}>{tileEmoji || '💸'}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="tx-row-title">
                              <span className="ttext">
                                {d.content || d.category_name || '입금'}
                                {' '}<span className="tag-periods">{d.periods} 회분</span>
                              </span>
                            </div>
                            <div className="tx-row-sub">{[tileCat, d.deposit_source_name].filter(Boolean).join(' · ') || '—'}</div>
                          </div>
                          <span style={{ fontSize: 14.5, fontWeight: 700, whiteSpace: 'nowrap', letterSpacing: '-.3px', flex: 'none', color: 'var(--income)' }}>+{fmtNum(d.amount)}</span>
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
          <div className="field"><label>다음 입금일 <span className="small muted">(비우면 자동)</span></label>
            <input type="date" value={editor.next_due_override} onChange={(e) => setEditor({ ...editor, next_due_override: e.target.value })} />
            <p className="small muted" style={{ margin: '4px 2px 0' }}>자동 계산: {autoNext || '-'}</p>
          </div>
          <div className="field"><label>연락처</label><input value={editor.contact} onChange={(e) => setEditor({ ...editor, contact: e.target.value })} /></div>
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
