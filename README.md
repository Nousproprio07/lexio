# Lexio

**Un mot de plus, chaque jour.** Lexio est votre dictionnaire personnel. Vous notez un mot et sa définition, et l'application en fait automatiquement des quiz à répétition espacée.

- React 19 + TypeScript, Vite, Tailwind CSS 4, Lucide
- **Aucune base de données ni compte** : tout est stocké sur l'appareil (IndexedDB)
- Aucune IA, aucun service tiers

En ligne : https://nousproprio07.github.io/lexio/

---

## 1. Démarrage

```bash
npm install
npm run dev        # http://localhost:5173
```

| Commande | Rôle |
| --- | --- |
| `npm run dev` | serveur de développement |
| `npm run build` | vérification des types puis build de production dans `dist/` |
| `npm test` | tests unitaires : moteur de quiz, score, répétition espacée, import/export |
| `npm run build && npm run e2e` | parcours utilisateur complets dans Chromium, sur mobile et desktop. Les captures sont écrites dans `test-results/` |
| `npm run deploy:pages` | build pour le sous-chemin `/lexio/` et publication sur la branche `gh-pages` (GitHub Pages) |
| `npm run icons` | régénère les icônes PNG à partir de `public/icon.svg` |

Pour `e2e` et `icons`, Playwright a besoin d'un Chromium : lancez `npx playwright install chromium`, ou indiquez un exécutable existant avec `CHROMIUM_PATH=…`.

---

## 2. Où sont mes mots ?

Tout reste **dans le navigateur de l'appareil**, dans IndexedDB : aucun serveur, aucun compte. Les données survivent aux rechargements, à la fermeture du navigateur et aux redéploiements du site. En revanche :

- **Pas de synchronisation** : les mots saisis sur le téléphone ne sont pas sur l'ordinateur, et inversement. Pour transférer, exportez en JSON puis importez sur l'autre appareil.
- **iPhone** : ajoutez Lexio à l'écran d'accueil (Safari → *Partager* → **Sur l'écran d'accueil**). Sans cela, Safari peut effacer les données d'un site non visité pendant 7 jours.
- **Effacer les données de navigation** (historique, cookies et données de sites) efface aussi le dictionnaire.
- **Navigation privée** : le stockage peut y être refusé. Un bandeau l'indique alors.

Le filet de sécurité est la **sauvegarde JSON** (*Réglages et données* → *Sauvegarde complète*). Elle contient les mots, les catégories et la progression, et se réimporte telle quelle. Lexio affiche la date de la dernière sauvegarde. À partir de 10 mots, l'accueil propose d'en faire une tous les 30 jours.

L'application demande aussi au navigateur un stockage « persistant » (`navigator.storage.persist()`), qui n'est pas effacé en cas de manque d'espace. Si plusieurs onglets de Lexio sont ouverts, ils restent synchronisés entre eux.

---

## 3. Déployer

C'est un site statique : le build produit `dist/`.

- **GitHub Pages** (actuel) : lancez `npm run deploy:pages`. Le site est construit avec `BASE_PATH=/lexio/`, `index.html` est copié en `404.html` pour que les adresses directes fonctionnent, puis le tout est publié sur la branche `gh-pages`.
- **Vercel / Cloudflare Pages** : importez le dépôt, avec `npm run build` comme commande et `dist` comme dossier de sortie. Les fichiers `vercel.json` et `public/_redirects` gèrent les routes.

⚠️ Les données étant liées à l'adresse du site, **changer d'hébergeur ou d'adresse repart d'un dictionnaire vide**. Exportez d'abord, puis réimportez sur la nouvelle adresse.

---

## 4. Fonctionnement

### Répétition espacée (`src/lib/srs.ts`)
C'est une variante déterministe et simplifiée de SM-2, avec des réponses binaires :

- **Nouveau mot** : il est à réviser immédiatement.
- **Réussite à l'échéance** : l'intervalle passe à 1 j, puis 3 j, puis 7 j, puis à *intervalle × facilité*. La facilité part de 2,5 et gagne 0,05 à chaque réussite, avec un maximum de 3,0.
- **Réussite anticipée** (mot pas encore dû) : elle compte comme réussite, mais n'allonge pas l'intervalle.
- **Erreur** : l'intervalle retombe à 0, la facilité perd 0,2 (minimum 1,3) et le mot redevient dû 10 minutes plus tard.
- **Plafond de 120 jours** : un mot maîtrisé revient au moins tous les 4 mois.
- **Statuts** : *Nouveau*, *À renforcer* (dernière réponse fausse), *Maîtrisé* (au moins 4 réussites consécutives et un intervalle d'au moins 14 jours), *En apprentissage* dans les autres cas.

### Sélection des questions (`src/lib/quiz.ts`)
- **Révision intelligente** : seulement les mots dus aujourd'hui. Viennent d'abord les mots à renforcer, puis ceux en apprentissage (les plus en retard en premier), puis au plus 10 nouveaux mots, puis les mots maîtrisés dus.
- **Session classique** : les mots non maîtrisés passent en premier. Les mots maîtrisés ne servent qu'à compléter la session. Aucun mot n'est répété dans une même session.
- **Mode B** : les trois leurres viennent de votre dictionnaire. Lexio privilégie la même catégorie et une longueur proche. Il exclut les définitions identiques et les homonymes : il ne peut donc jamais y avoir deux bonnes réponses. Avec moins de 4 définitions distinctes, la question devient un exercice de rappel, avec les boutons « Je savais » et « À revoir ».
- **Mode A** : la réponse est acceptée malgré la casse, les espaces superflus, les apostrophes ou tirets typographiques, la ponctuation finale et les ligatures œ/æ. Les accents ne sont tolérés que si le réglage est activé.
- **Score** : il est calculé uniquement sur les réponses réellement évaluées. Une session interrompue se reprend là où elle s'était arrêtée.

### Import / export
- **JSON** : sauvegarde complète, avec la progression.
- **CSV** : colonnes `mot, definition, categorie, exemple`, séparateur `,` ou `;`. Le fichier s'ouvre dans Excel.
- **Import** : chaque ligne est validée, et les doublons (même mot dans la même catégorie) sont ignorés. Un aperçu est affiché avant de confirmer.

---

## 5. Compatibilité
Safari iOS / macOS 15.4 et plus, Chrome, Firefox et Edge récents. L'application respecte la préférence « réduire les animations », se navigue entièrement au clavier et garde des contrastes AA.

**Raccourcis du quiz** : `Entrée` pour valider ou passer à la question suivante. `1` à `4` (ou `A` à `D`) pour choisir une définition. `1` / `2` pour « Je savais » / « À revoir ». `Ctrl/⌘ + Entrée` enregistre un mot depuis le champ définition.

## 6. Structure

```
src/
  lib/         logique pure et testée : srs, quiz, normalize, transfer, types
  data/        stockage local (IndexedDB) et interface du dépôt
  state/       contextes React : données, session de quiz, notifications, réglages
  components/  mise en page, dialogues de mot, composants d'interface
  pages/       Accueil, Dictionnaire, Quiz (réglages, session, résultats), Progression, Réglages
tests/         tests unitaires et parcours e2e
```
