import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { listSavedAccounts } from '../lib/accounts.js';
import PageHeader from '../components/PageHeader.jsx';

const Chevron = () => (
  <svg width="16" viewBox="0 0 24 24" fill="none" stroke="#c7c3cc" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}>
    <polyline points="9 6 15 12 9 18" />
  </svg>
);
const RepeatIcon = () => (
  <svg width="21" height="21" viewBox="0 0 24 24" fill="#191722" style={{ transform: 'scaleX(-1)' }}>
    <path d="M12,4V1L8,5l4,4V6c3.31,0,6,2.69,6,6c0,1.01-0.25,1.97-0.7,2.8l1.46,1.46C19.54,15.03,20,13.57,20,12C20,7.58,16.42,4,12,4z M6,12c0-1.01,0.25-1.97,0.7-2.8L5.24,7.74C4.46,8.97,4,10.43,4,12c0,4.42,3.58,8,8,8v3l4-4l-4-4v3c-3.31,0-6-2.69-6-6z" />
  </svg>
);
const SwitchIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="17 1 21 5 17 9" />
    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
    <polyline points="7 23 3 19 7 15" />
    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
  </svg>
);

export default function Settings() {
  const { user, login, switchAccount } = useAuth();
  const nav = useNavigate();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  // 계정 전환 모달 안에서 "다른 계정으로 로그인" 눌렀을 때 보여줄 인라인 로그인 폼 상태
  const [adding, setAdding] = useState(false);
  const [addEmail, setAddEmail] = useState('');
  const [addPassword, setAddPassword] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [addErr, setAddErr] = useState('');
  const savedAccounts = listSavedAccounts();
  // 지금 계정이 관리자이거나, 이 기기에 저장된 계정 중 관리자가 하나라도 있으면
  // (그 관리자 계정으로 다시 전환할 수 있도록) 계정 전환 버튼을 보여준다.
  const canSwitch = user.role === 'admin' || savedAccounts.some((a) => a.role === 'admin');
  const busy = switching || addBusy;

  const closeSwitcher = () => {
    if (busy) return;
    setSwitcherOpen(false); setAdding(false); setAddEmail(''); setAddPassword(''); setAddErr('');
  };
  const doSwitch = async (acc) => {
    if (acc.id === user.id || busy) return;
    setSwitching(true);
    try { await switchAccount(acc.id); closeSwitcher(); }
    catch (e) { alert(e.message); }
    finally { setSwitching(false); }
  };
  const openAdd = () => { setAdding(true); setAddEmail(''); setAddPassword(''); setAddErr(''); };
  const submitAdd = async (e) => {
    e.preventDefault();
    if (busy) return;
    setAddErr(''); setAddBusy(true);
    try { await login(addEmail.trim(), addPassword); closeSwitcher(); }
    catch (e2) { setAddErr(e2.message); }
    finally { setAddBusy(false); }
  };

  const groups = [
    {
      label: '가계부',
      items: [
        { label: '반복 관리', desc: '정기적으로 반복되는 내역 관리', bg: '#eef1fb', icon: <RepeatIcon />, to: '/settings/recurring' },
        { label: '친구 관리', desc: '자주 정산하는 친구 등록 및 분류 관리', bg: '#fff1e6', icon: '🗂️', to: '/settings/friends' },
      ],
    },
    {
      label: '분류/원천',
      items: [
        { label: '수입 분류 관리', desc: '월급·부수입·용돈 등 수입 분류 관리', bg: '#e8f6ee', icon: '💵', to: '/settings/categories/income' },
        { label: '지출 분류 관리', desc: '식당·교통·쇼핑 등 지출 분류 관리', bg: '#fde8ee', icon: '🧾', to: '/settings/categories/expense' },
        { label: '예산 관리', desc: '수입·지출 분류별 예산 설정', bg: '#fff1e6', icon: '📊', to: '/settings/budget' },
        { label: '원천 관리', desc: '현금·은행·카드 등 원천 자산 관리', bg: '#eef1fb', icon: '🏦', to: '/settings/sources' },
        { label: '카드 실적 관리', desc: '카드별 실적 구간에 따른 혜택 관리', bg: '#fff1e6', icon: '💳', to: '/settings/card-benefits' },
      ],
    },
    {
      label: '설정',
      items: [
        { label: '알림 관리', desc: '세부 항목별 알림 수신 설정', bg: '#fff1e6', icon: '🔔', to: '/settings/notifications' },
        { label: '화폐 설정', desc: '보조 화폐 추가 및 환율 자동 환산 설정', bg: '#eef1fb', icon: '💱', to: '/settings/currency' },
        { label: '내보내기', desc: '가계부 데이터 파일 백업', bg: '#eef1fb', icon: '📤' },
        { label: '가져오기', desc: '파일 업로드로 가계부 데이터 복원', bg: '#e8f6ee', icon: '📥' },
      ],
    },
  ];
  return (
    <div style={{ padding: '44px 0 12px' }}>
      <PageHeader title="설정" showBack={false} right={canSwitch && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="tb-icon-btn" style={{ color: '#6c6779' }} onClick={() => setSwitcherOpen(true)} aria-label="계정 전환">
            <SwitchIcon />
          </button>
          {user.role === 'admin' && (
            <button className="tb-icon-btn" style={{ color: '#6c6779' }} onClick={() => nav('/admin')} aria-label="관리자 페이지">
              <svg width="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a5 5 0 0 1 5 5v2h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h1V7a5 5 0 0 1 5-5z" />
                <circle cx="12" cy="16" r="1.6" fill="currentColor" stroke="none" />
              </svg>
            </button>
          )}
        </div>
      )} />

      <div className="settings-profile-card" style={{ marginTop: 14 }} onClick={() => nav('/settings/profile')}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: '#191722', lineHeight: 1 }}>{user.display_name}</span>
            {user.role === 'admin' && <span className="settings-admin-badge">관리자</span>}
          </div>
          <div style={{ fontSize: 12.5, color: '#8b8798', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{user.username}</div>
        </div>
        <Chevron />
      </div>

      {groups.map((g) => (
        <div key={g.label} style={{ marginTop: 26 }}>
          <div className="settings-group-label">{g.label}</div>
          <div className="tx-daycard">
            {g.items.map((it, i) => (
              <button
                key={it.label} className="settings-menu-row" onClick={it.to ? () => nav(it.to) : undefined}
                style={{ borderTop: i === 0 ? 'none' : '1.5px solid #f2f1f5' }}
              >
                <span className="settings-menu-tile" style={{ background: it.bg }}>{it.icon}</span>
                <span className="settings-menu-main">
                  <span className="settings-menu-label">{it.label}</span>
                  <span className="settings-menu-desc">{it.desc}</span>
                </span>
                <Chevron />
              </button>
            ))}
          </div>
        </div>
      ))}

      {switcherOpen && (
        <div className="catmodal-overlay" onClick={closeSwitcher}>
          <div className="catmodal-sheet" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 15.5, fontWeight: 800, color: '#191722' }}>
                {adding ? '다른 계정으로 로그인' : '계정 전환'}
              </div>
              <button aria-label="닫기" disabled={busy} onClick={closeSwitcher} className="catmodal-icon-btn">
                <svg width="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" /></svg>
              </button>
            </div>

            {adding ? (
              <form onSubmit={submitAdd} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input
                  type="email" placeholder="이메일" autoComplete="username" autoFocus
                  value={addEmail} onChange={(e) => setAddEmail(e.target.value)}
                  style={{ fontFamily: 'inherit', fontSize: 14, color: '#191722', background: '#fff', border: '1.5px solid #e9e9ee', borderRadius: 12, padding: '13px 16px', outline: 'none', width: '100%' }}
                />
                <input
                  type="password" placeholder="비밀번호" autoComplete="current-password"
                  value={addPassword} onChange={(e) => setAddPassword(e.target.value)}
                  style={{ fontFamily: 'inherit', fontSize: 14, color: '#191722', background: '#fff', border: '1.5px solid #e9e9ee', borderRadius: 12, padding: '13px 16px', outline: 'none', width: '100%' }}
                />
                {addErr && <p style={{ margin: '0 2px', fontSize: 12.5, color: '#FF4358', fontWeight: 600 }}>{addErr}</p>}
                <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                  <button type="button" onClick={() => setAdding(false)} disabled={busy}
                    style={{ flex: 1, height: 48, border: 'none', borderRadius: 999, background: '#f4f2f0', color: '#191722', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    뒤로
                  </button>
                  <button type="submit" disabled={busy || !addEmail || !addPassword}
                    style={{ flex: 1, height: 48, border: 'none', borderRadius: 999, background: '#191722', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', opacity: (busy || !addEmail || !addPassword) ? 0.6 : 1 }}
                  >
                    {addBusy ? '로그인 중…' : '로그인'}
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div style={{ maxHeight: '50vh', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                  {savedAccounts.map((acc, i) => (
                    <button
                      key={acc.id} type="button" onClick={() => doSwitch(acc)} disabled={busy}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, border: 'none', background: 'transparent',
                        padding: '12px 2px', borderTop: i === 0 ? 'none' : '1.5px solid #f2f1f5',
                        cursor: acc.id === user.id ? 'default' : 'pointer', textAlign: 'left', fontFamily: 'inherit', width: '100%',
                        opacity: busy && acc.id !== user.id ? 0.5 : 1,
                      }}
                    >
                      <span style={{ width: 34, height: 34, borderRadius: '50%', background: '#f4f2f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#191722', flex: 'none' }}>
                        {(acc.display_name || acc.username || '?').slice(0, 1).toUpperCase()}
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ fontSize: 13.75, fontWeight: 700, color: '#191722' }}>{acc.display_name}</span>
                          {acc.role === 'admin' && <span className="settings-admin-badge">관리자</span>}
                        </span>
                        <span style={{ display: 'block', fontSize: 11, color: '#8b8798' }}>@{acc.username}</span>
                      </span>
                      {acc.id === user.id && <span className="tag-periods">현재 계정</span>}
                    </button>
                  ))}
                </div>
                <button type="button" className="btn-ink-pill" style={{ marginTop: 0, height: 44 }} disabled={busy} onClick={openAdd}>
                  ＋ 다른 계정으로 로그인
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
