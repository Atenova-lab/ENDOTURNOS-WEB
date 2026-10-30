-- Supervisor acknowledgement of a specific coverage incident.
-- Acknowledgements survive reloads but cease to suppress an issue when its rule changes.
create table public.et_coverage_reviews (
 id uuid primary key default gen_random_uuid(),
 issue_id text not null,
 work_date date not null,
 consultation_id text not null references public.et_consultations(id),
 rule_id text not null,
 rule_snapshot jsonb not null,
 created_by uuid not null default auth.uid(),
 created_by_name text not null default '',
 reviewed_at timestamptz not null default now(),
 reopened_at timestamptz,
 reopened_by uuid,
 constraint et_coverage_review_issue_id_length check (char_length(issue_id) between 3 and 200)
);
create unique index et_coverage_review_active
 on public.et_coverage_reviews(issue_id, md5(rule_snapshot::text))
 where reopened_at is null;
create index et_coverage_review_date_idx on public.et_coverage_reviews(work_date);

alter table public.et_coverage_reviews enable row level security;
revoke all on public.et_coverage_reviews from public, anon, authenticated;
grant select, insert on public.et_coverage_reviews to authenticated;
grant update(reopened_at) on public.et_coverage_reviews to authenticated;
create policy "Supervisors read reviewed incidents" on public.et_coverage_reviews
 for select to authenticated using (et_private.is_supervisor());
create policy "Supervisors review incidents" on public.et_coverage_reviews
 for insert to authenticated with check (et_private.is_supervisor() and created_by=auth.uid());
create policy "Supervisors reopen incidents" on public.et_coverage_reviews
 for update to authenticated using (et_private.is_supervisor())
 with check (et_private.is_supervisor());

create function et_private.guard_coverage_review() returns trigger
 language plpgsql security invoker set search_path='' as $$
declare current_rule jsonb;
begin
 if not et_private.is_supervisor() or auth.uid() is null then
  raise exception 'Solo supervisión puede revisar incidencias.';
 end if;
 if TG_OP='UPDATE' then
  if old.reopened_at is not null or new.reopened_at is null then
   raise exception 'La incidencia ya está reabierta.';
  end if;
  new.id:=old.id; new.issue_id:=old.issue_id;
  new.work_date:=old.work_date; new.consultation_id:=old.consultation_id;
  new.rule_id:=old.rule_id; new.rule_snapshot:=old.rule_snapshot;
  new.created_by:=old.created_by; new.created_by_name:=old.created_by_name;
  new.reviewed_at:=old.reviewed_at;
  new.reopened_at:=now(); new.reopened_by:=auth.uid();
  return new;
 end if;
 select rule into current_rule
 from public.et_consultations c
 cross join lateral jsonb_array_elements(c.coverage_rules) rule
 where c.id=new.consultation_id and c.active and rule->>'id'=new.rule_id;
 if current_rule is null or current_rule<>new.rule_snapshot then
  raise exception 'La regla de cobertura ha cambiado. Actualiza las incidencias.';
 end if;
 if new.work_date < (current_rule->>'valid_from')::date
    or new.work_date > (current_rule->>'valid_until')::date then
  raise exception 'La fecha queda fuera de la regla vigente.';
 end if;
 new.created_by:=auth.uid();new.reviewed_at:=now();
 new.reopened_at:=null;new.reopened_by:=null;
 select display_name into new.created_by_name
 from public.et_staff where user_id=auth.uid() and active and role='supervisor';
 return new;
end $$;
revoke all on function et_private.guard_coverage_review() from public;
create trigger guard_coverage_review
 before insert or update on public.et_coverage_reviews
 for each row execute function et_private.guard_coverage_review();
alter publication supabase_realtime add table public.et_coverage_reviews;