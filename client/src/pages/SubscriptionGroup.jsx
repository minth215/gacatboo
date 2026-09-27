import { useEffect, useState, useCallback, useRef, Fragment } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import { fmtWon, fmtNum, today, addInterval, PERIOD_LABEL, renderTemplate, dotDate, monthPillLabel, isSettlement } from '../lib/format.js';
import Modal from '../components/Modal.jsx';
import MembersPanel from '../components/MembersPanel.jsx';
import SwipeRow from '../components/SwipeRow.jsx';
import { tileBg, formatDate, DayCardRow } from '../components/TransactionList.jsx';

const PERIOD_UNITS = ['day', 'week', 'month', 'year'];
const KEEP = '__keep__'; // id 없이 이름만 있는 원천/분류(스냅샷) 유지용 센티넬
// 정산 금액이 인원수로 안 나눠떨어져 남는 자투리(카카오페이 등이 별도로 입금해주는 몫)를
// 기록하기 위한 가상 멤버의 닉네임. 이 닉네임으로 그룹 멤버를 찾아 식별한다.
const LEFTOVER_NAME = '짤랑이';

// 날짜(dateStr)가 속한 달의 정기결제일(billingDay)로 날짜를 맞춰줌.
// 예: dateStr=2026-08-22, billingDay=19 → 2026-08-19 (그 달의 마지막 날짜를 넘지 않도록 보정)
function billingAlignedDate(dateStr, billingDay) {
  if (!dateStr) return null;
  if (!billingDay) return dateStr;
  const [y, m] = dateStr.slice(0, 7).split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const day = Math.min(billingDay, daysInMonth);
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// 날짜별로 묶기 (가계부 페이지와 동일한 카드 스타일에 사용)
function groupByDate(list) {
  const groups = {};
  for (const t of list) (groups[t.date] ||= []).push(t);
  return Object.keys(groups).sort((a, b) => (a < b ? 1 : -1)).map((d) => [d, groups[d]]);
}

// 월 → 날짜 2단계로 묶기: [[month, [[date, items], ...]], ...] (최신순)
function groupByMonthThenDate(list) {
  const byMonth = {};
  for (const t of list) (byMonth[t.date.slice(0, 7)] ||= []).push(t);
  return Object.keys(byMonth).sort((a, b) => (a < b ? 1 : -1)).map((mo) => [mo, groupByDate(byMonth[mo])]);
}

function SourceSelect({ sources, value, onChange, keepLabel }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">선택 안 함</option>
      {value === KEEP && <option value={KEEP}>{keepLabel} (기존)</option>}
      {sources.map((top) => (
        top.children?.length ? (
          <optgroup key={top.id} label={top.name}>
            <option value={top.id}>{top.name} (전체)</option>
            {top.children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </optgroup>
        ) : <option key={top.id} value={top.id}>{top.name}</option>
      ))}
    </select>
  );
}
function CategorySelect({ cats, value, onChange, keepLabel }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">선택 안 함</option>
      {value === KEEP && <option value={KEEP}>{keepLabel} (기존)</option>}
      {cats.map((c) => <option key={c.id} value={c.id}>{c.emoji ? `${c.emoji} ` : ''}{c.name}</option>)}
    </select>
  );
}
function sourceNameOf(flat, id) {
  if (!id) return '';
  const s = flat.find((x) => x.id === Number(id));
  return s ? s.name : ''; // 세부 항목명만
}
const matchCatId = (cats, name) => { const c = cats.find((x) => x.name === name); return c ? String(c.id) : ''; };
const matchSourceId = (flat, name) => { const s = flat.find((x) => x.name === name); return s ? String(s.id) : ''; };

