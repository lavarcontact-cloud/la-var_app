-- Fonctions d'administration complémentaires (réalisations du Studio, suivi des devis).

create or replace function public.upsert_work(p_id uuid, p_title text, p_artist text, p_role text, p_url text, p_position int, p_active boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid;
begin
  if not public.is_staff('admin') then raise exception 'accès refusé'; end if;
  if p_id is null then
    insert into public.studio_works (title, artist, role, url, position, is_active)
      values (p_title, nullif(p_artist, ''), nullif(p_role, ''), nullif(p_url, ''), coalesce(p_position, 100), p_active) returning id into rid;
  else
    update public.studio_works set title = p_title, artist = nullif(p_artist, ''), role = nullif(p_role, ''), url = nullif(p_url, ''),
           position = coalesce(p_position, 100), is_active = p_active where id = p_id returning id into rid;
  end if;
  return rid;
end $$;
grant execute on function public.upsert_work to authenticated;

create or replace function public.set_quote_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff('admin') then raise exception 'accès refusé'; end if;
  update public.quote_requests set status = p_status where id = p_id;
end $$;
grant execute on function public.set_quote_status to authenticated;

-- Recherche d'un compte par pseudo pour l'attribution des rôles (admin).
create or replace function public.find_profile(p_handle text) returns setof public.profiles
language sql stable security definer set search_path = public as $$
  select * from public.profiles where public.is_staff('admin') and handle = lower(p_handle)
$$;
grant execute on function public.find_profile to authenticated;

-- Par défaut, Supabase accorde EXECUTE aux rôles anon/authenticated sur toute
-- nouvelle fonction : on retire ce droit aux visiteurs (les fonctions
-- vérifient aussi le rôle, ceci est une défense supplémentaire).
revoke execute on function public.upsert_work, public.set_quote_status, public.find_profile from public, anon;
grant execute on function public.upsert_work, public.set_quote_status, public.find_profile to authenticated;
