import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { mediaUrl } from "@/lib/supabase/env";
import { PostDetail } from "./post-detail";

async function load(id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const sb = await supabaseServer();
  if (!sb) return null;
  const { data } = await sb.from("posts").select("id, title, body, media, created_at").eq("id", id).maybeSingle();
  return data;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const p = await load(id);
  if (!p) return { title: "Publication" };
  const img = (p.media as { path: string; type: string }[]).find((m) => m.type === "image");
  return {
    title: p.title,
    description: p.body?.slice(0, 160) ?? undefined,
    openGraph: { title: p.title, description: p.body?.slice(0, 160) ?? undefined, type: "article", images: img ? [{ url: mediaUrl(img.path)! }] : undefined },
  };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  return <PostDetail id={id} />;
}
