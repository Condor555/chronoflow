export const HOME_MODE_PRESENTATIONS = Object.freeze({
  office: Object.freeze({
    mode: "office",
    className: "mode-office",
    label: "Ufficio",
    icon: "▥",
    backgroundToken: "--home-office-background",
    foregroundToken: "--home-office-foreground",
    accentToken: "--home-office-accent"
  }),
  smart: Object.freeze({
    mode: "smart",
    className: "mode-smart",
    label: "Casa · Smart Working",
    icon: "⌂",
    backgroundToken: "--home-smart-background",
    foregroundToken: "--home-smart-foreground",
    accentToken: "--home-smart-accent"
  }),
  travel: Object.freeze({
    mode: "travel",
    className: "mode-travel",
    label: "Trasferta",
    icon: "↗",
    backgroundToken: "--home-travel-background",
    foregroundToken: "--home-travel-foreground",
    accentToken: "--home-travel-accent"
  })
});

export const HOME_MODE_CLASSES = Object.freeze(
  Object.values(HOME_MODE_PRESENTATIONS).map((item) => item.className)
);

export function homeModePresentation(value = "office") {
  return HOME_MODE_PRESENTATIONS[value] || HOME_MODE_PRESENTATIONS.office;
}

export function applyHomeModePresentation(card, labelTarget, value = "office", documentRef = globalThis.document) {
  if (!card?.classList || !labelTarget || !documentRef) throw new TypeError("Elementi Home non disponibili");
  const presentation = homeModePresentation(value);
  card.classList.remove(...HOME_MODE_CLASSES);
  card.classList.add(presentation.className);
  card.dataset.mode = presentation.mode;
  const icon = documentRef.createElement("span");
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = presentation.icon;
  labelTarget.replaceChildren(icon, documentRef.createTextNode(presentation.label));
  return presentation;
}
