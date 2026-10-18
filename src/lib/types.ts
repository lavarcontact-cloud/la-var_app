export type Role = "member" | "artist" | "editor" | "moderator" | "admin";
export type PostKind = "video" | "photo" | "carousel" | "article" | "link";
export type Category = "actu" | "sortie" | "clip" | "annonce" | "tendance" | "decouverte" | "coulisses" | "interview" | "evenement";
export type Scope = "fr" | "international" | "local";
export type InfoStatus = "officiel" | "confirme" | "a_verifier" | "rumeur";

export type MediaItem = { path: string; type: "image" | "video"; width?: number; height?: number; poster?: string };

export type FeedPost = {
  id: string;
  kind: PostKind;
  category: Category;
  scope: Scope;
  title: string;
  body: string | null;
  media: MediaItem[];
  source_name: string | null;
  source_url: string | null;
  info_status: InfoStatus;
  is_editorial: boolean;
  is_featured: boolean;
  is_sample: boolean;
  correction_note: string | null;
  like_count: number;
  comment_count: number;
  save_count: number;
  created_at: string;
  updated_at: string;
  author_id: string;
  author_handle: string;
  author_name: string;
  author_avatar: string | null;
  author_role: Role;
  author_verified: boolean;
  liked: boolean;
  saved: boolean;
  /** Présent sur la page de détail (lecture directe de la table). */
  status?: "published" | "hidden" | "removed";
};

export type ExternalItem = {
  id: string;
  title: string;
  url: string;
  summary: string | null;
  published_at: string | null;
  fetched_at: string;
  category: Category;
  scope: Scope;
  source: { name: string; homepage: string | null } | null;
};

export type Profile = {
  id: string;
  handle: string;
  display_name: string;
  bio: string | null;
  avatar_path: string | null;
  role: Role;
  is_verified: boolean;
  banned_until: string | null;
  created_at: string;
};

export const CATEGORIES: { value: Category; label: string }[] = [
  { value: "actu", label: "Actu" },
  { value: "sortie", label: "Sorties" },
  { value: "clip", label: "Clips" },
  { value: "annonce", label: "Annonces" },
  { value: "tendance", label: "Tendances" },
  { value: "decouverte", label: "Découvertes" },
  { value: "coulisses", label: "Coulisses" },
  { value: "interview", label: "Interviews" },
  { value: "evenement", label: "Événements" },
];
export const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label])) as Record<Category, string>;

export const SCOPES: { value: Scope; label: string }[] = [
  { value: "fr", label: "France" },
  { value: "international", label: "International" },
  { value: "local", label: "Local" },
];

/** Statut de l'information : affiché sur chaque publication. */
export const INFO_STATUS: Record<InfoStatus, { label: string; tone: "solid" | "outline" | "warn" | "muted"; hint: string }> = {
  officiel: { label: "Officiel", tone: "solid", hint: "Annoncé par l'artiste ou son équipe (compte vérifié)." },
  confirme: { label: "Confirmé", tone: "solid", hint: "Vérifié par la rédaction LA VAR." },
  a_verifier: { label: "À vérifier", tone: "outline", hint: "Publié par un membre, pas encore vérifié par la rédaction." },
  rumeur: { label: "Rumeur", tone: "warn", hint: "Information non confirmée, à prendre avec prudence." },
};

export const ROLE_LABEL: Record<Role, string> = {
  member: "Membre",
  artist: "Artiste",
  editor: "Rédaction",
  moderator: "Modération",
  admin: "Admin",
};
