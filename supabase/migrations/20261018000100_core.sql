-- =====================================================================
-- LA VAR : schéma principal
-- Principe : toute écriture passe par des règles RLS ou par des fonctions
-- SECURITY DEFINER qui revérifient l'identité (auth.uid()) et le rôle.
-- Le client n'a jamais de droit implicite ; tout est explicite ci-dessous.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Types ----------
create type public.user_role as enum ('member', 'artist', 'editor', 'moderator', 'admin');
create type public.post_kind as enum ('video', 'photo', 'carousel', 'article', 'link');
create type public.post_category as enum ('actu', 'sortie', 'clip', 'annonce', 'tendance', 'decouverte', 'coulisses', 'interview', 'evenement');
create type public.post_scope as enum ('fr', 'international', 'local');
-- Statut de l'information : une publication de membre est "à vérifier" tant
-- qu'un membre de la rédaction ne l'a pas qualifiée.
create type public.info_status as enum ('officiel', 'confirme', 'a_verifier', 'rumeur');
create type public.content_status as enum ('published', 'hidden', 'removed');
create type public.report_reason as enum ('spam', 'haine', 'harcelement', 'violence', 'sexuel', 'desinformation', 'droit_auteur', 'vie_privee', 'autre');

-- ---------- Profils ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  handle text not null unique check (handle ~ '^[a-z0-9_.]{3,24}$'),
  display_name text not null check (char_length(display_name) between 1 and 50),
  bio text check (char_length(bio) <= 280),
  avatar_path text,
  role public.user_role not null default 'member',
  is_verified boolean not null default false,
  banned_until timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.current_role_of(uid uuid) returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = uid
$$;

create or replace function public.is_staff(min_role public.user_role default 'moderator') returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select case min_role
       when 'editor' then role in ('editor', 'admin')
       when 'moderator' then role in ('moderator', 'editor', 'admin')
       when 'admin' then role = 'admin'
       else true end
     from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_banned(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select banned_until > now() from public.profiles where id = uid), false)
$$;

-- Création automatique du profil à l'inscription (pseudo dérivé, unique).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  base text := regexp_replace(lower(coalesce(new.raw_user_meta_data ->> 'handle', split_part(new.email, '@', 1))), '[^a-z0-9_.]', '', 'g');
  candidate text;
  n int := 0;
begin
  if char_length(base) < 3 then base := 'membre'; end if;
  base := left(base, 18);
  candidate := base;
  while exists (select 1 from public.profiles where handle = candidate) loop
    n := n + 1;
    candidate := base || n::text;
  end loop;
  insert into public.profiles (id, handle, display_name)
  values (new.id, candidate, left(coalesce(new.raw_user_meta_data ->> 'display_name', candidate), 50));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Publications ----------
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  kind public.post_kind not null,
  category public.post_category not null,
  scope public.post_scope not null default 'fr',
  title text not null check (char_length(title) between 3 and 140),
  body text check (char_length(body) <= 4000),
  media jsonb not null default '[]'::jsonb check (jsonb_typeof(media) = 'array' and jsonb_array_length(media) <= 10),
  source_name text check (char_length(source_name) <= 80),
  source_url text check (source_url is null or source_url ~ '^https://'),
  info_status public.info_status not null default 'a_verifier',
  is_editorial boolean not null default false,
  is_featured boolean not null default false,
  is_sample boolean not null default false,
  status public.content_status not null default 'published',
  correction_note text check (char_length(correction_note) <= 500),
  like_count int not null default 0,
  comment_count int not null default 0,
  save_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index posts_feed_idx on public.posts (status, created_at desc);
create index posts_author_idx on public.posts (author_id, created_at desc);
create index posts_category_idx on public.posts (category, created_at desc);

-- Garde-fou serveur : un membre ne peut ni se déclarer "rédaction", ni mettre
-- à la une, ni qualifier une info de "confirmée" ; seuls les artistes
-- vérifiés peuvent marquer "officiel" leurs propres annonces.
create or replace function public.posts_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r public.user_role := public.current_role_of(auth.uid());
  verified boolean := coalesce((select is_verified from public.profiles where id = auth.uid()), false);
  staff boolean := r in ('editor', 'admin');
