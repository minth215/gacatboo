import { useState } from 'react';

// 할부 기록 삭제 시 "할부 기록 전체 삭제 / 단건 삭제" 선택 모달.
// const [askInstallmentDelete, installmentDeleteEl] = useInstallmentDeleteChoice();
// const choice = await askInstallmentDelete(t) // 'all' | 'one' | null(취소)
export function useInstallmentDeleteChoice() {
  const [req, setReq] = useState(null); // { t, resolve }
  const ask = (t) => new Promise((resolve) => setReq({ t, resolve }));
  const close = (v) => { req?.resolve(v); setReq(null); };
  const btn = (primary) => ({
    width: '100%', height: 44, border: 'none', borderRadius: 999, fontFamily: 'inherit', fontWeight: 700, fontSize: 14, cursor: 'pointer',
    background: primary ? 'var(--k-bg-191722)' : 'var(--k-bg-f4f2f0)', color: primary ? 'var(--k-onink-fff)' : 'var(--k-tx-191722)',
  });
  const el = req ? (
    <div className="catmodal-overlay" onClick={() => close(null)}>
      <div className="catmodal-sheet" onClick={(e) => e.stopPropagation()}>
        <p style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--k-tx-191722)', margin: '4px 2px 18px' }}>
          할부 기록을 삭제할까요?{req.t?.installment_total ? ` (${req.t.installment_no}/${req.t.installment_total})` : ''}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button type="button" style={btn(true)} onClick={() => close('all')}>할부 기록 전체 삭제</button>
          <button type="button" style={btn(false)} onClick={() => close('one')}>단건 삭제</button>
        </div>
      </div>
    </div>
  ) : null;
  return [ask, el];
}