// 정산 탭: 결제 총액을 멤버 수로 나눈 기본 정산액 기준으로 멤버별 입금 현황을 관리
// (정산 카테고리 그룹의 그룹 상세 페이지에서도 재사용)
export function SettlementTab({ gid, group, members, isOwner, userId, payments, deposits, reloadMembers, loadDep }) {
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState('');
  const [toast, setToast] = useState('');
  const [toastKey, setToastKey] = useState(0);
  const toastTimer = useRef(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [payOpen, setPayOpen] = useState(null); // 정산 미완료 본인이 자기 카드를 눌렀을 때 뜨는 송금 안내 모달 대상

  const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0);
  const leftoverMember = members.find((m) => m.nickname === LEFTOVER_NAME);
  // 정산 인원 수·1인당 몫은 짤랑이(자투리 가상 멤버)를 빼고 계산한다.
  const memberCount = members.filter((m) => m.nickname !== LEFTOVER_NAME).length || 1;
  const defaultShare = Math.round(totalPaid / memberCount);
  // 총 결제 금액이 인원 수로 딱 나누어떨어지지 않아 반올림 후 남는 자투리 금액
  const leftover = totalPaid - defaultShare * memberCount;

  const rows = members.filter((m) => m.nickname !== LEFTOVER_NAME).map((m) => {
    const owed = m.settlement_override != null ? Number(m.settlement_override) : defaultShare;
    const paid = deposits.filter((d) => d.member_id === m.id).reduce((s, d) => s + Number(d.amount), 0);
    const remaining = Math.max(owed - paid, 0);
    return { ...m, owed, paid, remaining, settled: remaining <= 0 };
  });
  // 짤랑이 카드: 자투리가 0원이면 아예 표시하지 않는다. 실제 group_members 행은
  // 처음 "입금 완료"를 누르는 시점에 생성하므로, 그 전에는 가상 행으로만 존재한다.
  const leftoverRow = leftover === 0 ? null : leftoverMember
    ? (() => {
        const paid = deposits.filter((d) => d.member_id === leftoverMember.id).reduce((s, d) => s + Number(d.amount), 0);
        const remaining = Math.max(leftover - paid, 0);
        return { ...leftoverMember, owed: leftover, paid, remaining, settled: remaining <= 0 };
      })()
    : { id: null, nickname: LEFTOVER_NAME, role: 'member', is_account: false, owed: leftover, paid: 0, remaining: leftover, settled: false };

  // 총무 본인은 자신에게 입금하지 않으므로 정산 완료/남은 정산 금액 집계에서 제외
  const nonOwnerRows = rows.filter((r) => r.role !== 'owner');
  const totalSettled = nonOwnerRows.reduce((s, r) => s + r.paid, 0) + (leftoverRow ? leftoverRow.paid : 0);
  const totalRemaining = nonOwnerRows.reduce((s, r) => s + r.remaining, 0) + (leftoverRow ? leftoverRow.remaining : 0);
  // "정산 일괄 완료"/"정산 요청하기" 버튼은 실제 멤버 대상 기능이라 짤랑이는 제외한다
  // (짤랑이는 개별 스와이프로만 입금 완료 처리).
  const anyUnsettled = nonOwnerRows.some((r) => !r.settled);
  // 총무가 개별 정산 금액을 임의로 낮춰서, 전원 몫의 합(총무 포함 + 짤랑이)이
  // 총 결제 금액보다 적어지면 총무가 손해를 보게 되므로 경고로 대체한다.
  const sumOwed = rows.reduce((s, r) => s + r.owed, 0) + (leftoverRow ? leftoverRow.owed : 0);
  const underCollected = sumOwed < totalPaid;

  // 총무는 항상 맨 위. 짤랑이는 정산 완료 상태면 총무 바로 다음(다른 정산 완료 멤버보다 위),
  // 미완료 상태면 "정산 미완료" 구분선 바로 아래(미완료 멤버 중 가장 위)에 온다 — 즉 자신이
  // 속한 완료/미완료 구간에서는 항상 맨 위. 나머지 멤버는 정산 완료 먼저, 미완료 나중.
  const ownerRow = rows.find((r) => r.role === 'owner');
  const realRest = rows.filter((r) => r.role !== 'owner');
  const settledRest = realRest.filter((r) => r.settled);
  const unsettledRest = realRest.filter((r) => !r.settled);
  const sortedRows = (leftoverRow && !leftoverRow.settled
    ? [ownerRow, ...settledRest, leftoverRow, ...unsettledRest]
    : [ownerRow, ...(leftoverRow ? [leftoverRow] : []), ...settledRest, ...unsettledRest]
  ).filter(Boolean);
  const dividerIdx = sortedRows.findIndex((r) => r.role !== 'owner' && !r.settled);
  const showDivider = dividerIdx !== -1;

  const startEdit = (m) => { setEditingId(m.id); setEditDraft(String(m.owed)); };
  const cancelEdit = () => setEditingId(null);
  const saveEdit = async (m) => {
    try {
      await db.updateMemberSettlementOverride(m.id, editDraft === '' ? null : Number(editDraft));
      setEditingId(null);
      reloadMembers();
    } catch (e) { alert(e.message); }
  };

  const showToast = (msg) => {
    setToast(msg);
    setToastKey((k) => k + 1);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2200);
  };

  const poke = (m) => {
    if (!m.is_account) { showToast('외부 멤버에게는 알림을 보낼 수 없습니다.'); return; }
    alert(`${m.nickname}님에게 정산 알림을 보냈습니다. (푸시 알림 기능은 추후 제공될 예정입니다)`);
  };

  // 결제 내역이 한 건뿐이면 그 항목을 정산 대상으로 자동 지정
  const soleSettlementTargetId = payments.length === 1 ? payments[0].id : null;

  const createSettleDeposit = (m) => db.createDeposit({
    group_id: gid, member_id: m.id, date: today(), amount: m.remaining, periods: 1,
    category_name: '정산', category_emoji: '', leader_category_name: '정산', leader_category_emoji: '',
    leader_settlement_target_id: soleSettlementTargetId,
    content: '정산',
  });

  const markPaid = async (m) => {
    if (m.remaining <= 0) return;
    if (!confirm(`${m.nickname}님의 입금(${fmtWon(m.remaining)})을 완료 처리할까요?`)) return;
    try { await createSettleDeposit(m); loadDep(); } catch (e) { alert(e.message); }
  };

  // 짤랑이(자투리) 입금 완료: 실제 group_members 행이 아직 없으면 이 시점에 만든다.
  const markLeftoverPaid = async () => {
    if (!leftoverRow || leftoverRow.remaining <= 0) return;
    try {
      let member = leftoverMember;
      if (!member) member = await db.addMember(gid, { nickname: LEFTOVER_NAME, start_date: today(), end_date: '', contact: '', memo: '', username: '' });
      // content 는 기본값('정산')을 그대로 써서, 입금 내역에 다른 멤버와 같은 형식으로
      // "정산 - 짤랑이" 로 표시되게 한다.
      await createSettleDeposit({ id: member.id, remaining: leftoverRow.remaining });
      reloadMembers();
      loadDep();
    } catch (e) { alert(e.message); }
  };

  // 짤랑이 입금 내역 삭제(정정용). 총액이 바뀌어 자투리가 달라지는 등, 이미 입금 완료
  // 처리한 짤랑이 기록을 지우고 새 금액으로 다시 처리하고 싶을 때 쓴다.
  const deleteLeftoverDeposit = async () => {
    if (!leftoverMember) return;
    const dep = deposits.find((d) => d.member_id === leftoverMember.id);
    if (!dep) return;
    if (!confirm('짤랑이 입금 내역을 삭제할까요?')) return;
    try { await db.deleteDeposit(dep.id); loadDep(); } catch (e) { alert(e.message); }
  };

  // 정산 미완료 본인이 자기 카드를 눌러 송금 모달에서 "입금 완료"를 누른 경우.
  // 모달을 여는 것 자체가 이미 한 번의 확인 절차이므로 별도 confirm 은 두지 않는다.
  const confirmSelfPaid = async (m) => {
    try { await createSettleDeposit(m); setPayOpen(null); loadDep(); } catch (e) { alert(e.message); }
  };

  const requestSettlement = () => {
    const targets = rows.filter((r) => r.role !== 'owner' && r.is_account && !r.settled);
    if (!targets.length) return alert('알림을 보낼 대상이 없습니다.');
    alert(`${targets.length}명에게 정산 요청 알림을 보냈습니다. (푸시 알림 기능은 추후 제공될 예정입니다)`);
  };

  const settleAll = async () => {
    const targets = nonOwnerRows.filter((r) => !r.settled);
    if (!targets.length) return;
    if (!confirm(`미완료 멤버 ${targets.length}명의 정산을 모두 완료 처리할까요?`)) return;
    setBulkBusy(true);
    try {
      for (const m of targets) await createSettleDeposit(m);
      loadDep();
    } catch (e) { alert(e.message); }
    finally { setBulkBusy(false); }
  };

  // 클립보드 복사(iOS 사파리 등 clipboard API 미지원 환경 대비 execCommand 폴백)
  const copyText = async (text) => {
    try { await navigator.clipboard.writeText(text); }
    catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.focus(); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta);
      } catch { return false; }
    }
    return true;
  };
  const copyAccount = async () => {
    const ok = await copyText(group?.owner_account || '');
    showToast(ok ? '계좌번호가 복사되었습니다.' : '복사에 실패했습니다.');
  };

  // 토스 앱의 빈 송금 입력 화면(계좌·금액 직접 입력)으로 이동. 토스가 공식 문서화한
  // 기능이 아니라 비공식적으로 알려진 스킴이라 언제든 동작이 바뀔 수 있음에 유의.
  // 계좌가 등록돼 있으면 미리 클립보드에 복사해 붙여넣기만 하면 되게 해준다.
  const openTossBlank = async () => {
    if (group?.owner_account) {
      const ok = await copyText(group.owner_account);
      showToast(ok ? '계좌번호가 복사되었습니다. 토스 계좌 입력란에 붙여넣어 주세요.' : '복사에 실패했습니다.');
    }
    window.location.href = 'supertoss://send';
  };

  // http(s) 스킴이 없으면 붙여서 안전하게 새 탭으로 열리도록 함
  const withScheme = (v) => (v && !/^https?:\/\//i.test(v) ? `https://${v}` : v);
  const kakaopayHref = withScheme((group?.owner_kakaopay_link || '').trim());

  return (
    <>
      <div className="summary-card" style={{ marginTop: 14 }}>
        <div className="col"><div className="lbl">총 결제 금액</div><div className="val expense">{fmtNum(totalPaid)}</div></div>
        <div className="divider" />
        <div className="col"><div className="lbl">정산 완료 금액</div><div className="val income">{fmtNum(totalSettled)}</div></div>
        <div className="divider" />
        <div className="col"><div className="lbl">남은 정산 금액</div><div className="val">{fmtNum(totalRemaining)}</div></div>
      </div>

      {sortedRows.length === 0 ? <div className="empty">멤버가 없습니다.</div> : sortedRows.map((m, idx) => {
        if (m.nickname === LEFTOVER_NAME) {
          // 짤랑이 카드는 정산 완료 여부와 무관하게 항상 같은 모습(금액 + 삭제 아이콘)을
          // 유지한다. 완료/미완료는 구분선 기준 위/아래 위치로만 나타낸다.
          // 금액은 remaining(입금 후 0이 되는 값)이 아니라 owed(자투리 원금)를 그대로 표시해
          // 정산 완료돼도 숫자가 안 바뀌게 한다.
          const leftoverCardBox = (
            <div className="settle-card settle-card-leftover">
              <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13.25, fontWeight: 700, color: '#191722' }}>{LEFTOVER_NAME}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 13.25, fontWeight: 700, color: '#191722' }}>{fmtNum(m.owed)}</span>
                  {isOwner && leftoverMember && (
                    <button type="button" className="settle-pencil-btn" onClick={deleteLeftoverDeposit} aria-label="짤랑이 입금 삭제">
                      <svg width="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                      </svg>
                    </button>
                  )}
                </span>
              </div>
            </div>
          );
          return (
            <Fragment key={m.id ?? LEFTOVER_NAME}>
              {showDivider && idx === dividerIdx && (
                <div className="settle-divider">
                  <span className="settle-divider-line" />
                  <span className="settle-divider-pill">정산 미완료</span>
                  <span className="settle-divider-line" />
                </div>
              )}
              <div className="settle-swipe-wrap" style={{ marginTop: 10 }}>
                {isOwner && !m.settled ? (
                  <SwipeRow
                    actionsWidth={52}
                    actions={(progress) => (
                      <div className="settle-swipe-actions" style={{ opacity: progress }}>
                        <button type="button" className="settle-icon-btn mint" onClick={markLeftoverPaid} aria-label="입금 완료">
                          <svg width="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 13l4 4L19 7" />
                          </svg>
                        </button>
                      </div>
                    )}
                  >
                    {leftoverCardBox}
                  </SwipeRow>
                ) : leftoverCardBox}
              </div>
            </Fragment>
          );
        }
        const isMe = userId === m.user_id;
        // 총무 화면: 콕 찌르기/입금 완료는 카드를 왼쪽으로 밀어야 보임. 멤버 화면: 본인 카드는 눌러서 바로 입금 완료.
        const swipeForOwner = isOwner && m.role !== 'owner' && !m.settled && editingId !== m.id;
        const tapForSelf = !isOwner && isMe && m.role !== 'owner' && !m.settled;

        const cardInner = (
          <div style={{ padding: '14px 16px', background: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13.25, fontWeight: 700, color: '#191722' }}>{m.nickname}</span>
                {m.role === 'owner' && <span style={{ fontSize: 9, fontWeight: 700, color: '#FF3B5C', background: 'linear-gradient(90deg,#FDE2E8,#FFE9D6)', borderRadius: 999, padding: '2px 7px' }}>총무</span>}
                {m.role !== 'owner' && !m.is_account && <span style={{ fontSize: 9, fontWeight: 700, color: '#8b8798', background: '#f4f2f0', borderRadius: 999, padding: '2px 6px' }}>외부</span>}
              </div>
              {isOwner && editingId === m.id ? (
                <div className="settle-edit-inline">
                  <input
                    value={editDraft === '' ? '' : fmtNum(editDraft)}
                    onChange={(e) => setEditDraft(e.target.value.replace(/[^0-9]/g, ''))}
                    className="settle-edit-input" autoFocus inputMode="numeric"
                    onKeyDown={(e) => e.key === 'Enter' && saveEdit(m)}
                  />
                  <button type="button" className="settle-edit-icon-btn" onClick={cancelEdit} aria-label="취소">
                    <svg width="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6 L18 18 M18 6 L6 18" /></svg>
                  </button>
                  <button type="button" className="settle-edit-icon-btn settle-edit-icon-btn--save" onClick={() => saveEdit(m)} aria-label="저장">
                    <svg width="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
                  </button>
                </div>
              ) : (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 13.25, fontWeight: 700, color: '#191722' }}>{fmtNum(m.owed)}</span>
                  {isOwner && (
                    <button type="button" className="settle-pencil-btn" onClick={() => startEdit(m)} aria-label="정산 금액 수정">
                      <svg width="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                    </button>
                  )}
                </span>
              )}
            </div>
            <div style={{ marginTop: 6, fontSize: 10.75, color: '#a29ead' }}>
              {m.role === 'owner' ? (() => {
                // 총무의 남은 금액 = 총 결제 금액 - 총무 1인 몫 - 이미 정산된 금액.
                // (다른 멤버 각자의 owed 를 합산하면 개별 반올림 오차가 누적될 수 있어,
                //  총액에서 총무 몫 하나만 빼는 방식으로 정확하게 계산한다.)
                const ownerRemaining = Math.max(totalPaid - m.owed - totalSettled, 0);
                return ownerRemaining <= 0
                  ? <>{fmtNum(totalPaid)} 원 결제 · <span style={{ color: 'var(--income)' }}>정산 완료</span></>
                  : <>{fmtNum(totalPaid)} 원 결제 · 남은 금액 {fmtNum(ownerRemaining)} 원</>;
              })() : m.settled ? (
                <>{fmtNum(m.paid)} 원 입금 · 정산 완료</>
              ) : (
                <>{fmtNum(m.paid)} 원 입금 · <span style={{ color: 'var(--expense)' }}>남은 금액 {fmtNum(m.remaining)} 원</span></>
              )}
            </div>
          </div>
        );

        const cardBox = <div className="settle-card">{cardInner}</div>;

        return (
          <Fragment key={m.id}>
            {showDivider && idx === dividerIdx && (
              <div className="settle-divider">
                <span className="settle-divider-line" />
                <span className="settle-divider-pill">정산 미완료</span>
                <span className="settle-divider-line" />
              </div>
            )}
            <div className="settle-swipe-wrap" style={{ marginTop: 10 }}>
              {swipeForOwner ? (
                <SwipeRow
                  actionsWidth={104}
                  actions={(progress) => (
                    <div className="settle-swipe-actions" style={{ opacity: progress }}>
                      <button type="button" className={`settle-icon-btn${m.is_account ? '' : ' is-disabled'}`} onClick={() => poke(m)} aria-label="콕 찌르기">
                        <svg width="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M22 14a8 8 0 0 1-8 8" />
                          <path d="M18 11v-1a2 2 0 0 0-2-2 2 2 0 0 0-2 2" />
                          <path d="M14 10V9a2 2 0 0 0-2-2 2 2 0 0 0-2 2v1" />
                          <path d="M10 9.5V4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v10" />
                          <path d="M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
                        </svg>
                      </button>
                      <button type="button" className="settle-icon-btn mint" onClick={() => markPaid(m)} aria-label="입금 완료">
                        <svg width="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 13l4 4L19 7" />
                        </svg>
                      </button>
                    </div>
                  )}
                >
                  {cardBox}
                </SwipeRow>
              ) : tapForSelf ? (
                <div onClick={() => setPayOpen(m)} style={{ cursor: 'pointer' }}>{cardBox}</div>
              ) : cardBox}
            </div>
          </Fragment>
        );
      })}

      {isOwner && underCollected ? (
        <p style={{ textAlign: 'center', color: 'var(--expense)', fontSize: 12.5, fontWeight: 700, marginTop: 14 }}>
          정산 금액이 총 결제 금액보다 적습니다.
        </p>
      ) : isOwner && anyUnsettled && (
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button type="button" className="btn-settle-all" style={{ flex: 1, height: 48, marginTop: 0 }} disabled={bulkBusy} onClick={settleAll}>
            {bulkBusy ? '처리 중…' : '정산 일괄 완료'}
          </button>
          <button type="button" className="btn-ink-pill" style={{ flex: 1, height: 48, marginTop: 0 }} onClick={requestSettlement}>정산 요청하기</button>
        </div>
      )}

      {toast && <div key={toastKey} className="settle-toast">{toast}</div>}

      {payOpen && (
        <div className="catmodal-overlay" onClick={() => setPayOpen(null)}>
          <div className="catmodal-sheet" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 15.5, fontWeight: 800, color: '#191722' }}>정산 보내기</div>
              <button aria-label="닫기" onClick={() => setPayOpen(null)} className="catmodal-icon-btn">
                <svg width="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" /></svg>
              </button>
            </div>

            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10.75, fontWeight: 700, color: '#a29ead' }}>보낼 금액</div>
              <div style={{ marginTop: 4, fontSize: 24, fontWeight: 800, color: '#191722' }}>{fmtNum(payOpen.remaining)}원</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {group?.owner_account && (
                <button type="button" className="pay-link-btn account" onClick={copyAccount}>
                  <svg width="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                  {group.owner_account} 복사
                </button>
              )}
              <button type="button" className="pay-link-btn toss" onClick={openTossBlank}>
                {group?.owner_account ? '토스로 보내기 (계좌 복사됨)' : '토스 앱 열기'}
              </button>
              {kakaopayHref && (
                <a className="pay-link-btn kakao" href={kakaopayHref} target="_blank" rel="noreferrer">카카오페이로 보내기</a>
              )}
            </div>
            <p className="small muted" style={{ textAlign: 'center', margin: '-4px 0 0' }}>토스 버튼은 비공식 방식이라 계좌·금액은 토스 앱에서 직접 입력해야 해요.</p>

            <button type="button" className="btn-settle-all" style={{ marginTop: 0 }} onClick={() => confirmSelfPaid(payOpen)}>이미 보냈어요 · 입금 완료</button>
          </div>
        </div>
      )}
    </>
  );
}

