drop function if exists public.admin_get_onboarding();

create or replace function public.admin_get_onboarding()
returns table (
  user_id uuid,
  posted text,
  history text,
  goal text,
  mini_goal text,
  mini_goal_text text,
  business text,
  mvo_q2 jsonb,
  mvo_q3 jsonb,
  mvo_q4 jsonb,
  topic_freewrite text,
  phase2_context jsonb,
  mission_statement text,
  mission_generated_at timestamptz,
  commitment_declaration text,
  commitment_reasons jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.users u
    where u.auth_id = auth.uid()
      and coalesce(u.is_admin, false) = true
  ) then
    raise exception 'admin access required';
  end if;

  return query
  select
    o.user_id,
    o.posted,
    o.history,
    o.goal,
    o.mini_goal,
    o.mini_goal_text,
    o.business,
    o.mvo_q2,
    o.mvo_q3,
    o.mvo_q4,
    o.topic_freewrite,
    coalesce(o.phase2_context, '{}'::jsonb),
    o.mission_statement,
    o.mission_generated_at,
    o.commitment_declaration,
    coalesce(o.commitment_reasons, '[]'::jsonb),
    o.created_at,
    o.updated_at
  from public.onboarding o
  order by o.updated_at desc nulls last, o.created_at desc nulls last;
end;
$$;

grant execute on function public.admin_get_onboarding() to authenticated;
