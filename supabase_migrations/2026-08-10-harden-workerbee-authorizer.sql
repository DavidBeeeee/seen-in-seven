-- The exposed WorkerBee RPCs perform authorization internally.
-- The predicate itself is an implementation detail and is not directly callable.
revoke all on function public.workerbee_authorized(text) from public, anon, authenticated;
