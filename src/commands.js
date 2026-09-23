(function exposeCommands(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SlashDocsCommands = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCommands() {
  "use strict";

  const COMMANDS = [
    { id: "normal", label: "Texte normal", hint: "Revenir au style de paragraphe standard", keywords: "normal paragraph paragraphe texte", icon: "text", group: "Texte" },
    { id: "title", label: "Titre du document", hint: "Ajouter un grand titre principal", keywords: "title grand titre document", icon: "title", group: "Texte" },
    { id: "subtitle", label: "Sous-titre", hint: "Ajouter un sous-titre au document", keywords: "subtitle sous titre", icon: "subtitle", group: "Texte" },
    { id: "heading1", label: "Titre 1", hint: "Créer une grande section", keywords: "h1 heading titre 1", icon: "h1", group: "Texte" },
    { id: "heading2", label: "Titre 2", hint: "Créer une section moyenne", keywords: "h2 heading titre 2", icon: "h2", group: "Texte" },
    { id: "heading3", label: "Titre 3", hint: "Créer une petite section", keywords: "h3 heading titre 3", icon: "h3", group: "Texte" },
    { id: "table", label: "Tableau", hint: "Choisir le nombre de lignes et colonnes", keywords: "table tableau grille cellules", icon: "table", group: "Insertion" },
    { id: "image", label: "Image", hint: "Importer ou choisir une image", keywords: "image photo illustration upload importer", icon: "image", group: "Insertion" },
    { id: "link", label: "Lien", hint: "Ajouter un lien au texte", keywords: "link lien url hyperlien", icon: "link", group: "Insertion" },
    { id: "divider", label: "Ligne horizontale", hint: "Séparer deux parties du document", keywords: "divider séparateur ligne horizontale rule", icon: "divider", group: "Insertion" },
    { id: "pageBreak", label: "Saut de page", hint: "Commencer sur une nouvelle page", keywords: "page break saut page nouvelle", icon: "page-break", group: "Insertion" },
    { id: "checklist", label: "Liste à cocher", hint: "Créer une liste de tâches", keywords: "todo tâches cases checklist checkbox contrôle", icon: "checklist", group: "Listes" },
    { id: "bullets", label: "Liste à puces", hint: "Créer une liste simple", keywords: "bullet puce liste unordered", icon: "bullets", group: "Listes" },
    { id: "numbered", label: "Liste numérotée", hint: "Créer une liste ordonnée", keywords: "number chiffres nombre liste ordered", icon: "numbered", group: "Listes" },
    { id: "bold", label: "Gras", hint: "Mettre le texte en évidence", keywords: "bold fort gras", icon: "bold", group: "Mise en forme" },
    { id: "italic", label: "Italique", hint: "Donner de l’emphase au texte", keywords: "italic italique", icon: "italic", group: "Mise en forme" },
    { id: "underline", label: "Souligné", hint: "Souligner le texte sélectionné", keywords: "underline souligné souligne", icon: "underline", group: "Mise en forme" },
    { id: "clear", label: "Effacer la mise en forme", hint: "Revenir au format par défaut", keywords: "clear reset nettoyer effacer format", icon: "clear", group: "Mise en forme" }
  ];

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function score(command, rawQuery) {
    const query = normalize(rawQuery);
    if (!query) return 1;
    const label = normalize(command.label);
    const haystack = normalize(`${command.label} ${command.keywords}`);
    if (label === query) return 100;
    if (label.startsWith(query)) return 80;
    if (haystack.split(/\s+/).some((word) => word.startsWith(query))) return 60;
    if (haystack.includes(query)) return 40;
    return 0;
  }

  function filterCommands(query) {
    return COMMANDS
      .map((command, index) => ({ command, index, score: score(command, query) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .map((entry) => entry.command);
  }

  return { COMMANDS, normalize, filterCommands };
});
