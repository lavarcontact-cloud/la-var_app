import crypto from "node:crypto";
import { XMLParser } from "fast-xml-parser";

/**
 * Import des titres d'autres médias depuis leurs flux publics (RSS 2.0 ou
 * Atom). On ne garde que : titre, lien, court résumé texte, date. Jamais le
 * contenu complet ni les images (droits d'auteur).
 */

export type ParsedItem = { title: string; url: string; summary: string | null; published_at: string | null; dedupe_key: string };

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_ITEMS = 40;

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", textNodeName: "#text", processEntities: true, htmlEntities: true });

const text = (v: unknown): string => {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (typeof v === "object" && "#text" in (v as Record<string, unknown>)) return String((v as Record<string, unknown>)["#text"]);
  return "";
};

export function stripHtml(s: string): string {
  return s
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** URL canonique pour la déduplication : sans fragment ni paramètres de suivi. */
export function canonicalUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    u.hash = "";
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid|mc_)/i.test(k)) u.searchParams.delete(k);
    u.hostname = u.hostname.replace(/^www\./, "");
    return u.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function parseDate(v: string, now: number): string | null {
  if (!v) return null;
  const t = Date.parse(v);
  if (Number.isNaN(t)) return null;
  if (t > now + 86400_000) return null; // date dans le futur : ignorée
  return new Date(t).toISOString();
}

export function parseFeed(xml: string, now = Date.now()): ParsedItem[] {
  const doc = parser.parse(xml);
  const rssItems = doc?.rss?.channel?.item;
  const atomEntries = doc?.feed?.entry;
  const raw = rssItems ?? atomEntries ?? [];
  const list = (Array.isArray(raw) ? raw : [raw]).slice(0, MAX_ITEMS);
  const out: ParsedItem[] = [];
  for (const it of list) {
    const title = stripHtml(text(it.title)).slice(0, 300);
    let link = text(it.link);
    if (!link && it.link) {
      const links = Array.isArray(it.link) ? it.link : [it.link];
      const alt = links.find((l: Record<string, string>) => !l["@_rel"] || l["@_rel"] === "alternate") ?? links[0];
      link = alt?.["@_href"] ?? "";
    }
    if (!link && typeof it.guid === "string" && /^https?:/.test(it.guid)) link = it.guid;
    const url = canonicalUrl(link);
    if (!url || title.length < 3) continue;
    const summaryRaw = stripHtml(text(it.description) || text(it.summary) || text(it["content:encoded"]) || "");
    const summary = summaryRaw ? (summaryRaw.length > 280 ? summaryRaw.slice(0, 277).trimEnd() + "…" : summaryRaw) : null;
    const published_at = parseDate(text(it.pubDate) || text(it.published) || text(it.updated) || text(it["dc:date"]), now);
    out.push({ title, url, summary, published_at, dedupe_key: crypto.createHash("sha256").update(url).digest("hex") });
  }
  return out;
}

/** Refuse les adresses internes (protection SSRF) : seul HTTPS public est lu. */
export function isAllowedFeedUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    const h = u.hostname.toLowerCase();
    if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return false;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
      const [a, b] = h.split(".").map(Number);
      if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) return false;
    }
    if (h.includes(":") || h.startsWith("[")) return false; // IPv6 littérale
    return true;
  } catch {
    return false;
  }
}

export async function fetchFeedText(url: string, timeoutMs = 10_000): Promise<string> {
  if (!isAllowedFeedUrl(url)) throw new Error("adresse non autorisée");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal, redirect: "follow", headers: { "user-agent": "LA-VAR-ingest/1.0 (+titres et liens uniquement)", accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    if (!isAllowedFeedUrl(r.url)) throw new Error("redirection non autorisée");
    const len = Number(r.headers.get("content-length") ?? 0);
    if (len > MAX_BYTES) throw new Error("flux trop volumineux");
    const buf = await r.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) throw new Error("flux trop volumineux");
    return new TextDecoder().decode(buf);
  } finally {
    clearTimeout(t);
  }
}
