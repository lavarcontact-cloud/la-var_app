"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "@/components/session";

/** Raccourci "Profil" : vers son propre profil, ou vers la connexion. */
export default function Me() {
  const { ready, profile, user } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (!ready) return;
    router.replace(profile ? `/u/${profile.handle}` : user ? "/" : "/connexion?suite=/moi");
  }, [ready, profile, user, router]);
  return <p className="p-8 text-center text-[var(--color-muted)]">Chargement…</p>;
}
