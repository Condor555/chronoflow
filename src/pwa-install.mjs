export const INSTALL_DISMISSAL_MS = 7 * 24 * 60 * 60 * 1000;

export function isIosDevice(navigatorLike = globalThis.navigator) {
  const userAgent = String(navigatorLike?.userAgent || "");
  const platform = String(navigatorLike?.platform || "");
  const touchPoints = Number(navigatorLike?.maxTouchPoints || 0);
  return /iPad|iPhone|iPod/i.test(userAgent)
    || (platform === "MacIntel" && touchPoints > 1);
}

export function isStandaloneMode({ navigatorLike = globalThis.navigator, displayModeStandalone = false } = {}) {
  return Boolean(displayModeStandalone || navigatorLike?.standalone === true);
}

export function isInstallDismissalActive(value, now = Date.now(), cooldown = INSTALL_DISMISSAL_MS) {
  const dismissedAt = Number(value);
  return Number.isFinite(dismissedAt) && dismissedAt > 0 && now - dismissedAt < cooldown;
}

export function installBannerKind({ ios = false, standalone = false, promptAvailable = false } = {}) {
  if (standalone) return null;
  if (ios) return "ios";
  if (promptAvailable) return "prompt";
  return null;
}
