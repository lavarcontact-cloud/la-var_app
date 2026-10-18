import { PageHeader } from "./chrome";

export function Missing({ label }: { label: string }) {
  return <span className="placeholder">[à compléter : {label}]</span>;
}

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <PageHeader title={title} />
      <div className="prose-lv mx-auto max-w-3xl px-4 py-6">
        <p role="note" className="rounded-md border-2 border-[var(--color-warn)] p-3 text-sm !text-[var(--color-warn)]">
          Document de travail, à faire valider par un professionnel du droit avant l'ouverture publique.
        </p>
        {children}
      </div>
    </div>
  );
}