// 입금 내역 탭: 구독 그룹뿐 아니라 정산 카테고리 그룹의 그룹 상세 페이지에서도 재사용
// (정산 그룹은 회차 개념이 없으므로 showPeriods=false 로 배지를 숨김)
export function DepositsTab({ gid, deposits, isOwner, myMember, loadDep, nav, showPeriods = true, emptyCenter = false }) {
  const [openId, setOpenId] = useState(null); // 한 번에 하나의 카드만 밀려 있도록
  const delDeposit = async (d) => {
    if (!confirm('입금 내역을 삭제할까요? (연결된 가계부 항목도 삭제됩니다)')) return;
    try { await db.deleteDeposit(d.id); loadDep(); } catch (e) { alert(e.message); }
  };
  return (
    <>
      {deposits.length === 0 ? <div className={`empty${emptyCenter ? ' empty-center' : ''}`}>입금 내역이 없습니다.</div> : groupByMonthThenDate(deposits).map(([mo, dateGroups]) => (
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
                    const mine = isOwner || (myMember && d.member_id === myMember.id);
                    return (
                      <DayCardRow
                        key={d.id} index={i} count={items.length}
                        isOpen={openId === d.id} onOpenChange={(open) => setOpenId(open ? d.id : null)}
                        clickable={mine} onTap={() => mine && nav(`/tx/${d.id}?group=${gid}&kind=deposit`)}
                        onDelete={mine ? () => delDeposit(d) : undefined}
                      >
                          <span className="tx-tile" style={{ background: d.category_emoji ? tileBg(d.category_name) : '#f2f1f5' }}>{d.category_emoji || '💸'}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="tx-row-title">
                              <span className="ttext">
                                {d.content || d.category_name || '입금'} - {d.member?.nickname || '멤버'}
                                {showPeriods && <span className="tag-periods">{d.periods} 회분</span>}
                              </span>
                            </div>
                            <div className="tx-row-sub">{[d.category_name, d.deposit_source_name].filter(Boolean).join(' · ') || '—'}</div>
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
      {(isOwner || myMember) && (
        <button className="fab" onClick={() => nav(`/new?group=${gid}&kind=deposit`)} aria-label="입금 추가">
          <svg width="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        </button>
      )}
    </>
  );
}

export default function SubscriptionGroup({ gid, group, members, isOwner, leaderName, header, reloadMembers }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const settlementMode = isSettlement(group?.category);
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'payments';
  const setTab = useCallback((t) => {
    const next = new URLSearchParams(params);
    next.set('tab', t);
    setParams(next, { replace: true });
  }, [params, setParams]);
  const [sub, setSub] = useState(null);
  const [payments, setPayments] = useState([]);
  const [deposits, setDeposits] = useState([]);
  const [openPayId, setOpenPayId] = useState(null); // 결제 내역: 한 번에 하나의 카드만 밀려 있도록

  const myMember = members.find((m) => m.user_id === user.id && m.role !== 'owner');

  const loadSub = useCallback(() => db.getSubscription(gid).then(setSub).catch(() => setSub(null)), [gid]);
  const loadPay = useCallback(() => db.listPayments(gid).then(setPayments).catch(() => setPayments([])), [gid]);
  const loadDep = useCallback(() => db.listDeposits(gid).then(setDeposits).catch(() => setDeposits([])), [gid]);
  useEffect(() => { loadSub(); loadPay(); loadDep(); }, [loadSub, loadPay, loadDep]);

  const usedAmount = payments.reduce((s, p) => s + Number(p.amount), 0);
  const totalAmount = deposits.reduce((s, d) => s + Number(d.amount), 0);
  const remain = totalAmount - usedAmount;

  const delPayment = async (p) => {
    if (!confirm('결제 내역을 삭제할까요? (총대 가계부의 해당 지출도 삭제됩니다)')) return;
    try { await db.deletePayment(p.id); loadPay(); } catch (e) { alert(e.message); }
  };
  const todayStr = today();
  const memberStats = members.map((m) => {
    if (m.role === 'owner') {
      const cum = payments.reduce((s, p) => s + Number(p.amount), 0);
      const lastPay = payments.length ? [...payments].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).slice(-1)[0] : null;
      const last = lastPay ? lastPay.date : null;
      // 다음 결제일 = 마지막 결제일이 속한 달의 정기결제일 + 그 결제가 커버한 기간(회차)만큼 주기 추가
      const base = billingAlignedDate(last, sub?.billing_day);
      const auto = base && sub ? addInterval(base, sub.period_unit, sub.period_count, Math.max(Number(lastPay?.periods) || 1, 1)) : null;
      const next = m.next_due_override || auto;
      return { id: m.id, nickname: m.nickname, isOwner: true, cum, last, next, lastLabel: '마지막 결제일', nextLabel: '다음 결제일', overdue: !!(next && next < todayStr) };
    }
    const ds = [...deposits.filter((d) => d.member_id === m.id)].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const cum = ds.reduce((s, d) => s + Number(d.amount), 0);
    const lastDep = ds.length ? ds[ds.length - 1] : null;
    const last = lastDep ? lastDep.date : null;
    // 다음 입금일 = 마지막 입금일이 속한 달의 정기결제일 + 그 입금이 커버한 기간(회차)만큼 주기 추가
    const base = billingAlignedDate(last, sub?.billing_day);
    const auto = base && sub ? addInterval(base, sub.period_unit, sub.period_count, Math.max(Number(lastDep.periods) || 1, 1)) : (m.start_date || null);
    const next = m.next_due_override || auto;
    return { id: m.id, nickname: m.nickname, isOwner: false, cum, last, next, lastLabel: '마지막 입금일', nextLabel: '다음 입금일', overdue: !!(next && next < todayStr) };
  });

  return (
    <div style={{ padding: '84px 0 12px' }}>
      {header}

      <div className="underline-tabs">
        <button className={tab === 'payments' ? 'active' : ''} onClick={() => setTab('payments')}>결제 내역</button>
        <button className={tab === 'deposits' ? 'active' : ''} onClick={() => setTab('deposits')}>입금 내역</button>
        {settlementMode ? (
          <button className={tab === 'settlement' ? 'active' : ''} onClick={() => setTab('settlement')}>정산</button>
        ) : (
          <button className={tab === 'stats' ? 'active' : ''} onClick={() => setTab('stats')}>통계</button>
        )}
        <button className={tab === 'members' ? 'active' : ''} onClick={() => setTab('members')}>멤버</button>
      </div>

      {tab === 'payments' && (
        <>
          {payments.length === 0 ? <div className="empty">결제 내역이 없습니다.</div> : groupByMonthThenDate(payments).map(([mo, dateGroups]) => (
            <div key={mo}>
              <div className="month-pill-wrap" style={{ margin: '16px 0 8px' }}><span className="month-pill">{monthPillLabel(mo)}</span></div>
              {dateGroups.map(([date, items]) => {
                const net = items.reduce((s, p) => s + Number(p.amount), 0);
                return (
                  <div key={date}>
                    <div style={{ margin: '18px 0 9px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px 0 8px' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#191722' }}>{formatDate(date)}</span>
                      <span style={{ fontSize: 11.5, fontWeight: 600, color: '#8b8798' }}>-{fmtNum(net)}</span>
                    </div>
                    <div className="tx-daygroup">
                      {items.map((p, i) => (
                        <DayCardRow
                          key={p.id} index={i} count={items.length}
                          isOpen={openPayId === p.id} onOpenChange={(open) => setOpenPayId(open ? p.id : null)}
                          clickable={isOwner} onTap={() => isOwner && nav(`/tx/${p.id}?group=${gid}&kind=payment`)}
                          onDelete={isOwner ? () => delPayment(p) : undefined}
                        >
                            <span className="tx-tile" style={{ background: p.category_emoji ? tileBg(p.category_name) : '#f2f1f5' }}>{p.category_emoji || '💳'}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div className="tx-row-title">
                                <span className="ttext">{p.content || p.category_name} <span className="tag-periods">{p.periods} 회분</span></span>
                              </div>
                              <div className="tx-row-sub">{[p.category_name, p.source_name].filter(Boolean).join(' · ') || '—'}</div>
                            </div>
                            <span style={{ fontSize: 14.5, fontWeight: 700, whiteSpace: 'nowrap', letterSpacing: '-.3px', flex: 'none', color: 'var(--expense)' }}>-{fmtNum(p.amount)}</span>
                        </DayCardRow>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
          {isOwner && (
            <button className="fab" onClick={() => nav(`/new?group=${gid}&kind=payment`)} aria-label="결제 추가">
              <svg width="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            </button>
          )}
        </>
      )}

      {tab === 'deposits' && (
        <DepositsTab gid={gid} deposits={deposits} isOwner={isOwner} myMember={myMember} loadDep={loadDep} nav={nav} />
      )}

      {!settlementMode && tab === 'stats' && (
        <>
          <div className="summary-card" style={{ marginTop: 14 }}>
            <div className="col"><div className="lbl">총 금액</div><div className="val income">{fmtNum(totalAmount)}</div></div>
            <div className="divider" />
            <div className="col"><div className="lbl">사용 금액</div><div className="val expense">{fmtNum(usedAmount)}</div></div>
            <div className="divider" />
            <div className="col"><div className="lbl">잔여 금액</div><div className="val">{fmtNum(remain)}</div></div>
          </div>
          {memberStats.length === 0 ? <div className="empty">멤버가 없습니다.</div> : memberStats.map((m) => (
            <div key={m.id} className="tx-daycard" style={{ borderRadius: 16, padding: '14px 16px', marginTop: 10, cursor: m.isOwner ? 'default' : 'pointer' }} onClick={() => !m.isOwner && nav(`/groups/${gid}/member/${m.id}`)}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13.25, fontWeight: 700, color: '#191722' }}>{m.nickname}</span>
                  {m.isOwner && <span style={{ fontSize: 9, fontWeight: 700, color: '#FF3B5C', background: 'linear-gradient(90deg,#FDE2E8,#FFE9D6)', borderRadius: 999, padding: '2px 7px' }}>{leaderName}</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: '#a29ead' }}>누적</span>
                  <span style={{ fontSize: 13.25, fontWeight: 700, color: '#191722' }}>{fmtNum(m.cum)}</span>
                </div>
              </div>
              <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.75, color: '#a29ead' }}>
                <span>{m.lastLabel} {dotDate(m.last) || '-'}</span>
                <span style={{ color: '#e4e2e6' }}>|</span>
                <span style={{ color: m.overdue ? 'var(--expense)' : '#a29ead', fontWeight: m.overdue ? 700 : 400 }}>{m.nextLabel} {dotDate(m.next) || '-'}</span>
              </div>
            </div>
          ))}
        </>
      )}

      {settlementMode && tab === 'settlement' && (
        <SettlementTab
          gid={gid} group={group} members={members} isOwner={isOwner} userId={user.id}
          payments={payments} deposits={deposits} reloadMembers={reloadMembers} loadDep={loadDep}
        />
      )}

      {tab === 'members' && (
        <MembersPanel groupId={gid} members={members} isOwner={isOwner} leaderName={leaderName} onReload={reloadMembers} />
      )}
    </div>
  );
}

export function DepositForm({ initial, sub, cats, incomeCats = [], sources, members, recentExpenses = [], isOwner, onSave, onSaved, topNotice, defaultCategoryName = '구독', showPeriods = true }) {
  const editing = !!initial;
  const defMemberCat = cats.find((c) => c.name === defaultCategoryName);     // 멤버 지출 기본(구독/정산 등)
  const defLeaderCat = incomeCats.find((c) => c.name === (sub?.deposit_category || defaultCategoryName)); // 총대 수입 기본 = 입금분류(없으면 동일 기본값)
  const [f, setF] = useState(() => editing ? {
    memberId: String(initial.member_id), date: initial.date, amount: String(initial.amount), periods: String(initial.periods || 1),
    // 멤버 영역
    mCatId: matchCatId(cats, initial.category_name) || (initial.category_name ? KEEP : ''),
    mSourceId: matchSourceId(sources.flat, initial.source_name) || (initial.source_name ? KEEP : ''),
    // 총대 영역
    lCatId: matchCatId(incomeCats, initial.leader_category_name) || (initial.leader_category_name ? KEEP : ''),
    lSettleId: initial.leader_settlement_target_id ? String(initial.leader_settlement_target_id) : '',
    lSourceId: matchSourceId(sources.flat, initial.deposit_source_name) || (initial.deposit_source_name ? KEEP : ''),
    content: initial.content || '', memo: initial.memo || '',
  } : {
    memberId: '', date: today(),
    amount: '', periods: '1',
    mCatId: '', mSourceId: '',
    lCatId: '', lSettleId: '',
    lSourceId: '',
    content: '',
    memo: '',
  });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);

  // 신규 작성 시 구독 설정/그룹 데이터가 비동기로 나중에 도착해도 기본값이 반영되도록
  // 각 필드가 비어 있을 때만 채움(사용자가 이미 입력했으면 덮어쓰지 않음)
  useEffect(() => {
    if (editing || f.memberId || !members[0]) return;
    setF((prev) => ({ ...prev, memberId: String(members[0].id) }));
  }, [editing, members]);
  useEffect(() => {
    if (editing || f.amount || !sub?.deposit_amount) return;
    setF((prev) => ({ ...prev, amount: String(sub.deposit_amount) }));
  }, [editing, sub]);
  useEffect(() => {
    if (editing || f.mCatId || !defMemberCat) return;
    setF((prev) => ({ ...prev, mCatId: String(defMemberCat.id) }));
  }, [editing, cats]);
  useEffect(() => {
    if (editing || f.lCatId || !defLeaderCat) return;
    setF((prev) => ({ ...prev, lCatId: String(defLeaderCat.id) }));
  }, [editing, incomeCats, sub]);
  useEffect(() => {
    if (editing || f.lSourceId || !sub?.deposit_source_id) return;
    setF((prev) => ({ ...prev, lSourceId: String(sub.deposit_source_id) }));
  }, [editing, sub]);
  // 수정 화면 진입 시 분류/원천 목록이 initial 보다 늦게 도착해 "(기존)"으로만
  // 표시되던 문제 보정: 목록이 도착한 뒤 실제로 일치하는 항목이 있으면 교체
  useEffect(() => {
    if (!editing || f.mCatId !== KEEP) return;
    const id = matchCatId(cats, initial.category_name);
    if (id) setF((prev) => (prev.mCatId === KEEP ? { ...prev, mCatId: id } : prev));
  }, [editing, cats]);
  useEffect(() => {
    if (!editing || f.lCatId !== KEEP) return;
    const id = matchCatId(incomeCats, initial.leader_category_name);
    if (id) setF((prev) => (prev.lCatId === KEEP ? { ...prev, lCatId: id } : prev));
  }, [editing, incomeCats]);
  useEffect(() => {
    if (!editing || f.mSourceId !== KEEP) return;
    const id = matchSourceId(sources.flat, initial.source_name);
    if (id) setF((prev) => (prev.mSourceId === KEEP ? { ...prev, mSourceId: id } : prev));
  }, [editing, sources]);
  useEffect(() => {
    if (!editing || f.lSourceId !== KEEP) return;
    const id = matchSourceId(sources.flat, initial.deposit_source_name);
    if (id) setF((prev) => (prev.lSourceId === KEEP ? { ...prev, lSourceId: id } : prev));
  }, [editing, sources]);
  useEffect(() => {
    if (editing || f.content || !sub?.deposit_content_template) return;
    setF((prev) => ({ ...prev, content: renderTemplate(sub.deposit_content_template, prev.date) }));
  }, [editing, sub]);

  // 금액 입력 시 기본 입금액 대비 회차 자동 계산
  const defaultAmount = Number(sub?.deposit_amount) || 0;
  const onAmountChange = (v) => {
    const amount = v.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '');
    setF((prev) => ({
      ...prev,
      amount,
      periods: showPeriods && defaultAmount > 0 && amount ? String(Math.round(Number(amount) / defaultAmount)) : prev.periods,
    }));
  };
  // 신규 작성 시 날짜 변경에 따라 "내용" 기본값 템플릿({연}/{월}/{일}) 재계산
  const onDateChange = (date) => {
    setF((prev) => ({
      ...prev,
      date,
      content: (!editing && sub?.deposit_content_template) ? renderTemplate(sub.deposit_content_template, date) : prev.content,
    }));
  };

  const leaderCat = f.lCatId === KEEP
    ? { name: initial?.leader_category_name, emoji: initial?.leader_category_emoji }
    : incomeCats.find((c) => String(c.id) === f.lCatId);
  const leaderIsSettle = leaderCat?.name === '정산';

  const submit = async () => {
    if (!f.memberId) return setErr('멤버를 선택하세요.');
    if (!f.amount || Number(f.amount) < 0) return setErr('금액을 입력하세요.');

    // 멤버 가계부(지출) 필드
    let m_name = '', m_emoji = '', m_source = '';
    if (isOwner) {
      if (editing) { m_name = initial.category_name; m_emoji = initial.category_emoji; m_source = initial.source_name; }
      else { m_name = defaultCategoryName; m_emoji = defMemberCat?.emoji || ''; m_source = ''; }
    } else {
      if (f.mCatId === KEEP) { m_name = initial.category_name; m_emoji = initial.category_emoji; }
      else if (f.mCatId) { const c = cats.find((x) => String(x.id) === f.mCatId); if (c) { m_name = c.name; m_emoji = c.emoji || ''; } }
      m_source = f.mSourceId === KEEP ? (initial?.source_name || '') : sourceNameOf(sources.flat, f.mSourceId);
    }

    // 총대 가계부(수입) 필드
    let l_name = '', l_emoji = '', l_settle = null, l_source = '';
    if (isOwner) {
      if (f.lCatId === KEEP) { l_name = initial.leader_category_name; l_emoji = initial.leader_category_emoji; }
      else if (f.lCatId) { const c = incomeCats.find((x) => String(x.id) === f.lCatId); if (c) { l_name = c.name; l_emoji = c.emoji || ''; } }
      l_settle = (l_name === '정산' && f.lSettleId) ? Number(f.lSettleId) : null;
      l_source = f.lSourceId === KEEP ? (initial?.deposit_source_name || '') : sourceNameOf(sources.flat, f.lSourceId);
    } else {
      if (editing) { l_name = initial.leader_category_name; l_emoji = initial.leader_category_emoji; l_settle = initial.leader_settlement_target_id || null; l_source = initial.deposit_source_name; }
      else { l_name = sub?.deposit_category || ''; l_emoji = sub?.deposit_category_emoji || ''; l_settle = null; l_source = sub?.deposit_source_name || ''; }
    }

    setBusy(true); setErr('');
    try {
      await onSave({
        member_id: Number(f.memberId), date: f.date, amount: Math.round(Number(f.amount)),
        periods: Math.max(Number(f.periods) || 1, 1),
        category_name: m_name, category_emoji: m_emoji, source_id: null, source_name: m_source,
        deposit_source_name: l_source,
        leader_category_name: l_name, leader_category_emoji: l_emoji, leader_settlement_target_id: l_settle,
        content: f.content, memo: f.memo,
      });
      onSaved?.();
    } catch (e) { setErr(e.message); setBusy(false); }
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
      {topNotice}
      {/* 공통 */}
      <div className="field"><label>멤버</label>
        <select value={f.memberId} onChange={(e) => setF({ ...f, memberId: e.target.value })} disabled={editing || members.length <= 1}>
          {members.map((m) => <option key={m.id} value={m.id}>{m.nickname}</option>)}
          {editing && !members.some((m) => String(m.id) === String(f.memberId)) && <option value={f.memberId}>{initial.member?.nickname || '멤버'}</option>}
        </select>
      </div>
      <div className="field"><label>날짜</label><input type="date" value={f.date} onChange={(e) => onDateChange(e.target.value)} /></div>
      {showPeriods ? (
        <div className="grid2">
          <div className="field"><label>금액</label>
            <div className="with-suffix">
              <input
                type="text" inputMode="numeric"
                value={f.amount ? Number(f.amount).toLocaleString('ko-KR') : ''}
                onChange={(e) => onAmountChange(e.target.value)}
              />
              <span className="suffix">원</span>
            </div>
          </div>
          <div className="field"><label>기간(회차)</label><input type="number" min="1" value={f.periods} onChange={(e) => setF({ ...f, periods: e.target.value })} /></div>
        </div>
      ) : (
        <div className="field"><label>금액</label>
          <div className="with-suffix">
            <input
              type="text" inputMode="numeric"
              value={f.amount ? Number(f.amount).toLocaleString('ko-KR') : ''}
              onChange={(e) => onAmountChange(e.target.value)}
            />
            <span className="suffix">원</span>
          </div>
        </div>
      )}

      {isOwner ? (
        /* 총대 가계부 영역 */
        <div className="form-section-card">
          <div className="form-section-title">총대 가계부 (수입)</div>
          <div className="field"><label>분류</label>
            <CategorySelect cats={incomeCats} value={f.lCatId} onChange={(v) => setF({ ...f, lCatId: v })} keepLabel={initial?.leader_category_name} />
          </div>
          {leaderIsSettle && (
            <div className="field"><label>정산 대상 <span className="small muted">(정산할 지출 선택)</span></label>
              <select value={f.lSettleId} onChange={(e) => setF({ ...f, lSettleId: e.target.value })}>
                <option value="">선택 안 함</option>
                {recentExpenses.map((x) => (
                  <option key={x.id} value={x.id}>{x.date.slice(5)} {x.category_emoji || ''} {x.content || x.category_name || '지출'} ({fmtWon(x.amount)})</option>
                ))}
              </select>
            </div>
          )}
          <div className="field"><label>원천</label>
            <SourceSelect sources={sources.tree} value={f.lSourceId} onChange={(v) => setF({ ...f, lSourceId: v })} keepLabel={initial?.deposit_source_name} />
          </div>
        </div>
      ) : (
        /* 멤버 가계부 영역 */
        <div className="form-section">
          <div className="form-section-title">내 가계부 (지출)</div>
          <div className="field"><label>분류</label>
            <CategorySelect cats={cats} value={f.mCatId} onChange={(v) => setF({ ...f, mCatId: v })} keepLabel={initial?.category_name} />
          </div>
          <div className="field"><label>원천</label>
            <SourceSelect sources={sources.tree} value={f.mSourceId} onChange={(v) => setF({ ...f, mSourceId: v })} keepLabel={initial?.source_name} />
          </div>
        </div>
      )}

      <div className="field"><label>내용</label><input value={f.content} onChange={(e) => setF({ ...f, content: e.target.value })} placeholder="예: 넷플릭스 회비" /></div>
      <div className="field"><label>메모</label><textarea value={f.memo} onChange={(e) => setF({ ...f, memo: e.target.value })} /></div>
      {err && <p className="error">{err}</p>}
      <button className="btn-ink-pill" disabled={busy}>{busy ? '저장 중…' : editing ? '수정' : '저장'}</button>
    </form>
  );
}

export function SettingsForm({ sub, incomeCats, onClose, onSave }) {
  const [f, setF] = useState({
    mode: sub?.mode || 'personal',
    billing_day: sub?.billing_day ? String(sub.billing_day) : '',
    billing_amount: sub?.billing_amount ? String(sub.billing_amount) : '',
    deposit_amount: sub?.deposit_amount ? String(sub.deposit_amount) : '',
    period_count: sub?.period_count ? String(sub.period_count) : '1',
    period_unit: sub?.period_unit || 'month',
    deposit_source_id: sub?.deposit_source_id ? String(sub.deposit_source_id) : '',
    deposit_content_template: sub?.deposit_content_template || '',
    payment_content_template: sub?.payment_content_template || '',
  });
  const initCat = incomeCats.find((c) => c.name === sub?.deposit_category);
  const [depositCatId, setDepositCatId] = useState(initCat ? String(initCat.id) : '');
  const [sources, setSources] = useState({ tree: [], flat: [] });
  const [busy, setBusy] = useState(false);

  useEffect(() => { db.listSources().then(setSources).catch(() => {}); }, []);

  // 금액 입력 시 천단위 콤마 자동 표시
  const setAmountField = (key) => (e) => {
    const v = e.target.value.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '');
    setF((prev) => ({ ...prev, [key]: v }));
  };

  const submit = async () => {
    const cat = incomeCats.find((c) => c.id === Number(depositCatId));
    setBusy(true);
    try {
      await onSave({
        mode: f.mode,
        billing_day: f.billing_day ? Number(f.billing_day) : null,
        billing_amount: f.billing_amount ? Math.round(Number(f.billing_amount)) : null,
        deposit_amount: f.deposit_amount ? Math.round(Number(f.deposit_amount)) : null,
        period_unit: f.period_unit, period_count: Math.max(Number(f.period_count) || 1, 1),
        deposit_category: cat?.name || '', deposit_category_emoji: cat?.emoji || '',
        deposit_source_id: f.deposit_source_id ? Number(f.deposit_source_id) : null,
        deposit_source_name: sourceNameOf(sources.flat, f.deposit_source_id),
        deposit_content_template: f.deposit_content_template.trim(),
        payment_content_template: f.payment_content_template.trim(),
      });
    } catch (e) { alert(e.message); setBusy(false); }
  };

  return (
    <Modal title="구독 관리 설정" onClose={onClose}>
      <div className="field"><label>입금 방식</label>
        <div className="pill-toggle">
          <button type="button" className={f.mode === 'personal' ? 'active' : ''} onClick={() => setF({ ...f, mode: 'personal' })}>개인</button>
          <button type="button" className={f.mode === 'common' ? 'active' : ''} onClick={() => setF({ ...f, mode: 'common' })}>공통</button>
        </div>
        <p className="small muted" style={{ marginTop: 4 }}>개인: 총대 개인 계좌 / 공통: 모임통장 등 공동 계좌</p>
      </div>
      <div className="grid2">
        <div className="field"><label>정기결제일</label>
          <div className="with-suffix"><input type="number" min="1" max="31" value={f.billing_day} onChange={(e) => setF({ ...f, billing_day: e.target.value })} /><span className="suffix">일</span></div>
        </div>
        <div className="field"><label>정기결제금액</label>
          <div className="with-suffix">
            <input type="text" inputMode="numeric" value={f.billing_amount ? Number(f.billing_amount).toLocaleString('ko-KR') : ''} onChange={setAmountField('billing_amount')} />
            <span className="suffix">원</span>
          </div>
        </div>
      </div>
      <div className="grid2">
        <div className="field"><label>정기입금액</label>
          <div className="with-suffix">
            <input type="text" inputMode="numeric" value={f.deposit_amount ? Number(f.deposit_amount).toLocaleString('ko-KR') : ''} onChange={setAmountField('deposit_amount')} />
            <span className="suffix">원</span>
          </div>
        </div>
        <div className="field"><label>주기</label>
          <div className="row">
            <input type="number" min="1" value={f.period_count} onChange={(e) => setF({ ...f, period_count: e.target.value })} style={{ width: 64 }} />
            <select value={f.period_unit} onChange={(e) => setF({ ...f, period_unit: e.target.value })}>
              {PERIOD_UNITS.map((u) => <option key={u} value={u}>{PERIOD_LABEL[u]}</option>)}
            </select>
          </div>
        </div>
      </div>
      <div className="field"><label>입금 분류 <span className="small muted">(총대 수입 분류)</span></label>
        <select value={depositCatId} onChange={(e) => setDepositCatId(e.target.value)}>
          <option value="">선택 안 함</option>
          {incomeCats.map((c) => <option key={c.id} value={c.id}>{c.emoji ? `${c.emoji} ` : ''}{c.name}</option>)}
        </select>
      </div>
      <div className="field"><label>입금 원천 <span className="small muted">(총대 수입 원천 기본값)</span></label>
        <SourceSelect sources={sources.tree} value={f.deposit_source_id} onChange={(v) => setF({ ...f, deposit_source_id: v })} keepLabel={sub?.deposit_source_name} />
      </div>
      <div className="field"><label>입금 내용 기본값</label>
        <input value={f.deposit_content_template} onChange={(e) => setF({ ...f, deposit_content_template: e.target.value })} placeholder="예: {월}월 회비" />
      </div>
      <div className="field"><label>결제 내용 기본값</label>
        <input value={f.payment_content_template} onChange={(e) => setF({ ...f, payment_content_template: e.target.value })} placeholder="예: {월}월 정기결제" />
        <p className="small muted" style={{ margin: '4px 2px 0' }}>{'내용에 {연}, {월}, {일} 을 넣으면 입력한 날짜 기준으로 자동 치환됩니다.'}</p>
      </div>
      <div className="row" style={{ marginTop: 6 }}>
        <button className="btn block" onClick={onClose}>취소</button>
        <button className="btn primary block" disabled={busy} onClick={submit}>{busy ? '저장 중…' : '저장'}</button>
      </div>
    </Modal>
  );
}
