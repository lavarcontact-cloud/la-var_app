-- =====================================================================
-- LA VAR : règles d'accès (RLS), fonctions serveur, stockage des médias
-- =====================================================================

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.likes enable row level security;
alter table public.saves enable row level security;
alter table public.follows enable row level security;
alter table public.reports enable row level security;
alter table public.moderation_actions enable row level security;
alter table public.external_sources enable row level security;
alter table public.external_items enable row level security;
alter table public.services enable row level security;
alter table public.studio_works enable row level security;
alter table public.quote_requests enable row level security;
alter table public.rate_events enable row level security;

-- Aucun droit implicite : on repart de zéro, puis on accorde le strict nécessaire.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated, public;

-- ---------- Profils ----------
grant select on public.profiles to anon, authenticated;
grant update (display_name, bio, avatar_path) on public.profiles to authenticated;
create policy profiles_read on public.profiles for select using (true);
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- ---------- Publications ----------
grant select on public.posts to anon, authenticated;
grant insert (kind, category, scope, title, body, media, source_name, source_url, info_status) on public.posts to authenticated;
grant update (title, body, media, source_name, source_url, category, scope) on public.posts to authenticated;
grant delete on public.posts to authenticated;
create policy posts_read on public.posts for select
  using (status = 'published' or author_id = auth.uid() or public.is_staff('moderator'));
create policy posts_insert on public.posts for insert to authenticated
  with check (author_id = auth.uid() and public.rate_ok_self('post', 20, 3600));
create policy posts_update_own on public.posts for update to authenticated
  using (author_id = auth.uid() and status = 'published') with check (author_id = auth.uid());
create policy posts_delete_own on public.posts for delete to authenticated
  using (author_id = auth.uid() or public.is_staff('admin'));

-- ---------- Commentaires ----------
grant select on public.comments to anon, authenticated;
grant insert (post_id, body) on public.comments to authenticated;
grant delete on public.comments to authenticated;
create policy comments_read on public.comments for select
  using ((status = 'published' and exists (select 1 from public.posts p where p.id = post_id and p.status = 'published'))
         or author_id = auth.uid() or public.is_staff('moderator'));
create policy comments_insert on public.comments for insert to authenticated
  with check (author_id = auth.uid() and public.rate_ok_self('comment', 60, 3600));
create policy comments_delete on public.comments for delete to authenticated
  using (author_id = auth.uid());

-- ---------- Interactions ----------
grant select, insert, delete on public.likes, public.saves, public.follows to authenticated;
-- saves : droit technique pour que get_feed fonctionne hors connexion ; la
-- politique saves_read (authenticated uniquement) ne renvoie aucune ligne au visiteur.
grant select on public.likes, public.follows, public.saves to anon;
create policy likes_read on public.likes for select using (true);
create policy likes_write on public.likes for insert to authenticated
  with check (user_id = auth.uid() and public.rate_ok_self('like', 300, 3600));
create policy likes_delete on public.likes for delete to authenticated using (user_id = auth.uid());
-- Les enregistrements sont privés : chacun ne voit que les siens.
create policy saves_read on public.saves for select to authenticated using (user_id = auth.uid());
create policy saves_write on public.saves for insert to authenticated with check (user_id = auth.uid());
create policy saves_delete on public.saves for delete to authenticated using (user_id = auth.uid());
create policy follows_read on public.follows for select using (true);
create policy follows_write on public.follows for insert to authenticated
  with check (follower_id = auth.uid() and public.rate_ok_self('follow', 200, 3600));
create policy follows_delete on public.follows for delete to authenticated using (follower_id = auth.uid());

-- ---------- Signalements ----------
grant insert (target_type, target_id, reason, details) on public.reports to authenticated;
grant select on public.reports to authenticated;
create policy reports_insert on public.reports for insert to authenticated
  with check (reporter_id = auth.uid() and public.rate_ok_self('report', 30, 3600));
create policy reports_read on public.reports for select to authenticated
  using (reporter_id = auth.uid() or public.is_staff('moderator'));

grant select on public.moderation_actions to authenticated;
create policy modlog_read on public.moderation_actions for select to authenticated
  using (public.is_staff('moderator')
         or exists (select 1 from public.posts p where p.id = target_id and p.author_id = auth.uid())
         or exists (select 1 from public.comments c where c.id = target_id and c.author_id = auth.uid())
         or (target_type = 'profile' and target_id = auth.uid()));

-- ---------- Actualités externes ----------
grant select on public.external_sources, public.external_items to anon, authenticated;
create policy ext_sources_read on public.external_sources for select using (is_active or public.is_staff('editor'));
create policy ext_items_read on public.external_items for select using (not hidden or public.is_staff('editor'));

