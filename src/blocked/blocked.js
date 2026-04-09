const storageApi = globalThis.NopeTabStorage || {};

const reasonText = document.getElementById("reasonText");
const detailText = document.getElementById("detailText");
const messageText = document.getElementById("messageText");
const countdownPanel = document.getElementById("countdownPanel");
const countdownValue = document.getElementById("countdownValue");
const countdownDeadlineText = document.getElementById("countdownDeadlineText");
const targetText = document.getElementById("targetText");
const retryHintText = document.getElementById("retryHintText");
const emergencyButton = document.getElementById("emergencyButton");
const retryLink = document.getElementById("retryLink");
const closeButton = document.getElementById("closeButton");

let countdownIntervalId = null;
let countdownDeadlineMs = null;
let autoRetryInProgress = false;

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

function clearCountdownTimer() {
  if (countdownIntervalId !== null) {
    window.clearInterval(countdownIntervalId);
    countdownIntervalId = null;
  }
}

function hideCountdown() {
  clearCountdownTimer();
  countdownDeadlineMs = null;
  countdownPanel.hidden = true;
  countdownValue.textContent = "--:--";
  countdownDeadlineText.textContent = "";
}

function formatDurationParts(totalSeconds) {
  const safeSeconds = Math.max(0, totalSeconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
  }

  return `${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}

function renderCountdownValue() {
  if (countdownDeadlineMs === null) {
    return;
  }

  const remainingSeconds = Math.max(0, Math.ceil((countdownDeadlineMs - Date.now()) / 1000));
  countdownValue.textContent = formatDurationParts(remainingSeconds);
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

async function attemptAutoRetry(targetUrl) {
  if (autoRetryInProgress || !hasValidTargetUrl(targetUrl)) {
    return;
  }

  autoRetryInProgress = true;

  try {
    const response = await sendMessage("get-state", { targetUrl });
    if (response && response.ok && response.blockState && !response.blockState.blocked) {
      await sendMessage("open-target-tab", { targetUrl });
      return;
    }

    await loadBlockedState();
  } catch (error) {
    console.error("NopeTab auto retry failed", error);
    await loadBlockedState();
  } finally {
    autoRetryInProgress = false;
  }
}

function startCountdown(deadline, targetUrl) {
  clearCountdownTimer();

  if (!(deadline instanceof Date) || Number.isNaN(deadline.getTime())) {
    hideCountdown();
    return;
  }

  countdownDeadlineMs = deadline.getTime();
  countdownPanel.hidden = false;
  countdownDeadlineText.textContent = `Se desbloquea a las ${deadline.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  })}.`;
  renderCountdownValue();

  countdownIntervalId = window.setInterval(async () => {
    if (countdownDeadlineMs === null) {
      clearCountdownTimer();
      return;
    }

    const remainingMs = countdownDeadlineMs - Date.now();
    if (remainingMs <= 0) {
      clearCountdownTimer();
      countdownValue.textContent = "00m 00s";
      await attemptAutoRetry(targetUrl);
      return;
    }

    renderCountdownValue();
  }, 1000);
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
    hideCountdown();
    reasonText.textContent = `El acceso a ${targetHost} esta bloqueado en este momento.`;
    detailText.textContent = "No se pudo verificar la URL original que intentaste abrir.";
    targetText.textContent = "No hay una direccion valida disponible para volver a intentar.";
    emergencyButton.disabled = true;
    emergencyButton.title = "No hay una URL valida para aplicar el desbloqueo de emergencia.";
    return;
  }

  const response = await sendMessage("get-state", { targetUrl });
  const activeRule = response.blockState.activeRule;
  const currentDomain = response.blockState.matchedDomain || targetHost;
  const currentGroup = response.blockState.groupEntry ? response.blockState.groupEntry.domains.join(", ") : currentDomain;

  reasonText.textContent = `El acceso a ${currentDomain} esta bloqueado en este momento.`;
  detailText.textContent = activeRule
    ? formatOccurrence(activeRule)
    : `La web coincide con un grupo configurado (${currentGroup}).`;
  messageText.textContent = response.data.settings.blockMessage;
  targetText.textContent = `Intentaste abrir ${targetHost}.`;
  emergencyButton.textContent = response.data.settings.emergencyLabel;

  if (!activeRule || response.blockState.emergencyUnlocked) {
    hideCountdown();
    emergencyButton.disabled = true;
    emergencyButton.title = "El desbloqueo de emergencia solo aplica a la regla activa actual de este sitio.";
  } else {
    const activeEnd = parseDateTimeValue(activeRule.occurrenceEnd);
    startCountdown(activeEnd, targetUrl);
    emergencyButton.disabled = false;
    emergencyButton.title = "";
  }
}

retryLink.addEventListener("click", async () => {
  const targetUrl = parseTargetUrl();
  if (!hasValidTargetUrl(targetUrl)) {
    return;
  }
  await attemptAutoRetry(targetUrl);
});

emergencyButton.addEventListener("click", async () => {
  const targetUrl = parseTargetUrl();
  const response = await sendMessage("emergency-unlock", { targetUrl });
  if (response && response.ok && targetUrl) {
    await sendMessage("open-target-tab", { targetUrl });
  }
});

closeButton.addEventListener("click", () => window.close());
window.addEventListener("beforeunload", clearCountdownTimer);

loadBlockedState();
