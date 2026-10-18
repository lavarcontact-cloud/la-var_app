"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Category, ExternalItem, FeedPost, Scope } from "./types";

export type FeedQuery = {
  category?: Category | null;
  scope?: Scope | null;
  following?: boolean;
  author?: string | null;
  featured?: boolean;
  saved?: boolean;
  before?: string | null;
  limit?: number;
};

export async function fetchFeed(sb: SupabaseClient, q: FeedQuery = {}): Promise<FeedPost[]> {
  const { data, error } = await sb.rpc("get_feed", {
    p_category: q.category ?? null,
    p_scope: q.scope ?? null,
    p_following: q.following ?? false,
    p_author: q.author ?? null,
    p_before: q.before ?? null,
    p_limit: q.limit ?? 10,
    p_featured: q.featured ?? false,
    p_saved: q.saved ?? false,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as FeedPost[];
}

export async function fetchPost(sb: SupabaseClient, id: string): Promise<FeedPost | null> {
  // get_feed ne filtre pas par id : on passe par la table (RLS) puis on
  // complète auteur + état du lecteur.
  const { data, error } = await sb
    .from("posts")
    .select("*, author:profiles!posts_author_id_fkey(id, handle, display_name, avatar_path, role, is_verified)")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  const { data: auth } = await sb.auth.getUser();
  const uid = auth.user?.id;
  const [liked, saved] = uid
    ? await Promise.all([
        sb.from("likes").select("post_id").eq("post_id", id).eq("user_id", uid).maybeSingle(),
        sb.from("saves").select("post_id").eq("post_id", id).eq("user_id", uid).maybeSingle(),
      ])
    : [{ data: null }, { data: null }];
  const a = data.author as { id: string; handle: string; display_name: string; avatar_path: string | null; role: FeedPost["author_role"]; is_verified: boolean };
  return {
    ...(data as unknown as FeedPost),
    author_id: a.id,
    author_handle: a.handle,
    author_name: a.display_name,
    author_avatar: a.avatar_path,
    author_role: a.role,
    author_verified: a.is_verified,
    liked: !!liked.data,
    saved: !!saved.data,
  };
}

export async function setLike(sb: SupabaseClient, postId: string, on: boolean) {
  const { error } = on ? await sb.from("likes").insert({ post_id: postId }) : await sb.from("likes").delete().eq("post_id", postId);
  if (error && !(on && error.code === "23505")) throw new Error(error.message);
}

export async function setSave(sb: SupabaseClient, postId: string, on: boolean) {
  const { error } = on ? await sb.from("saves").insert({ post_id: postId }) : await sb.from("saves").delete().eq("post_id", postId);
  if (error && !(on && error.code === "23505")) throw new Error(error.message);
}

export async function setFollow(sb: SupabaseClient, followee: string, on: boolean) {
  const { error } = on
    ? await sb.from("follows").insert({ followee_id: followee })
    : await sb.from("follows").delete().eq("followee_id", followee);
  if (error && !(on && error.code === "23505")) throw new Error(error.message);
}

export type CommentRow = {
  id: string;
  body: string;
  created_at: string;
  author: { id: string; handle: string; display_name: string; avatar_path: string | null; is_verified: boolean };
};

export async function fetchComments(sb: SupabaseClient, postId: string): Promise<CommentRow[]> {
  const { data, error } = await sb
    .from("comments")
    .select("id, body, created_at, author:profiles!comments_author_id_fkey(id, handle, display_name, avatar_path, is_verified)")
    .eq("post_id", postId)
    .eq("status", "published")
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as CommentRow[];
}

export async function addComment(sb: SupabaseClient, postId: string, body: string) {
  const { data, error } = await sb.from("comments").insert({ post_id: postId, body }).select("id").single();
  if (error) throw new Error(friendlyError(error.message));
  return data.id as string;
}

export async function report(sb: SupabaseClient, targetType: "post" | "comment" | "profile", targetId: string, reason: string, details: string) {
  const { error } = await sb.from("reports").insert({ target_type: targetType, target_id: targetId, reason, details: details || null });
  if (error) throw new Error(friendlyError(error.message));
}

export async function fetchExternal(sb: SupabaseClient, limit = 20): Promise<ExternalItem[]> {
  const { data, error } = await sb
    .from("external_items")
    .select("id, title, url, summary, published_at, fetched_at, category, scope, source:external_sources(name, homepage)")
    .eq("hidden", false)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ExternalItem[];
}

/** Messages d'erreur serveur traduits en phrases compréhensibles. */
export function friendlyError(msg: string): string {
  if (/row-level security|rate|policy/i.test(msg)) return "Action refusée : vous allez trop vite ou vous n'avez pas les droits. Réessayez plus tard.";
  if (/compte suspendu/i.test(msg)) return "Votre compte est suspendu : vous ne pouvez pas publier pour le moment.";
  if (/publication indisponible/i.test(msg)) return "Cette publication n'est plus disponible.";
  if (/JWT|not authenticated|auth/i.test(msg)) return "Connectez-vous pour continuer.";
  if (/check constraint|violates/i.test(msg)) return "Certaines informations ne respectent pas le format attendu.";
  return "Une erreur est survenue. Réessayez.";
}
