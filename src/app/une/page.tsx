"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/chrome";
import { ExternalRow, NewsRow, Section } from "@/components/news-list";
import { fetchExternal, fetchFeed } from "@/lib/posts";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { ExternalItem, FeedPost } from "@/lib/types";

type Data = { featured: FeedPost[]; actu: FeedPost[]; sorties: FeedPost[]; tendances: FeedPost[]; external: ExternalItem[] };

export default function UnePage() {
  const sb = supabaseBrowser();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!sb) return;
    Promise.all([
      fetchFeed(sb, { featured: true, limit: 5 }),
      fetchFeed(sb, { category: "actu", limit: 8 }),
      fetchFeed(sb, { category: "sortie", limit: 6 }),
      fetchFeed(sb, { category: "tendance", limit: 6 }),
      fetchExternal(sb, 15),
    ])
      .then(([featured, actu, sorties, tendances, external]) => setData({ featured, actu, sorties, tendances, external }))
      .catch(() => setError("Impossible de charger les actualités."));
  }, [sb]);

  return (
    <div>
      <PageHeader title="À la une" />
      <div className="mx-auto max-w-5xl px-4 pb-10">
        {!sb && <p className="py-10 text-center text-[var(--color-muted)]">Base de données non configurée sur cette version d'aperçu.</p>}
        {error && <p role="alert" className="py-10 text-center">{error}</p>}
        {sb && !data && !error && <div className="mt-6 space-y-3">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-28 rounded" />)}</div>}
        {data && (
          <div className="lg:grid lg:grid-cols-[1fr_320px] lg:gap-10">
            <div>
              <Section title="La sélection" count={data.featured.length} empty="La rédaction n'a encore rien mis à la une.">
                {data.featured.map((p, i) => <NewsRow key={p.id} post={p} big={i === 0} />)}
              </Section>
              <Section title="Dernières actus" count={data.actu.length} empty="Pas encore d'actu publiée." action={<Link href="/publier" className="text-sm underline">Publier</Link>}>
                {data.actu.map((p) => <NewsRow key={p.id} post={p} />)}
              </Section>
              <Section title="Sorties" count={data.sorties.length} empty="Aucune sortie partagée pour l'instant.">
                {data.sorties.map((p) => <NewsRow key={p.id} post={p} />)}
              </Section>
              <Section title="Tendances" count={data.tendances.length} empty="Aucune tendance pour l'instant.">
                {data.tendances.map((p) => <NewsRow key={p.id} post={p} />)}
              </Section>
            </div>
            <aside>
              <Section title="Ailleurs dans le rap" count={data.external.length} empty="Aucune source externe n'est encore branchée. La rédaction peut en ajouter depuis l'espace admin.">
                <div className="space-y-2">{data.external.map((x) => <ExternalRow key={x.id} item={x} />)}</div>
              </Section>
              <p className="mt-3 text-xs text-[var(--color-muted)]">Titres et liens publiés par d'autres médias, récupérés automatiquement depuis leurs flux publics. Le contenu reste sur leur site.</p>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
