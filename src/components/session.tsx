"use client";

import type { User } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";

type Ctx = {
  ready: boolean;
  configured: boolean;
  user: User | null;
  profile: Profile | null;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<Ctx>({
  ready: false,
  configured: false,
  user: null,
  profile: null,
  refreshProfile: async () => {},
  signOut: async () => {},
});

export const useSession = () => useContext(SessionContext);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const sb = supabaseBrowser();
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const loadProfile = useCallback(
    async (uid: string | undefined) => {
      if (!sb || !uid) return setProfile(null);
      const { data } = await sb.from("profiles").select("*").eq("id", uid).maybeSingle();
      setProfile((data as Profile) ?? null);
    },
    [sb],
  );

  useEffect(() => {
    if (!sb) {
      setReady(true);
      return;
    }
    sb.auth.getUser().then(async ({ data }) => {
      setUser(data.user);
      await loadProfile(data.user?.id);
      setReady(true);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
      loadProfile(session?.user?.id);
    });
    return () => sub.subscription.unsubscribe();
  }, [sb, loadProfile]);

  const value: Ctx = {
    ready,
    configured: !!sb,
    user,
    profile,
    refreshProfile: () => loadProfile(user?.id),
    signOut: async () => {
      await sb?.auth.signOut();
      setUser(null);
      setProfile(null);
    },
  };
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
