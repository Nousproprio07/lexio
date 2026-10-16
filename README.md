# Lexio

**Un mot de plus, chaque jour.** Lexio est votre dictionnaire personnel. Vous notez un mot et sa définition, et l'application en fait automatiquement des quiz à répétition espacée.

- React 19 + TypeScript, Vite, Tailwind CSS 4, Lucide
- Supabase : Postgres, authentification et Row Level Security
- Aucune IA, aucun service tiers en dehors de Supabase

---

## 1. Démarrage rapide

```bash
npm install
cp .env.example .env.local   # puis renseignez les deux valeurs (voir §2)
npm run dev                  # http://localhost:5173
```

Sans configuration Supabase, l'application affiche un écran « Base de données non configurée » avec un bouton **Essayer en mode démonstration**.

| Commande | Rôle |
| --- | --- |
| `npm run dev` | serveur de développement |
| `npm run build` | vérification des types puis build de production dans `dist/` |
| `npm test` | tests unitaires (moteur de quiz, score, répétition espacée, import/export) et tests du schéma SQL et des règles RLS dans un vrai Postgres (PGlite) |
| `npm run build && npm run e2e` | parcours utilisateur complets dans Chromium, sur mobile et desktop, en mode démonstration. Les captures sont écrites dans `test-results/` |
| `npm run icons` | régénère les icônes PNG à partir de `public/icon.svg` |

Pour `e2e` et `icons`, Playwright a besoin d'un Chromium : lancez `npx playwright install chromium`, ou indiquez un exécutable existant avec `CHROMIUM_PATH=…`.

---

## 2. Configurer Supabase (environ 10 minutes)

### Ce que vous devez me fournir, ou renseigner vous-même

| Variable | Où la trouver | Exemple de forme |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Supabase → *Project Settings* → *API* → **Project URL** | `https://abcdefghijkl.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | même page, clé **anon / publishable** | `eyJhbGci…` ou `sb_publishable_…` |

> ⚠️ N'utilisez **jamais** la clé `service_role` / `secret`. Seule la clé publique est envoyée au navigateur. C'est sans risque, car toutes les tables sont protégées par RLS : chaque requête ne voit que les lignes de l'utilisateur connecté.

### Étapes

1. Créez un projet sur [supabase.com](https://supabase.com). Choisissez une région UE (par exemple Paris) si vous le souhaitez.
2. **Créez le schéma** : *SQL Editor* → *New query* → collez le contenu de `supabase/migrations/20261016000000_init.sql` → *Run*.
   Avec la CLI, vous pouvez à la place lancer `supabase link --project-ref <ref>`, puis `supabase db push`.
3. **Authentification** : *Authentication* → *Sign In / Providers* → vérifiez que **Email** est activé.
   - *Authentication* → *URL Configuration* → **Site URL** : l'URL de production (par exemple `https://lexio.vercel.app`). Ajoutez aussi `http://localhost:5173` dans *Redirect URLs*. Ces adresses servent aux e-mails de confirmation et de réinitialisation.
4. Renseignez les deux variables dans `.env.local`, relancez `npm run dev`, puis cliquez sur **Créer un compte**.
5. **Recommandé pour un usage strictement personnel** : une fois votre compte créé, désactivez les inscriptions (*Authentication* → *Sign In / Providers* → décochez **Allow new users to sign up**). Plus personne d'autre ne pourra créer de compte.

### Schéma

| Table | Contenu |
| --- | --- |
| `categories` | catégories personnelles, nom unique par utilisateur (insensible à la casse) |
| `words` | mot, définition, exemple, catégorie, dates. Pas de doublon exact dans une même catégorie |
| `word_progress` | réussites, erreurs, série, facilité, intervalle, dernière et prochaine révision, statut |
| `quiz_sessions` | mode, nombre de questions, réponses évaluées, bonnes réponses, début et fin |
| `quiz_answers` | chaque réponse donnée, la réponse attendue et le résultat |

Toutes les tables ont un `user_id` rempli automatiquement par `auth.uid()`, et quatre politiques RLS (lecture, ajout, modification, suppression) limitées au propriétaire. Les relations utilisent des clés étrangères composites `(id, user_id)`. Il est donc impossible, même avec une requête forgée, de rattacher une progression ou une réponse au mot d'un autre compte. Ces garanties sont testées dans `tests/schema.test.ts`.

---

## 3. Déployer

L'application est un site statique (SPA). Le build produit `dist/`.

### Vercel
1. Importez le dépôt Git dans Vercel. Le framework **Vite** est détecté.
2. *Settings* → *Environment Variables* : ajoutez `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`.
3. Déployez. `vercel.json` redirige toutes les routes vers `index.html`.

### Cloudflare Pages
1. *Workers & Pages* → *Create* → *Pages* → connectez le dépôt.
2. Commande de build : `npm run build`. Dossier de sortie : `dist`.
3. Ajoutez les deux variables d'environnement, puis déployez. `public/_redirects` gère les routes.

### GitHub Pages (`https://<compte>.github.io/lexio/`)
1. Placez les deux variables dans `.env.production.local` (fichier ignoré par git).
2. Lancez `npm run deploy:pages` : l'application est construite pour le sous-chemin `/lexio/`, puis publiée sur la branche `gh-pages`.
3. Le dépôt doit être public si le compte GitHub est gratuit.

