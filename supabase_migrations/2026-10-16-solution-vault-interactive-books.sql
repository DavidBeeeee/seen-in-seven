-- Solution Vault: interactive books and claim links. WBR-445, David 2026-10-16.
--
-- The first interactive book is "The Stupidest Lies You Were Told About Making
-- Content", the Day One gift: a list of claims the reader calls "Believe it"
-- or "No way" before each one is revealed. It grows over time, so:
-- * Content is data (solution_vault_books.interactive), edited in Admin and
--   validated here. Every claim has a permanent id; ids already saved can be
--   hidden but never removed, so readers' answers always have a home.
-- * Answers are one small jsonb map per reader and book ({claim id: yes|no|open}),
--   written only through save_solution_vault_answers. A reader's first call on a
--   claim stands; a later call cannot overwrite it.
-- * admin_book_answer_stats gives counts per claim, never names.
-- * A claim link gives the book to whoever opens it while signed in. It is how
--   the second-meeting RSVP page hands over the gift until Systeme can send an
--   RSVP event. Rotating the link retires the old one. Codes are never stored in
--   this file.

alter table public.solution_vault_books drop constraint if exists solution_vault_books_format_check;
alter table public.solution_vault_books add constraint solution_vault_books_format_check
  check (format in ('pdf', 'web', 'interactive'));
alter table public.solution_vault_books add column if not exists interactive jsonb;

alter table public.solution_vault_book_progress
  add column if not exists answers jsonb not null default '{}'::jsonb;

-- ── Content validation ────────────────────────────────────────────────────
-- Returns null when the content is acceptable, or the reason it is not.
create or replace function public.vault_interactive_problem(p_content jsonb, p_previous jsonb default null)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_item jsonb;
  v_ids text[] := '{}';
  v_id text;
  v_para jsonb;
  v_quote jsonb;
  v_old text;
  v_url text;
