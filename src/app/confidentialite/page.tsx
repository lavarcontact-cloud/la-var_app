import type { Metadata } from "next";
import { LegalPage, Missing } from "@/components/legal";

export const metadata: Metadata = { title: "Confidentialité" };

export default function Page() {
  return (
    <LegalPage title="Confidentialité">
      <h2>Responsable</h2>
      <p>Sébastien Fula-Pitu, éditeur de LA VAR. Contact : <Missing label="e-mail dédié aux données personnelles" />.</p>
      <h2>Ce que nous traitons</h2>
      <ul>
        <li><b>Compte</b> (e-mail, pseudo, mot de passe chiffré par notre prestataire, photo et bio facultatives) : pour faire fonctionner le service. Conservé tant que le compte existe.</li>
        <li><b>Publications, commentaires, j'aime, abonnements</b> : publics par nature (sauf les enregistrements, privés). Supprimés avec le compte.</li>
        <li><b>Signalements et décisions de modération</b> : obligation légale de modération. Conservés <Missing label="durée" />.</li>
        <li><b>Demandes de devis</b> (nom, e-mail, téléphone facultatif, message) : pour y répondre. Conservées 3 ans au plus sans suite.</li>
        <li><b>Sécurité</b> : empreinte non réversible de l'adresse IP pour limiter le spam, conservée 24 heures.</li>
      </ul>
      <p>Aucune publicité, aucun traceur de mesure d'audience, aucune revente de données.</p>
      <h2>Prestataires</h2>
      <p>Vercel (hébergement du site, États-Unis), Supabase (base de données, comptes et fichiers, <Missing label="région" />). Transferts encadrés par le cadre UE / États-Unis ou des clauses contractuelles types <Missing label="à vérifier pour chaque prestataire" />.</p>
      <h2>Vos droits</h2>
      <p>Accès, rectification, suppression, portabilité, opposition : <Missing label="e-mail" />. Réclamation possible auprès de la CNIL (cnil.fr).</p>
      <h2>Cookies</h2>
      <p>Uniquement les cookies nécessaires à la connexion (session). Aucun cookie de mesure d'audience ou publicitaire.</p>
    </LegalPage>
  );
}
