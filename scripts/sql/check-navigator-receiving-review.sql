-- WBR-459 independent acceptance. Synthetic members only; all work rolls back.
begin;
create temporary table navigator_review_result (result jsonb) on commit drop;
do $probe$
declare
 a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
 aa uuid := gen_random_uuid(); bb uuid := gen_random_uuid();
 ma uuid := gen_random_uuid(); mb uuid := gen_random_uuid();
 ka uuid := gen_random_uuid(); km uuid := gen_random_uuid();
 r public.navigator_roadmaps; r2 public.navigator_roadmaps;
 m public.navigator_moves; denied boolean := false; n integer; erased jsonb;
begin
 insert into auth.users(id,email) values (aa,'wbr459-a@example.invalid'),(bb,'wbr459-b@example.invalid');
 insert into public.users(id,auth_id,email) values (a,aa,'wbr459-a@example.invalid'),(b,bb,'wbr459-b@example.invalid');
 insert into public.studio_entitlements(user_id,app_key,status) values (a,'eee','active'),(b,'eee','active');
 insert into public.navigator_moves(id,user_id,next_action) values (ma,a,'Synthetic A'),(mb,b,'Synthetic B');
 insert into public.navigator_states(user_id,state) values (a,'{"probe":"A"}'),(b,'{"probe":"B"}');
 perform set_config('request.jwt.claim.sub',aa::text,true);
 perform set_config('role','authenticated',true);
 select * into r from public.save_navigator_roadmap('{"name":"Synthetic A"}',now(),null,ka,'in_progress');
 select * into r2 from public.save_navigator_roadmap('{"name":"Synthetic A"}',now(),null,ka,'in_progress');
 if r.version <> r2.version then raise exception 'duplicate save'; end if;
 select * into r2 from public.save_navigator_roadmap('{"name":"Synthetic A updated"}',now(),1,gen_random_uuid(),'complete');
 begin
  perform public.save_navigator_roadmap('{"name":"stale"}',now(),1,gen_random_uuid(),'in_progress');
 exception when sqlstate 'P0001' then denied := sqlerrm='STALE_VERSION';
 end;
 if not denied then raise exception 'stale not refused'; end if;
 select * into m from public.complete_navigator_move(ma,km);
 select * into m from public.complete_navigator_move(ma,km);
 perform set_config('role','postgres',true);
 select count(*) into n from public.logs where user_id=a and event_type='navigator_move_lifecycle';
 if n<>1 then raise exception 'completion doubled'; end if;
 perform set_config('request.jwt.claim.sub',bb::text,true);
 perform set_config('role','authenticated',true);
 select count(*) into n from public.navigator_roadmaps where user_id=a;
 if n<>0 then raise exception 'B read A'; end if;
 perform public.save_navigator_roadmap('{"name":"Synthetic B"}',now(),null,gen_random_uuid(),'in_progress');
 perform set_config('request.jwt.claim.sub',aa::text,true);
 select count(*) into n from public.navigator_roadmaps;
 if n<>1 then raise exception 'export scope'; end if;
 select count(*) into n from public.navigator_moves;
 if n<>1 then raise exception 'export move scope'; end if;
 erased := public.erase_navigator_data();
 if erased <> '{"roadmaps":1,"moves":1,"states":1}'::jsonb then raise exception 'erase counts'; end if;
 select count(*) into n from public.navigator_roadmaps;
 if n<>0 then raise exception 'A erase failed'; end if;
 perform set_config('request.jwt.claim.sub',bb::text,true);
 select count(*) into n from public.navigator_roadmaps;
 if n<>1 then raise exception 'B data lost'; end if;
 select count(*) into n from public.navigator_moves;
 if n<>1 then raise exception 'B move lost'; end if;
 select count(*) into n from public.navigator_states;
 if n<>1 then raise exception 'B state lost'; end if;
 perform set_config('role','postgres',true);
 insert into navigator_review_result values (jsonb_build_object('staleRefused',true,'saveKeyedOnce',true,'completionTrailRows',1,'memberBReadA',0,'exportCallerScoped',true,'erased',erased,'memberBRetainedAll',true));
end
$probe$;
select result from navigator_review_result;
rollback;
