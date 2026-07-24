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

const TX_SELECT =
  '*, group:groups(name), author:profiles!transactions_user_fk(display_name)';

// 조회 결과를 평탄화 (group_name, author_name)
function flattenTx(rows) {
  return (rows || []).map((r) => ({
    ...r,
    group_name: r.group?.name || null,
    author_name: r.author?.display_name || null,
  }));
}

export const db = {
  // ---------- 분류 ----------
  async listCategories(type) {
    let q = supabase.from('categories').select('*').order('sort_order').order('id');
    if (type) q = q.eq('type', type);
    return unwrap(await q);
  },
  async addCategory(userId, type, name, emoji = '') {
    const existing = unwrap(await supabase.from('categories').select('sort_order').eq('type', type).order('sort_order', { ascending: false }).limit(1));
    const next = (existing[0]?.sort_order ?? -1) + 1;
    return unwrap(await supabase.from('categories').insert({ user_id: userId, type, name, emoji, sort_order: next }).select().single());
  },
  async updateCategory(id, patch) {
    const cat = unwrap(await supabase.from('categories').update(patch).eq('id', id).select().single());
    // 이 분류로 등록된 기존 거래의 스냅샷(이름/이모지)도 함께 갱신
    await supabase.from('transactions').update({ category_name: cat.name, category_emoji: cat.emoji || '' }).eq('category_id', id);
    return cat;
  },
  async deleteCategory(id) {
    return unwrap(await supabase.from('categories').delete().eq('id', id));
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

  // ---------- 트랜잭션 ----------
  async listTransactions({ month, groupId = null }) {
    const { start, endExclusive } = monthBounds(month);
    let q = supabase.from('transactions').select(TX_SELECT).gte('date', start).lt('date', endExclusive)
      .order('date', { ascending: false }).order('id', { ascending: false });
    if (groupId) q = q.eq('group_id', groupId);
    else q = q.is('group_id', null);
    return flattenTx(unwrap(await q));
  },

  // 개인 가계부: 개인 항목 + 내가 속한 그룹 항목(반영)
  async listLedger({ month }) {
    const { start, endExclusive } = monthBounds(month);
    const rows = unwrap(await supabase.from('transactions').select(TX_SELECT)
      .gte('date', start).lt('date', endExclusive)
      .order('date', { ascending: false }).order('id', { ascending: false }));
    return flattenTx(rows);
  },

  async getTransaction(id) {
    return unwrap(await supabase.from('transactions').select(TX_SELECT).eq('id', id).single());
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
      source_id: payload.source_id || null,
      source_name,
      content: (payload.content || '').trim(),
      memo: (payload.memo || '').trim(),
      settlement_target_id: payload.settlement_target_id ?? null,
    };
    if (id) {
      return unwrap(await supabase.from('transactions').update(base).eq('id', id).select(TX_SELECT).single());
    }
    const insert = { ...base, user_id: userId, created_by: userId, group_id: payload.group_id || null };
    return unwrap(await supabase.from('transactions').insert(insert).select(TX_SELECT).single());
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
  async createGroup(userId, { name, description, category, category_emoji, start_date, end_date }) {
    const g = unwrap(await supabase.from('groups').insert({
      name, description: description || '', category, category_emoji: category_emoji || '', owner_id: userId,
      start_date: start_date || null, end_date: end_date || null,
    }).select().single());
    unwrap(await supabase.from('group_members').insert({ group_id: g.id, user_id: userId, role: 'owner' }));
    return g;
  },
  async updateGroup(id, patch) {
    return unwrap(await supabase.from('groups').update({
      name: patch.name?.trim(), description: (patch.description || '').trim(),
      category: patch.category, category_emoji: patch.category_emoji || '',
      start_date: patch.start_date || null, end_date: patch.end_date || null,
    }).eq('id', id).select().single());
  },

  // ---------- 그룹 카테고리 (사용자별 선택지) ----------
  async listGroupCategories() {
    return unwrap(await supabase.from('group_categories').select('*').order('sort_order').order('id'));
  },
  async addGroupCategory(userId, name, emoji = '') {
    const existing = unwrap(await supabase.from('group_categories').select('sort_order').order('sort_order', { ascending: false }).limit(1));
    const next = (existing[0]?.sort_order ?? -1) + 1;
    return unwrap(await supabase.from('group_categories').insert({ user_id: userId, name, emoji, sort_order: next }).select().single());
  },
  async updateGroupCategory(id, { name, emoji, oldName }) {
    const gc = unwrap(await supabase.from('group_categories').update({ name, emoji }).eq('id', id).select().single());
    // 이 카테고리를 쓰는 (내가 소유한) 기존 그룹의 이름/이모지도 함께 갱신
    if (oldName) {
      await supabase.from('groups').update({ category: gc.name, category_emoji: gc.emoji || '' }).eq('category', oldName);
    }
    return gc;
  },
  async deleteGroupCategory(id) {
    return unwrap(await supabase.from('group_categories').delete().eq('id', id));
  },
  async getGroup(id) {
    const group = unwrap(await supabase.from('groups').select('*, owner:profiles!groups_owner_id_fkey(display_name)').eq('id', id).single());
    const rows = unwrap(await supabase.from('group_members')
      .select('id, user_id, role, nickname, start_date, end_date, contact, next_due_override, profiles(username, display_name)')
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
      next_due_override: m.next_due_override,
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
    return unwrap(await supabase.from('subscription_payments').select('*')
      .eq('group_id', groupId).order('date', { ascending: false }).order('id', { ascending: false }));
  },
  async createPayment(groupId, userId, p) {
    const tx = unwrap(await supabase.from('transactions').insert({
      user_id: userId, group_id: null, type: 'expense', date: p.date, amount: p.amount,
      category_name: p.category_name || '구독', category_emoji: p.category_emoji || '',
      source_id: p.source_id || null, source_name: p.source_name || '',
      content: (p.content || '').trim(), memo: (p.memo || '').trim(), created_by: userId,
    }).select('id').single());
    const pay = unwrap(await supabase.from('subscription_payments').insert({
      group_id: groupId, date: p.date, amount: p.amount,
      category_name: p.category_name || '구독', category_emoji: p.category_emoji || '',
      source_id: p.source_id || null, source_name: p.source_name || '',
      content: (p.content || '').trim(), memo: (p.memo || '').trim(), tx_id: tx.id, created_by: userId,
    }).select().single());
    // 미러 tx 에 원본 링크
    unwrap(await supabase.from('transactions').update({ origin_type: 'payment', origin_id: pay.id, origin_group_id: groupId }).eq('id', tx.id));
    return pay;
  },
  // 결제 수정 → 트리거가 미러 tx 동기화
  async updatePayment(id, p) {
    return unwrap(await supabase.from('subscription_payments').update({
      date: p.date, amount: p.amount,
      category_name: p.category_name || '구독', category_emoji: p.category_emoji || '',
      source_id: p.source_id || null, source_name: p.source_name || '',
      content: (p.content || '').trim(), memo: (p.memo || '').trim(),
    }).eq('id', id).select().single());
  },
  async deletePayment(id) {
    const pay = unwrap(await supabase.from('subscription_payments').select('tx_id').eq('id', id).single());
    unwrap(await supabase.from('subscription_payments').delete().eq('id', id));
    if (pay?.tx_id) unwrap(await supabase.from('transactions').delete().eq('id', pay.tx_id));
  },

  // ---------- 입금 내역 (총대 수입 + 멤버 지출 자동기입, RPC) ----------
  async listDeposits(groupId) {
    return unwrap(await supabase.from('subscription_deposits')
      .select('*, member:group_members(nickname)')
      .eq('group_id', groupId).order('date', { ascending: false }).order('id', { ascending: false }));
  },
  async createDeposit(p) {
    const { data, error } = await supabase.rpc('create_subscription_deposit', {
      p_group_id: p.group_id, p_member_id: p.member_id, p_date: p.date, p_amount: p.amount,
      p_periods: p.periods, p_category_name: p.category_name || '', p_category_emoji: p.category_emoji || '',
      p_source_id: p.source_id || null, p_source_name: p.source_name || '',
      p_deposit_source_name: p.deposit_source_name || '', p_content: p.content || '', p_memo: p.memo || '',
      p_leader_category_name: p.leader_category_name || '', p_leader_category_emoji: p.leader_category_emoji || '',
      p_leader_settlement_target_id: p.leader_settlement_target_id || null,
    });
    if (error) throw new Error(error.message);
    return data;
  },
  // 입금 수정 → 트리거가 총대/멤버 미러 tx 동기화 (RLS: 총대 또는 본인)
  async updateDeposit(id, p) {
    return unwrap(await supabase.from('subscription_deposits').update({
      date: p.date, amount: p.amount, periods: Math.max(Number(p.periods) || 1, 1),
      category_name: p.category_name || '', category_emoji: p.category_emoji || '',
      source_name: p.source_name || '', deposit_source_name: p.deposit_source_name || '',
      content: (p.content || '').trim(), memo: (p.memo || '').trim(),
      leader_category_name: p.leader_category_name || '', leader_category_emoji: p.leader_category_emoji || '',
      leader_settlement_target_id: p.leader_settlement_target_id || null,
    }).eq('id', id).select().single());
  },
  async deleteDeposit(id) {
    const { error } = await supabase.rpc('delete_subscription_deposit', { p_id: id });
    if (error) throw new Error(error.message);
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
  async personalStats(month, userId) {
    const { start, endExclusive } = monthBounds(month);
    const rows = unwrap(await supabase.from('transactions')
      .select('id, type, amount, category_name, source_id, source_name, settlement_target_id')
      .is('group_id', null).eq('user_id', userId)
      .gte('date', start).lt('date', endExclusive));

    const expenses = rows.filter((r) => r.type === 'expense');
    // 이 달 지출들에 매겨진 정산(수입) 합계 — 정산은 다른 달일 수도 있으므로 전 기간 조회
    const settleMap = await this.settlementsByTarget(expenses.map((r) => r.id));

    // 정산 수입(대상 지정된 income)은 수입에서 제외
    const incomeRows = rows.filter((r) => r.type === 'income' && r.settlement_target_id == null);

    // 대상 지출은 정산액만큼 차감(0 하한). 정산액이 지출보다 크면 초과분은 수입으로 계상.
    const effExpense = (r) => Math.max(0, Number(r.amount) - (settleMap[r.id] || 0));
    const excessOf = (r) => Math.max(0, (settleMap[r.id] || 0) - Number(r.amount));
    const expense = expenses.reduce((s, r) => s + effExpense(r), 0);
    const settleExcess = expenses.reduce((s, r) => s + excessOf(r), 0);
    const income = incomeRows.reduce((s, r) => s + Number(r.amount), 0) + settleExcess;

    const groupCat = (items, valueOf) => {
      const map = {};
      items.forEach((r) => { const n = r.category_name || '미분류'; map[n] = (map[n] || 0) + valueOf(r); });
      return Object.entries(map).map(([name, total]) => ({ name, total }))
        .filter((x) => x.total > 0).sort((a, b) => b.total - a.total);
    };
    const groupSrc = (items, valueOf) => {
      const map = {};
      items.forEach((r) => {
        const key = r.source_id != null ? `id:${r.source_id}` : `nm:${r.source_name || '미지정'}`;
        if (!map[key]) map[key] = { source_id: r.source_id ?? null, name: r.source_name || '미지정', total: 0 };
        map[key].total += valueOf(r);
      });
      return Object.values(map).filter((x) => x.total > 0).sort((a, b) => b.total - a.total);
    };

    // 카드 실적용: 원천 id 별 총 사용액(정산 차감 없는 원금)
    const grossBySourceId = {};
    expenses.forEach((r) => { if (r.source_id != null) grossBySourceId[r.source_id] = (grossBySourceId[r.source_id] || 0) + Number(r.amount); });

    const incomeByCategory = groupCat(incomeRows, (r) => Number(r.amount));
    const incomeBySource = groupSrc(incomeRows, (r) => Number(r.amount));
    if (settleExcess > 0) { // 정산 초과분은 '정산' 수입으로 표기
      incomeByCategory.push({ name: '정산', total: settleExcess });
      incomeByCategory.sort((a, b) => b.total - a.total);
      incomeBySource.push({ source_id: null, name: '정산', total: settleExcess });
      incomeBySource.sort((a, b) => b.total - a.total);
    }

    return {
      totals: { income, expense, balance: income - expense },
      incomeByCategory,
      expenseByCategory: groupCat(expenses, effExpense),
      incomeBySource,
      expenseBySource: groupSrc(expenses, effExpense),
      grossBySourceId,
    };
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
};
