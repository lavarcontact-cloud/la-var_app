import type { Metadata } from "next";
import { LegalPage, Missing } from "@/components/legal";

export const metadata: Metadata = { title: "Règles de la communauté" };

export default function Page() {
  return (
    <LegalPage title="Règles">
      <h2>L'esprit</h2>
      <p>LA VAR est un média ouvert : tout le monde peut partager une actu, une sortie ou une découverte, commenter et réagir. On parle de rap, avec passion, sans s'en prendre aux personnes.</p>
      <h2>Ce qui est interdit</h2>
      <ul>
        <li>Haine, discrimination, harcèlement, menaces, appel à la violence.</li>
        <li>Contenus sexuels, contenus impliquant des mineurs.</li>
        <li>Fausses informations présentées comme vraies, usurpation d'identité.</li>
        <li>Publier un clip, un son ou une photo dont vous n'avez pas les droits (fuites, contenus payants, images volées).</li>
        <li>Diffuser des informations privées sur quelqu'un (adresse, téléphone, vie privée).</li>
        <li>Spam, arnaques, liens frauduleux.</li>
      </ul>
      <h2>Infos, rumeurs et sources</h2>
      <p>Chaque publication porte un statut : <b>Officiel</b> (annoncé par l'artiste ou son équipe, compte vérifié), <b>Confirmé</b> (vérifié par la rédaction), <b>À vérifier</b> (publié par un membre) ou <b>Rumeur</b>. Citez vos sources. La rédaction peut requalifier une publication et ajouter une correction visible.</p>
      <h2>Signaler</h2>
      <p>Chaque publication, commentaire et profil a un bouton "Signaler". Les signalements sont examinés par l'équipe de modération. Pour signaler un contenu illicite sans compte : <Missing label="adresse e-mail de signalement" />.</p>
      <h2>Décisions et contestation</h2>
      <p>Quand un contenu est masqué ou retiré, ou qu'un compte est suspendu, le motif est indiqué à la personne concernée dans son profil. Pour contester une décision : <Missing label="adresse e-mail de contestation" />. Une personne différente réexamine la décision.</p>
      <h2>Point de contact</h2>
      <p>Autorités et utilisateurs : <Missing label="point de contact unique (e-mail), langues acceptées : français" />.</p>
    </LegalPage>
  );
}
