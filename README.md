# Slash Docs

Une extension Chrome légère qui ajoute une palette de commandes `/` à Google Docs.

## Installer la version de développement

1. Ouvrir `chrome://extensions`.
2. Activer **Mode développeur**.
3. Cliquer sur **Charger l’extension non empaquetée**.
4. Sélectionner ce dossier.
5. Recharger un document Google Docs déjà ouvert.

Dans le document, tape `/`, recherche une commande, puis valide avec `Entrée`.

## Commandes disponibles

- Texte normal, titre et sous-titre
- Titres 1 à 3
- Checklist, liste à puces et liste numérotée
- Tableau, image et lien
- Ligne horizontale et saut de page
- Gras, italique et souligné
- Effacer la mise en forme

La navigation fonctionne avec `↑`, `↓`, `Entrée`, `Tab`, `Retour arrière` et `Échap`.

## Développement

L’extension n’a ni dépendance ni étape de compilation.

```bash
npm test
npm run check
```

La couche spécifique à l’interface de Google Docs est isolée dans `src/docs-adapter.js`. Si Google renomme un bouton ou un sélecteur, les ajustements restent localisés dans ce fichier.

Les commandes **Tableau** et **Image** ouvrent le sélecteur natif de Google Docs afin de choisir respectivement les dimensions ou la source.

## Vie privée

Slash Docs fonctionne localement. Aucun texte du document n’est lu, enregistré ou envoyé à un serveur. La seule préférence synchronisée par Chrome est l’état activé/désactivé de l’extension.
