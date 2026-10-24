-- WBR-458 production check. Run through the Supabase SQL connector. It always
-- ends in RAISE EXCEPTION, so every write here (a throwaway auth user, 63 past
-- sessions in 2001, cleared and back-dated heartbeat rows, one tick) is rolled
-- back. The exception message is the result. Expected, 2026-10-23 read back:
--   page1Identical true, stateHistoryCount 50, page1 {len 50, total 63,
--   next 50, hasMore true}, page2 {len 13, next null, hasMore false,
--   overlapsPage1 false}, page3Len 0, hb1.missed false, hb2missed false,
--   overdueCheck.overdue true at 27h, hb3 {missed true, gapHours 27},
--   tickFirst true, tickReplay false.
do $$
declare
  v_auth uuid := gen_random_uuid();
  v_uid uuid;
  v_state jsonb; p1 jsonb; p2 jsonb; p3 jsonb;
  v_hb1 jsonb; v_hb2 jsonb; v_hb3 jsonb; v_status jsonb;
  v_nonce uuid; c1 boolean; c2 boolean;
begin
  insert into auth.users (id, email, aud, role) values (v_auth, 'wbr458-check@example.invalid', 'authenticated', 'authenticated');
  select id into v_uid from public.users where auth_id = v_auth;
  if v_uid is null then
    insert into public.users (auth_id) values (v_auth) returning id into v_uid;
  end if;
  insert into public.certainty_sessions (user_id, member_email, starts_at, ends_at, mode, status, iso_week, calendar_status)
  select v_uid, 'wbr458-check@example.invalid', timestamptz '2001-01-01 15:17:00+00' + (g || ' days')::interval,
         timestamptz '2001-01-01 17:17:00+00' + (g || ' days')::interval, 'zoom', 'booked', 'WBR458-' || g, 'skipped'
  from generate_series(1, 63) g;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  v_state := public.certainty_state(21);
  p1 := public.certainty_history(0, 50);
  p2 := public.certainty_history(50, 50);
  p3 := public.certainty_history(100, 50);
  perform set_config('role', 'postgres', true);

  delete from public.certainty_reminder_runs;
  v_hb1 := public.certainty_record_reminder_run('manual', '{}'::jsonb, 26);
  v_hb2 := public.certainty_record_reminder_run('manual', '{}'::jsonb, 26);
  update public.certainty_reminder_runs set ran_at = now() - interval '27 hours';
  v_status := public.certainty_reminder_heartbeat(26);
  v_hb3 := public.certainty_record_reminder_run('hourly-tick', '{}'::jsonb, 26);

  v_nonce := public.certainty_mint_tick();
  c1 := public.certainty_consume_tick(v_nonce);
  c2 := public.certainty_consume_tick(v_nonce);

  raise exception 'RESULT %', jsonb_build_object(
    'stateHistoryLen', jsonb_array_length(v_state->'history'),
    'stateHistoryCount', v_state->'historyCount',
    'page1Identical', (p1->'history') = (v_state->'history'),
    'page1', jsonb_build_object('len', jsonb_array_length(p1->'history'), 'total', p1->'total', 'next', p1->'nextOffset', 'hasMore', p1->'hasMore'),
    'page2', jsonb_build_object('len', jsonb_array_length(p2->'history'), 'next', p2->'nextOffset', 'hasMore', p2->'hasMore', 'first', p2->'history'->0->>'starts_at', 'overlapsPage1', exists (select 1 from jsonb_array_elements(p1->'history') a, jsonb_array_elements(p2->'history') b where a->>'id' = b->>'id')),
    'page3Len', jsonb_array_length(p3->'history'),
    'hb1', v_hb1 - 'id', 'hb2missed', v_hb2->'missed', 'overdueCheck', v_status, 'hb3', v_hb3 - 'id',
    'tickFirst', c1, 'tickReplay', c2);
end $$;
