// 기록 폼에서 분류/원천 "편집"으로 설정 페이지에 다녀올 때, 작성 중이던 내용을 기기에 잠깐
// 저장해 두고 돌아오면 그대로 복원한다. 다른 경로로 폼을 나가는 경우(저장/닫기 등)에는
// 아예 저장하지 않으므로 복원 대상이 없다. 한 번 읽으면(slot 일치 여부와 무관하게) 즉시
// 지워, 엉뚱한 화면에서 과거 임시 저장값이 다시 뜨는 일이 없게 한다.
const KEY = 'gacatboo.tx-draft.v1';

export function saveTxDraft(slot, data) {
  try { localStorage.setItem(KEY, JSON.stringify({ slot, data })); } catch {}
}

export function takeTxDraft(slot) {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    localStorage.removeItem(KEY);
    const parsed = JSON.parse(raw);
    return parsed?.slot === slot ? parsed.data : null;
  } catch { return null; }
}
