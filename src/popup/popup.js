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

function formatWindow(windowEntry) {
  if (!windowEntry) {
    return "Sin intervalo activo.";
  }

  const start = parseDateTimeValue(windowEntry.startAt);
  const end = parseDateTimeValue(windowEntry.endAt);
  if (!start || !end) {
    return "Intervalo invalido.";
  }

  return `${start.toLocaleString()} - ${end.toLocaleString()}`;
}

function renderState(snapshot) {
  const { data, blockState } = snapshot;

  statusBadge.textContent = blockState.blocked ? "Bloqueando" : "Libre";
  statusBadge.className = `badge ${blockState.blocked ? "active" : ""}`.trim();

  if (blockState.blocked) {
    stateSummary.textContent = blockState.emergencyUnlocked
      ? "El intervalo actual fue desbloqueado de emergencia."
      : "Hay un bloqueo activo por fecha y hora.";
  } else if (blockState.activeWindow && blockState.emergencyUnlocked) {
    stateSummary.textContent = "Hay un intervalo activo, pero ya fue desbloqueado de emergencia.";
  } else {
    stateSummary.textContent = "No hay bloqueo activo en este momento.";
  }

  windowSummary.textContent = blockState.activeWindow
    ? `Intervalo activo: ${formatWindow(blockState.activeWindow)}`
    : "No hay un intervalo activo ahora.";

  nextWindowSummary.textContent = blockState.nextWindow
    ? formatWindow(blockState.nextWindow)
    : "No hay ningun intervalo futuro configurado.";

  siteSummary.textContent = data.blockedSites.length
    ? `Sitios en la lista: ${data.blockedSites.join(", ")}`
    : "Anade sitios desde la configuracion.";
}

async function refreshState() {
  const response = await sendMessage("get-state");
  renderState(response);
}

refreshButton.addEventListener("click", refreshState);
openOptionsButton.addEventListener("click", () => chrome.runtime.openOptionsPage());

refreshState();
