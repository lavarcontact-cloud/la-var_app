import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[80svh] max-w-sm flex-col items-center justify-center px-6 text-center">
      <p className="t-display text-6xl text-[var(--color-red)]">404</p>
      <p className="t-display mt-2 text-3xl">Rien à voir ici.</p>
      <Link href="/" className="btn btn-red mt-6">Retour au fil</Link>
    </div>
  );
}