Après le premier déploiement, reportez l'URL de production dans Supabase (*Site URL*, voir §2.3).

Les données sont stockées dans Supabase. Un redéploiement ou un rechargement ne les touche jamais.

### Sur votre téléphone
Ouvrez l'URL dans Safari → *Partager* → **Sur l'écran d'accueil**. Lexio s'ouvre alors en plein écran, comme une application.

---

## 4. Fonctionnement

### Répétition espacée (`src/lib/srs.ts`)
C'est une variante déterministe et simplifiée de SM-2, avec des réponses binaires :

- **Nouveau mot** : il est à réviser immédiatement.
- **Réussite à l'échéance** : l'intervalle passe à 1 j, puis 3 j, puis 7 j, puis à *intervalle × facilité*. La facilité part de 2,5 et gagne 0,05 à chaque réussite, avec un maximum de 3,0.
- **Réussite anticipée** (mot pas encore dû) : elle compte comme réussite, mais n'allonge pas l'intervalle. On ne « maîtrise » pas un mot en le répétant dix fois le même jour.
- **Erreur** : l'intervalle retombe à 0, la facilité perd 0,2 (minimum 1,3) et le mot redevient dû 10 minutes plus tard.
- **Plafond de 120 jours** : un mot maîtrisé revient au moins tous les 4 mois.
- **Statuts** : *Nouveau* (jamais évalué), *À renforcer* (dernière réponse fausse), *Maîtrisé* (au moins 4 réussites consécutives et un intervalle d'au moins 14 jours), *En apprentissage* dans les autres cas.

### Sélection des questions (`src/lib/quiz.ts`)
- **Révision intelligente** : seulement les mots dus aujourd'hui. Viennent d'abord les mots à renforcer, puis ceux en apprentissage (les plus en retard en premier), puis au plus 10 nouveaux mots, puis les mots maîtrisés dus.
- **Session classique** : les mots non maîtrisés passent en premier. Les mots maîtrisés ne servent qu'à compléter la session, ils ne la monopolisent jamais.
- Aucun mot n'est répété dans une même session.
- **Mode B** : les trois leurres viennent de votre propre dictionnaire. Lexio privilégie la même catégorie et une longueur proche. Il exclut toute définition identique à la bonne réponse, ainsi que les homonymes : il ne peut donc jamais y avoir deux bonnes réponses. Avec moins de 4 définitions distinctes, la question devient un exercice de rappel, avec les boutons « Je savais » et « À revoir ».
- **Mode A** : la réponse est acceptée malgré la casse, les espaces superflus, les apostrophes ou tirets typographiques, la ponctuation finale et les ligatures œ/æ. Les accents ne sont tolérés que si le réglage est activé. Seuls les mots enregistrés avec exactement la même définition sont acceptés comme alternatives.
- **Score** : il est calculé uniquement sur les réponses réellement évaluées.

### Robustesse
- Les réponses de quiz sont affichées immédiatement, puis envoyées via une **file d'attente persistante** (`src/data/outbox.ts`). En cas de coupure réseau, elles sont rejouées automatiquement au retour de la connexion, sans risque de doublon grâce aux identifiants générés côté client.
- La **session en cours** est conservée dans le navigateur. Après un changement de page, un rechargement ou une fermeture, Lexio propose de reprendre ou d'abandonner. Les réponses déjà données restent enregistrées.
- L'**export JSON** contient les mots, les catégories et la progression. On peut le réimporter tel quel, avec validation et dédoublonnage. L'**export CSV** s'ouvre dans Excel ; l'import accepte les séparateurs `,` ou `;`.

### Mode démonstration
Ce bac à sable est stocké dans le navigateur, sous une clé dédiée, et entièrement séparé des données Supabase. Un bandeau le signale en permanence. Il sert à essayer l'application et aux tests e2e. Des mots d'exemple peuvent y être ajoutés depuis *Réglages*, et uniquement en mode démonstration.

---

## 5. Compatibilité
Safari iOS / macOS 15.4 et plus, Chrome, Firefox et Edge récents. L'application utilise `<dialog>`, `:has()`, les unités `dvh` et `structuredClone`. Elle respecte la préférence « réduire les animations », se navigue entièrement au clavier et garde des contrastes AA.

**Raccourcis du quiz** : `Entrée` pour valider ou passer à la question suivante. `1` à `4` (ou `A` à `D`) pour choisir une définition. `1` / `2` pour « Je savais » / « À revoir ». `Ctrl/⌘ + Entrée` enregistre un mot depuis le champ définition.

## 6. Structure

```
src/
  lib/         logique pure et testée : srs, quiz, normalize, transfer, types
  data/        dépôts Supabase et démo, file d'attente hors ligne
  state/       contextes React : auth, données, session de quiz, notifications, réglages
  components/  mise en page, dialogues de mot, composants d'interface
  pages/       Accueil, Dictionnaire, Quiz (réglages, session, résultats), Progression, Réglages, Connexion
supabase/migrations/   schéma SQL et RLS
tests/                 tests unitaires, tests du schéma, parcours e2e
```
