import { TILE_BG } from './TransactionList.jsx';

// 분류 아이콘 배경색 입력 필드 — 프리셋 파스텔 톤 + 직접 선택.
export default function ColorField({ value, onChange }) {
  return (
    <div className="field">
      <label>배경색 <span className="small muted">(가계부 아이콘 배경)</span></label>
      <div className="row" style={{ alignItems: 'center', gap: 8 }}>
        <input
          type="color"
          value={value || '#F2F1F5'}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: 44, height: 38, padding: 2, border: '1px solid var(--line)', borderRadius: 10, background: '#fff' }}
        />
        {value && <button type="button" className="btn sm ghost" onClick={() => onChange('')}>기본값</button>}
      </div>
      <div className="emoji-quick">
        {TILE_BG.map((c) => (
          <button
            type="button" key={c} aria-label={c} onClick={() => onChange(c)}
            style={{
              width: 30, height: 30, borderRadius: 8, background: c, padding: 0, cursor: 'pointer',
              border: value === c ? '2px solid var(--primary)' : '1px solid var(--line)',
            }}
          />
        ))}
      </div>
    </div>
  );
}
