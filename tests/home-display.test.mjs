import test from "node:test";
import assert from "node:assert/strict";
import {
  HOME_MODE_CLASSES,
  HOME_MODE_PRESENTATIONS,
  applyHomeModePresentation,
  homeModePresentation
} from "../src/home-display.mjs";

test("ogni modalità Home usa classe e token di design distinti", () => {
  assert.deepEqual(HOME_MODE_CLASSES, ["mode-office", "mode-smart", "mode-travel"]);
  const presentations = Object.values(HOME_MODE_PRESENTATIONS);
  assert.equal(new Set(presentations.map((item) => item.className)).size, 3);
  assert.equal(new Set(presentations.map((item) => item.backgroundToken)).size, 3);
  assert.equal(new Set(presentations.map((item) => item.accentToken)).size, 3);
  assert.deepEqual(presentations.map((item) => item.label), [
    "Ufficio",
    "Casa · Smart Working",
    "Trasferta"
  ]);
});

test("modalità sconosciuta torna al tema Ufficio senza perdere testo e icona", () => {
  assert.equal(homeModePresentation("smart").className, "mode-smart");
  assert.equal(homeModePresentation("travel").className, "mode-travel");
  assert.deepEqual(homeModePresentation("unknown"), HOME_MODE_PRESENTATIONS.office);
  assert.ok(homeModePresentation("office").icon);
});

test("il cambio modalità aggiorna davvero classi DOM, data-mode, icona e testo", () => {
  const classes = new Set(["hero-card", "mode-office"]);
  const card = {
    dataset: { mode: "office" },
    classList: {
      add: (...values) => values.forEach((value) => classes.add(value)),
      remove: (...values) => values.forEach((value) => classes.delete(value))
    }
  };
  const label = {
    children: [],
    replaceChildren(...values) { this.children = values; }
  };
  const documentRef = {
    createElement: () => ({ setAttribute(name, value) { this[name] = value; }, textContent: "" }),
    createTextNode: (textContent) => ({ textContent })
  };

  applyHomeModePresentation(card, label, "travel", documentRef);
  assert.equal(card.dataset.mode, "travel");
  assert.equal(classes.has("mode-travel"), true);
  assert.equal(classes.has("mode-office"), false);
  assert.equal(classes.has("mode-smart"), false);
  assert.equal(label.children[0].textContent, "↗");
  assert.equal(label.children[1].textContent, "Trasferta");

  applyHomeModePresentation(card, label, "smart", documentRef);
  assert.equal(card.dataset.mode, "smart");
  assert.equal(classes.has("mode-smart"), true);
  assert.equal(classes.has("mode-travel"), false);
  assert.equal(label.children[1].textContent, "Casa · Smart Working");
});
