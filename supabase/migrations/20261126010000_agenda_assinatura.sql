-- Agenda para assinar no Google Agenda / iPhone / Outlook.
-- Cada aluno tem um código secreto (ical_token); o endereço /api/agenda/{código}.ics devolve só os eventos dele.
-- O Google busca esse endereço sem login, por isso a leitura é por uma função que só aceita o código.
alter table profiles add column if not exists ical_token uuid not null default gen_random_uuid();
create unique index if not exists profiles_ical_token_key on profiles (ical_token);

create or replace function public.ical_feed(p_token uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', p.full_name,
    'ics', (select value from settings where key = 'calendar_ics_url'),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'title', e.title, 'kind', e.kind, 'starts_at', e.starts_at, 'ends_at', e.ends_at,
        'location', e.location, 'meet_url', e.meet_url, 'description', e.description,
        'canceled', e.canceled, 'updated_at', e.updated_at, 'response', a.response
      ) order by e.starts_at)
      from event_attendees a join events e on e.id = a.event_id
      where a.student_id = p.id and e.ends_at > now() - interval '60 days'
    ), '[]'::jsonb)
  )
  from profiles p
  where p.ical_token = p_token and p.role = 'aluno';
$$;
revoke execute on function public.ical_feed(uuid) from public;
grant execute on function public.ical_feed(uuid) to anon, authenticated;

-- O aluno pode trocar o código (o link antigo para de funcionar).
create or replace function public.reset_ical_token() returns uuid
language sql security definer set search_path = public as $$
  update profiles set ical_token = gen_random_uuid() where id = auth.uid() returning ical_token;
$$;
revoke execute on function public.reset_ical_token() from anon, public;
grant execute on function public.reset_ical_token() to authenticated;
