import { useState } from 'react';
import { useAuth } from '../lib/auth.jsx';
import PageHeader from '../components/PageHeader.jsx';

const WARNINGS = [
  '탈퇴 시 모든 가계부 데이터가 영구적으로 삭제되며 복구할 수 없습니다.',
  '참여 중인 그룹에서 자동으로 탈퇴되며, 그룹장인 경우 그룹이 삭제됩니다.',
  '진행 중인 반복 내역, 카드 실적 등 설정 정보가 모두 삭제됩니다.',
  '동일한 이메일로 재가입하더라도 이전 데이터는 복구되지 않습니다.',
];

export default function Withdraw() {
  const { withdraw } = useAuth();
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!agree || busy) return;
    if (!confirm('정말 탈퇴하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return;
    setError(''); setBusy(true);
    try { await withdraw(); }
    catch (e) { setError(e.message); setBusy(false); }
  };

  return (
    <div style={{ padding: '44px 0 12px', minHeight: 'calc(100vh - 44px)', display: 'flex', flexDirection: 'column' }}>
      <PageHeader title="회원 탈퇴" flat />

      <div style={{ flex: 1, marginTop: 18 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: '#191722', marginBottom: 12 }}>탈퇴 전 꼭 확인해 주세요</div>
        <div style={{ background: '#fff', borderRadius: 18, padding: '18px 16px', display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 4px 16px rgba(25,23,34,.06)' }}>
          {WARNINGS.map((w) => (
            <div key={w} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
              <svg width="14" viewBox="0 0 24 24" fill="none" stroke="#FF3B5C" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none', marginTop: 2 }}>
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span style={{ fontSize: 12.75, lineHeight: 1.55, color: '#191722' }}>{w}</span>
            </div>
          ))}
        </div>

        <button
          type="button" onClick={() => setAgree((v) => !v)}
          style={{ marginTop: 20, width: '100%', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', border: 'none', borderRadius: 14, background: '#fff', boxShadow: '0 4px 16px rgba(25,23,34,.06)', cursor: 'pointer', textAlign: 'left' }}
        >
          <span style={{ width: 20, height: 20, borderRadius: 6, background: agree ? '#FF3B5C' : '#fff', border: `1.5px solid ${agree ? '#FF3B5C' : '#d8d5de'}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            {agree && (
              <svg width="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            )}
          </span>
          <span style={{ fontSize: 12.75, fontWeight: 600, color: '#191722' }}>안내 사항을 모두 확인하였으며, 이에 동의합니다.</span>
        </button>

        {error && <p style={{ margin: '14px 2px 0', fontSize: 12.5, color: '#FF4358', fontWeight: 600 }}>{error}</p>}
      </div>

      <div style={{ padding: '20px 0 0' }}>
        <button
          onClick={submit} disabled={!agree || busy}
          style={{
            width: '100%', fontFamily: 'inherit', height: 52, border: 'none', borderRadius: 999,
            background: agree ? '#FF3B5C' : '#f0eef1', color: agree ? '#fff' : '#b6b2c0',
            fontSize: 14.5, fontWeight: 700, cursor: (agree && !busy) ? 'pointer' : 'not-allowed',
          }}
        >
          {busy ? '탈퇴 처리 중…' : '탈퇴하기'}
        </button>
      </div>
    </div>
  );
}
