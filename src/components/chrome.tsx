"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "./session";

const TABS = [
  { href: "/", label: "Fil", icon: IconFeed },
  { href: "/une", label: "À la une", icon: IconNews },
  { href: "/publier", label: "Publier", icon: IconPlus, primary: true },
  { href: "/decouvertes", label: "Découvertes", icon: IconSpark },
  { href: "/moi", label: "Profil", icon: IconUser },
] as const;

const isActive = (p: string, href: string) => (href === "/" ? p === "/" : p.startsWith(href));

/** Barre d'onglets mobile : fil, à la une, publier, découvertes, profil. */
export function TabBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--color-line)] bg-black/95 pb-[var(--safe-b)] lg:hidden"
    >
      <ul className="mx-auto grid h-[var(--nav-h)] max-w-lg grid-cols-5">
        {TABS.map(({ href, label, icon: Icon, ...t }) => {
          const active = isActive(pathname, href);
          const primary = "primary" in t;
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex h-full flex-col items-center justify-center gap-0.5 text-[10.5px] font-semibold ${active ? "text-[var(--color-paper)]" : "text-[var(--color-muted)]"}`}
              >
                {primary ? (
                  <span className="flex h-9 w-12 -skew-x-[10deg] items-center justify-center rounded-[4px] bg-[var(--color-red)] text-white">
                    <span className="skew-x-[10deg]"><Icon /></span>
                  </span>
                ) : (
                  <Icon active={active} />
                )}
                <span className={primary ? "sr-only" : ""}>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Colonne de navigation desktop : logo, rubriques, accès Studio. */
export function SideBar() {
  const pathname = usePathname();
  const { profile } = useSession();
  const staff = profile && ["moderator", "editor", "admin"].includes(profile.role);
  const links = [
    ...TABS.filter((t) => !("primary" in t)),
    { href: "/studio", label: "Studio", icon: IconCamera },
    ...(staff ? [{ href: "/moderation", label: "Modération", icon: IconShield }] : []),
    ...(profile?.role === "admin" || profile?.role === "editor" ? [{ href: "/admin", label: "Admin", icon: IconGear }] : []),
  ];
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-[var(--color-line)] bg-black px-5 py-6 lg:flex">
      <Link href="/" aria-label="LA VAR, accueil" className="block w-36">
        <Image src="/brand/la-var-logo-640.png" alt="LA VAR" width={640} height={328} priority className="h-auto w-full" />
      </Link>
      <nav aria-label="Navigation principale" className="mt-8 flex flex-col gap-1">
        {links.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-[6px] px-3 py-2.5 font-semibold ${active ? "bg-[var(--color-panel)] text-[var(--color-paper)]" : "text-[var(--color-muted)] hover:text-[var(--color-paper)]"}`}
            >
              <Icon active={active} />
              {label}
            </Link>
          );
        })}
      </nav>
      <Link href="/publier" className="btn btn-red mt-6">Publier</Link>
      <div className="mt-auto space-y-1 text-xs text-[var(--color-muted)]">
        <Link href="/regles" className="block hover:text-[var(--color-paper)]">Règles de la communauté</Link>
        <Link href="/mentions-legales" className="block hover:text-[var(--color-paper)]">Mentions légales</Link>
        <Link href="/confidentialite" className="block hover:text-[var(--color-paper)]">Confidentialité</Link>
      </div>
    </aside>
  );
}

/** En-tête mobile des pages (hors fil plein écran). */
export function PageHeader({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-[var(--color-line)] bg-black/95 px-4 pb-3 pt-[calc(var(--safe-t)+12px)] lg:px-8">
      <div className="flex items-center gap-3">
        <Link href="/" aria-label="LA VAR, accueil" className="w-16 lg:hidden">
          <Image src="/brand/la-var-logo-640.png" alt="LA VAR" width={640} height={328} className="h-auto w-full" />
        </Link>
        <h1 className="t-display text-[26px] lg:text-4xl">{title}</h1>
      </div>
      {right}
    </header>
  );
}

/* ---------- Icônes (24px, trait 2) ---------- */
type IP = { active?: boolean };
const sv = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
export function IconFeed({ active }: IP) {
  return <svg {...sv}><rect x="5" y="3" width="14" height="18" rx="3" fill={active ? "currentColor" : "none"} /><path d="M10.5 9.5v5l4-2.5z" stroke={active ? "#000" : "currentColor"} /></svg>;
}
export function IconNews({ active }: IP) {
  return <svg {...sv}><path d="M4 5h12v14H6a2 2 0 0 1-2-2z" fill={active ? "currentColor" : "none"} /><path d="M16 9h4v8a2 2 0 0 1-2 2h-2" /><path d="M7 9h6M7 13h6" stroke={active ? "#000" : "currentColor"} /></svg>;
}
export function IconPlus() {
  return <svg {...sv} strokeWidth={2.6}><path d="M12 5v14M5 12h14" /></svg>;
}
export function IconSpark({ active }: IP) {
  return <svg {...sv}><path d="M12 3l2.4 6.1L21 12l-6.6 2.9L12 21l-2.4-6.1L3 12l6.6-2.9z" fill={active ? "currentColor" : "none"} /></svg>;
}
export function IconUser({ active }: IP) {
  return <svg {...sv}><circle cx="12" cy="8" r="4" fill={active ? "currentColor" : "none"} /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></svg>;
}
export function IconCamera({ active }: IP) {
  return <svg {...sv}><path d="M3 8h4l2-3h6l2 3h4v11H3z" fill={active ? "currentColor" : "none"} /><circle cx="12" cy="13" r="3.5" stroke={active ? "#000" : "currentColor"} /></svg>;
}
export function IconShield({ active }: IP) {
  return <svg {...sv}><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" fill={active ? "currentColor" : "none"} /></svg>;
}
export function IconGear({ active }: IP) {
  return <svg {...sv}><circle cx="12" cy="12" r="3" fill={active ? "currentColor" : "none"} /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>;
}
