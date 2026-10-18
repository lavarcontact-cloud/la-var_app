-- Données de référence : les 4 prestations demandées. Les tarifs restent
-- NULL tant que Sébastien ne les a pas renseignés (affichage "Sur devis").
insert into public.services (slug, title, description, deliverables, position) values
  ('formats-reseaux', 'Formats réseaux sociaux', 'Contenus courts pensés pour Instagram, TikTok et YouTube Shorts : teasers, extraits, annonces de sortie.', array['Captation', 'Montage vertical 9:16', 'Déclinaisons de formats'], 10),
  ('plan-sequence', 'Plan-séquence', 'Une prise continue, préparée et chorégraphiée : performance, freestyle, visite ou annonce.', array['Repérage', 'Mise en place', 'Tournage en une prise', 'Étalonnage'], 20),
  ('photographie', 'Photographie', 'Portraits, photos presse, photos de plateau et visuels de sortie.', array['Shooting', 'Sélection et retouche', 'Fichiers HD et formats réseaux'], 30),
  ('clip', 'Réalisation de clip', 'Du synopsis à la livraison : écriture, préparation, tournage, montage, étalonnage.', array['Synopsis et moodboard', 'Préparation et tournage', 'Montage et étalonnage', 'Déclinaisons réseaux'], 40)
on conflict (slug) do nothing;
