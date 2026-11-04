-- =====================================================================
-- 0093: 주결제/주입금수단은 세부 항목만
--   · 원천 그룹은 원천으로 선택할 수 없으므로(0083) 그룹 단위 지정을 없앤다.
--   · 그룹에 지정돼 있던 것은 그 그룹의 같은 이름 세부 항목(없으면 첫 세부 항목)으로 옮긴다. 회원·기본값 모두.
-- 0001~0092 이후 실행. 여러 번 실행해도 안전.
-- =====================================================================

do $$
declare g record; v_child bigint;
begin
  for g in select * from public.sources where parent_id is null and (is_primary_payment or is_primary_deposit) loop
    select c.id into v_child from public.sources c where c.parent_id = g.id
      order by (c.name = g.name) desc, c.sort_order, c.id limit 1;
    update public.sources set is_primary_payment = false, is_primary_deposit = false where id = g.id;
    if v_child is not null then
      update public.sources set
        is_primary_payment = is_primary_payment or g.is_primary_payment,
        -- 카드 그룹은 주입금수단 불가
        is_primary_deposit = is_primary_deposit or (g.is_primary_deposit and coalesce(g.group_type, 'general') not in ('credit', 'check'))
      where id = v_child;
    end if;
  end loop;

  for g in select * from public.default_sources where parent_id is null and (is_primary_payment or is_primary_deposit) loop
    select c.id into v_child from public.default_sources c where c.parent_id = g.id
      order by (c.name = g.name) desc, c.sort_order, c.id limit 1;
    update public.default_sources set is_primary_payment = false, is_primary_deposit = false where id = g.id;
    if v_child is not null then
      update public.default_sources set
        is_primary_payment = is_primary_payment or g.is_primary_payment,
        is_primary_deposit = is_primary_deposit or (g.is_primary_deposit and coalesce(g.group_type, 'general') not in ('credit', 'check'))
      where id = v_child;
    end if;
  end loop;
end $$;
