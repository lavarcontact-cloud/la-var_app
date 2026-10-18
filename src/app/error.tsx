"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto flex min-h-[80svh] max-w-sm flex-col items-center justify-center px-6 text-center">
      <p className="t-display text-4xl">Ça a coupé.</p>
      <p className="mt-2 text-[var(--color-muted)]">Une erreur est survenue. Réessayez.</p>
      <button type="button" onClick={reset} className="btn btn-red mt-6">Réessayer</button>
    </div>
  );
}
