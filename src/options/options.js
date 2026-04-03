const storageApi = globalThis.NopeTabStorage || {};

const blockedSitesInput = document.getElementById("blockedSitesInput");
const blockMessageInput = document.getElementById("blockMessageInput");
const emergencyLabelInput = document.getElementById("emergencyLabelInput");
const scheduleList = document.getElementById("scheduleList");
const scheduleEmptyState = document.getElementById("scheduleEmptyState");
const scheduleRowTemplate = document.getElementById("scheduleRowTemplate");
const addRuleButton = document.getElementById("addRuleButton");
const saveButton = document.getElementById("saveButton");
const reloadButton = document.getElementById("reloadButton");
const saveStatus = document.getElementById("saveStatus");

function sendMessage(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, payload });
}

function sanitizeBlockedSites(values) {
  if (typeof storageApi.sanitizeBlockedSites === "function") {
    return storageApi.sanitizeBlockedSites(values);
  }

  const unique = new Set();
  const sites = [];

  for (const value of values || []) {
    if (!value) {
      continue;
    }

    let hostname = String(value).trim().toLowerCase();
    if (!hostname) {
      continue;
    }

    if (/^https?:\/\//.test(hostname)) {
      try {
        hostname = new URL(hostname).hostname.toLowerCase();
      } catch (error) {
        continue;
      }
    } else {
      hostname = hostname.split("/")[0];
    }

    hostname = hostname.replace(/^\*\./, "").replace(/^www\./, "").trim();
    if (!hostname || !hostname.includes(".") || unique.has(hostname)) {
      continue;
    }

    unique.add(hostname);
    sites.push(hostname);
  }

  return sites.sort();
}

function sanitizeBlockWindows(windows) {
  if (typeof storageApi.sanitizeBlockWindows === "function") {
    return storageApi.sanitizeBlockWindows(windows);
  }

  const now = Date.now();
  const normalized = [];

  for (const entry of windows || []) {
    const start = entry && entry.startAt ? new Date(entry.startAt) : null;
    const end = entry && entry.endAt ? new Date(entry.endAt) : null;
    if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      continue;
    }

    const startAtMs = start.getTime();
    const endAtMs = end.getTime();
    if (endAtMs <= startAtMs || endAtMs <= now) {
      continue;
    }

    normalized.push({
      id: `${startAtMs}-${endAtMs}`,
      startAt: toDateTimeLocalString(start),
      endAt: toDateTimeLocalString(end)
    });
  }

  return normalized.sort((left, right) => left.startAt.localeCompare(right.startAt));
}

function sanitizeSettings(settings) {
  if (typeof storageApi.sanitizeSettings === "function") {
    return storageApi.sanitizeSettings(settings);
  }

  return {
    blockMessage:
      settings && typeof settings.blockMessage === "string" && settings.blockMessage.trim()
        ? settings.blockMessage.trim()
        : "¡NOPE!",
    emergencyLabel:
      settings && typeof settings.emergencyLabel === "string" && settings.emergencyLabel.trim()
        ? settings.emergencyLabel.trim()
        : "Necesito entrar igual"
  };
}

function toDateTimeLocalString(date) {
  if (typeof storageApi.toDateTimeLocalString === "function") {
    return storageApi.toDateTimeLocalString(date);
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function createDefaultWindow() {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return {
    startAt: toDateTimeLocalString(start),
    endAt: toDateTimeLocalString(end)
  };
}

function createWindowRow(windowEntry = createDefaultWindow()) {
  const fragment = scheduleRowTemplate.content.cloneNode(true);
  const row = fragment.querySelector(".schedule-row");

  row.querySelector('[data-field="startAt"]').value = windowEntry.startAt;
  row.querySelector('[data-field="endAt"]').value = windowEntry.endAt;

  row.querySelector('[data-action="remove"]').addEventListener("click", () => {
    row.remove();
    updateScheduleEmptyState();
  });

  scheduleList.appendChild(row);
  updateScheduleEmptyState();
}

function updateScheduleEmptyState() {
  scheduleEmptyState.hidden = scheduleList.children.length > 0;
}

function readBlockWindows() {
  const windows = Array.from(scheduleList.querySelectorAll(".schedule-row")).map((row) => ({
    startAt: row.querySelector('[data-field="startAt"]').value,
    endAt: row.querySelector('[data-field="endAt"]').value
  }));

  return sanitizeBlockWindows(windows);
}

function renderOptions(data) {
  blockedSitesInput.value = data.blockedSites.join("\n");
  blockMessageInput.value = data.settings.blockMessage;
  emergencyLabelInput.value = data.settings.emergencyLabel;

  scheduleList.innerHTML = "";
  for (const entry of data.blockWindows) {
    createWindowRow(entry);
  }
  updateScheduleEmptyState();
}

async function loadOptions() {
  const response = await sendMessage("get-state");
  renderOptions(response.data);
  saveStatus.textContent = "Configuracion cargada.";
}

addRuleButton.addEventListener("click", () => createWindowRow());

saveButton.addEventListener("click", async () => {
  const blockedSites = sanitizeBlockedSites(blockedSitesInput.value.split(/\r?\n/));
  const settings = sanitizeSettings({
    blockMessage: blockMessageInput.value,
    emergencyLabel: emergencyLabelInput.value
  });
  const blockWindows = readBlockWindows();

  await sendMessage("save-options", {
    blockedSites,
    blockWindows,
    settings
  });

  saveStatus.textContent = "Cambios guardados correctamente.";
});

reloadButton.addEventListener("click", loadOptions);

loadOptions();
