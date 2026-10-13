import { useRef, useState } from 'react';
import { db } from '../lib/db.js';
import { useAuth } from '../lib/auth.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';

const SUMMARY_LABELS = {
  sources: '원천', categories: '수입/지출 분류', category_budgets: '예산', card_benefit_tiers: '카드 실적 구간',
  friend_groups: '친구 분류', friends: '친구', recurring_rules: '반복 규칙', transactions: '가계부 항목',
  groups: '그룹', group_members: '그룹 멤버',
};

export default function SettingsImport() {
  const { user } = useAuth();
  const fileRef = useRef(null);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState(null);

  const pick = () => fileRef.current?.click();

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setFileName(file.name);
    setErr(''); setResult(null);
    if (!confirm(`'${file.name}' 백업 파일을 가져올까요? 가져온 내용은 기존 데이터에 추가됩니다(덮어쓰지 않음).`)) return;
    setBusy(true);
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const summary = await db.importBackup(user.id, payload);
      setResult(summary);
    } catch (e2) {
      setErr(e2.message?.includes('JSON') ? '파일을 읽을 수 없습니다. 올바른 백업 파일인지 확인하세요.' : e2.message);
    } finally { setBusy(false); }
  };

  return (
    <div style={{ padding: '44px 0 32px' }}>
      <PageHeader title="가져오기" flat />

      <div className="tx-daycard" style={{ marginTop: 14, padding: '18px 16px', textAlign: 'center' }}>
        <div style={{ fontSize: 28 }}>📥</div>
        <div style={{ marginTop: 8, fontSize: 13.25, fontWeight: 700, color: '#191722' }}>백업 파일(JSON) 업로드</div>
        <div style={{ marginTop: 4, fontSize: 11.5, color: '#a29ead' }}>설정 &gt; 내보내기로 만든 백업 파일을 선택하세요.</div>
        {fileName && <div style={{ marginTop: 8, fontSize: 11.5, color: '#8b8798' }}>{fileName}</div>}
        <input ref={fileRef} type="file" accept="application/json,.json" onChange={onFile} style={{ display: 'none' }} />
        <button type="button" className="btn-ink-pill" style={{ marginTop: 14 }} disabled={busy} onClick={pick}>
          파일 선택
        </button>
      </div>

      {busy && <div style={{ marginTop: 20 }}><Spinner /></div>}
      {err && <p className="error" style={{ marginTop: 14 }}>{err}</p>}

      {result && (
        <div className="tx-daycard" style={{ marginTop: 14 }}>
          {Object.entries(result).filter(([k]) => k !== 'groups_skipped').map(([k, v], i) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderTop: i === 0 ? 'none' : '1.5px solid #f2f1f5' }}>
              <span style={{ fontSize: 13, color: '#191722' }}>{SUMMARY_LABELS[k] || k}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#191722' }}>{v}건</span>
            </div>
          ))}
          {result.groups_skipped > 0 && (
            <div style={{ padding: '12px 14px', borderTop: '1.5px solid #f2f1f5', fontSize: 11.5, color: '#a29ead' }}>
              내가 총무/총대가 아니었던 그룹 {result.groups_skipped}건은 소유권을 옮길 수 없어 제외됐습니다. 필요하면 직접 다시 만들어 주세요.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
