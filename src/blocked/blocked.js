const storageApi = globalThis.NopeTabStorage || {};

const reasonText = document.getElementById("reasonText");
const messageText = document.getElementById("messageText");
const targetText = document.getElementById("targetText");
const emergencyButton = document.getElementById("emergencyButton");
const closeButton = document.getElementById("closeButton");

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

function parseTargetUrl() {
  const currentUrl = new URL(window.location.href);
  return currentUrl.searchParams.get("target");
}

function formatWindow(windowEntry) {
  if (!windowEntry) {
    return "No hay intervalo activo.";
  }

  const start = parseDateTimeValue(windowEntry.startAt);
  const end = parseDateTimeValue(windowEntry.endAt);
  if (!start || !end) {
    return "Intervalo invalido.";
  }

  return `${start.toLocaleString()} - ${end.toLocaleString()}`;
}

async function loadBlockedState() {
  const response = await sendMessage("get-state");
  const targetUrl = parseTargetUrl();
  const targetHost = targetUrl ? new URL(targetUrl).hostname : "el sitio que intentaste abrir";

  reasonText.textContent = response.blockState.activeWindow
    ? `Este sitio esta bloqueado durante el intervalo ${formatWindow(response.blockState.activeWindow)}.`
    : "Este sitio forma parte de tu lista de distracciones.";
  messageText.textContent = response.data.settings.blockMessage;
  targetText.textContent = `Intentaste abrir ${targetHost}.`;
  emergencyButton.textContent = response.data.settings.emergencyLabel;

  if (!response.blockState.activeWindow || response.blockState.emergencyUnlocked) {
    emergencyButton.disabled = true;
    emergencyButton.title = "El desbloqueo de emergencia solo aplica al intervalo activo actual.";
  }
}

emergencyButton.addEventListener("click", async () => {
  const targetUrl = parseTargetUrl();
  const response = await sendMessage("emergency-unlock");
  if (response && response.ok && targetUrl) {
    await sendMessage("open-target-tab", { targetUrl });
  }
});

closeButton.addEventListener("click", () => window.close());

loadBlockedState();
