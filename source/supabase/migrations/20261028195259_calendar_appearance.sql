-- A single shared calendar palette, editable only by supervisors via the existing RLS policy.
alter table public.et_planning_settings
  add column calendar_appearance jsonb not null default '{"VAC":{"color":"#d8f1e5","intensity":100,"pattern":"solid"},"PERM":{"color":"#eadcf0","intensity":100,"pattern":"solid"},"FOR":{"color":"#ffe3c7","intensity":100,"pattern":"solid"},"DESCANSO":{"color":"#e3e5e6","intensity":100,"pattern":"solid"}}'::jsonb;

alter table public.et_planning_settings add constraint et_calendar_appearance_valid
  check (jsonb_typeof(calendar_appearance) = 'object');

grant update(calendar_appearance) on public.et_planning_settings to authenticated;
