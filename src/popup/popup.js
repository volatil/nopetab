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
  const currentDomain = blockState.matchedDomain || null;
  const currentGroup = blockState.groupEntry || null;
  const groupDomainSummary = currentGroup ? currentGroup.domains.join(", ") : null;

  statusBadge.textContent = blockState.blocked ? "Bloque activo" : "En calma";
  statusBadge.className = `badge ${blockState.blocked ? "danger" : "active"}`.trim();

  if (blockState.blocked) {
    stateSummary.textContent = blockState.emergencyUnlocked
      ? "Esta ventana ya fue abierta con desbloqueo de emergencia durante la regla actual."
      : "El sitio actual cayo dentro de una ventana activa y NopeTab lo esta sosteniendo por ti.";
  } else if (blockState.activeRule && blockState.emergencyUnlocked) {
    stateSummary.textContent = "La regla sigue corriendo, pero este sitio ya fue liberado de emergencia.";
  } else if (currentDomain) {
    stateSummary.textContent = "La web actual pertenece a un grupo configurado, pero ahora mismo no tiene un bloqueo activo.";
  } else {
    stateSummary.textContent = "Esta web todavia no forma parte de ningun grupo configurado.";
  }

  windowSummary.textContent = blockState.activeRule
    ? `Ventana activa: ${formatOccurrence(blockState.activeRule)}`
    : "No hay una ventana activa para esta web en este momento.";

  nextWindowSummary.textContent = blockState.nextRule
    ? formatOccurrence(blockState.nextRule)
    : currentDomain
      ? "Este grupo no tiene otra ventana futura por ahora."
      : "Abre una web que pertenezca a un grupo para ver la siguiente ventana.";

  siteSummary.textContent = currentDomain
    ? `Web actual: ${currentDomain}. Grupo compartido: ${groupDomainSummary}. Grupos configurados: ${data.ruleGroups.length}.`
    : data.ruleGroups.length
      ? `Grupos disponibles: ${data.ruleGroups.map((entry) => entry.domains.join(", ")).join(" | ")}`
      : "Crea tu primer grupo desde la configuracion para empezar a bloquear con criterio.";
}

async function refreshState() {
  const targetUrl = await getActiveTabUrl();
  const response = await sendMessage("get-state", { targetUrl });
  renderState(response);
}

refreshButton.addEventListener("click", refreshState);
openOptionsButton.addEventListener("click", () => chrome.runtime.openOptionsPage());

refreshState();
