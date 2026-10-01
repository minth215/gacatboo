// 브라우저 기본 confirm() 대신 쓰는 앱 내 확인 모달(네/아니요 버튼).
export default function ConfirmModal({ message, onYes, onNo, yesLabel = '네', noLabel = '아니요' }) {
  return (
    <div className="catmodal-overlay" onClick={onNo}>
      <div className="catmodal-sheet" onClick={(e) => e.stopPropagation()}>
        <p style={{ fontSize: 14.5, fontWeight: 600, color: '#191722', margin: '4px 2px 18px', whiteSpace: 'pre-line' }}>{message}</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button" onClick={onNo}
            style={{ flex: 1, height: 42, border: 'none', borderRadius: 999, background: '#f4f2f0', color: '#191722', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            {noLabel}
          </button>
          <button
            type="button" onClick={onYes}
            style={{ flex: 1, height: 42, border: 'none', borderRadius: 999, background: '#191722', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            {yesLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
