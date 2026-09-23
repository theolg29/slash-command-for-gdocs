const test = require("node:test");
const assert = require("node:assert/strict");
const { COMMANDS, normalize, filterCommands } = require("../src/commands.js");

test("le catalogue contient les commandes essentielles", () => {
  const ids = COMMANDS.map((command) => command.id);
  assert.ok(ids.includes("heading1"));
  assert.ok(ids.includes("checklist"));
  assert.ok(ids.includes("bullets"));
  assert.ok(ids.includes("table"));
  assert.ok(ids.includes("image"));
  assert.ok(ids.includes("pageBreak"));
});

test("la recherche ignore les accents et la casse", () => {
  assert.equal(normalize("  NumÉRotée "), "numerotee");
  assert.equal(filterCommands("numero")[0].id, "numbered");
});

test("les alias courts retrouvent les titres", () => {
  assert.equal(filterCommands("h2")[0].id, "heading2");
  assert.equal(filterCommands("todo")[0].id, "checklist");
  assert.equal(filterCommands("photo")[0].id, "image");
});

test("une recherche inconnue renvoie une liste vide", () => {
  assert.deepEqual(filterCommands("xyz-introuvable"), []);
});
