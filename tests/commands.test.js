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

test("les dimensions sont interprétées comme colonnes × lignes et bornées", () => {
  assert.deepEqual(filterCommands("tableau 4x5")[0].dimensions, {columns: 4, rows: 5});
  assert.deepEqual(filterCommands("table 2 × 7")[0].dimensions, {columns: 2, rows: 7});
  assert.deepEqual(filterCommands("tableau 0x3"), []);
  assert.deepEqual(filterCommands("tableau 21x3"), []);
});

test("la recherche accepte fautes, transpositions et plusieurs mots", () => {
  assert.equal(filterCommands("tabelau")[0].id, "table");
  assert.equal(filterCommands("chekbox")[0].id, "checklist");
  assert.equal(filterCommands("titre 2")[0].id, "heading2");
  assert.equal(filterCommands("liste numerote")[0].id, "numbered");
});