-- ---------- Studio ----------
grant select on public.services, public.studio_works to anon, authenticated;
create policy services_read on public.services for select using (is_active or public.is_staff('admin'));
create policy works_read on public.studio_works for select using (is_active or public.is_staff('admin'));
grant select on public.quote_requests to authenticated;
create policy quotes_read on public.quote_requests for select to authenticated using (public.is_staff('admin'));

-- =====================================================================
-- Fonctions serveur (SECURITY DEFINER : vérifient elles-mêmes les droits)
-- =====================================================================

-- Fil : publications visibles + auteur + état "aimé / enregistré" du lecteur.
create or replace function public.get_feed(
  p_category public.post_category default null,
  p_scope public.post_scope default null,
  p_following boolean default false,
  p_author uuid default null,
  p_before timestamptz default null,
  p_limit int default 12,
  p_featured boolean default false,
  p_saved boolean default false
) returns table (
  id uuid, kind public.post_kind, category public.post_category, scope public.post_scope,
  title text, body text, media jsonb, source_name text, source_url text,
  info_status public.info_status, is_editorial boolean, is_featured boolean, is_sample boolean,
  correction_note text, like_count int, comment_count int, save_count int,
  created_at timestamptz, updated_at timestamptz,
  author_id uuid, author_handle text, author_name text, author_avatar text,
  author_role public.user_role, author_verified boolean,
  liked boolean, saved boolean
)
language sql stable security invoker set search_path = public as $$
  select p.id, p.kind, p.category, p.scope, p.title, p.body, p.media, p.source_name, p.source_url,
         p.info_status, p.is_editorial, p.is_featured, p.is_sample, p.correction_note,
         p.like_count, p.comment_count, p.save_count, p.created_at, p.updated_at,
         a.id, a.handle, a.display_name, a.avatar_path, a.role, a.is_verified,
         exists (select 1 from public.likes l where l.post_id = p.id and l.user_id = auth.uid()),
         exists (select 1 from public.saves s where s.post_id = p.id and s.user_id = auth.uid())
  from public.posts p
  join public.profiles a on a.id = p.author_id
  where p.status = 'published'
    and (p_category is null or p.category = p_category)
    and (p_scope is null or p.scope = p_scope)
    and (p_author is null or p.author_id = p_author)
    and (not p_featured or p.is_featured)
    and (not p_following or exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = p.author_id))
    and (not p_saved or exists (select 1 from public.saves s where s.post_id = p.id and s.user_id = auth.uid()))
    and (p_before is null or p.created_at < p_before)
  order by p.created_at desc
  limit least(greatest(p_limit, 1), 30)
$$;
grant execute on function public.get_feed to anon, authenticated;

