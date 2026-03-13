# Ivoire Chess Club - Classement Live (Supabase)

Frontend statique (GitHub Pages) + base partagée Supabase pour un classement multi-utilisateurs.

## Fichiers

- `index.html` : UI publique + panneau admin.
- `styles.css` : styles.
- `supabaseClient.js` : client Supabase (URL + anon key).
- `app.js` : logique métier (lecture/écriture/realtime).
- `supabase/schema.sql` : tables, RLS et policies.

## Démarrage local

```bash
python3 -m http.server 8080
```

Puis ouvrir `http://localhost:8080`.

## Configuration rapide

1. Exécuter `supabase/schema.sql` dans l'éditeur SQL de Supabase.
2. Créer un utilisateur admin dans Supabase Auth (email/password).
3. Ajouter cet utilisateur dans `app_admins` avec son UUID.
4. Remplir `SUPABASE_URL` et `SUPABASE_ANON_KEY` dans `supabaseClient.js`.
5. Activer Realtime pour `players` et `app_settings` dans Supabase (Database > Replication).

## Déploiement GitHub Pages

1. Pousser les fichiers sur la branche `main` (ou branche Pages).
2. GitHub > Settings > Pages > Source: Deploy from branch.
3. Vérifier que `supabaseClient.js` contient les valeurs de production.
4. Ouvrir l'URL Pages et tester login admin + ajout joueur.
