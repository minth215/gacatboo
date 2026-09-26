import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Bar } from 'react-chartjs-2';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import { PALETTE } from '../lib/chartSetup.js';
import { currentMonth, shiftMonth, monthLabel, fmtWon, isSubscription, isSettlement, leaderLabel } from '../lib/format.js';
import TransactionList from '../components/TransactionList.jsx';
import MembersPanel from '../components/MembersPanel.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';
import SubscriptionGroup, { DepositsTab, SettlementTab } from './SubscriptionGroup.jsx';

export default function GroupDetail() {
  const { id } = useParams();
  const gid = Number(id);
  const nav = useNavigate();
  const { user } = useAuth();
  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);

  const loadGroup = useCallback(() => {
    db.getGroup(gid).then(({ group, members }) => { setGroup(group); setMembers(members); })
      .catch((e) => { alert(e.message); nav('/groups'); });
  }, [gid, nav]);
  useEffect(() => { loadGroup(); }, [loadGroup]);

  if (!group) return <Spinner />;

  const isOwner = group.owner_id === user.id;
  const leaderName = leaderLabel(group.category);

  const header = (
    <PageHeader title={group.name} flat right={isOwner && (
      <button className="tb-icon-btn" onClick={() => nav(`/groups/${gid}/edit`)} aria-label="그룹 정보 수정">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
    )} />
  );

  if (isSubscription(group.category)) {
    return (
      <SubscriptionGroup
        gid={gid} group={group} members={members} isOwner={isOwner} leaderName={leaderName}
        header={header} reloadMembers={loadGroup}
      />
    );
  }

  return <GenericGroup gid={gid} group={group} members={members} isOwner={isOwner} leaderName={leaderName} header={header} nav={nav} user={user} reloadMembers={loadGroup} />;
}

// ---------- 일반 그룹 (내역/통계/멤버, 정산 카테고리는 내역/입금 내역/정산/멤버) ----------
function GenericGroup({ gid, group, members, isOwner, leaderName, header, nav, user, reloadMembers }) {
  const settlementMode = isSettlement(group.category);
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'ledger';
  const setTab = useCallback((t) => {
    const next = new URLSearchParams(params);
    next.set('tab', t);
    setParams(next, { replace: true });
  }, [params, setParams]);
  const [month, setMonth] = useState(currentMonth());
  const [allTxs, setAllTxs] = useState([]);
  const [deposits, setDeposits] = useState([]);

  const myMember = members.find((m) => m.user_id === user.id && m.role !== 'owner');

  const loadTxs = useCallback(() => {
    db.listGroupTransactionsAll(gid).then(setAllTxs).catch(() => setAllTxs([]));
  }, [gid]);
  const loadDep = useCallback(() => {
    if (!settlementMode) return;
    db.listDeposits(gid).then(setDeposits).catch(() => setDeposits([]));
  }, [gid, settlementMode]);
  useEffect(() => { loadTxs(); }, [loadTxs]);
  useEffect(() => { loadDep(); }, [loadDep]);

  const canEdit = (t) => t.created_by === user.id;
  const removeTx = async (t) => {
    if (!confirm('이 항목을 삭제할까요?')) return;
    try { await db.deleteTransaction(t.id); loadTxs(); } catch (e) { alert(e.message); }
  };
  // 멤버별 통계용 이름 매핑
  const statMembers = members.map((m) => ({ user_id: m.user_id, display_name: m.nickname }));
  const paidTxs = allTxs.filter((t) => t.type === 'expense');

  return (
    <div style={{ padding: '84px 0 12px' }}>
      {header}

      <div className="underline-tabs">
        <button className={tab === 'ledger' ? 'active' : ''} onClick={() => setTab('ledger')}>{settlementMode ? '결제 내역' : '내역'}</button>
        {settlementMode && <button className={tab === 'deposits' ? 'active' : ''} onClick={() => setTab('deposits')}>입금 내역</button>}
        {settlementMode ? (
          <button className={tab === 'settlement' ? 'active' : ''} onClick={() => setTab('settlement')}>정산</button>
        ) : (
          <button className={tab === 'stats' ? 'active' : ''} onClick={() => setTab('stats')}>통계</button>
        )}
        <button className={tab === 'members' ? 'active' : ''} onClick={() => setTab('members')}>멤버</button>
      </div>

      {!settlementMode && tab === 'stats' && (
        <div className="month-nav" style={{ marginTop: 14 }}>
          <button onClick={() => setMonth(shiftMonth(month, -1))}>‹</button>
          <div className="mlabel">{monthLabel(month)}</div>
          <button onClick={() => setMonth(shiftMonth(month, 1))}>›</button>
        </div>
      )}

      {tab === 'ledger' && (
        <>
          <TransactionList transactions={allTxs} canEdit={canEdit} onEdit={(t) => nav(`/tx/${t.id}`)} onDelete={removeTx} groupByMonth />
          <button className="fab" onClick={() => nav(`/new?group=${gid}`)} aria-label="추가">
            <svg width="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          </button>
        </>
      )}

      {settlementMode && tab === 'deposits' && (
        <DepositsTab gid={gid} deposits={deposits} isOwner={isOwner} myMember={myMember} loadDep={loadDep} nav={nav} showPeriods={false} />
      )}

      {!settlementMode && tab === 'stats' && (
        <GroupStatsView gid={gid} month={month} members={statMembers} />
      )}

      {settlementMode && tab === 'settlement' && (
        <SettlementTab
          gid={gid} members={members} isOwner={isOwner} userId={user.id}
          payments={paidTxs} deposits={deposits} reloadMembers={reloadMembers} loadDep={loadDep}
        />
      )}

      {tab === 'members' && (
        <MembersPanel groupId={gid} members={members} isOwner={isOwner} leaderName={leaderName} onReload={reloadMembers} />
      )}
    </div>
  );
}