-- Modération : masquer, retirer, restaurer, suspendre, avec motif obligatoire.
create or replace function public.moderate(
  p_target_type text, p_target_id uuid, p_action text, p_reason text, p_report_id uuid default null, p_ban_days int default 7
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff('moderator') then raise exception 'accès refusé'; end if;
  if char_length(coalesce(p_reason, '')) < 3 then raise exception 'motif requis'; end if;
  if p_target_type = 'post' and p_action in ('hide', 'remove', 'restore') then
    update public.posts set status = case p_action when 'hide' then 'hidden' when 'remove' then 'removed' else 'published' end::public.content_status
      where id = p_target_id;
  elsif p_target_type = 'comment' and p_action in ('hide', 'remove', 'restore') then
    update public.comments set status = case p_action when 'hide' then 'hidden' when 'remove' then 'removed' else 'published' end::public.content_status
      where id = p_target_id;
  elsif p_target_type = 'profile' and p_action in ('ban', 'unban') then
    if p_target_id = auth.uid() then raise exception 'action impossible sur son propre compte'; end if;
    update public.profiles set banned_until = case p_action when 'ban' then now() + make_interval(days => greatest(1, least(p_ban_days, 3650))) else null end
      where id = p_target_id;
  else
    raise exception 'action invalide';
  end if;
  insert into public.moderation_actions (moderator_id, target_type, target_id, action, reason, report_id)
    values (auth.uid(), p_target_type, p_target_id, p_action, p_reason, p_report_id);
  if p_report_id is not null then
    update public.reports set status = 'actioned', handled_by = auth.uid(), handled_at = now(), decision_note = p_reason where id = p_report_id;
  end if;
end $$;
grant execute on function public.moderate to authenticated;

create or replace function public.dismiss_report(p_report_id uuid, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff('moderator') then raise exception 'accès refusé'; end if;
  update public.reports set status = 'dismissed', handled_by = auth.uid(), handled_at = now(), decision_note = left(p_note, 1000) where id = p_report_id;
end $$;
grant execute on function public.dismiss_report to authenticated;

-- Qualification éditoriale : statut de l'info, mise à la une, correction publique.
create or replace function public.qualify_post(
  p_post_id uuid, p_info_status public.info_status, p_featured boolean, p_editorial boolean, p_correction text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff('editor') then raise exception 'accès refusé'; end if;
  update public.posts set info_status = p_info_status, is_featured = p_featured, is_editorial = p_editorial,
         correction_note = nullif(left(coalesce(p_correction, ''), 500), '')
   where id = p_post_id;
  insert into public.moderation_actions (moderator_id, target_type, target_id, action, reason)
    values (auth.uid(), 'post', p_post_id, 'qualify', 'statut : ' || p_info_status || coalesce(' · ' || nullif(p_correction, ''), ''));
end $$;
grant execute on function public.qualify_post to authenticated;

-- Rôles : réservé aux administrateurs.
create or replace function public.set_role(p_user uuid, p_role public.user_role, p_verified boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff('admin') then raise exception 'accès refusé'; end if;
  update public.profiles set role = p_role, is_verified = p_verified where id = p_user;
end $$;
grant execute on function public.set_role to authenticated;

-- Prestations : modification des tarifs par un administrateur.
create or replace function public.update_service(
  p_slug text, p_title text, p_description text, p_price_cents int, p_price_label text, p_terms text, p_active boolean
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff('admin') then raise exception 'accès refusé'; end if;
  update public.services set title = p_title, description = p_description, price_cents = p_price_cents,
         price_label = nullif(p_price_label, ''), terms = nullif(p_terms, ''), is_active = p_active, updated_at = now()
   where slug = p_slug;
end $$;
grant execute on function public.update_service to authenticated;

-- Sources d'actualité : ajout / désactivation par la rédaction.
create or replace function public.upsert_source(
  p_id uuid, p_name text, p_homepage text, p_feed_url text, p_category public.post_category, p_scope public.post_scope, p_active boolean
) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid;
begin
  if not public.is_staff('editor') then raise exception 'accès refusé'; end if;
  if p_id is null then
    insert into public.external_sources (name, homepage, feed_url, default_category, default_scope, is_active)
      values (p_name, nullif(p_homepage, ''), p_feed_url, p_category, p_scope, p_active) returning id into rid;
  else
    update public.external_sources set name = p_name, homepage = nullif(p_homepage, ''), feed_url = p_feed_url,
           default_category = p_category, default_scope = p_scope, is_active = p_active where id = p_id returning id into rid;
  end if;
  return rid;
end $$;
grant execute on function public.upsert_source to authenticated;

create or replace function public.hide_external_item(p_id uuid, p_hidden boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff('editor') then raise exception 'accès refusé'; end if;
  update public.external_items set hidden = p_hidden where id = p_id;
end $$;
grant execute on function public.hide_external_item to authenticated;

-- Demande de devis : ouverte à tous, limitée en débit, renvoie l'identifiant
-- réellement enregistré (aucun faux succès possible côté interface).
create or replace function public.submit_quote(
  p_service text, p_name text, p_email text, p_phone text, p_message text, p_budget text, p_date text, p_client_key text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid;
begin
  if not public.rate_ok('quote:' || coalesce(auth.uid()::text, left(p_client_key, 64)), 5, 3600) then
    raise exception 'trop de demandes';
  end if;
  insert into public.quote_requests (service_slug, name, email, phone, message, budget, date_wish, user_id)
    values (nullif(p_service, ''), p_name, lower(p_email), nullif(p_phone, ''), p_message, nullif(p_budget, ''), nullif(p_date, ''), auth.uid())
    returning id into rid;
  return rid;
end $$;

-- Fonctions utilitaires appelées par les politiques.
-- Droits finaux sur les fonctions : on retire tout (y compris les droits par
-- défaut accordés aux fonctions créées plus haut), puis on accorde au cas par cas.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.is_staff, public.is_banned, public.current_role_of to anon, authenticated;
grant execute on function public.rate_ok_self to authenticated;
grant execute on function public.get_feed to anon, authenticated;
-- Devis : uniquement via la route serveur /api/quote (clé de service), qui
-- fournit une empreinte d'IP non falsifiable par le navigateur.
grant execute on function public.submit_quote to service_role;
grant execute on function public.moderate, public.dismiss_report, public.qualify_post, public.set_role,
  public.update_service, public.upsert_source, public.hide_external_item to authenticated;

-- =====================================================================
-- Stockage : un seau public en lecture (les publications sont publiques),
-- écriture uniquement dans son propre dossier, types et tailles limités.
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 52428800,
        array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy media_upload_own on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text and not public.is_banned(auth.uid()));
create policy media_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy media_read on storage.objects for select using (bucket_id = 'media');
