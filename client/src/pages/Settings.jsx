import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
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

export default function Settings() {
  const { user } = useAuth();
  const nav = useNavigate();

  const groups = [
    {
      label: '가계부',
      items: [
        { label: '반복 관리', desc: '정기적으로 반복되는 내역 관리', bg: '#eef1fb', icon: <RepeatIcon /> },
        { label: '그룹 카테고리 관리', desc: '구독·여행·정산 등 그룹 카테고리 관리', bg: '#fff1e6', icon: '🗂️', to: '/settings/group-categories' },
      ],
    },
    {
      label: '분류/원천',
      items: [
        { label: '수입 분류 관리', desc: '월급·부수입·용돈 등 수입 분류 관리', bg: '#e8f6ee', icon: '💵', to: '/settings/categories/income' },
        { label: '지출 분류 관리', desc: '식당·교통·쇼핑 등 지출 분류 관리', bg: '#fde8ee', icon: '🧾', to: '/settings/categories/expense' },
        { label: '원천 관리', desc: '현금·은행·카드 등 원천 자산 관리', bg: '#eef1fb', icon: '🏦', to: '/settings/sources' },
        { label: '카드 실적 관리', desc: '카드별 실적 구간에 따른 혜택 관리', bg: '#fff1e6', icon: '💳', to: '/settings/card-benefits' },
      ],
    },
    {
      label: '설정',
      items: [
        { label: '알림 관리', desc: '세부 항목별 알림 수신 설정', bg: '#fff1e6', icon: '🔔' },
        { label: '내보내기', desc: '가계부 데이터 파일 백업', bg: '#eef1fb', icon: '📤' },
        { label: '가져오기', desc: '파일 업로드로 가계부 데이터 복원', bg: '#e8f6ee', icon: '📥' },
      ],
    },
  ];
  if (user.role === 'admin') {
    groups.push({
      label: '관리자',
      items: [
        { label: '회원 관리', desc: '가입 승인·역할 부여 등 회원 계정 관리', bg: '#fde8ee', icon: '👤', to: '/admin' },
      ],
    });
  }

  return (
    <div style={{ padding: '44px 0 12px' }}>
      <PageHeader title="설정" showBack={false} />

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
    </div>
  );
}