function GroupStatsView({ gid, month, members }) {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    if (!members.length) { setStats(null); return; }
    db.groupStats(gid, month, members).then(setStats).catch(() => setStats(null));
  }, [gid, month, members]);
  if (!stats) return <div className="empty">데이터가 없습니다.</div>;
  return (
    <>
      <div className="summary-card">
        <div className="col"><div className="lbl">수입</div><div className="val income">{fmtWon(stats.totals.income)}</div></div>
        <div className="divider" />
        <div className="col"><div className="lbl">지출</div><div className="val expense">{fmtWon(stats.totals.expense)}</div></div>
        <div className="divider" />
        <div className="col"><div className="lbl">합계</div><div className="val">{fmtWon(stats.totals.balance)}</div></div>
      </div>
      <div className="card">
        <h3>멤버별 지출/수입</h3>
        {stats.byMember.every((m) => !m.income && !m.expense) ? (
          <div className="empty">데이터가 없습니다.</div>
        ) : (
          <div className="chart-box">
            <Bar data={{
              labels: stats.byMember.map((m) => m.name),
              datasets: [
                { label: '수입', data: stats.byMember.map((m) => m.income), backgroundColor: '#191722', borderRadius: 6, maxBarThickness: 26 },
                { label: '지출', data: stats.byMember.map((m) => m.expense), backgroundColor: '#e5484d', borderRadius: 6, maxBarThickness: 26 },
              ],
            }} options={{
              responsive: true, maintainAspectRatio: false,
              plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } } },
              scales: { y: { ticks: { callback: (v) => (v >= 10000 ? `${v / 10000}만` : v) } } },
            }} />
          </div>
        )}
      </div>
      {stats.byCategory.length > 0 && (
        <div className="card">
          <h3>분류별 지출</h3>
          <div className="legend-list">
            {stats.byCategory.map((c, i) => (
              <div className="legend-row" key={c.name}>
                <span className="sw" style={{ background: PALETTE[i % PALETTE.length] }} />
                <span className="lname">{c.name}</span>
                <span className="lval">{fmtWon(c.total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
