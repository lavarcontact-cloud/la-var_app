import type { Metadata } from "next";
import { LegalPage, Missing } from "@/components/legal";

export const metadata: Metadata = { title: "Mentions légales" };

export default function Page() {
  return (
    <LegalPage title="Mentions légales">
      <h2>Éditeur</h2>
      <p>LA VAR, édité par Sébastien Fula-Pitu, <Missing label="statut, SIRET, adresse, téléphone" />.</p>
      <p>Directeur de la publication : Sébastien Fula-Pitu.</p>
      <h2>Hébergement</h2>
      <p>Site : Vercel Inc. <Missing label="adresse et téléphone de l'hébergeur, vérifiés à la mise en ligne" />. Données et fichiers : Supabase <Missing label="entité, adresse, région de stockage" />.</p>
      <h2>Contenus publiés par les membres</h2>
      <p>LA VAR héberge des contenus publiés par ses membres, qui en sont responsables. Tout contenu manifestement illicite peut être signalé (bouton "Signaler" ou <Missing label="e-mail de signalement" />) et sera retiré promptement s'il est avéré.</p>
    </LegalPage>
  );
}
