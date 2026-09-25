// 이모지 입력 필드 — 직접 입력 + 빠른 선택.
const QUICK = [
  '💰', '💵', '🪙', '📈', '🍽️', '🚌', '🛍️', '🎬', '📱', '🛡️',
  '🏥', '📚', '🔁', '📦', '✈️', '🏠', '🍕', '🎁', '☕', '🏦',
  '💳', '🎮', '🐶', '🚗', '🏋️', '💊', '🍺', '🧾', '❤️', '🎓',
];

export default function EmojiField({ value, onChange, showQuick = true }) {
  return (
    <div className="field">
      <label>이모지</label>
      <div className="row" style={{ alignItems: 'center' }}>
        <input
          value={value}
          onChange={(e) => onChange([...e.target.value].slice(-1).join(''))}
          placeholder="🙂"
          style={{ width: 64, textAlign: 'center', fontSize: 22, padding: 8, border: '1px solid var(--line)', borderRadius: 10 }}
        />
        {value && <button type="button" className="btn sm ghost" onClick={() => onChange('')}>지우기</button>}
      </div>
      {showQuick && (
        <div className="emoji-quick">
          {QUICK.map((e) => (
            <button type="button" key={e} className={`emoji-pick ${value === e ? 'active' : ''}`} onClick={() => onChange(e)}>{e}</button>
          ))}
        </div>
      )}
    </div>
  );
}