begin
  if auth.uid() is null then
    return new; -- service interne (imports, tests) : pas de restriction
  end if;
  -- Mise à jour interne des compteurs (bump_counter) : seuls les compteurs bougent.
  if tg_op = 'UPDATE' and current_setting('lavar.counter_update', true) = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if public.is_banned(auth.uid()) then raise exception 'compte suspendu'; end if;
    new.author_id := auth.uid();
    new.status := 'published';
    new.like_count := 0; new.comment_count := 0; new.save_count := 0;
    new.is_sample := false;
  else
    -- Les compteurs et l'auteur ne sont jamais modifiables par le client.
    new.author_id := old.author_id;
    new.like_count := old.like_count; new.comment_count := old.comment_count; new.save_count := old.save_count;
    new.created_at := old.created_at;
    new.is_sample := old.is_sample;
    if not public.is_staff('moderator') then new.status := old.status; end if;
  end if;
  if not staff then
    new.is_editorial := coalesce(old.is_editorial, false) and tg_op = 'UPDATE';
    new.is_featured := coalesce(old.is_featured, false) and tg_op = 'UPDATE';
    if new.info_status in ('confirme') or (new.info_status = 'officiel' and not (r = 'artist' and verified)) then
      new.info_status := coalesce(case when tg_op = 'UPDATE' then old.info_status end, 'a_verifier');
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger posts_guard before insert or update on public.posts
  for each row execute function public.posts_guard();

-- ---------- Commentaires ----------
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  body text not null check (char_length(body) between 1 and 1000),
  status public.content_status not null default 'published',
  created_at timestamptz not null default now()
);
create index comments_post_idx on public.comments (post_id, created_at);

create or replace function public.comments_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then
    if public.is_banned(auth.uid()) then raise exception 'compte suspendu'; end if;
    new.author_id := auth.uid();
    new.status := 'published';
    if not exists (select 1 from public.posts where id = new.post_id and status = 'published') then
      raise exception 'publication indisponible';
    end if;
  else
    new.author_id := old.author_id; new.post_id := old.post_id; new.created_at := old.created_at;
    if not public.is_staff('moderator') then new.status := old.status; end if;
  end if;
  return new;
end $$;
create trigger comments_guard before insert or update on public.comments
  for each row execute function public.comments_guard();

