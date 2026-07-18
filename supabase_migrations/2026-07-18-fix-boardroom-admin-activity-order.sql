create or replace function public.admin_get_boardroom_activity()
returns table (
  user_id uuid,
  workspace_id uuid,
  workspace_name text,
  conversations bigint,
  messages bigint,
  documents bigint,
  active_cards bigint,
  completed_cards bigint,
  last_active timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.users u
    where u.auth_id = auth.uid() and coalesce(u.is_admin, false)
  ) then
    raise exception 'Admin access required';
  end if;

  return query
  select
    u.id,
    w.id,
    w.name,
    (select count(*) from public.boardroom_conversations c where c.workspace_id = w.id),
    (select count(*) from public.boardroom_messages m where m.workspace_id = w.id),
    (select count(*) from public.boardroom_documents d where d.workspace_id = w.id),
    (select count(*) from public.boardroom_advisor_cards ac where ac.workspace_id = w.id and ac.status in ('suggested', 'active')),
    (select count(*) from public.boardroom_advisor_cards ac where ac.workspace_id = w.id and ac.status = 'done'),
    greatest(
      w.updated_at,
      coalesce((select max(c.updated_at) from public.boardroom_conversations c where c.workspace_id = w.id), w.updated_at),
      coalesce((select max(m.created_at) from public.boardroom_messages m where m.workspace_id = w.id), w.updated_at)
    )
  from public.users u
  left join public.boardroom_workspace_members wm on wm.user_id = u.auth_id
  left join public.boardroom_workspaces w on w.id = wm.workspace_id
  where w.id is not null
     or exists (
       select 1 from public.studio_entitlements e
       where e.user_id = u.id and e.app_key = 'boardroom'
     )
  order by 9 desc nulls last;
end;
$$;

revoke all on function public.admin_get_boardroom_activity() from public, anon;
grant execute on function public.admin_get_boardroom_activity() to authenticated;
