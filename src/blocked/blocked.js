const storageApi = globalThis.NopeTabStorage || {};

const reasonText = document.getElementById("reasonText");
const detailText = document.getElementById("detailText");
const messageText = document.getElementById("messageText");
const targetText = document.getElementById("targetText");
const retryHintText = document.getElementById("retryHintText");
const emergencyButton = document.getElementById("emergencyButton");
const retryLink = document.getElementById("retryLink");
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

function getTargetHost(targetUrl) {
  if (!targetUrl) {
    return "el sitio que intentaste abrir";
  }

  try {
    return new URL(targetUrl).hostname;
  } catch (error) {
    return "el sitio que intentaste abrir";
  }
}

function hasValidTargetUrl(targetUrl) {
  if (!targetUrl) {
    return false;
  }

  try {
    const parsed = new URL(targetUrl);
    return /^https?:$/i.test(parsed.protocol);
  } catch (error) {
    return false;
  }
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
    return `Horario semanal (${daySummary}) desde ${start.toLocaleString()} hasta ${end.toLocaleString()}.`;
  }

  return `Intervalo puntual desde ${start.toLocaleString()} hasta ${end.toLocaleString()}.`;
}

async function loadBlockedState() {
  const targetUrl = parseTargetUrl();
  const canRetry = hasValidTargetUrl(targetUrl);
  const targetHost = getTargetHost(targetUrl);
  retryLink.hidden = !canRetry;
  retryLink.disabled = !canRetry;
  retryHintText.textContent = canRetry
    ? "Cuando termine el bloqueo, usa este link para volver a cargar la pagina original."
    : "No se pudo recuperar una direccion valida para reintentar la navegacion.";

  if (!canRetry) {
    reasonText.textContent = `El acceso a ${targetHost} esta bloqueado en este momento.`;
    detailText.textContent = "No se pudo verificar la URL original que intentaste abrir.";
    targetText.textContent = "No hay una direccion valida disponible para volver a intentar.";
    emergencyButton.disabled = true;
    emergencyButton.title = "No hay una URL valida para aplicar el desbloqueo de emergencia.";
    return;
  }

  const response = await sendMessage("get-state", { targetUrl });
  const activeRule = response.blockState.activeRule;
  const currentDomain = response.blockState.siteEntry ? response.blockState.siteEntry.domain : targetHost;

  reasonText.textContent = `El acceso a ${currentDomain} esta bloqueado en este momento.`;
  detailText.textContent = activeRule
    ? formatOccurrence(activeRule)
    : "El sitio coincide con una regla configurada.";
  messageText.textContent = response.data.settings.blockMessage;
  targetText.textContent = `Intentaste abrir ${targetHost}.`;
  emergencyButton.textContent = response.data.settings.emergencyLabel;

  if (!activeRule || response.blockState.emergencyUnlocked) {
    emergencyButton.disabled = true;
    emergencyButton.title = "El desbloqueo de emergencia solo aplica a la regla activa actual de este sitio.";
  } else {
    emergencyButton.disabled = false;
    emergencyButton.title = "";
  }
}

retryLink.addEventListener("click", async () => {
  const targetUrl = parseTargetUrl();
  if (!hasValidTargetUrl(targetUrl)) {
    return;
  }

  const response = await sendMessage("get-state", { targetUrl });
  if (response && response.ok && response.blockState && !response.blockState.blocked) {
    await sendMessage("open-target-tab", { targetUrl });
    return;
  }

  await loadBlockedState();
});

emergencyButton.addEventListener("click", async () => {
  const targetUrl = parseTargetUrl();
  const response = await sendMessage("emergency-unlock", { targetUrl });
  if (response && response.ok && targetUrl) {
    await sendMessage("open-target-tab", { targetUrl });
  }
});

closeButton.addEventListener("click", () => window.close());

loadBlockedState();
