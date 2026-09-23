(function initializeSlashDocs() {
  "use strict";

  if (globalThis.__slashDocsLoaded) return;
  globalThis.__slashDocsLoaded = true;

  const CHANNEL = "slash-docs:v1";
  const isTop = window === window.top;
  let enabled = true;
  let paletteOpen = false;
  let query = "";
  let selectedIndex = 0;
  let sourceWindow = null;
  let lastPointer = { x: Math.round(window.innerWidth / 2), y: 180 };

  chrome.storage.sync.get({ enabled: true }, (result) => { enabled = result.enabled !== false; });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.enabled) {
      enabled = changes.enabled.newValue !== false;
      if (!enabled) closePalette();
    }
  });

  function emit(type, detail = {}) {
    const message = { channel: CHANNEL, type, ...detail };
    if (isTop) handleMessage(message, window);
    else window.top.postMessage(message, "*");
  }

  function sendToSource(type) {
    if (sourceWindow && sourceWindow !== window) sourceWindow.postMessage({ channel: CHANNEL, type }, "*");
  }

  window.addEventListener("message", (event) => {
    if (event.data?.channel !== CHANNEL) return;
    if (isTop) handleMessage(event.data, event.source);
    else if (event.source === window.top && event.data.type === "closed") paletteOpen = false;
  });

  document.addEventListener("pointerdown", (event) => {
    lastPointer = { x: event.clientX, y: event.clientY };
    if (!paletteOpen) return;
    if (!isTop) {
      emit("close");
      return;
    }
    if (!event.composedPath().includes(host)) closePalette();
  }, true);

  window.addEventListener("keydown", (event) => {
    if (!enabled || event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;

    if (!paletteOpen) {
      if (event.key !== "/" || !isEditingTarget(event.target)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      paletteOpen = true;
      query = "";
      emit("open", { point: lastPointer });
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      paletteOpen = false;
      emit("close");
      insertLiteralSlash(event.target);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopImmediatePropagation();
      emit("navigate", { delta: event.key === "ArrowDown" ? 1 : -1 });
      return;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      event.stopImmediatePropagation();
      emit("execute");
      return;
    }
    if (event.key === "Backspace") {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (query.length === 0) {
        paletteOpen = false;
        emit("close");
      } else {
        query = query.slice(0, -1);
        emit("query", { query });
      }
      return;
    }
    if (event.key.length === 1) {
      event.preventDefault();
      event.stopImmediatePropagation();
      query += event.key;
      emit("query", { query });
    }
  }, true);

  function isEditingTarget(target) {
    if (!(target instanceof Element)) return false;
    // The Docs editor receives typing inside its dedicated iframe.
    if (!isTop) {
      try { return window.frameElement?.matches(".docs-texteventtarget-iframe") === true; }
      catch { return false; }
    }
    return Boolean(target.closest(".kix-appview-editor, #editor[contenteditable='true']"));
  }

  function insertLiteralSlash(target) {
    // Docs handles paste through its editor iframe; native contenteditables
    // (including our browser fixture) can use the browser's editing command.
    if (isTop) {
      document.execCommand("insertText", false, "/");
      return;
    }
    const clipboard = new DataTransfer();
    clipboard.setData("text/plain", "/");
    clipboard.setData("text/html", "<span>/</span>");
    target.dispatchEvent(new ClipboardEvent("paste", {
      bubbles: true, cancelable: true, clipboardData: clipboard
    }));
  }

  if (!isTop) return;

  const host = document.createElement("div");
  host.id = "slash-docs-root";
  host.hidden = true;
  host.setAttribute("aria-live", "polite");
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>${getPaletteStyles()}</style>
    <section class="palette" role="dialog" aria-label="Commandes Slash Docs">
      <header class="menu-heading">
        <span class="search-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"></circle><path d="m15.5 15.5 5 5"></path></svg></span>
        <span class="query-display" aria-label="Recherche en cours"><span class="query-placeholder">Rechercher dans les menus</span><span class="query-value">/<span class="query-text"></span><span class="caret"></span></span></span>
        <kbd>Échap</kbd>
      </header>
      <div class="results" role="listbox" aria-label="Commandes disponibles"></div>
    </section>`;

  const palette = shadow.querySelector(".palette");
  const results = shadow.querySelector(".results");
  const queryText = shadow.querySelector(".query-text");
  const queryPlaceholder = shadow.querySelector(".query-placeholder");
  const queryValue = shadow.querySelector(".query-value");
  let filtered = SlashDocsCommands.COMMANDS;
  let adapter;
  let openingFrame = null;

  function mount() {
    if (!document.documentElement.contains(host)) document.documentElement.appendChild(host);
    adapter ||= SlashDocsAdapter.createDocsAdapter(document);
  }

  function handleMessage(message, source) {
    if (!enabled && message.type !== "close") return;
    if (message.type !== "open" && message.type !== "close" && !paletteOpen) return;
    if (message.type === "open") {
      sourceWindow = source;
      paletteOpen = true;
      query = "";
      selectedIndex = 0;
      filtered = SlashDocsCommands.COMMANDS;
      mount();
      render();
      host.hidden = false;
      host.style.display = "block";
      palette.removeAttribute("aria-hidden");
      palette.style.pointerEvents = "auto";
      positionPalette(message.point);
      openingFrame = requestAnimationFrame(() => {
        openingFrame = null;
        if (paletteOpen && host.isConnected) palette.classList.add("visible");
      });
    } else if (message.type === "query") {
      query = message.query || "";
      selectedIndex = 0;
      filtered = SlashDocsCommands.filterCommands(query);
      render();
    } else if (message.type === "navigate") {
      if (!filtered.length) return;
      selectedIndex = (selectedIndex + message.delta + filtered.length) % filtered.length;
      render();
    } else if (message.type === "execute") {
      const command = filtered[selectedIndex];
      closePalette();
      if (command) executeCommand(command);
    } else if (message.type === "close") closePalette();
  }

  function closePalette() {
    paletteOpen = false;
    query = "";
    if (!isTop) return;
    if (openingFrame !== null) cancelAnimationFrame(openingFrame);
    openingFrame = null;
    palette.classList.remove("visible");
    palette.setAttribute("aria-hidden", "true");
    palette.style.pointerEvents = "none";
    host.hidden = true;
    host.style.display = "none";
    host.remove();
    results.replaceChildren();
    sendToSource("closed");
    sourceWindow = null;
  }

  function positionPalette(point) {
    const anchor = getCursorRect() || (point ? { left: point.x, bottom: point.y } : null) || { left: window.innerWidth / 2, bottom: 180 };
    const width = Math.min(340, window.innerWidth - 24);
    const left = Math.max(12, Math.min(anchor.left, window.innerWidth - width - 12));
    let top = anchor.bottom + 6;
    let room = window.innerHeight - top - 12;
    // Prefer a shorter, scrollable list directly below the insertion point.
    if (room < 100) {
      room = Math.min(460, (anchor.top ?? anchor.bottom) - 18);
      top = Math.max(12, (anchor.top ?? anchor.bottom) - room - 6);
    }
    results.style.maxHeight = `${Math.max(40, Math.min(408, room - 62))}px`;
    host.style.setProperty("--slash-left", `${left}px`);
    host.style.setProperty("--slash-top", `${top}px`);
    host.style.setProperty("--slash-width", `${width}px`);
  }

  function getCursorRect() {
    const selection = document.getSelection();
    if (selection?.rangeCount && selection.isCollapsed &&
        selection.anchorNode?.parentElement?.closest(".kix-appview-editor, #editor[contenteditable='true']")) {
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      if (rect.height > 0) return rect;
    }
    const selectors = [".kix-cursor-caret", ".docs-text-ui-cursor-blink", ".kix-cursor"];
    for (const selector of selectors) {
      const elements = Array.from(document.querySelectorAll(selector));
      const cursor = elements.find((element) => {
        const rect = element.getBoundingClientRect();
        const owner = element.closest(".kix-cursor");
        const name = owner?.querySelector(".kix-cursor-name");
        if (name?.textContent.trim()) return false;
        return rect.height > 5 && rect.left >= 0 && rect.top >= 0 &&
          rect.left < window.innerWidth && rect.top < window.innerHeight &&
          getComputedStyle(element).display !== "none";
      });
      if (cursor) return cursor.getBoundingClientRect();
    }
    return null;
  }

  function render() {
    queryText.textContent = query;
    queryPlaceholder.hidden = Boolean(query);
    queryValue.hidden = !query;
    results.replaceChildren();
    if (!filtered.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.innerHTML = `<span>Aucune commande</span><small>Efface quelques lettres pour continuer.</small>`;
      results.appendChild(empty);
      return;
    }
    let previousGroup = null;
    filtered.forEach((command, index) => {
      if (!query && command.group !== previousGroup) {
        if (previousGroup !== null) {
          const separator = document.createElement("div");
          separator.className = "group-separator";
          separator.setAttribute("role", "separator");
          results.appendChild(separator);
        }
        previousGroup = command.group;
      }
      const button = document.createElement("button");
      button.type = "button";
      button.className = `command${index === selectedIndex ? " selected" : ""}`;
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", String(index === selectedIndex));
      const icon = document.createElement("span");
      icon.className = `command-icon icon-${command.icon}`;
      icon.setAttribute("aria-hidden", "true");
      icon.innerHTML = iconSvg(command.icon);
      const copy = document.createElement("span");
      copy.className = "command-copy";
      const label = document.createElement("strong");
      label.textContent = command.label;
      const hint = document.createElement("small");
      hint.textContent = command.hint;
      button.setAttribute("aria-label", `${command.label} — ${command.hint}`);
      copy.append(label, hint);
      button.append(icon, copy);
      button.addEventListener("pointermove", () => {
        if (selectedIndex !== index) {
          selectedIndex = index;
          results.querySelectorAll(".command").forEach((row, rowIndex) => {
            row.classList.toggle("selected", rowIndex === index);
            row.setAttribute("aria-selected", String(rowIndex === index));
          });
        }
      });
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", () => {
        if (!paletteOpen) return;
        closePalette();
        executeCommand(command);
      });
      results.appendChild(button);
    });
    results.querySelector(".selected")?.scrollIntoView({ block: "nearest" });
    if (/^(table|tableau)$/.test(query.trim().toLowerCase())) {
      const chooser = document.createElement("div");
      chooser.className = "table-chooser";
      const caption = document.createElement("div");
      caption.textContent = "Colonnes × lignes · ou tape tableau 4x5";
      const grid = document.createElement("div");
      grid.className = "table-grid";
      for (let rows = 1; rows <= 5; rows++) {
        for (let columns = 1; columns <= 5; columns++) {
          const cell = document.createElement("button");
          cell.type = "button";
          cell.setAttribute("aria-label", `${columns} colonnes, ${rows} lignes`);
          cell.textContent = `${columns}×${rows}`;
          cell.addEventListener("mousedown", event => event.preventDefault());
          cell.addEventListener("click", () => {
            if (!paletteOpen) return;
            closePalette();
            executeCommand({ id: "table", label: `Tableau ${columns} × ${rows}`, dimensions: { columns, rows } });
          });
          grid.appendChild(cell);
        }
      }
      chooser.append(caption, grid);
      results.appendChild(chooser);
    }
  }

  async function executeCommand(command) {
    try {
      const message = await adapter.execute(command.id, command.dimensions);
      showToast(message || `${command.label} appliqué`, "success");
    } catch (error) {
      console.warn("[Slash Docs]", error);
      showToast(error.message || "Action impossible dans cette version de Docs.", "error");
    }
  }

  function showToast(message, state) {
    // Notifications must never remount the closed command palette.
    const notificationHost = document.createElement("div");
    notificationHost.style.setProperty("pointer-events", "none", "important");
    const notificationRoot = notificationHost.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = getPaletteStyles();
    const toast = document.createElement("div");
    toast.setAttribute("role", "status");
    toast.style.pointerEvents = "none";
    toast.className = `toast ${state}`;
    toast.textContent = message;
    notificationRoot.append(style, toast);
    document.documentElement.appendChild(notificationHost);
    requestAnimationFrame(() => toast.classList.add("show"));
    setTimeout(() => { toast.classList.remove("show"); setTimeout(() => notificationHost.remove(), 180); }, 2200);
  }

  function iconSvg(icon) {
    const icons = {
      text: '<svg viewBox="0 0 24 24"><path d="M5 5h14M12 5v14M8.5 19h7"/></svg>',
      title: '<svg viewBox="0 0 24 24"><path d="M4 6h16M8 6v12M5 18h6M15 10h5M17.5 10v8M15 18h5"/></svg>',
      subtitle: '<svg viewBox="0 0 24 24"><path d="M5 7h14M12 7v10M9 17h6M5 21h14"/></svg>',
      h1: '<svg viewBox="0 0 24 24"><path d="M4 6v12M10 6v12M4 12h6M15 9l3-2v11M15 18h6"/></svg>',
      h2: '<svg viewBox="0 0 24 24"><path d="M3 6v12M9 6v12M3 12h6M14 10c.5-2 6-2.5 6 .8 0 2.7-6 3.6-6 7.2h7"/></svg>',
      h3: '<svg viewBox="0 0 24 24"><path d="M3 6v12M9 6v12M3 12h6M14 9.5c1-2 6-1.5 6 .8 0 1.4-1 2.1-2.4 2.2 1.7.1 2.7.9 2.7 2.5 0 3-5.3 3.4-6.5 1"/></svg>',
      table: '<svg viewBox="0 0 24 24"><rect x="3.5" y="4" width="17" height="16" rx="1"/><path d="M3.5 9h17M9 4v16M15 4v16"/></svg>',
      image: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="1.5"/><path d="m5 18 4.5-4.5 3 3 2.5-2.5 4 4"/></svg>',
      link: '<svg viewBox="0 0 24 24"><path d="M9.5 14.5 14.5 9M8 16H6a4 4 0 0 1 0-8h4M16 8h2a4 4 0 0 1 0 8h-4"/></svg>',
      divider: '<svg viewBox="0 0 24 24"><path d="M3 12h18"/></svg>',
      "page-break": '<svg viewBox="0 0 24 24"><path d="M6 3h12v6M6 21h12v-6M3 12h3m3 0h3m3 0h3m3 0h1"/></svg>',
      checklist: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="6" height="6" rx="1"/><path d="m4.5 7 1.4 1.4L8 6M12 7h9M3 17h6M12 17h9"/></svg>',
      bullets: '<svg viewBox="0 0 24 24"><circle cx="5" cy="7" r="1" fill="currentColor" stroke="none"/><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="5" cy="17" r="1" fill="currentColor" stroke="none"/><path d="M9 7h11M9 12h11M9 17h11"/></svg>',
      numbered: '<svg viewBox="0 0 24 24"><path d="M4 5h1v4M3.5 9h3M3.5 13c.4-1.5 3-1.5 3 0 0 1.2-3 1.6-3 3h3M3.5 19c.5 1.2 3 1.1 3-.3 0-1-1-1.2-2-1.2 1 0 2-.4 2-1.3M10 7h10M10 12h10M10 17h10"/></svg>',
      bold: '<svg viewBox="0 0 24 24"><path d="M7 4h6.5a4 4 0 0 1 0 8H7zm0 8h7a4 4 0 0 1 0 8H7z"/></svg>',
      italic: '<svg viewBox="0 0 24 24"><path d="M10 4h8M6 20h8M14 4 10 20"/></svg>',
      underline: '<svg viewBox="0 0 24 24"><path d="M6 4v7a6 6 0 0 0 12 0V4M4 21h16"/></svg>',
      clear: '<svg viewBox="0 0 24 24"><path d="m4 17 8-12 7 5-6 9H7zM3 21h18M14 7l-7 10"/></svg>'
    };
    return icons[icon] || icons.text;
  }

  function getPaletteStyles() {
    return `
      :host { all: initial; }
      .table-chooser { padding: 12px; color: #5f6368; font: 12px/1.4 Roboto,Arial,sans-serif; }
      .table-grid { display: grid; grid-template-columns: repeat(5,1fr); gap: 4px; margin-top: 8px; }
      .table-grid button { min-height: 32px; border: 1px solid #dadce0; background: #fff; color: #3c4043; border-radius: 3px; cursor: pointer; }
      .table-grid button:hover, .table-grid button:focus-visible { background: #e8f0fe; outline: 2px solid #1a73e8; }
      .palette { position: fixed; left: var(--slash-left); top: var(--slash-top); width: var(--slash-width); z-index: 2147483647; overflow: hidden; color: #202124; background: #fff; border: 1px solid #dadce0; border-radius: 4px; box-shadow: 0 2px 6px 2px rgba(60,64,67,.15); font: 14px/1.2 Roboto,Arial,sans-serif; opacity: 0; transform: translateY(-3px); transform-origin: 24px 0; transition: opacity 100ms ease-out, transform 120ms ease-out; pointer-events: auto; }
      .palette.visible { opacity: 1; transform: none; }
      .menu-heading { display: grid; grid-template-columns: 24px minmax(0,1fr) auto; align-items: center; gap: 8px; min-height: 48px; padding: 0 12px; color: #3c4043; background: #fff; border-bottom: 1px solid #dadce0; }
      .search-icon { display: grid; place-items: center; width: 24px; height: 24px; color: #5f6368; }
      .search-icon svg { width: 19px; height: 19px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; }
      .query-display { min-width: 0; overflow: hidden; color: #202124; font: 400 14px/1.2 Roboto,Arial,sans-serif; text-overflow: ellipsis; white-space: nowrap; }
      .query-placeholder { color: #5f6368; }
      .query-value[hidden], .query-placeholder[hidden] { display: none; }
      kbd { padding: 3px 5px; color: #5f6368; background: #f8f9fa; border: 1px solid #dadce0; border-radius: 3px; font: 10px/1 Roboto,Arial,sans-serif; }
      .caret { display: inline-block; width: 1px; height: 13px; margin-left: 1px; vertical-align: -2px; background: #1a73e8; animation: blink 1s step-end infinite; }
      .results { max-height: 408px; padding: 6px 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: #dadce0 transparent; }
      .group-separator { height: 1px; margin: 6px 0; background: #dadce0; }
      .command { width: 100%; display: grid; grid-template-columns: 32px minmax(0,1fr); align-items: center; gap: 8px; min-height: 40px; padding: 0 14px; color: inherit; background: transparent; border: 0; border-radius: 0; font: inherit; text-align: left; cursor: pointer; transition: background 80ms ease; }
      .command:hover { background: #f1f3f4; }
      .command.selected { color: #202124; background: #e8eaed; }
      .command:active { background: #dadce0; }
      .command:focus-visible { outline: 2px solid #1a73e8; outline-offset: -2px; }
      .command-icon { display: grid; place-items: center; width: 24px; height: 24px; color: #5f6368; }
      .command.selected .command-icon { color: #3c4043; }
      .command-icon svg { width: 19px; height: 19px; overflow: visible; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
      .command-copy { min-width: 0; display: block; }
      .command-copy strong { display: block; overflow: hidden; color: inherit; font-size: 14px; font-weight: 400; text-overflow: ellipsis; white-space: nowrap; }
      .command-copy small { display: none; }
      .empty { display: flex; min-height: 112px; flex-direction: column; align-items: center; justify-content: center; color: #3c4043; } .empty small { margin-top: 4px; color: #5f6368; }
      .toast { position: fixed; right: 22px; bottom: 22px; z-index: 2147483647; max-width: 360px; padding: 11px 14px; color: #fff; background: #3c4043; border-radius: 4px; box-shadow: 0 4px 12px rgba(60,64,67,.24); font: 500 12px/1.4 Roboto,Arial,sans-serif; opacity: 0; transform: translateY(6px); transition: opacity 120ms ease, transform 150ms ease; }
      .toast.error { background: #b3261e; } .toast.show { opacity: 1; transform: none; }
      @keyframes blink { 50% { opacity: 0; } }
      @media (prefers-reduced-motion: reduce) { .palette, .toast { transition: none; } .caret { animation: none; } }
    `;
  }
})();