begin
  if p_content is null or jsonb_typeof(p_content) <> 'object' then
    return 'Content must be an object';
  end if;
  if length(p_content::text) > 300000 then
    return 'Content is too large (300 KB limit)';
  end if;
  if jsonb_typeof(p_content -> 'items') <> 'array' or jsonb_array_length(p_content -> 'items') < 1
     or jsonb_array_length(p_content -> 'items') > 300 then
    return 'There must be between 1 and 300 claims';
  end if;

  for v_item in select * from jsonb_array_elements(p_content -> 'items') loop
    v_id := v_item ->> 'id';
    if v_id is null or v_id !~ '^[a-z0-9][a-z0-9-]{0,47}$' then
      return 'Every claim needs an id of lowercase letters, numbers and dashes';
    end if;
    if v_id = any(v_ids) then
      return 'Claim id "' || v_id || '" is used twice';
    end if;
    v_ids := v_ids || v_id;
    if length(btrim(coalesce(v_item ->> 'claim', ''))) not between 1 and 300 then
      return 'Claim "' || v_id || '" needs a statement of 1 to 300 characters';
    end if;
    if jsonb_typeof(coalesce(v_item -> 'body', '[]'::jsonb)) <> 'array' then
      return 'Claim "' || v_id || '" body must be a list of paragraphs';
    end if;
    for v_para in select * from jsonb_array_elements(coalesce(v_item -> 'body', '[]'::jsonb)) loop
      if jsonb_typeof(v_para) <> 'string' or length(v_para #>> '{}') > 3000 then
        return 'Claim "' || v_id || '" has a paragraph that is not text or is over 3000 characters';
      end if;
    end loop;
  end loop;

  for v_quote in select * from jsonb_array_elements(coalesce(p_content -> 'quotes', '[]'::jsonb)) loop
    if not ((v_quote ->> 'after') = any(v_ids)) then
      return 'A pull quote is placed after a claim that does not exist';
    end if;
    if length(btrim(coalesce(v_quote ->> 'text', ''))) not between 1 and 300 then
      return 'Pull quotes need 1 to 300 characters';
    end if;
  end loop;

  v_url := nullif(btrim(coalesce(p_content #>> '{close,button_url}', '')), '');
  if v_url is not null and v_url !~ '^https://[A-Za-z0-9.-]+(/[^\s"<>]*)?$' then
    return 'The closing button link must be a full https:// address';
  end if;

  if p_previous is not null and jsonb_typeof(p_previous -> 'items') = 'array' then
    for v_old in select x ->> 'id' from jsonb_array_elements(p_previous -> 'items') x loop
      if not (v_old = any(v_ids)) then
        return 'Claim "' || v_old || '" was removed. Hide it instead, so readers who answered it keep their answers';
      end if;
    end loop;
  end if;

  return null;
end;
$$;

revoke all on function public.vault_interactive_problem(jsonb, jsonb) from public, anon;
grant execute on function public.vault_interactive_problem(jsonb, jsonb) to authenticated;

-- ── Member shelf, now carrying interactive content and answers ────────────
create or replace function public.my_solution_vault_books()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.vault_caller_user_id();
  v_admin boolean := public.vault_caller_is_admin();
begin
  if v_user is null then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'slug', b.slug,
      'title', b.title,
      'subtitle', b.subtitle,
      'description', b.description,
      'format', b.format,
      'status', b.status,
      'cover_url', b.cover_url,
      'content_path', b.content_path,
      'content_version', b.content_version,
      'page_count', b.page_count,
      'download_enabled', b.download_enabled and b.content_path is not null,
      'download_filename', b.download_filename,
      'chapters', b.chapters,
      'interactive', b.interactive,
      'admin_preview', not public.member_has_book(v_user, b.id),
      'progress', case when p.user_id is null or p.content_version <> b.content_version then null
        else jsonb_build_object('last_page', p.last_page, 'last_chapter_id', p.last_chapter_id,
          'completed', p.completed, 'updated_at', p.updated_at, 'answers', p.answers) end,
      'progress_reset', p.user_id is not null and p.content_version <> b.content_version
    ) order by b.sort_order, b.created_at)
    from public.solution_vault_books b
    left join public.solution_vault_book_progress p on p.book_id = b.id and p.user_id = v_user
    where public.member_has_book(v_user, b.id)
       or (v_admin and b.status <> 'retired')
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.my_solution_vault_books() from public, anon;
grant execute on function public.my_solution_vault_books() to authenticated;

-- ── Saving answers ────────────────────────────────────────────────────────
create or replace function public.save_solution_vault_answers(target_book_slug text, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.vault_caller_user_id();
  v_book public.solution_vault_books;
  v_visible text[];
  v_key text;
  v_value text;
  v_row public.solution_vault_book_progress;
  v_merged jsonb;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select * into v_book from public.solution_vault_books b where b.slug = target_book_slug;
  if v_book.id is null or not public.member_has_book(v_user, v_book.id) then
    raise exception 'This book is not in your library' using errcode = '42501';
  end if;
  if v_book.format <> 'interactive' then
    raise exception 'Only interactive books take answers' using errcode = '22023';
  end if;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    raise exception 'Answers must be an object' using errcode = '22023';
  end if;

  select array_agg(x ->> 'id') into v_visible
  from jsonb_array_elements(v_book.interactive -> 'items') x
  where coalesce((x ->> 'hidden')::boolean, false) = false;

  for v_key, v_value in select key, value #>> '{}' from jsonb_each(p_answers) loop
    if not (v_key = any(v_visible)) then
      raise exception 'Unknown claim "%"', v_key using errcode = '22023';
    end if;
    if v_value not in ('yes', 'no', 'open') then
      raise exception 'Answers are yes, no or open' using errcode = '22023';
    end if;
  end loop;

  select * into v_row from public.solution_vault_book_progress p
  where p.user_id = v_user and p.book_id = v_book.id;
  -- The first call on a claim stands: existing answers win over new ones.
  v_merged := p_answers || coalesce(v_row.answers, '{}'::jsonb);

  insert into public.solution_vault_book_progress as p (user_id, book_id, content_version, answers, completed, updated_at)
  values (v_user, v_book.id, v_book.content_version, v_merged,
    (select count(*) from unnest(v_visible) k where v_merged ? k) = coalesce(array_length(v_visible, 1), 0), now())
  on conflict (user_id, book_id) do update
  set answers = v_merged,
      content_version = excluded.content_version,
      completed = excluded.completed,
      updated_at = now()
  returning * into v_row;

  return jsonb_build_object('ok', true, 'answers', v_row.answers, 'completed', v_row.completed);
end;
$$;

revoke all on function public.save_solution_vault_answers(text, jsonb) from public, anon;
grant execute on function public.save_solution_vault_answers(text, jsonb) to authenticated;

-- ── Admin: content and counts ─────────────────────────────────────────────
create or replace function public.admin_save_interactive_content(p_book_slug text, p_content jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_book public.solution_vault_books;
  v_problem text;
begin
  if not public.vault_caller_is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  select * into v_book from public.solution_vault_books b where b.slug = p_book_slug for update;
  if v_book.id is null then
    raise exception 'Book not found' using errcode = 'P0002';
  end if;
  if v_book.format <> 'interactive' then
    raise exception 'Only interactive books have this content' using errcode = '22023';
  end if;
  v_problem := public.vault_interactive_problem(p_content, v_book.interactive);
  if v_problem is not null then
    raise exception '%', v_problem using errcode = '22023';
  end if;

  update public.solution_vault_books set interactive = p_content, updated_at = now() where id = v_book.id;
  return jsonb_build_object('ok', true, 'slug', v_book.slug, 'claims', jsonb_array_length(p_content -> 'items'));
end;
$$;

create or replace function public.admin_book_answer_stats(p_book_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_book public.solution_vault_books;
begin
  if not public.vault_caller_is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  select * into v_book from public.solution_vault_books b where b.slug = p_book_slug;
  if v_book.id is null then
    raise exception 'Book not found' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'readers', (select count(*) from public.solution_vault_book_progress p where p.book_id = v_book.id and p.answers <> '{}'::jsonb),
    'claims', coalesce((
      select jsonb_object_agg(s.key, s.counts)
      from (
        select k.key, jsonb_build_object(
          'yes', count(*) filter (where k.value #>> '{}' = 'yes'),
          'no', count(*) filter (where k.value #>> '{}' = 'no'),
          'open', count(*) filter (where k.value #>> '{}' = 'open')) as counts
        from public.solution_vault_book_progress p, jsonb_each(p.answers) k
        where p.book_id = v_book.id
        group by k.key
      ) s
    ), '{}'::jsonb)
  );
end;
$$;

revoke all on function public.admin_save_interactive_content(text, jsonb) from public, anon;
revoke all on function public.admin_book_answer_stats(text) from public, anon;
grant execute on function public.admin_save_interactive_content(text, jsonb) to authenticated;
grant execute on function public.admin_book_answer_stats(text) to authenticated;

-- ── Claim links ───────────────────────────────────────────────────────────
create table if not exists public.solution_vault_claim_links (
  code text primary key check (code ~ '^[a-f0-9]{18,64}$'),
  book_id uuid not null references public.solution_vault_books(id) on delete restrict,
  active boolean not null default true,
  claims integer not null default 0,
  created_at timestamptz not null default now(),
  retired_at timestamptz
);

create unique index if not exists solution_vault_claim_links_one_active
  on public.solution_vault_claim_links (book_id) where active;

alter table public.solution_vault_claim_links enable row level security;
revoke all on table public.solution_vault_claim_links from public, anon, authenticated;
grant select on public.solution_vault_claim_links to authenticated;
drop policy if exists vault_claim_links_admin_read on public.solution_vault_claim_links;
create policy vault_claim_links_admin_read on public.solution_vault_claim_links
  for select to authenticated using (public.vault_caller_is_admin());

-- One gift per person per book through claim links, whichever link they used.
-- A grant an admin revoked stays revoked.
create or replace function public.claim_solution_vault_book(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.vault_caller_user_id();
  v_link public.solution_vault_claim_links;
  v_book public.solution_vault_books;
  v_grant public.solution_vault_book_grants;
  v_state text;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in to claim this book' using errcode = '42501';
  end if;
  if v_user is null then
    perform public.claim_studio_profile();
    v_user := public.vault_caller_user_id();
  end if;

  select * into v_link from public.solution_vault_claim_links l
  where l.code = lower(btrim(coalesce(p_code, ''))) and l.active;
  if v_link.code is null then
    return jsonb_build_object('ok', false, 'error', 'link_inactive');
  end if;
  select * into v_book from public.solution_vault_books b where b.id = v_link.book_id;
  if v_book.status <> 'published' then
    return jsonb_build_object('ok', false, 'error', 'book_not_published');
  end if;

  select * into v_grant from public.solution_vault_book_grants g
  where g.user_id = v_user and g.book_id = v_book.id and g.source_kind = 'optin' and g.source_ref = 'claim:' || v_book.slug;

  if v_grant.id is null then
    insert into public.solution_vault_book_grants (user_id, book_id, grant_kind, source_kind, source_ref)
    values (v_user, v_book.id, 'gift', 'optin', 'claim:' || v_book.slug);
    update public.solution_vault_claim_links set claims = claims + 1 where code = v_link.code;
    v_state := 'granted';
  elsif v_grant.status = 'revoked' then
    v_state := 'revoked_kept';
  else
    v_state := 'already_active';
  end if;

  return jsonb_build_object('ok', v_state <> 'revoked_kept', 'state', v_state, 'slug', v_book.slug, 'title', v_book.title,
    'error', case when v_state = 'revoked_kept' then 'revoked' end);
end;
$$;

create or replace function public.admin_rotate_claim_link(p_book_slug text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_book public.solution_vault_books;
  v_code text := encode(extensions.gen_random_bytes(12), 'hex');
begin
  if not public.vault_caller_is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  select * into v_book from public.solution_vault_books b where b.slug = p_book_slug;
  if v_book.id is null then
    raise exception 'Book not found' using errcode = 'P0002';
  end if;

  update public.solution_vault_claim_links set active = false, retired_at = now()
  where book_id = v_book.id and active;
  insert into public.solution_vault_claim_links (code, book_id) values (v_code, v_book.id);
  return jsonb_build_object('ok', true, 'code', v_code, 'slug', v_book.slug);
end;
$$;

revoke all on function public.claim_solution_vault_book(text) from public, anon;
revoke all on function public.admin_rotate_claim_link(text) from public, anon;
grant execute on function public.claim_solution_vault_book(text) to authenticated;
grant execute on function public.admin_rotate_claim_link(text) to authenticated;

-- Seed: The Stupidest Lies You Were Told About Making Content (Day One gift).
-- Content is the October 2026 prototype, word for word; David edits it in Admin.
insert into public.solution_vault_books (slug, title, subtitle, description, format, status, cover_url, sort_order, interactive)
values ('content-lies', 'The Stupidest Lies You Were Told About Making Content',
  'The "Rules" You Still Think You Need to Follow',
  'Call each one before you read it: believe it, or no way. Your answers are saved, and new ones get added over time.',
  'interactive', 'published', '/assets/vault/content-lies-cover.png', 20, $cl${"kicker":"Your Day One gift","heading":"Ten things about recording","heading_emphasis":"you won't believe","intro":["I'm going to lose you somewhere around number two, and that's fine, since that's where I lost me too.","Every one of these is the opposite of what I got told when I started. I followed that advice for a long time and my videos kept getting worse, and I couldn't work out why until I finally quit doing it.","**Call each one before you read it.** Believe it, or no way. There's no wrong answer here, I just want to know which ones you're going to fight me on.","The ones you don't believe are the expensive ones. 😬"],"start_label":"Start here","believe_label":"Believe it","doubt_label":"No way","skip_top":"Not in the mood to guess?","skip_bottom":"Rather just read the rest?","skip_button":"Open all {total_word}","believed_lines":["True. And you already knew.","True. You're ahead of me on this one.","True. Good instincts.","True. You've clearly filmed something before.","True. Nice."],"doubted_lines":["True. 😏","True. Sorry.","True, annoyingly.","True. I fought this one too.","True. Stay with me."],"opened_line":"True.","items":[{"id":"tidy-background","claim":"A tidy background makes people trust you less","body":["Before my first video I cleaned for two hours, straightening the shelf and hiding the mail and moving a lamp that didn't need moving. Then I watched it back and it looked like a set.","A set makes people careful. The coffee cup and the pile of mail are what tell somebody a real person lives here, and I'd spent the whole morning getting rid of them.","**I cleaned so I'd be taken seriously, and that's the exact thing that kept people from believing me.**"],"hidden":false,"added_at":"2026-10-16"},{"id":"ring-light","claim":"Your ring light is actively making you uglier","body":["I own two of them. 😑","A ring light throws flat light straight at your face, which wipes out all your shadows. Shadows are what keep a face from looking pasted on.","It also puts a little donut of light in your eyes, and people have seen that in a thousand ads by now. So it reads as an ad.","Window light comes at you from one side. That's the whole fix."],"hidden":false,"added_at":"2026-10-16"},{"id":"bad-audio","claim":"Bad audio will kill your video. Bad video won't.","body":["People will sit through a grainy video all the way to the end, but they'll close a beautiful one in four seconds if the room echoes. I watched that happen to my own videos enough times to stop arguing about it.","And you don't need a microphone. Echo bounces off hard surfaces, so all you need is soft ones.","A rug, curtains, a couch, or your closet if that's what's available. Any of those will get you further than my first three hundred dollars did. 😅"],"hidden":false,"added_at":"2026-10-16"},{"id":"sitting-down","claim":"Sitting down is making you sound half dead","body":["I filmed sitting down for a year, wondering the whole time why I sounded like I was reading a hostage note.","Sitting folds your diaphragm in half, so standing up gives you about a third more life in your voice. Same script, same room, same face, and you didn't do a single thing differently.","**Record one line both ways tonight. You'll hear it before you finish the sentence.**"],"hidden":false,"added_at":"2026-10-16"},{"id":"speaking-clearly","claim":"Speaking clearly is what makes them scroll away","body":["Careful, well-paced delivery sounds like reading out loud, while a little too fast sounds like you mean it. People keep up fine either way.","They follow what you're saying and don't even register the word you tripped on, so slowing down to be understood is the thing that actually loses them.","Which brings me to the one I got wrong the longest..."],"hidden":false,"added_at":"2026-10-16"},{"id":"retakes","claim":"Every retake makes your video worse","body":["Your energy drops faster than your accuracy climbs, so by take four you're finally saying it right and sounding dead while you do it. I have folders full of take nine.","Not one of them has ever been watched by another human being.","**You can hear the words getting cleaner, but you can't hear the life draining out, and that's what makes it a trap.**"],"hidden":false,"added_at":"2026-10-16"},{"id":"editing-pauses","claim":"Editing out your pauses makes you look like a liar","body":["When you cut out every pause, you end up sounding like someone who never hesitates, and people pick up on that faster than you'd think. Once they do, they start wondering what else got taken out.","Leave the stumble in and you just sound like a person talking. I stopped cutting mine a while back and started getting more replies, and I still don't have a better explanation for it than that."],"hidden":false,"added_at":"2026-10-16"},{"id":"looking-shifty","claim":"Looking shifty on camera has nothing to do with your face","body":["Nobody is looking at your jawline, I promise. What they're watching is your eyes.","When the screen is facing you, you keep checking yourself without meaning to, and your eyes flick away every few seconds. That's what reads as somebody with something to hide.","Nothing is wrong with you. You're looking at the wrong spot."],"hidden":false,"added_at":"2026-10-16"},{"id":"dressing-up","claim":"The nicer you dress, the faker you look","body":["Wear whatever you'd have on if this person walked into your kitchen unannounced.","A blazer you don't normally own tells people you're performing rather than talking, and that comes right through the screen. I put a collared shirt on for an early video and my own mother asked me what was wrong. 😅"],"hidden":false,"added_at":"2026-10-16"},{"id":"ashamed-video","claim":"The video you're ashamed of will beat everything else you make","body":["My voice cracked and I said the same sentence twice, and then I sat there with my thumb over the delete button. The only reason it ever went up is that I was tired and done arguing with myself.","It got more messages than everything I'd made before it put together.","**The polished ones get watched and forgotten, but the one where something slipped is the one people write to you about.**","Whatever you're about to cut is usually the reason somebody would have reached out."],"hidden":false,"added_at":"2026-10-16"}],"quotes":[{"after":"speaking-clearly","text":"Your best video is the one you almost deleted."}],"score":{"none":{"heading":"All {total_word} are true, and you believed every one.","body":"You know more about this than you're giving yourself credit for. The only thing left is doing it."},"one":{"heading":"All {total_word} are true, and there's one you're still not buying.","body":"That's the one. Go test it on your next video and let me be wrong about it."},"most":{"heading":"All {total_word} are true, and you didn't believe {doubted} of them.","body":"Good. That's the same face I made. Pick the loudest one and go find out for yourself."},"some":{"heading":"All {total_word} are true, and you didn't believe {doubted} of them.","body":"Those are the ones worth your time. The ones you already agreed with weren't going to change anything."}},"close":{"heading":"Pick one. Just one.","paragraphs":["Ten changes at once is the same as making zero changes, so take the one that made you say \"no way\" out loud and do that on your next video. Then find out if I'm lying. 😏","I spent eleven months making videos I was proud of and not one of them did anything for me. The one where my voice cracked did.","Your next script is sitting there waiting on you, so go point a camera at it."],"button_label":"Back to the challenge","button_url":"https://content.coloradomastermind.com/day1","signature":"David Bee"}}$cl$::jsonb)
on conflict (slug) do nothing;
