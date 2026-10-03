import { supabase } from './supabase.js';

// supabase 쿼리 에러를 통일된 형태로 던짐
function unwrap({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

// 월 경계 [start, endExclusive). endExclusive = 다음 달 1일.
// Postgres date 는 '2026-06-31' 같은 잘못된 날짜를 거부하므로 상한을 배타적으로 둔다.
function monthBounds(month) {
  const [y, m] = month.split('-').map(Number);
  const next = new Date(Date.UTC(y, m, 1));
  const endExclusive = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-01`;
  return { start: `${month}-01`, endExclusive };
}

// 원천 id → "부모 > 자식" 형태의 스냅샷 이름 (플랫 목록 기준)
function sourceName(flat, id) {
  if (!id) return '';
  const s = flat.find((x) => x.id === id);
  return s ? s.name : ''; // 세부 항목명만(상위 항목 표기 없이)
}

const TX_SELECT = '*, group:groups(name, category), recurring:recurring_rules(id, label, freq_unit, freq_interval, weekdays)';

// 조회 결과를 평탄화 (group_name)
function flattenTx(rows) {
  return (rows || []).map((r) => ({
    ...r,
    group_name: r.group?.name || null,
  }));
}

// 개인 가계부(내 가계부/검색) 전용 필터: 정산 그룹의 결제 내역은 그룹 멤버 전원에게 RLS로 노출되지만
// (그룹 자체의 "결제 내역" 탭에서는 전원이 봐야 함), 각자의 개인 가계부에는 본인이 작성한 항목만 반영한다.
function hideOthersSettlementPayments(rows, userId) {
  return (rows || []).filter((r) => !(r.group_id && r.group?.category === '정산' && r.user_id !== userId));
}

export const db = {
  // ---------- 분류 ----------
  async listCategories(type) {
    let q = supabase.from('categories').select('*').order('sort_order').order('id');
    if (type) q = q.eq('type', type);
    return unwrap(await q);
  },
  async addCategory(userId, type, name, emoji = '', color = '') {
    const existing = unwrap(await supabase.from('categories').select('sort_order').eq('type', type).order('sort_order', { ascending: false }).limit(1));
    const next = (existing[0]?.sort_order ?? -1) + 1;
    return unwrap(await supabase.from('categories').insert({ user_id: userId, type, name, emoji, color, sort_order: next }).select().single());
  },
  async updateCategory(id, patch) {
    const cat = unwrap(await supabase.from('categories').update(patch).eq('id', id).select().single());
    // 이 분류로 등록된 기존 거래의 스냅샷(이름/이모지/배경색)도 함께 갱신
    await supabase.from('transactions').update({ category_name: cat.name, category_emoji: cat.emoji || '', category_color: cat.color || '' }).eq('category_id', id);
    return cat;
  },
  async deleteCategory(id) {
    return unwrap(await supabase.from('categories').delete().eq('id', id));
  },
  // 드래그 정렬 후 순서 일괄 반영
  async reorderCategories(orderedIds) {
    await Promise.all(orderedIds.map((id, i) => supabase.from('categories').update({ sort_order: i }).eq('id', id)));
  },

  // ---------- 원천 ----------
  async listSources() {
    const flat = unwrap(await supabase.from('sources').select('*').order('sort_order').order('id'));
    const tops = flat.filter((s) => s.parent_id == null).map((t) => ({ ...t, children: flat.filter((c) => c.parent_id === t.id) }));
    return { tree: tops, flat };
  },
  async addSource(userId, name, parentId = null) {
    let q = supabase.from('sources').select('sort_order').order('sort_order', { ascending: false }).limit(1);
    q = parentId ? q.eq('parent_id', parentId) : q.is('parent_id', null);
    const existing = unwrap(await q);
    const next = (existing[0]?.sort_order ?? -1) + 1;
    return unwrap(await supabase.from('sources').insert({ user_id: userId, name, parent_id: parentId, sort_order: next }).select().single());
  },
  async updateSource(id, name) {
    return unwrap(await supabase.from('sources').update({ name }).eq('id', id).select().single());
  },
  async deleteSource(id) {
    return unwrap(await supabase.from('sources').delete().eq('id', id));
  },
  // kind: 'payment' | 'deposit'. value: true 로 지정하면 같은 종류의 기존 지정은 자동 해제됨(사용자당 하나씩).
  async setPrimarySource(id, kind, value) {
    return unwrap(await supabase.rpc('set_primary_source', { p_source_id: id, p_kind: kind, p_value: value }));
  },

  // ---------- 화폐 설정(보조 화폐) ----------
  // 주 화폐(원화)는 행이 없고 항상 기본값으로 취급. 여기 목록은 "추가로 쓸 수 있는" 보조 화폐만 담는다.
  async listCurrencies() {
    return unwrap(await supabase.from('user_currencies').select('*').order('sort_order').order('id'));
  },
  async addCurrency(userId, code) {
    const existing = unwrap(await supabase.from('user_currencies').select('sort_order').order('sort_order', { ascending: false }).limit(1));
    const next = (existing[0]?.sort_order ?? -1) + 1;
    const { data, error } = await supabase.from('user_currencies').insert({ user_id: userId, code, sort_order: next }).select().single();
    if (error) throw new Error(error.code === '23505' ? '이미 추가된 화폐입니다.' : error.message);
    return data;
  },
  async deleteCurrency(id) {
    return unwrap(await supabase.from('user_currencies').delete().eq('id', id));
  },

  // ---------- 반복 수입/지출 ----------
  // 생성/삭제와 종료일 수정만 지원(그 외 필드 수정은 해제 후 재등록). 실제 거래 생성은 서버 pg_cron이 매일 수행.
  async listRecurringRules() {
    const rows = unwrap(await supabase.from('recurring_rules').select('*, group:groups(name, owner_id)').eq('active', true).order('created_at', { ascending: false }));
    return rows.map((r) => ({ ...r, group_name: r.group?.name || null }));
  },
  // 규칙을 삭제하면 연결된 과거 거래의 recurring_id 는 자동으로 null 이 됨(on delete set null) — 과거 내역은 유지.
  async deleteRecurringRule(id) {
    return unwrap(await supabase.from('recurring_rules').delete().eq('id', id));
  },
  // 반복 종료일 설정/해제. 값이 있으면 그 날짜까지만(포함) 반복 생성(서버 함수에서 체크).
  async updateRecurringRuleEndDate(id, endDate) {
    return unwrap(await supabase.from('recurring_rules').update({ end_date: endDate || null }).eq('id', id).select().single());
  },
  // 영업일 보정: 'none' | 'before'(전 영업일) | 'after'(후 영업일). 월/연 반복에만 의미가 있음.
  async updateRecurringRuleBusinessDay(id, rule) {
    return unwrap(await supabase.from('recurring_rules').update({ business_day_rule: rule }).eq('id', id).select().single());
  },
  // 과거 날짜로 반복을 새로 걸었을 때 밀린 회차를 한 번에 생성(시작일 다음날 ~ 오늘). 생성 개수 반환.
  async backfillRecurringRule(ruleId) {
    const { data, error } = await supabase.rpc('backfill_recurring_rule', { p_rule_id: ruleId });
    if (error) throw new Error(error.message);
    return data;
  },

  // ---------- 트랜잭션 ----------
  async listTransactions({ month, groupId = null }) {
    const { start, endExclusive } = monthBounds(month);
    let q = supabase.from('transactions').select(TX_SELECT).gte('date', start).lt('date', endExclusive)
      .order('date', { ascending: false }).order('id', { ascending: false });
    if (groupId) q = q.eq('group_id', groupId);
    // 개인 가계부 화면: 보통 group_id 가 없는 내 항목만 보여주되, 그룹 내에서 설정한 반복 항목은
    // (반복 설정을 건 그룹 거래 자체 포함) 그룹 카드 스타일로 개인 가계부에도 함께 노출
    else q = q.or('group_id.is.null,recurring_id.not.is.null');
    return flattenTx(unwrap(await q));
  },
  // 그룹 내역 탭(정산형 등): 월 이동 없이 전체 기간을 한 번에 불러와 월별로 묶어 보여줄 때 사용
  async listGroupTransactionsAll(groupId) {
    const rows = unwrap(await supabase.from('transactions').select(TX_SELECT).eq('group_id', groupId)
      .order('date', { ascending: false }).order('id', { ascending: false }).limit(2000));
    return flattenTx(rows);
  },

  // 개인 가계부: 개인 항목 + 내가 속한 그룹 항목(반영)
  async listLedger({ month, userId }) {
    const { start, endExclusive } = monthBounds(month);
    const rows = unwrap(await supabase.from('transactions').select(TX_SELECT)
      .gte('date', start).lt('date', endExclusive)
      .order('date', { ascending: false }).order('id', { ascending: false }));
    return this.attachSubscriptionPeriods(flattenTx(hideOthersSettlementPayments(rows, userId)));
  },
  // 구독 그룹의 결제/입금이 가계부에 반영된 항목에 회차(몇 회분) 정보를 붙인다.
  // 가계부 행에는 회차가 없어서 원본(subscription_payments/deposits)에서 가져오며,
  // 회차 개념이 없는 정산 그룹 등은 제외하고 카테고리가 '구독'인 그룹만 대상으로 한다.
  // 조회에 실패해도 가계부 표시는 막지 않도록 원래 행을 그대로 돌려준다.
  async attachSubscriptionPeriods(rows) {
    const idsOf = (type) => [...new Set(rows.filter((r) => r.origin_type === type && r.origin_id != null).map((r) => r.origin_id))];
    const payIds = idsOf('payment');
    const depIds = idsOf('deposit');
    if (!payIds.length && !depIds.length) return rows;
    try {
      const [pays, deps] = await Promise.all([
        payIds.length ? supabase.from('subscription_payments').select('id, periods, group_id').in('id', payIds) : { data: [] },
        depIds.length ? supabase.from('subscription_deposits').select('id, periods, group_id').in('id', depIds) : { data: [] },
      ]);
      const src = [
        ...(pays.data || []).map((x) => ({ ...x, type: 'payment' })),
        ...(deps.data || []).map((x) => ({ ...x, type: 'deposit' })),
      ];
      const groupIds = [...new Set(src.map((x) => x.group_id))];
      if (!groupIds.length) return rows;
      const { data: groups } = await supabase.from('groups').select('id, category').in('id', groupIds);
      const subGroups = new Set((groups || []).filter((g) => g.category === '구독').map((g) => g.id));
      const periods = {};
      src.forEach((x) => { if (subGroups.has(x.group_id)) periods[`${x.type}:${x.id}`] = Math.max(Number(x.periods) || 1, 1); });
      return rows.map((r) => {
        const n = periods[`${r.origin_type}:${r.origin_id}`];
        return n ? { ...r, periods: n } : r;
      });
    } catch (e) {
      console.error(e);
      return rows;
    }
  },

  async getTransaction(id) {
    return unwrap(await supabase.from('transactions').select(TX_SELECT).eq('id', id).single());
  },

  // 전체 기간 검색 (개인+참여그룹, RLS 범위). 구조 필터는 서버, 텍스트는 화면에서.
  async searchTransactions({ from, to, type, category, source, userId } = {}) {
    let query = supabase.from('transactions').select(TX_SELECT)
      .order('date', { ascending: false }).order('id', { ascending: false }).limit(2000);
    if (from) query = query.gte('date', from);
    if (to) query = query.lte('date', to);
    if (type === 'income' || type === 'expense') query = query.eq('type', type);
    if (category) query = query.eq('category_name', category);
    if (source) query = query.eq('source_name', source);
    return this.attachSubscriptionPeriods(flattenTx(hideOthersSettlementPayments(unwrap(await query), userId)));
  },

  // 내용 자동완성용: 과거에 쓴 내용(중복 제거, 최신순)
  async listContentSuggestions(userId) {
    const rows = unwrap(await supabase.from('transactions').select('content')
      .eq('user_id', userId).neq('content', '')
      .order('date', { ascending: false }).order('id', { ascending: false }).limit(500));
    const seen = new Set(); const out = [];
    for (const r of rows || []) {
      const c = (r.content || '').trim();
      if (c && !seen.has(c)) { seen.add(c); out.push(c); if (out.length >= 100) break; }
    }
    return out;
  },

  // ---------- 정산 ----------
  // 정산 대상 선택용: 최근 개인 지출 목록 (기본 최근 120일)
  async listRecentExpenses(userId, { days = 120, includeId = null } = {}) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - days);
    const since = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    const rows = unwrap(await supabase.from('transactions')
      .select('id, date, amount, content, category_name, category_emoji')
      .eq('user_id', userId).is('group_id', null).eq('type', 'expense')
      .gte('date', since).order('date', { ascending: false }).order('id', { ascending: false }));
    // 편집 중인 대상이 기간 밖이면 포함
    if (includeId && !rows.some((r) => r.id === includeId)) {
      const one = unwrap(await supabase.from('transactions')
        .select('id, date, amount, content, category_name, category_emoji').eq('id', includeId).maybeSingle());
      if (one) rows.unshift(one);
    }
    return rows;
  },
  // 대상 지출 id 들에 매겨진 정산(수입) 합계 맵 { targetId: sum }
  async settlementsByTarget(expenseIds) {
    if (!expenseIds || !expenseIds.length) return {};
    const rows = unwrap(await supabase.from('transactions')
      .select('settlement_target_id, amount')
      .eq('type', 'income').in('settlement_target_id', expenseIds));
    const map = {};
    (rows || []).forEach((r) => { map[r.settlement_target_id] = (map[r.settlement_target_id] || 0) + Number(r.amount); });
    return map;
  },
  // 정산 수입 건별 초과분(수입으로 계상되는 금액) 맵 { 정산수입행ID: 초과분 }
  // 한 지출에 여러 정산 수입이 걸린 경우 날짜순으로 지출액을 먼저 소진시키고, 남는 만큼을 각 건의 초과분으로 계상
  // → 초과분이 지출 월이 아니라 '정산 수입이 들어온 달'의 수입으로 잡히도록 함
  async settlementExcessByRow(targetIds) {
    const ids = [...new Set((targetIds || []).filter((v) => v != null))];
    if (!ids.length) return {};
    const targets = unwrap(await supabase.from('transactions').select('id, amount').in('id', ids));
    const settleRows = unwrap(await supabase.from('transactions')
      .select('id, date, amount, settlement_target_id')
      .eq('type', 'income').in('settlement_target_id', ids)
      .order('date', { ascending: true }).order('id', { ascending: true }));
    const remaining = {};
    (targets || []).forEach((t) => { remaining[t.id] = Number(t.amount); });
    const excessMap = {};
    (settleRows || []).forEach((r) => {
      const tid = r.settlement_target_id;
      const rem = remaining[tid] || 0;
      const amt = Number(r.amount);
      const consumed = Math.min(rem, amt);
      excessMap[r.id] = amt - consumed;
      remaining[tid] = rem - consumed;
    });
    return excessMap;
  },

  async saveTransaction({ id, userId, payload, sourcesFlat }) {
    const category_name = payload.category_name ?? '';
    const source_name = payload.source_name !== undefined
      ? payload.source_name
      : sourceName(sourcesFlat || [], payload.source_id);
    const base = {
      type: payload.type,
      date: payload.date,
      amount: payload.amount,
      category_id: payload.category_id || null,
      category_name,
      category_emoji: payload.category_emoji ?? '',
      category_color: payload.category_color ?? '',
      source_id: payload.source_id || null,
      source_name,
      content: (payload.content || '').trim(),
      memo: (payload.memo || '').trim(),
      settlement_target_id: payload.settlement_target_id ?? null,
      input_currency: payload.input_currency || '',
      input_amount: payload.input_currency ? payload.input_amount ?? null : null,
      fx_rate: payload.input_currency ? payload.fx_rate ?? null : null,
    };

    // 반복 설정을 새로 켠 경우: 규칙을 먼저 만들고 이 거래에 연결(규칙의 시작일 = 이 거래의 날짜)
    let recurring_id;
    if (payload.recurrence) {
      const r = payload.recurrence;
      const rule = unwrap(await supabase.from('recurring_rules').insert({
        user_id: userId, group_id: payload.group_id || null, type: payload.type, amount: payload.amount,
        category_id: base.category_id, category_name: base.category_name,
        category_emoji: base.category_emoji, category_color: base.category_color,
        source_id: base.source_id, source_name: base.source_name,
        content: base.content, memo: base.memo,
        start_date: payload.date,
        freq_unit: r.freq_unit, freq_interval: r.freq_interval, weekdays: r.weekdays || [], label: r.label,
      }).select().single());
      recurring_id = rule.id;
    }

    let saved;
    if (id) {
      const patch = { ...base, ...(recurring_id ? { recurring_id } : {}) };
      saved = unwrap(await supabase.from('transactions').update(patch).eq('id', id).select(TX_SELECT).single());
    } else {
      const insert = { ...base, user_id: userId, created_by: userId, group_id: payload.group_id || null, ...(recurring_id ? { recurring_id } : {}) };
      saved = unwrap(await supabase.from('transactions').insert(insert).select(TX_SELECT).single());
    }
    // 과거 날짜로 반복을 새로 걸었고 사용자가 일괄 생성을 선택한 경우: 밀린 회차를 한 번에 생성
    if (recurring_id && payload.backfillPast) await this.backfillRecurringRule(recurring_id);
    return saved;
  },
  async deleteTransaction(id) {
    return unwrap(await supabase.from('transactions').delete().eq('id', id));
  },

  // ---------- 그룹 ----------
  async listGroups(userId) {
    // 내가 멤버인 그룹만 RLS로 노출됨
    const groups = unwrap(await supabase.from('groups').select('*, owner:profiles!groups_owner_id_fkey(display_name), group_members(count)')
      .order('created_at', { ascending: false }));
    return groups.map((g) => ({
      ...g,
      owner_name: g.owner?.display_name || '',
      member_count: g.group_members?.[0]?.count ?? 0,
    }));
  },
  async createGroup(userId, { name, description, category, category_emoji, color, start_date, end_date, nickname }) {
    const g = unwrap(await supabase.from('groups').insert({
      name, description: description || '', category, category_emoji: category_emoji || '', color: color || '', owner_id: userId,
      start_date: start_date || null, end_date: end_date || null,
    }).select().single());
    unwrap(await supabase.from('group_members').insert({
      group_id: g.id, user_id: userId, role: 'owner', nickname: (nickname || '').trim(), end_date: end_date || null,
    }));
    return g;
  },
  async updateGroup(id, patch) {
    const g = unwrap(await supabase.from('groups').update({
      name: patch.name?.trim(), description: (patch.description || '').trim(),
      category: patch.category, category_emoji: patch.category_emoji || '', color: patch.color || '',
      start_date: patch.start_date || null, end_date: patch.end_date || null,
      owner_account: (patch.owner_account ?? '').trim(),
      owner_kakaopay_link: (patch.owner_kakaopay_link ?? '').trim(),
    }).eq('id', id).select().single());
    // 그룹 종료일자가 입력되면 멤버들의 종료일자도 함께 맞춤
    if (patch.end_date) {
      await supabase.from('group_members').update({ end_date: patch.end_date }).eq('group_id', id);
    }
    return g;
  },

  // ---------- 그룹 카테고리 (사용자별 선택지, 이름만 관리 — 이모지/색상은 그룹마다 독립 설정) ----------
  async listGroupCategories() {
    return unwrap(await supabase.from('group_categories').select('*').order('sort_order').order('id'));
  },
  async addGroupCategory(userId, name) {
    const existing = unwrap(await supabase.from('group_categories').select('sort_order').order('sort_order', { ascending: false }).limit(1));
    const next = (existing[0]?.sort_order ?? -1) + 1;
    return unwrap(await supabase.from('group_categories').insert({ user_id: userId, name, sort_order: next }).select().single());
  },
  async updateGroupCategory(id, { name, oldName }) {
    const gc = unwrap(await supabase.from('group_categories').update({ name }).eq('id', id).select().single());
    // 이 카테고리를 쓰는 (내가 소유한) 기존 그룹의 이름도 함께 갱신
    if (oldName) {
      await supabase.from('groups').update({ category: gc.name }).eq('category', oldName);
    }
    return gc;
  },
  async deleteGroupCategory(id) {
    return unwrap(await supabase.from('group_categories').delete().eq('id', id));
  },
  async reorderGroupCategories(orderedIds) {
    await Promise.all(orderedIds.map((id, i) => supabase.from('group_categories').update({ sort_order: i }).eq('id', id)));
  },
  async getGroup(id) {
    const group = unwrap(await supabase.from('groups').select('*, owner:profiles!groups_owner_id_fkey(display_name)').eq('id', id).single());
    const rows = unwrap(await supabase.from('group_members')
      .select('id, user_id, role, nickname, start_date, end_date, contact, next_due_override, settlement_override, profiles(username, display_name)')
      .eq('group_id', id));
    // 메모는 총무/총대만 조회 가능(RLS). 아니면 빈 결과.
    const notes = {};
    (unwrap(await supabase.from('group_member_notes').select('member_id, memo').eq('group_id', id)) || [])
      .forEach((n) => { notes[n.member_id] = n.memo; });
    const members = rows.map((m) => ({
      id: m.id, user_id: m.user_id, role: m.role,
      nickname: m.nickname || m.profiles?.display_name || '멤버',
      username: m.profiles?.username || null,
      is_account: !!m.user_id,
      start_date: m.start_date, end_date: m.end_date, contact: m.contact,
      next_due_override: m.next_due_override, settlement_override: m.settlement_override,
      memo: notes[m.id] || '',
    })).sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : (a.nickname || '').localeCompare(b.nickname || '')));
    return { group: { ...group, owner_name: group.owner?.display_name || '' }, members };
  },
  async addMember(groupId, { nickname, start_date, end_date, contact, memo, username }) {
    let user_id = null;
    if (username && username.trim()) {
      const prof = unwrap(await supabase.from('profiles').select('id, status').eq('username', username.trim()).maybeSingle());
      if (!prof) throw new Error('해당 아이디의 사용자를 찾을 수 없습니다.');
      if (prof.status !== 'approved') throw new Error('승인된 사용자만 연결할 수 있습니다.');
      const exists = unwrap(await supabase.from('group_members').select('id').eq('group_id', groupId).eq('user_id', prof.id).maybeSingle());
      if (exists) throw new Error('이미 멤버로 추가된 계정입니다.');
      user_id = prof.id;
    }
    const row = unwrap(await supabase.from('group_members').insert({
      group_id: groupId, user_id, role: 'member',
      nickname: (nickname || '').trim(),
      start_date: start_date || null, end_date: end_date || null,
      contact: (contact || '').trim() || null,
    }).select('id').single());
    if (memo && memo.trim()) {
      unwrap(await supabase.from('group_member_notes').insert({ member_id: row.id, group_id: groupId, memo: memo.trim() }));
    }
    return row;
  },
  async updateMember(memberId, groupId, patch) {
    const upd = {
      nickname: (patch.nickname || '').trim(),
      start_date: patch.start_date || null, end_date: patch.end_date || null,
      contact: (patch.contact || '').trim() || null,
    };
    if ('next_due_override' in patch) upd.next_due_override = patch.next_due_override || null;
    unwrap(await supabase.from('group_members').update(upd).eq('id', memberId));
    if ('memo' in patch) {
      unwrap(await supabase.from('group_member_notes').upsert({ member_id: memberId, group_id: groupId, memo: (patch.memo || '').trim() }));
    }
  },
  // 정산 탭: 멤버별 정산 금액 수동 조정(null 이면 기본 균등분배 금액 사용)
  async updateMemberSettlementOverride(memberId, amount) {
    return unwrap(await supabase.from('group_members')
      .update({ settlement_override: amount == null ? null : Math.max(Math.round(Number(amount)) || 0, 0) })
      .eq('id', memberId));
  },
  async removeMember(memberId) {
    return unwrap(await supabase.from('group_members').delete().eq('id', memberId));
  },
  async deleteGroup(id) {
    return unwrap(await supabase.from('groups').delete().eq('id', id));
  },

  // ---------- 구독 설정 ----------
  async getSubscription(groupId) {
    return unwrap(await supabase.from('subscriptions').select('*').eq('group_id', groupId).maybeSingle());
  },
  async upsertSubscription(groupId, s) {
    return unwrap(await supabase.from('subscriptions').upsert({ group_id: groupId, ...s }).select().single());
  },

  // ---------- 결제 내역 (총대 지출 자동기입) ----------
  async listPayments(groupId) {
    return unwrap(await supabase.from('subscription_payments').select('*, recurring:recurring_rules(id, label)')
      .eq('group_id', groupId).order('date', { ascending: false }).order('id', { ascending: false }));
  },
  async getPayment(id) {
    return unwrap(await supabase.from('subscription_payments').select('*, recurring:recurring_rules(id, label)').eq('id', id).single());
  },
  // 정산 대상 후보: 이 그룹에서 입력된 결제 내역(지출)만, tx_id(가계부 지출 항목 id) 기준
  async listGroupPaymentExpenses(groupId) {
    const rows = unwrap(await supabase.from('subscription_payments')
      .select('tx_id, date, amount, content, category_name, category_emoji')
      .eq('group_id', groupId).not('tx_id', 'is', null)
      .order('date', { ascending: false }).order('tx_id', { ascending: false }));
    return (rows || []).map((r) => ({ id: r.tx_id, date: r.date, amount: r.amount, content: r.content, category_name: r.category_name, category_emoji: r.category_emoji }));
  },
  async createPayment(groupId, userId, p) {
    const tx = unwrap(await supabase.from('transactions').insert({
      user_id: userId, group_id: null, type: 'expense', date: p.date, amount: p.amount,
      category_name: p.category_name || '구독', category_emoji: p.category_emoji || '',
      source_id: p.source_id || null, source_name: p.source_name || '',
      content: (p.content || '').trim(), memo: (p.memo || '').trim(), created_by: userId,
    }).select('id').single());

    // 반복 설정을 새로 켠 경우: 규칙을 만들고(target='subscription_payment') 결제·미러 거래 양쪽에 연결.
    // 이후 서버(pg_cron)가 생성하는 결제도 동일한 규칙을 보고 같은 방식으로 subscription_payments +
    // 미러 거래를 함께 만듦(아래 generate_due_recurring_transactions 참고).
    let recurring_id = null;
    if (p.recurrence) {
      const r = p.recurrence;
      const rule = unwrap(await supabase.from('recurring_rules').insert({
        user_id: userId, group_id: groupId, target: 'subscription_payment', type: 'expense', amount: p.amount,
        category_name: p.category_name || '구독', category_emoji: p.category_emoji || '',
        source_id: p.source_id || null, source_name: p.source_name || '',
        content: (p.content || '').trim(), memo: (p.memo || '').trim(),
        start_date: p.date, freq_unit: r.freq_unit, freq_interval: r.freq_interval, weekdays: r.weekdays || [], label: r.label,
      }).select().single());
      recurring_id = rule.id;
      unwrap(await supabase.from('transactions').update({ recurring_id }).eq('id', tx.id));
    }

    const pay = unwrap(await supabase.from('subscription_payments').insert({
      group_id: groupId, date: p.date, amount: p.amount, periods: Math.max(Number(p.periods) || 1, 1),
      category_name: p.category_name || '구독', category_emoji: p.category_emoji || '',
      source_id: p.source_id || null, source_name: p.source_name || '',
      content: (p.content || '').trim(), memo: (p.memo || '').trim(), tx_id: tx.id, created_by: userId,
      recurring_id,
    }).select().single());
    // 미러 tx 에 원본 링크
    unwrap(await supabase.from('transactions').update({ origin_type: 'payment', origin_id: pay.id, origin_group_id: groupId }).eq('id', tx.id));
    // 과거 날짜로 반복을 새로 걸었고 사용자가 일괄 생성을 선택한 경우: 밀린 회차를 한 번에 생성
    // (이 결제 행이 먼저 존재해야 밀린 회차 계산의 기준(마지막 결제일·회차)이 맞으므로 가장 마지막에 호출)
    if (recurring_id && p.backfillPast) await this.backfillRecurringRule(recurring_id);
    return pay;
  },
  // 결제 수정 → 트리거가 미러 tx 동기화
  async updatePayment(id, p, userId) {
    // 수정 중에 반복을 새로 켠 경우(원래 반복이 아니었던 결제): 규칙을 만들고 이 결제·미러 거래에 연결
    let recurring_id;
    if (p.recurrence) {
      const existing = unwrap(await supabase.from('subscription_payments').select('group_id, tx_id, recurring_id').eq('id', id).single());
      if (!existing.recurring_id) {
        const r = p.recurrence;
        const rule = unwrap(await supabase.from('recurring_rules').insert({
          user_id: userId, group_id: existing.group_id, target: 'subscription_payment', type: 'expense', amount: p.amount,
          category_name: p.category_name || '구독', category_emoji: p.category_emoji || '',
          source_id: p.source_id || null, source_name: p.source_name || '',
          content: (p.content || '').trim(), memo: (p.memo || '').trim(),
          start_date: p.date, freq_unit: r.freq_unit, freq_interval: r.freq_interval, weekdays: r.weekdays || [], label: r.label,
        }).select().single());
        recurring_id = rule.id;
        if (existing.tx_id) unwrap(await supabase.from('transactions').update({ recurring_id }).eq('id', existing.tx_id));
      }
    }
    const patch = {
      date: p.date, amount: p.amount, periods: Math.max(Number(p.periods) || 1, 1),
      category_name: p.category_name || '구독', category_emoji: p.category_emoji || '',
      source_id: p.source_id || null, source_name: p.source_name || '',
      content: (p.content || '').trim(), memo: (p.memo || '').trim(),
      ...(recurring_id ? { recurring_id } : {}),
    };
    const saved = unwrap(await supabase.from('subscription_payments').update(patch).eq('id', id).select().single());
    if (recurring_id && p.backfillPast) await this.backfillRecurringRule(recurring_id);
    return saved;
  },
  async deletePayment(id) {
    const pay = unwrap(await supabase.from('subscription_payments').select('tx_id').eq('id', id).single());
    unwrap(await supabase.from('subscription_payments').delete().eq('id', id));
    if (pay?.tx_id) unwrap(await supabase.from('transactions').delete().eq('id', pay.tx_id));
  },

  // ---------- 입금 내역 (총대 수입 + 멤버 지출 자동기입, RPC) ----------
  async listDeposits(groupId) {
    return unwrap(await supabase.from('subscription_deposits')
      .select('*, member:group_members(nickname), recurring:recurring_rules(id, label)')
      .eq('group_id', groupId).order('date', { ascending: false }).order('id', { ascending: false }));
  },
  async getDeposit(id) {
    return unwrap(await supabase.from('subscription_deposits')
      .select('*, member:group_members(nickname), recurring:recurring_rules(id, label)').eq('id', id).single());
  },
  async createDeposit(p, userId) {
    const { data: depId, error } = await supabase.rpc('create_subscription_deposit', {
      p_group_id: p.group_id, p_member_id: p.member_id, p_date: p.date, p_amount: p.amount,
      p_periods: p.periods, p_category_name: p.category_name || '', p_category_emoji: p.category_emoji || '',
      p_source_id: p.source_id || null, p_source_name: p.source_name || '',
      p_deposit_source_name: p.deposit_source_name || '', p_content: p.content || '', p_memo: p.memo || '',
      p_leader_category_name: p.leader_category_name || '', p_leader_category_emoji: p.leader_category_emoji || '',
      p_leader_settlement_target_id: p.leader_settlement_target_id || null,
    });
    if (error) throw new Error(error.message);

    // 반복 설정을 새로 켠 경우: 규칙을 만들고(target='subscription_deposit') 이 입금과 총대/멤버
    // 미러 거래 양쪽에 연결. 이후 서버(pg_cron)가 생성하는 입금도 같은 규칙을 보고 총대 수입·멤버
    // 지출 미러를 동일하게 만듦(아래 generate_due_recurring_transactions 참고).
    if (p.recurrence) {
      const r = p.recurrence;
      const rule = unwrap(await supabase.from('recurring_rules').insert({
        user_id: userId, group_id: p.group_id, member_id: p.member_id, target: 'subscription_deposit', type: 'income',
        amount: p.amount,
        category_name: p.category_name || '', category_emoji: p.category_emoji || '', source_name: p.source_name || '',
        leader_category_name: p.leader_category_name || '', leader_category_emoji: p.leader_category_emoji || '',
        deposit_source_name: p.deposit_source_name || '',
        content: (p.content || '').trim(), memo: (p.memo || '').trim(),
        start_date: p.date, freq_unit: r.freq_unit, freq_interval: r.freq_interval, weekdays: r.weekdays || [], label: r.label,
      }).select().single());
      const dep = unwrap(await supabase.from('subscription_deposits').update({ recurring_id: rule.id }).eq('id', depId).select('leader_tx_id, member_tx_id').single());
      const txIds = [dep.leader_tx_id, dep.member_tx_id].filter(Boolean);
      if (txIds.length) unwrap(await supabase.from('transactions').update({ recurring_id: rule.id }).in('id', txIds));
      // 과거 날짜로 반복을 새로 걸었고 사용자가 일괄 생성을 선택한 경우: 밀린 회차를 한 번에 생성
      if (p.backfillPast) await this.backfillRecurringRule(rule.id);
    }
    return depId;
  },
  // 입금 수정 → 트리거가 총대/멤버 미러 tx 동기화 (RLS: 총대 또는 본인)
  async updateDeposit(id, p, userId) {
    // 수정 중에 반복을 새로 켠 경우(원래 반복이 아니었던 입금): 규칙을 만들고 총대/멤버 미러 거래에 연결
    let recurring_id;
    if (p.recurrence) {
      const existing = unwrap(await supabase.from('subscription_deposits').select('group_id, member_id, leader_tx_id, member_tx_id, recurring_id').eq('id', id).single());
      if (!existing.recurring_id) {
        const r = p.recurrence;
        const rule = unwrap(await supabase.from('recurring_rules').insert({
          user_id: userId, group_id: existing.group_id, member_id: existing.member_id, target: 'subscription_deposit', type: 'income',
          amount: p.amount,
          category_name: p.category_name || '', category_emoji: p.category_emoji || '', source_name: p.source_name || '',
          leader_category_name: p.leader_category_name || '', leader_category_emoji: p.leader_category_emoji || '',
          deposit_source_name: p.deposit_source_name || '',
          content: (p.content || '').trim(), memo: (p.memo || '').trim(),
          start_date: p.date, freq_unit: r.freq_unit, freq_interval: r.freq_interval, weekdays: r.weekdays || [], label: r.label,
        }).select().single());
        recurring_id = rule.id;
        const txIds = [existing.leader_tx_id, existing.member_tx_id].filter(Boolean);
        if (txIds.length) unwrap(await supabase.from('transactions').update({ recurring_id }).in('id', txIds));
      }
    }
    const patch = {
      date: p.date, amount: p.amount, periods: Math.max(Number(p.periods) || 1, 1),
      category_name: p.category_name || '', category_emoji: p.category_emoji || '',
      source_name: p.source_name || '', deposit_source_name: p.deposit_source_name || '',
      content: (p.content || '').trim(), memo: (p.memo || '').trim(),
      leader_category_name: p.leader_category_name || '', leader_category_emoji: p.leader_category_emoji || '',
      leader_settlement_target_id: p.leader_settlement_target_id || null,
      ...(recurring_id ? { recurring_id } : {}),
    };
    const saved = unwrap(await supabase.from('subscription_deposits').update(patch).eq('id', id).select().single());
    if (recurring_id && p.backfillPast) await this.backfillRecurringRule(recurring_id);
    return saved;
  },
  async deleteDeposit(id) {
    const { error } = await supabase.rpc('delete_subscription_deposit', { p_id: id });
    if (error) throw new Error(error.message);
  },

  // ---------- 내 프로필 ----------
  async updateMyProfile(username, displayName) {
    return unwrap(await supabase.rpc('update_my_profile', { p_username: username, p_display_name: displayName }));
  },

  // ---------- 친구 분류 ----------
  async listFriendGroups() {
    return unwrap(await supabase.from('friend_groups').select('*').order('sort_order').order('id'));
  },
  async addFriendGroup(userId, name) {
    const existing = unwrap(await supabase.from('friend_groups').select('sort_order').order('sort_order', { ascending: false }).limit(1));
    const next = (existing[0]?.sort_order ?? -1) + 1;
    return unwrap(await supabase.from('friend_groups').insert({ user_id: userId, name, sort_order: next }).select().single());
  },
  async updateFriendGroup(id, name) {
    return unwrap(await supabase.from('friend_groups').update({ name }).eq('id', id).select().single());
  },
  async deleteFriendGroup(id) {
    return unwrap(await supabase.from('friend_groups').delete().eq('id', id));
  },

  // ---------- 친구 ----------
  async listFriends() {
    return unwrap(await supabase.from('friends').select('*, friend:profiles!friends_friend_user_id_fkey(username, display_name)').order('sort_order').order('id'));
  },
  // 아이디로 가캣부 회원 검색(등록 전 닉네임 미리 채우기용)
  async findProfileByUsername(username) {
    const prof = unwrap(await supabase.from('profiles').select('id, username, display_name, status').eq('username', username.trim()).maybeSingle());
    if (!prof) throw new Error('해당 아이디의 사용자를 찾을 수 없습니다.');
    if (prof.status !== 'approved') throw new Error('승인된 사용자만 등록할 수 있습니다.');
    return prof;
  },
  async addFriend(userId, { friendUserId = null, nickname, groupId = null }) {
    if (friendUserId === userId) throw new Error('자기 자신은 친구로 등록할 수 없습니다.');
    if (friendUserId) {
      const exists = unwrap(await supabase.from('friends').select('id').eq('user_id', userId).eq('friend_user_id', friendUserId).maybeSingle());
      if (exists) throw new Error('이미 등록된 친구입니다.');
    }
    const existing = unwrap(await supabase.from('friends').select('sort_order').eq('user_id', userId).order('sort_order', { ascending: false }).limit(1));
    const next = (existing[0]?.sort_order ?? -1) + 1;
    return unwrap(await supabase.from('friends').insert({
      user_id: userId, friend_user_id: friendUserId, nickname: nickname.trim(), group_id: groupId, sort_order: next,
    }).select('*, friend:profiles!friends_friend_user_id_fkey(username, display_name)').single());
  },
  async updateFriend(id, { nickname, groupId = null }) {
    return unwrap(await supabase.from('friends').update({ nickname: nickname.trim(), group_id: groupId })
      .eq('id', id).select('*, friend:profiles!friends_friend_user_id_fkey(username, display_name)').single());
  },
  async deleteFriend(id) {
    return unwrap(await supabase.from('friends').delete().eq('id', id));
  },

  // ---------- 관리자 ----------
  async listUsers() {
    const users = unwrap(await supabase.from('profiles').select('*').order('created_at', { ascending: false }));
    return users.sort((a, b) => (a.status === 'pending' ? -1 : b.status === 'pending' ? 1 : 0));
  },
  async setUserStatus(id, status) {
    return unwrap(await supabase.from('profiles').update({ status }).eq('id', id));
  },
  async setUserRole(id, role) {
    return unwrap(await supabase.from('profiles').update({ role }).eq('id', id));
  },
  // ---------- 카드 실적(혜택 구간) ----------
  async listCardBenefits() {
    return unwrap(await supabase.from('card_benefit_tiers').select('*')
      .order('source_id').order('threshold'));
  },
  async addCardTier(userId, sourceId, { threshold, benefit }) {
    return unwrap(await supabase.from('card_benefit_tiers').insert({
      user_id: userId, source_id: sourceId,
      threshold: Math.max(Math.round(Number(threshold) || 0), 0), benefit: (benefit || '').trim(),
    }).select().single());
  },
  async updateCardTier(id, { threshold, benefit }) {
    return unwrap(await supabase.from('card_benefit_tiers').update({
      threshold: Math.max(Math.round(Number(threshold) || 0), 0), benefit: (benefit || '').trim(),
    }).eq('id', id).select().single());
  },
  async deleteCardTier(id) {
    return unwrap(await supabase.from('card_benefit_tiers').delete().eq('id', id));
  },

  // ---------- 통계 (클라이언트 집계) ----------
  // 기간 내 거래를 정산 반영 금액(eff)과 함께 반환. 분류별/원천별/항목별 집계는 화면에서 수행.
  // 범위는 가계부(listLedger)와 동일: 내 개인 항목 + 내가 속한 그룹 항목(RLS 범위)
  async statsRows({ start, endExclusive }) {
    const rows = unwrap(await supabase.from('transactions').select(TX_SELECT)
      .gte('date', start).lt('date', endExclusive)
      .order('date', { ascending: false }).order('id', { ascending: false }).limit(5000));

    const expenses = rows.filter((r) => r.type === 'expense');
    // 이 기간 지출에 매겨진 정산(수입) 합계 — 정산은 다른 기간일 수도 있으므로 전 기간 조회
    const settleMap = await this.settlementsByTarget(expenses.map((r) => r.id));
    // 이 기간에 들어온 정산 수입 — 초과분만 이 기간 수입으로 계상
    const settleIncomeRows = rows.filter((r) => r.type === 'income' && r.settlement_target_id != null);
    const excessMap = await this.settlementExcessByRow(settleIncomeRows.map((r) => r.settlement_target_id));

    const withEff = flattenTx(rows).map((r) => {
      // 대상 지출은 정산액만큼 차감(0 하한)
      if (r.type === 'expense') return { ...r, eff: Math.max(0, Number(r.amount) - (settleMap[r.id] || 0)) };
      // 정산 수입은 초과분만 '정산' 수입으로 계상
      if (r.settlement_target_id != null) return { ...r, eff: excessMap[r.id] || 0, category_name: '정산' };
      return { ...r, eff: Number(r.amount) };
    });
    // 구독 그룹 결제/입금이 반영된 항목에 회차(몇 회분) 정보를 붙인다(가계부와 동일).
    return this.attachSubscriptionPeriods(withEff);
  },

  async groupStats(groupId, month, members) {
    const { start, endExclusive } = monthBounds(month);
    const rows = unwrap(await supabase.from('transactions').select('type, amount, category_name, user_id')
      .eq('group_id', groupId).gte('date', start).lt('date', endExclusive));
    const sum = (arr, t) => arr.filter((r) => r.type === t).reduce((s, r) => s + Number(r.amount), 0);
    const income = sum(rows, 'income');
    const expense = sum(rows, 'expense');

    const byMember = members.map((mem) => {
      const mr = rows.filter((r) => r.user_id === mem.user_id);
      return { name: mem.display_name, income: sum(mr, 'income'), expense: sum(mr, 'expense') };
    }).sort((a, b) => b.expense - a.expense);

    const catMap = {};
    rows.filter((r) => r.type === 'expense').forEach((r) => {
      const n = r.category_name || '미분류';
      catMap[n] = (catMap[n] || 0) + Number(r.amount);
    });
    const byCategory = Object.entries(catMap).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total);

    return { totals: { income, expense, balance: income - expense }, byMember, byCategory };
  },

  async createUser({ email, password, username, display_name, role }) {
    const { data, error } = await supabase.functions.invoke('admin', {
      body: { action: 'create_user', email, password, username, display_name, role },
    });
    if (error) throw new Error(data?.error || error.message);
    if (data?.error) throw new Error(data.error);
    return data;
  },
  async deleteUser(id) {
    const { data, error } = await supabase.functions.invoke('admin', { body: { action: 'delete_user', id } });
    if (error) throw new Error(data?.error || error.message);
    if (data?.error) throw new Error(data.error);
    return data;
  },
  // 본인 계정 탈퇴(관리자 권한 불필요 — 로그인한 누구나 자기 자신만 삭제 가능)
  async withdrawMyAccount() {
    const { data, error } = await supabase.functions.invoke('admin', { body: { action: 'delete_self' } });
    if (error) throw new Error(data?.error || error.message);
    if (data?.error) throw new Error(data.error);
    return data;
  },

  // 영수증 사진(base64) → { date, amount, merchant, category } 추출(Gemini Vision, 서버 함수 호출)
  async parseReceipt(image, mimeType, categoryNames) {
    const { data, error } = await supabase.functions.invoke('parse-receipt', {
      body: { image, mimeType, categoryNames },
    });
    if (error) {
      // supabase-js 는 Edge Function이 2xx가 아니면 data 를 비우고 실제 응답 본문을
      // error.context(Response) 안에 읽지 않은 채로 둔다 — 여기서 꺼내야 진짜 에러 메시지가 보임.
      let msg = error.message;
      if (error.context && typeof error.context.json === 'function') {
        try {
          const body = await error.context.clone().json();
          if (body?.error) msg = body.error;
        } catch {}
      }
      throw new Error(msg);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  },
};
