(function exposeAdapter(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SlashDocsAdapter = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createAdapterModule() {
  "use strict";

  const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

  async function waitFor(find) {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const element = find();
      if (element) return element;
      await wait(50);
    }
    return null;
  }

  function visible(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = element.ownerDocument.defaultView.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  }

  function mouseClick(element) {
    if (!element) return false;
    ["mouseover", "mousedown", "mouseup", "click"].forEach((type) => {
      element.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
    });
    return true;
  }

  function normalizedText(element) {
    return (element.innerText || element.textContent || "")
      .replace(/\s+/g, " ")
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function normalize(value) {
    return String(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function findByAria(doc, phrases) {
    const nodes = Array.from(doc.querySelectorAll("[aria-label]"));
    return nodes.find((node) => {
      const label = (node.getAttribute("aria-label") || "").toLowerCase();
      return visible(node) && phrases.some((phrase) => label.includes(phrase));
    });
  }

  function findVisibleMenuItem(doc, labels) {
    const wanted = labels.map(normalize);
    const candidates = Array.from(doc.querySelectorAll(
      '[role="menuitem"], [role="menuitemradio"], [role="option"], .goog-menuitem, .goog-option'
    ));
    return candidates.find((candidate) => {
      if (!visible(candidate)) return false;
      const text = normalizedText(candidate) || normalize(candidate.getAttribute("aria-label") || "");
      return wanted.some((label) => text === label || text.startsWith(`${label} `));
    });
  }

  function findVisibleStyleItem(doc, labels) {
    const direct = findVisibleMenuItem(doc, labels);
    if (direct) return direct;

    const wanted = labels.map(normalize);
    const containers = Array.from(doc.querySelectorAll(
      '[role="menu"], [role="listbox"], .goog-menu, .goog-menu-vertical'
    )).filter(visible);

    for (const container of containers) {
      const descendants = Array.from(container.querySelectorAll("div, span"));
      const matchingLeaf = descendants
        .filter(visible)
        .filter((element) => {
          const text = normalizedText(element) || normalize(element.getAttribute("aria-label") || "");
          return wanted.some((label) => text === label || text.startsWith(`${label} `));
        })
        .sort((a, b) => normalizedText(a).length - normalizedText(b).length)[0];

      if (matchingLeaf) {
        return matchingLeaf.closest(
          '[role="menuitem"], [role="menuitemradio"], [role="option"], .goog-menuitem, .goog-option'
        ) || matchingLeaf;
      }
    }
    return null;
  }

  async function openInsertMenu(doc) {
    const direct = doc.getElementById("docs-insert-menu");
    const menubar = doc.getElementById("docs-menubar");
    const fallback = menubar && Array.from(menubar.children).find((item) => {
      const text = normalizedText(item);
      return text === "insert" || text === "insertion";
    });
    const button = direct || fallback;
    if (!button) throw new Error("Le menu Insertion est introuvable.");
    mouseClick(button);
    await wait(90);
  }

  async function openInsertChoice(doc, labels, message) {
    await openInsertMenu(doc);
    const item = await waitFor(() => findVisibleMenuItem(doc, labels));
    if (!item) throw new Error(`L’option ${labels[0]} est introuvable dans le menu Insertion.`);
    mouseClick(item);
    return message;
  }

  async function insertHorizontalLine(doc) {
    await openInsertChoice(doc, ["horizontal line", "ligne horizontale"]);
  }

  async function insertTable(doc, { columns = 3, rows = 3 } = {}) {
    if (![columns, rows].every(n => Number.isInteger(n) && n >= 1 && n <= 20)) throw new Error("Dimensions attendues : 1 à 20.");
    await openInsertChoice(doc, ["table", "tableau"]);
    const picker = await waitFor(() => Array.from(doc.querySelectorAll(".goog-dimension-picker")).find(visible));
    const catcher = picker?.querySelector(".goog-dimension-picker-mousecatcher");
    const highlight = picker?.querySelector(".goog-dimension-picker-highlighted");
    if (!catcher || !highlight) {
      throw new Error(`Sélection automatique indisponible : choisis ${columns} × ${rows} dans la grille Google Docs ouverte.`);
    }
    const rect = catcher.getBoundingClientRect();
    const unit = parseFloat(doc.defaultView.getComputedStyle(catcher).fontSize);
    const point = { clientX: rect.left + unit * (columns - 0.5), clientY: rect.top + unit * (rows - 0.5) };
    const send = type => catcher.dispatchEvent(new doc.defaultView.MouseEvent(type, {
      bubbles: true, cancelable: true, view: doc.defaultView, ...point
    }));
    send("mouseover");
    send("mousemove");
    // Verify native dimensions before confirming insertion.
    const confirmed = await waitFor(() => {
      const size = highlight.getBoundingClientRect();
      return Math.abs(size.width - unit * columns) < 2 && Math.abs(size.height - unit * rows) < 2;
    });
    if (!confirmed) throw new Error(`Choisis ${columns} × ${rows} dans la grille : ses dimensions n’ont pas pu être vérifiées automatiquement.`);
    send("mousedown");
    send("mouseup");
    send("click");
  }

  async function insertPageBreak(doc) {
    await openInsertMenu(doc);
    const breakItem = findVisibleMenuItem(doc, ["break", "saut"]);
    if (!breakItem) throw new Error("Le menu Saut est introuvable.");
    mouseClick(breakItem);
    await wait(90);
    const pageBreak = findVisibleMenuItem(doc, ["page break", "saut de page"]);
    if (!pageBreak) throw new Error("L’option Saut de page est introuvable.");
    mouseClick(pageBreak);
  }

  async function applyParagraphStyle(doc, labels) {
    const button = doc.getElementById("headingStyleSelect") || findByAria(doc, ["styles", "styles de paragraphe", "normal text", "texte normal"]);
    if (!button) throw new Error("Le menu des styles est introuvable.");
    mouseClick(button);

    let item = null;
    for (let attempt = 0; attempt < 20 && !item; attempt += 1) {
      await wait(50);
      item = findVisibleStyleItem(doc, labels);
    }
    if (!item) {
      mouseClick(button);
      throw new Error("Ce style n’est pas disponible dans l’interface actuelle de Docs.");
    }
    mouseClick(item);
  }

  function clickToolbar(doc, ids, ariaPhrases) {
    const byId = ids.map((id) => doc.getElementById(id)).find(Boolean);
    const target = byId || findByAria(doc, ariaPhrases);
    if (!target) throw new Error("Cette action est introuvable dans la barre d’outils.");
    mouseClick(target);
  }

  async function applyChecklist(doc) {
    const direct = doc.getElementById("addChecklistButton") || findByAria(doc, ["checklist", "liste de contrôle", "cases à cocher"]);
    if (direct) return mouseClick(direct);
    const presets = doc.getElementById("bulletedListPresetMenuButton") || findByAria(doc, ["bullet list options", "options de liste à puces"]);
    if (!presets) throw new Error("Le bouton de checklist est introuvable.");
    mouseClick(presets);
    await wait(70);
    const checkbox = doc.querySelector(".docs-listpreset-checkbox") || findByAria(doc, ["checklist", "liste de contrôle", "cases à cocher"]);
    if (!checkbox) throw new Error("Le modèle de checklist est introuvable.");
    mouseClick(checkbox.closest('[role="menuitem"]') || checkbox);
  }

  function createDocsAdapter(doc) {
    return {
      async execute(commandId, dimensions) {
        const actions = {
          normal: () => applyParagraphStyle(doc, ["normal text", "texte normal"]),
          title: () => applyParagraphStyle(doc, ["title", "titre"]),
          subtitle: () => applyParagraphStyle(doc, ["subtitle", "sous-titre", "sous titre"]),
          heading1: () => applyParagraphStyle(doc, ["heading 1", "titre 1"]),
          heading2: () => applyParagraphStyle(doc, ["heading 2", "titre 2"]),
          heading3: () => applyParagraphStyle(doc, ["heading 3", "titre 3"]),
          table: () => insertTable(doc, dimensions),
          image: () => openInsertChoice(doc, ["image"], "Choisis la source de l’image dans le menu Docs"),
          link: () => clickToolbar(doc, ["insertLinkButton"], ["insert link", "insérer un lien", "lien"]),
          divider: () => insertHorizontalLine(doc),
          pageBreak: () => insertPageBreak(doc),
          checklist: () => applyChecklist(doc),
          bullets: () => clickToolbar(doc, ["addBulletButton"], ["bulleted list", "liste à puces"]),
          numbered: () => clickToolbar(doc, ["addNumberedBulletButton", "addNumberedListButton"], ["numbered list", "liste numérotée"]),
          bold: () => clickToolbar(doc, ["boldButton"], ["bold", "gras"]),
          italic: () => clickToolbar(doc, ["italicButton"], ["italic", "italique"]),
          underline: () => clickToolbar(doc, ["underlineButton"], ["underline", "souligné"]),
          clear: () => clickToolbar(doc, ["clearFormattingButton"], ["clear formatting", "effacer la mise en forme"])
        };
        const action = actions[commandId];
        if (!action) throw new Error(`Commande inconnue : ${commandId}`);
        const result = await action();
        return typeof result === "string" ? result : undefined;
      }
    };
  }

  return { createDocsAdapter };
});
