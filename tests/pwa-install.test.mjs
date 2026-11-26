import test from "node:test";
import assert from "node:assert/strict";
import {
  INSTALL_DISMISSAL_MS,
  installBannerKind,
  isInstallDismissalActive,
  isIosDevice,
  isStandaloneMode
} from "../src/pwa-install.mjs";

test("riconosce iPhone e iPadOS moderno", () => {
  assert.equal(isIosDevice({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", platform: "iPhone", maxTouchPoints: 5 }), true);
  assert.equal(isIosDevice({ userAgent: "Mozilla/5.0 (Macintosh)", platform: "MacIntel", maxTouchPoints: 5 }), true);
  assert.equal(isIosDevice({ userAgent: "Mozilla/5.0 (Linux; Android 15)", platform: "Linux armv8l", maxTouchPoints: 5 }), false);
});

test("riconosce la modalità PWA standalone", () => {
  assert.equal(isStandaloneMode({ navigatorLike: { standalone: true }, displayModeStandalone: false }), true);
  assert.equal(isStandaloneMode({ navigatorLike: {}, displayModeStandalone: true }), true);
  assert.equal(isStandaloneMode({ navigatorLike: {}, displayModeStandalone: false }), false);
});

test("mostra il banner iOS o il prompt nativo solo fuori dalla PWA", () => {
  assert.equal(installBannerKind({ ios: true, standalone: false }), "ios");
  assert.equal(installBannerKind({ ios: false, standalone: false, promptAvailable: true }), "prompt");
  assert.equal(installBannerKind({ ios: true, standalone: true, promptAvailable: true }), null);
  assert.equal(installBannerKind({ ios: false, standalone: false, promptAvailable: false }), null);
});

test("la chiusura del banner resta valida per sette giorni", () => {
  const now = Date.now();
  assert.equal(isInstallDismissalActive(String(now - INSTALL_DISMISSAL_MS + 1), now), true);
  assert.equal(isInstallDismissalActive(String(now - INSTALL_DISMISSAL_MS), now), false);
  assert.equal(isInstallDismissalActive("non-valido", now), false);
});
