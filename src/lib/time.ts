const TZ = "Europe/Paris";

/** "18 oct. 2026 à 21:14" (heure de Paris), toujours affichée quelque part. */
export function absoluteDate(iso: string | null | undefined): string {
  if (!iso) return "date inconnue";
  const d = new Date(iso);
  const date = d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: TZ });
  const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
  return `${date} à ${time}`;
}

/** "il y a 5 min", "il y a 3 h", puis la date absolue au-delà de 7 jours. */
export function relativeDate(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "date inconnue";
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  if (s < 7 * 86400) return `il y a ${Math.floor(s / 86400)} j`;
  return absoluteDate(iso);
}