-- ---------- Interactions ----------
create table public.likes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create table public.saves (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create table public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  followee_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

-- Compteurs dénormalisés tenus par la base (jamais par le client).
create or replace function public.bump_counter() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  delta int := case when tg_op = 'INSERT' then 1 else -1 end;
  pid uuid := coalesce(new.post_id, old.post_id);
begin
  perform set_config('lavar.counter_update', 'on', true);
  if tg_table_name = 'likes' then
    update public.posts set like_count = greatest(0, like_count + delta) where id = pid;
  elsif tg_table_name = 'saves' then
    update public.posts set save_count = greatest(0, save_count + delta) where id = pid;
  elsif tg_table_name = 'comments' then
    if tg_op = 'UPDATE' then
      delta := case when new.status = 'published' and old.status <> 'published' then 1
                    when new.status <> 'published' and old.status = 'published' then -1 else 0 end;
    elsif (tg_op = 'INSERT' and new.status <> 'published') or (tg_op = 'DELETE' and old.status <> 'published') then
      delta := 0;
    end if;
    update public.posts set comment_count = greatest(0, comment_count + delta) where id = pid;
  end if;
  perform set_config('lavar.counter_update', 'off', true);
  return null;
end $$;
-- Le drapeau lavar.counter_update n'est levé que le temps de l'UPDATE interne
-- ci-dessus (posts_guard le reconnaît), puis immédiatement rabaissé.
create trigger likes_count after insert or delete on public.likes for each row execute function public.bump_counter();
create trigger saves_count after insert or delete on public.saves for each row execute function public.bump_counter();
create trigger comments_count after insert or delete or update of status on public.comments for each row execute function public.bump_counter();

-- ---------- Signalements et modération (DSA : notification et action) ----------
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles (id) on delete set null default auth.uid(),
  target_type text not null check (target_type in ('post', 'comment', 'profile')),
  target_id uuid not null,
  reason public.report_reason not null,
  details text check (char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  handled_by uuid references public.profiles (id) on delete set null,
  handled_at timestamptz,
  decision_note text check (char_length(decision_note) <= 1000),
  created_at timestamptz not null default now()
);
create index reports_open_idx on public.reports (status, created_at);

-- Journal des décisions : motif communiqué à l'auteur (exposé des motifs).
create table public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  -- Journal conservé si le compte du modérateur est supprimé (droit à l'effacement).
  moderator_id uuid references public.profiles (id) on delete set null,
  target_type text not null check (target_type in ('post', 'comment', 'profile')),
  target_id uuid not null,
  action text not null check (action in ('hide', 'remove', 'restore', 'ban', 'unban', 'qualify')),
  reason text not null check (char_length(reason) between 3 and 1000),
  report_id uuid references public.reports (id),
  created_at timestamptz not null default now()
);

-- ---------- Actualités externes (titres + lien, jamais le contenu complet) ----------
create table public.external_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  homepage text check (homepage ~ '^https://'),
  feed_url text not null unique check (feed_url ~ '^https://'),
  default_category public.post_category not null default 'actu',
  default_scope public.post_scope not null default 'fr',
  is_active boolean not null default true,
  last_fetched_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
create table public.external_items (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.external_sources (id) on delete cascade,
  dedupe_key text not null unique,
  title text not null check (char_length(title) between 3 and 300),
  url text not null check (url ~ '^https?://'),
  summary text check (char_length(summary) <= 300),
  published_at timestamptz,
  category public.post_category not null,
  scope public.post_scope not null,
  hidden boolean not null default false,
  fetched_at timestamptz not null default now()
);
create index external_items_recent_idx on public.external_items (hidden, published_at desc nulls last);

-- ---------- Studio : prestations et demandes de devis ----------
create table public.services (
  slug text primary key check (slug ~ '^[a-z0-9-]{2,40}$'),
  title text not null,
  description text not null,
  deliverables text[] not null default '{}',
  -- null = tarif non renseigné : affiché "Sur devis", jamais inventé.
  price_cents int check (price_cents is null or price_cents > 0),
  price_label text check (char_length(price_label) <= 60),
  terms text check (char_length(terms) <= 1000),
  position int not null default 100,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);
create table public.studio_works (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  artist text,
  role text,
  url text check (url is null or url ~ '^https://'),
  media_path text,
  position int not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.quote_requests (
  id uuid primary key default gen_random_uuid(),
  service_slug text references public.services (slug),
  name text not null check (char_length(name) between 2 and 120),
  email text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 200),
  phone text check (char_length(phone) <= 30),
  message text not null check (char_length(message) between 20 and 3000),
  budget text check (char_length(budget) <= 60),
  date_wish text check (char_length(date_wish) <= 80),
  user_id uuid references public.profiles (id) on delete set null,
  status text not null default 'nouveau' check (status in ('nouveau', 'en_cours', 'repondu', 'archive')),
  created_at timestamptz not null default now()
);

-- ---------- Limitation de débit (anti-spam) ----------
create table public.rate_events (
  key text not null,
  at timestamptz not null default now()
);
create index rate_events_idx on public.rate_events (key, at);

create or replace function public.rate_ok(k text, max_count int, window_s int) returns boolean
language plpgsql security definer set search_path = public as $$
declare c int;
begin
  delete from public.rate_events where at < now() - interval '1 day';
  select count(*) into c from public.rate_events where key = k and at > now() - make_interval(secs => window_s);
  if c >= max_count then return false; end if;
  insert into public.rate_events (key) values (k);
  return true;
end $$;

-- Version appelable par les règles d'accès : la clé est TOUJOURS liée à
-- l'utilisateur connecté, on ne peut donc consommer que son propre quota.
create or replace function public.rate_ok_self(action text, max_count int, window_s int) returns boolean
language sql security definer set search_path = public as $$
  select auth.uid() is not null and public.rate_ok(action || ':' || auth.uid()::text, max_count, window_s)
$$;
