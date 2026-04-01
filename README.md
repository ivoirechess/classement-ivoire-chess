# Ivoire Chess Club - Classement Live (Supabase)

Frontend statique (GitHub Pages) + base partagée Supabase pour un classement multi-utilisateurs.

## Fichiers

- `index.html` : UI publique + panneau admin.
- `styles.css` : styles.
- `supabaseClient.js` : client Supabase (URL + anon key).
- `app.js` : logique métier (lecture/écriture/realtime).
- `supabase/schema.sql` : tables, RLS et policies.
- `supabase/seed_players.sql` : import initial des joueurs historiques.

## Démarrage local

```bash
python3 -m http.server 8080
```

Puis ouvrir `http://localhost:8080`.

## Configuration rapide

1. Exécuter `supabase/schema.sql` dans l'éditeur SQL de Supabase.
2. Exécuter `supabase/seed_players.sql` pour importer les joueurs existants (requête compatible avec `players(username_chesscom, display_name, club, is_active)`).
3. Créer un utilisateur admin dans Supabase Auth (email/password).
4. Ajouter cet utilisateur dans `app_admins` avec son UUID.
5. Remplir `SUPABASE_URL` et `SUPABASE_ANON_KEY` dans `supabaseClient.js`.
6. Activer Realtime pour `players`, `app_settings`, `club_matches` et `club_tournaments` dans Supabase (Database > Replication).

## Nouvelles tables et réglages

- `club_matches` : annonces 1v1 (joueur 1, joueur 2, date/heure, format, statut, résultat).
- `club_tournaments` : annonces de tournois (titre, date, format, lieu, description, lien, statut).
- `app_settings` inclut aussi :
  - `ref_date_mode` (`auto` ou `manual`)
  - `ref_date_start` (YYYY-MM-DD)
  - `ref_date_end` (YYYY-MM-DD)

> Vérifiez aussi dans Supabase Dashboard → Database → Replication que `club_matches` et `club_tournaments` sont bien incluses dans la publication Realtime.

## Déploiement GitHub Pages

1. Pousser les fichiers sur la branche `main` (ou branche Pages).
2. GitHub > Settings > Pages > Source: Deploy from branch.
3. Vérifier que `supabaseClient.js` contient les valeurs de production.
4. Ouvrir l'URL Pages et tester login admin + ajout joueur.
