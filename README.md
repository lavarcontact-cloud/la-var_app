# LA VAR — application

Média rap FR & international : fil vertical immersif (vidéos 9:16, photos, carrousels, articles courts), **À la une**, **Découvertes**, et l'espace professionnel **Studio** de Sébastien Fula-Pitu (prestations, réalisations, demande de devis).

Tout le monde peut publier, aimer, commenter, enregistrer, suivre et signaler. Les publications de membres sont marquées « À vérifier » par défaut ; seule la rédaction peut les confirmer ou les mettre à la une.

> Ce dépôt est indépendant du portfolio et d'*Avant la sortie*. Ne pas le déployer sur leurs projets Vercel.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 4 · Supabase (Postgres, Auth, Storage, RLS) · Vitest · Playwright + axe.

## Démarrer en local

Prérequis : Node 22+, Docker.

```bash
npm install                      # .npmrc active legacy-peer-deps
# Si le registre public.ecr.aws est inaccessible :
export SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io
npm run db:start                 # Postgres + Auth + Storage + API locaux
npm run db:reset                 # applique supabase/migrations + seed.sql (4 prestations, sans prix)
npx supabase status -o env       # récupérer API_URL, ANON_KEY, SERVICE_ROLE_KEY
cp .env.example .env.local       # puis renseigner les valeurs
npm run db:sample                # facultatif : comptes et publications d'EXEMPLE (local uniquement)
npm run dev -- -p 3400
```

`db:sample` crée `redaction@lavar.local` (admin) et `membre@lavar.local`, mot de passe `motdepasse-local-123`. Leurs publications portent le badge **Exemple** et ne présentent aucune actualité comme réelle. Le script refuse de s'exécuter hors d'une base locale.

## Tests

```bash
npm run lint       # TypeScript strict
npm test           # 32 tests sur la pile Supabase locale : RLS/droits (26) + ingestion RSS (6)
npm run test:e2e   # 24 tests Playwright (mobile Pixel 7 + desktop 1440) : parcours complets + axe
```

Les tests e2e utilisent le serveur sur le port 3400 (ou le démarrent). Si Chromium n'est pas celui de Playwright : `PW_CHROMIUM=/chemin/chrome npm run test:e2e`. Les comptes créés par les tests sont supprimés à la fin.

## Rôles

| Rôle | Peut |
|---|---|
| `member` (défaut) | publier (« À vérifier » / « Rumeur »), commenter, aimer, enregistrer, suivre, signaler |
| `artist` + vérifié | idem + statut « Officiel » sur ses propres publications |
| `moderator` | traiter les signalements : masquer, retirer, rétablir, suspendre, classer |
| `editor` | idem + confirmer une info, mettre à la une, publier au nom de la rédaction |
| `admin` | idem + devis, prix, réalisations, rôles, sources RSS |

Premier administrateur (une seule fois, dans l'éditeur SQL Supabase) :

```sql
update public.profiles set role = 'admin' where handle = 'votre_pseudo';
```

Les rôles suivants se donnent depuis **/admin → Rôles**.

## Sécurité (résumé)

- RLS sur toutes les tables ; fonctions `SECURITY DEFINER` qui revérifient `auth.uid()` et le rôle ; droits `EXECUTE` révoqués puis accordés au cas par cas.
- Un membre ne peut pas s'auto-confirmer, se mettre à la une ni gonfler les compteurs (trigger `posts_guard`).
- Fichiers : bucket `media`, écriture uniquement dans `{uid}/`, types limités (JPEG, PNG, WebP, MP4, WebM, MOV), 50 Mo max.
- Devis : uniquement via `/api/quote` (validation zod, champ piège, limite de 5 par heure sur une empreinte HMAC de l'IP, clé service côté serveur). Le formulaire n'affiche un succès qu'avec l'identifiant renvoyé par la base.
- Modération : motif obligatoire, visible par l'auteur dans son profil ; journal conservé même si le modérateur supprime son compte.
- En-têtes : CSP stricte, `X-Frame-Options: DENY`, `noindex` sur /admin et /moderation ; tout le site reste `noindex` tant que `SITE_INDEXABLE` n'est pas activé.

## Actualités externes (RSS/Atom)

`/admin → Sources` : ajouter un flux public **https**. `/api/ingest` (tâche Vercel quotidienne, protégée par `CRON_SECRET`) récupère seulement le titre, le lien, un résumé de 280 caractères au plus et la date. Elle déduplique par URL canonique (sha256), bloque les adresses internes, et purge les éléments après 90 jours. Le contenu reste sur le site d'origine, présenté comme « Ailleurs dans le rap » avec la source et l'heure. **Aucune source n'est configurée par défaut.**

Déclenchement manuel : `curl -H "Authorization: Bearer $CRON_SECRET" https://…/api/ingest`.

## Déploiement (non effectué)

1. Créer un projet Supabase dédié, puis `npx supabase link` et `npx supabase db push`. Exécuter `supabase/seed.sql`.
2. Supabase Auth : renseigner l'URL du site et les redirections (`/connexion`). Configurer un SMTP pour les e-mails de confirmation (l'envoi intégré est très limité).
3. Créer un **nouveau** projet Vercel pointant sur ce dépôt, avec les variables de `.env.example`. Ce n'est ni le projet du portfolio ni celui d'Avant la sortie.
4. Sur le plan Hobby, la tâche `/api/ingest` tourne une fois par jour (`vercel.json`).

Sans variables Supabase, l'application se construit et affiche des états « non configuré » explicites, sans fausses données.

## À compléter par LA VAR

- Prix des prestations (**/admin → Prix**) : affichés « Sur devis » tant qu'ils ne sont pas renseignés.
- Réalisations du Studio (**/admin → Réalisations**).
- Mentions légales : éditeur, adresse, directeur de publication, hébergeur. Adresses de contact pour les signalements et contestations. Ces champs sont signalés « à compléter » dans les pages légales.
- Sources RSS à suivre.

## Limites connues

- Pas de transcodage vidéo : un `.mov` HEVC d'iPhone peut ne pas se lire sur Chrome ou Android. MP4 H.264 recommandé.
- Pas de notification e-mail à la réception d'un devis : les demandes se consultent dans **/admin → Devis**.
- Ingestion quotidienne seulement sur Vercel Hobby.
