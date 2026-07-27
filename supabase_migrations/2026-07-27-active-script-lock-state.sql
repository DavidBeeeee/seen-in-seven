-- Keep current UI lock state separate from the historical first-lock timestamp.
-- A deleted script cannot remain actively locked, while locked_at continues to
-- preserve the user's earned points and original achievement history.

alter table public.video_progress
  add column if not exists is_locked boolean not null default false;

update public.video_progress vp
set is_locked = (
  vp.locked_at is not null
  and exists (
    select 1
    from public.scripts s
    where s.user_id = vp.user_id
      and s.video_number = vp.video_index + 1
      and s.level = vp.level
      and s.is_current = true
  )
);
