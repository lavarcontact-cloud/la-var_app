import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "./auth-form";

export const metadata: Metadata = { title: "Connexion" };

export default function Page() {
  return (
    <Suspense>
      <AuthForm />
    </Suspense>
  );
}
