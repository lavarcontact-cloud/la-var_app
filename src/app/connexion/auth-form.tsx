"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useSession } from "@/components/session";
import { supabaseBrowser } from "@/lib/supabase/client";

/** Connexion / inscription par e-mail et mot de passe (Supabase Auth). */
export function AuthForm() {
  const sb = supabaseBrowser();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("suite")?.startsWith("/") ? params.get("suite")! : "/";
  const { user, signOut } = useSession();
  const [mode, setMode] = useState<"connexion" | "inscription">("connexion");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [handle, setHandle] = useState("");
  const [rules, setRules] = useState(false);
  const [age, setAge] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "check-email">("idle");
  const [error, setError] = useState("");

  if (!sb) {
    return <Shell><p className="text-[var(--color-muted)]">Les comptes ne sont pas encore activés sur cette version d'aperçu (base de données non configurée).</p></Shell>;
  }
  if (user) {
    return (
      <Shell>
        <p>Vous êtes connecté avec {user.email}.</p>
        <div className="mt-4 flex gap-2">
          <Link href={next} className="btn btn-red">Continuer</Link>
          <button type="button" className="btn btn-line" onClick={signOut}>Se déconnecter</button>
        </div>
      </Shell>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (mode === "inscription") {
      if (!/^[a-z0-9_.]{3,24}$/.test(handle)) return setError("Pseudo : 3 à 24 caractères, minuscules, chiffres, point ou tiret bas.");
      if (password.length < 10) return setError("Mot de passe : 10 caractères minimum.");
      if (!rules || !age) return setError("Merci de confirmer votre âge et d'accepter les règles.");
    }
    setState("sending");
    if (mode === "connexion") {
      const { error: err } = await sb.auth.signInWithPassword({ email, password });
      if (err) {
        setState("idle");
        return setError(/confirm/i.test(err.message) ? "Confirmez d'abord votre adresse e-mail (lien reçu par e-mail)." : "E-mail ou mot de passe incorrect.");
      }
      router.push(next);
      router.refresh();
    } else {
      const { data, error: err } = await sb.auth.signUp({
        email,
        password,
        options: { data: { handle, display_name: handle }, emailRedirectTo: `${location.origin}/connexion?suite=${encodeURIComponent(next)}` },
      });
      if (err) {
        setState("idle");
        return setError(/registered|exists/i.test(err.message) ? "Un compte existe déjà avec cet e-mail." : "Inscription impossible. Vérifiez vos informations.");
      }
      if (data.session) {
        router.push(next);
        router.refresh();
      } else {
        setState("check-email");
      }
    }
  };

  if (state === "check-email") {
    return (
      <Shell>
        <p role="status">Compte créé. Un e-mail de confirmation a été envoyé à <b>{email}</b> : cliquez sur le lien pour activer votre compte.</p>
      </Shell>
    );
  }

  return (
    <Shell>
      <div role="tablist" className="mb-5 grid grid-cols-2 gap-2">
        {(["connexion", "inscription"] as const).map((m) => (
          <button key={m} role="tab" aria-selected={mode === m} type="button" onClick={() => { setMode(m); setError(""); }} className="chip justify-center" aria-pressed={mode === m}>
            {m === "connexion" ? "Se connecter" : "Créer un compte"}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="space-y-3" noValidate>
        {mode === "inscription" && (
          <label className="block text-sm font-semibold">
            Pseudo
            <input value={handle} onChange={(e) => setHandle(e.target.value.toLowerCase())} autoComplete="username" className="input mt-1" placeholder="ex. sebfp" />
          </label>
        )}
        <label className="block text-sm font-semibold">
          E-mail
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required className="input mt-1" />
        </label>
        <label className="block text-sm font-semibold">
          Mot de passe
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "connexion" ? "current-password" : "new-password"} required className="input mt-1" />
        </label>
        {mode === "inscription" && (
          <div className="space-y-2 text-sm">
            <label className="flex items-start gap-2"><input type="checkbox" checked={age} onChange={(e) => setAge(e.target.checked)} className="mt-1 h-4 w-4 accent-[var(--color-red)]" /> J'ai 15 ans ou plus.</label>
            <label className="flex items-start gap-2"><input type="checkbox" checked={rules} onChange={(e) => setRules(e.target.checked)} className="mt-1 h-4 w-4 accent-[var(--color-red)]" /> <span>J'accepte les <Link href="/regles" className="underline">règles de la communauté</Link> et les <Link href="/cgu" className="underline">conditions d'utilisation</Link>.</span></label>
          </div>
        )}
        {error && <p role="alert" className="text-sm text-[var(--color-red-hi)]">{error}</p>}
        <button type="submit" className="btn btn-red w-full" disabled={state === "sending"}>
          {state === "sending" ? "…" : mode === "connexion" ? "Se connecter" : "Créer mon compte"}
        </button>
      </form>
      <p className="mt-4 text-xs text-[var(--color-muted)]">Vos données de compte servent uniquement au fonctionnement de LA VAR. <Link href="/confidentialite" className="underline">Confidentialité</Link>.</p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[100svh] max-w-sm flex-col justify-center px-5 py-10">
      <Image src="/brand/la-var-logo-640.png" alt="LA VAR" width={640} height={328} className="mx-auto mb-8 h-auto w-40" priority />
      {children}
    </div>
  );
}
