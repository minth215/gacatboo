import { useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import { loadStyle, setStyle } from '../lib/style.js';

function OptionRow({ active, disabled, label, desc, badge, onClick }) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        border: 'none', background: 'transparent', textAlign: 'left', padding: '13px 14px',
        opacity: disabled ? 0.45 : 1, cursor: disabled ? 'default' : 'pointer',
      }}
    >
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13.25, fontWeight: 700, color: 'var(--k-tx-191722)' }}>{label}</span>
          {badge && (
            <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--k-tx-8b8798)', background: 'var(--k-bg-f4f2f0)', borderRadius: 999, padding: '2px 6px' }}>{badge}</span>
          )}
        </div>
        {desc && <div style={{ marginTop: 2, fontSize: 11.5, color: 'var(--k-tx-a29ead)' }}>{desc}</div>}
      </div>
      <span
        aria-hidden style={{
          width: 20, height: 20, borderRadius: '50%', flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          border: active ? 'none' : '1.5px solid var(--k-bd-d8d5d0)', background: active ? 'var(--primary)' : 'transparent',
        }}
      >
        {active && (
          <svg width="11" viewBox="0 0 24 24" fill="none" stroke="var(--k-onink-fff)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="5 13 9 17 19 7" /></svg>
        )}
      </span>
    </button>
  );
}

export default function SettingsStyle() {
  const [style, setStyleState] = useState(loadStyle);

  const choose = (patch) => setStyleState(setStyle(patch));

  return (
    <div style={{ padding: '44px 0 12px' }}>
      <PageHeader title="스타일" flat />

      <div className="settings-group-label" style={{ marginTop: 18 }}>테마</div>
      <div className="tx-daycard">
        <OptionRow active={style.theme === 'light'} label="라이트 모드" onClick={() => choose({ theme: 'light' })} />
        <div style={{ borderTop: '1.5px solid var(--k-bd-f2f1f5)' }}>
          <OptionRow active={style.theme === 'dark'} label="다크 모드" onClick={() => choose({ theme: 'dark' })} />
        </div>
        <div style={{ borderTop: '1.5px solid var(--k-bd-f2f1f5)' }}>
          <OptionRow active={style.theme === 'system'} label="기기 설정 따름" desc="휴대폰의 라이트/다크 설정에 맞춰 바뀌어요" onClick={() => choose({ theme: 'system' })} />
        </div>
      </div>

      <div className="settings-group-label" style={{ marginTop: 18 }}>폰트</div>
      <div className="tx-daycard">
        <OptionRow active={style.font === 'paperlogy'} label="페이퍼로지" onClick={() => choose({ font: 'paperlogy' })} />
        <div style={{ borderTop: '1.5px solid var(--k-bd-f2f1f5)' }}>
          <OptionRow active={style.font === 'system'} label="시스템 폰트" onClick={() => choose({ font: 'system' })} />
        </div>
      </div>
    </div>
  );
}
