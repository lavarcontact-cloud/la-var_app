import { describe, expect, it } from "vitest";
import { canonicalUrl, isAllowedFeedUrl, parseFeed, stripHtml } from "@/lib/ingest";

const NOW = Date.parse("2026-10-18T12:00:00Z");

const rss = `<?xml version="1.0"?><rss version="2.0"><channel><title>Média</title>
<item><title>Nouvel album annoncé</title><link>https://www.media.example/article-1?utm_source=rss#top</link>
<description><![CDATA[<p>Un <b>album</b> arrive.</p><script>alert(1)</script>]]></description><pubDate>Fri, 17 Oct 2026 18:30:00 +0200</pubDate></item>
<item><title>Lien piégé</title><link>javascript:alert(1)</link></item>
<item><title>Date du futur</title><link>https://media.example/futur</link><pubDate>Sat, 01 Jan 2028 00:00:00 GMT</pubDate></item>
<item><title>X</title><link>https://media.example/court</link></item>
</channel></rss>`;

const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Atom</title>
<entry><title type="html">Clip &amp; coulisses</title><link rel="alternate" href="https://atom.example/clip"/><updated>2026-10-16T08:00:00Z</updated><summary>${"a".repeat(400)}</summary></entry>
</feed>`;

describe("import des actualités externes", () => {
  it("lit un flux RSS : titre, lien canonique, résumé texte, date", () => {
    const items = parseFeed(rss, NOW);
    const first = items.find((i) => i.title === "Nouvel album annoncé")!;
    expect(first.url).toBe("https://media.example/article-1");
    expect(first.summary).toBe("Un album arrive.");
    expect(first.published_at).toBe("2026-10-17T16:30:00.000Z");
    expect(first.dedupe_key).toMatch(/^[0-9a-f]{64}$/);
  });
  it("écarte les liens non http(s) et les titres trop courts, ignore les dates futures", () => {
    const items = parseFeed(rss, NOW);
    expect(items.map((i) => i.title)).not.toContain("Lien piégé");
    expect(items.map((i) => i.title)).not.toContain("X");
    expect(items.find((i) => i.title === "Date du futur")?.published_at).toBeNull();
  });
  it("lit un flux Atom et tronque le résumé à 280 caractères", () => {
    const [e] = parseFeed(atom, NOW);
    expect(e.title).toBe("Clip & coulisses");
    expect(e.url).toBe("https://atom.example/clip");
    expect(e.summary!.length).toBeLessThanOrEqual(280);
  });
  it("même article, mêmes paramètres de suivi en moins : même clé de déduplication", () => {
    const a = parseFeed(rss, NOW)[0].dedupe_key;
    const b = parseFeed(rss.replace("?utm_source=rss#top", ""), NOW)[0].dedupe_key;
    expect(a).toBe(b);
  });
  it("refuse les adresses internes et non HTTPS (protection SSRF)", () => {
    expect(isAllowedFeedUrl("https://media.example/feed")).toBe(true);
    for (const u of ["http://media.example/feed", "https://localhost/feed", "https://127.0.0.1/feed", "https://10.0.0.5/x", "https://192.168.1.1/x", "https://169.254.169.254/latest", "https://[::1]/x", "https://db.internal/x"]) {
      expect(isAllowedFeedUrl(u), u).toBe(false);
    }
  });
  it("nettoie le HTML et les URL", () => {
    expect(stripHtml("<p>a&nbsp;<b>b</b></p><style>x{}</style>")).toBe("a b");
    expect(canonicalUrl("ftp://x.example")).toBeNull();
  });
});
