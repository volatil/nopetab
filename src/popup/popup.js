const storageApi = globalThis.NopeTabStorage || {};

const statusBadge = document.getElementById("statusBadge");
const stateSummary = document.getElementById("stateSummary");
const windowSummary = document.getElementById("windowSummary");
const siteSummary = document.getElementById("siteSummary");
const nextWindowSummary = document.getElementById("nextWindowSummary");
const refreshButton = document.getElementById("refreshButton");
const openOptionsButton = document.getElementById("openOptionsButton");

function sendMessage(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, payload });
}

function parseDateTimeValue(value) {
  if (typeof storageApi.parseDateTimeValue === "function") {
    return storageApi.parseDateTimeValue(value);
  }

  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatOccurrence(occurrence) {
  if (!occurrence) {
    return "No hay regla activa.";
  }

  const start = parseDateTimeValue(occurrence.occurrenceStart);
  const end = parseDateTimeValue(occurrence.occurrenceEnd);
  if (!start || !end) {
    return "Regla invalida.";
  }

  if (occurrence.rule.type === "weekly-hours") {
    const daySummary =
      typeof storageApi.formatRuleDays === "function"
        ? storageApi.formatRuleDays(occurrence.rule.daysOfWeek)
        : "dias configurados";
    return `${daySummary}: ${start.toLocaleString()} - ${end.toLocaleString()}`;
  }

  return `${start.toLocaleString()} - ${end.toLocaleString()}`;
}

async function getActiveTabUrl() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeUrl = tabs[0] && tabs[0].url ? tabs[0].url : null;
  if (!activeUrl) {
    return null;
  }

  try {
    const parsedUrl = new URL(activeUrl);
    if (parsedUrl.pathname.endsWith(`/${storageApi.BLOCKED_PAGE_PATH}`)) {
      return parsedUrl.searchParams.get("target");
    }
  } catch (error) {
    return activeUrl;
  }

  return activeUrl;
}

function renderState(snapshot) {
  const { data, blockState } = snapshot;
  const currentDomain = blockState.siteEntry ? blockState.siteEntry.domain : null;

  statusBadge.textContent = blockState.blocked ? "Bloqueando" : "Libre";
  statusBadge.className = `badge ${blockState.blocked ? "active" : ""}`.trim();

  if (blockState.blocked) {
    stateSummary.textContent = blockState.emergencyUnlocked
      ? "La regla actual de este sitio fue liberada de emergencia."
      : "El sitio actual coincide con una regla activa.";
  } else if (blockState.activeRule && blockState.emergencyUnlocked) {
    stateSummary.textContent = "La regla actual sigue corriendo, pero ya fue desbloqueada de emergencia.";
  } else if (currentDomain) {
    stateSummary.textContent = "Este sitio esta configurado, pero ahora no tiene una regla activa.";
  } else {
    stateSummary.textContent = "El sitio actual no coincide con ninguna regla configurada.";
  }

  windowSummary.textContent = blockState.activeRule
    ? `Regla activa: ${formatOccurrence(blockState.activeRule)}`
    : "No hay una regla activa para este sitio.";

  nextWindowSummary.textContent = blockState.nextRule
    ? formatOccurrence(blockState.nextRule)
    : currentDomain
      ? "No hay ninguna regla futura para este sitio."
      : "Abre un sitio configurado para ver su proxima regla.";

  siteSummary.textContent = currentDomain
    ? `Sitio actual: ${currentDomain}. Sitios configurados: ${data.siteRules.length}.`
    : data.siteRules.length
      ? `Sitios configurados: ${data.siteRules.map((entry) => entry.domain).join(", ")}`
      : "Anade sitios desde la configuracion.";
}

async function refreshState() {
  const targetUrl = await getActiveTabUrl();
  const response = await sendMessage("get-state", { targetUrl });
  renderState(response);
}

refreshButton.addEventListener("click", refreshState);
openOptionsButton.addEventListener("click", () => chrome.runtime.openOptionsPage());

refreshState();
