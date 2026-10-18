import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, Missing } from "@/components/legal";

export const metadata: Metadata = { title: "Conditions d'utilisation" };

export default function Page() {
  return (
    <LegalPage title="Conditions">
      <h2>Le service</h2>
      <p>LA VAR permet de lire l'actualité du rap, de publier des contenus, de commenter et de suivre des comptes. L'inscription est gratuite et réservée aux personnes de 15 ans ou plus.</p>
      <h2>Vos contenus</h2>
      <p>Vous restez propriétaire de ce que vous publiez. Vous garantissez avoir les droits nécessaires (images, musique, personnes filmées) et autorisez LA VAR à les afficher sur le service. <Missing label="étendue exacte de la licence accordée" /></p>
      <h2>Règles</h2>
      <p>L'utilisation du service suppose le respect des <Link href="/regles">règles de la communauté</Link>. En cas de manquement, un contenu peut être retiré et un compte suspendu, avec indication du motif.</p>
      <h2>Responsabilité</h2>
      <p><Missing label="clauses de responsabilité, droit applicable, juridiction" /></p>
    </LegalPage>
  );
}
