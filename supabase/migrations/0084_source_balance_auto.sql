-- =====================================================================
-- 0084: 원천 금액 자동 반영
--   · 가계부 기록(수입/지출/이체)을 저장·수정·삭제하면 선택한 원천 세부 항목의 금액(sources.balance)을 자동으로 +/-.
--       수입: 원천 +금액 / 지출: 원천 −금액 / 이체: 출금 원천 −금액, 입금 원천 +금액
--   · 신용카드/체크카드 그룹(의 세부 항목)은 금액 칸이 없으므로 반영하지 않는다.
--   · 이 마이그레이션 이후에 저장된 기록만 반영(transactions.balance_applied). 그 전 기록을 수정·삭제해도
--     예전 금액을 되돌리지 않고, 수정 후 값만 새로 반영한다.
--   · 금액을 입력하지 않은 원천은 0원에서 시작.
-- 0001~0083 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

alter table public.transactions add column if not exists balance_applied boolean not null default false;

create or replace function public.adjust_source_balance(p_source_id bigint, p_delta bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_source_id is null or coalesce(p_delta, 0) = 0 then return; end if;
  update public.sources s
  set balance = coalesce(s.balance, 0) + p_delta
  where s.id = p_source_id
    and coalesce((select p.group_type from public.sources p where p.id = s.parent_id), s.group_type) not in ('credit', 'check');
end;
$$;
revoke execute on function public.adjust_source_balance(bigint, bigint) from public, anon, authenticated;

-- 기록 한 건이 원천 금액에 주는 영향을 적용(sign = 1 반영, -1 되돌리기)
create or replace function public.apply_tx_balance(r public.transactions, sign int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if r.type = 'income' then
    perform public.adjust_source_balance(r.source_id, sign * r.amount);
  elsif r.type = 'expense' then
    perform public.adjust_source_balance(r.source_id, -sign * r.amount);
  elsif r.type = 'transfer' then
    perform public.adjust_source_balance(r.source_id, -sign * r.amount);
    perform public.adjust_source_balance(r.to_source_id, sign * r.amount);
  end if;
end;
$$;
revoke execute on function public.apply_tx_balance(public.transactions, int) from public, anon, authenticated;

create or replace function public.trg_tx_source_balance()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.balance_applied then perform public.apply_tx_balance(old, -1); end if;
    return old;
  end if;
  if tg_op = 'UPDATE' then
    -- 금액에 영향 없는 수정(내용·메모 등)은 건너뜀
    if old.balance_applied
       and old.type is not distinct from new.type and old.amount is not distinct from new.amount
       and old.source_id is not distinct from new.source_id and old.to_source_id is not distinct from new.to_source_id then
      return new;
    end if;
    if old.balance_applied then perform public.apply_tx_balance(old, -1); end if;
  end if;
  new.balance_applied := true;
  perform public.apply_tx_balance(new, 1);
  return new;
end;
$$;

drop trigger if exists tx_source_balance_ins_upd on public.transactions;
create trigger tx_source_balance_ins_upd
  before insert or update on public.transactions
  for each row execute function public.trg_tx_source_balance();
drop trigger if exists tx_source_balance_del on public.transactions;
create trigger tx_source_balance_del
  after delete on public.transactions
  for each row execute function public.trg_tx_source_balance();
