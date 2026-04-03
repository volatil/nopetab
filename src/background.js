const STORAGE_KEY = "nopetab-data";
const BLOCKED_PAGE_PATH = "src/blocked/blocked.html";

const DEFAULT_DATA = {
  blockedSites: [],
  blockWindows: [],
  emergencyUnlock: {
    activeWindowId: null,
    unlockedAt: null
  },
  settings: {
    blockMessage: "¡NOPE!",
    emergencyLabel: "Necesito entrar igual"
  }
};

function cloneDefaultData() {
  return JSON.parse(JSON.stringify(DEFAULT_DATA));
}

function normalizeDomain(rawValue) {
  if (!rawValue) {
    return null;
  }

  const trimmed = String(rawValue).trim().toLowerCase();
  if (!trimmed) {
    return null;
  }

  let hostname = trimmed;
  if (/^https?:\/\//.test(trimmed)) {
    try {
      hostname = new URL(trimmed).hostname.toLowerCase();
    } catch (error) {
      return null;
    }
  } else {
    hostname = trimmed.split("/")[0];
  }

  hostname = hostname.replace(/^\*\./, "").replace(/^www\./, "").trim();
  if (!hostname || hostname.indexOf(".") === -1) {
    return null;
  }

  return hostname;
}

function sanitizeBlockedSites(values) {
  const unique = new Set();
  const sites = [];

  for (const value of values || []) {
    const normalized = normalizeDomain(value);
    if (!normalized || unique.has(normalized)) {
      continue;
    }

    unique.add(normalized);
    sites.push(normalized);
  }

  return sites.sort();
}

function parseDateTimeValue(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function toDateTimeLocalString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function sanitizeBlockWindows(windows) {
  const now = Date.now();
  const normalized = [];

  for (const entry of windows || []) {
    const startDate = parseDateTimeValue(entry && entry.startAt);
    const endDate = parseDateTimeValue(entry && entry.endAt);
    if (!startDate || !endDate) {
      continue;
    }

    const startAtMs = startDate.getTime();
    const endAtMs = endDate.getTime();
    if (endAtMs <= startAtMs || endAtMs <= now) {
      continue;
    }

    normalized.push({
      id: (entry && entry.id) || `${startAtMs}-${endAtMs}`,
      startAt: toDateTimeLocalString(startDate),
      endAt: toDateTimeLocalString(endDate)
    });
  }

  return normalized.sort((left, right) => left.startAt.localeCompare(right.startAt));
}

function sanitizeEmergencyUnlock(unlock, blockWindows) {
  const activeWindowId = unlock && typeof unlock.activeWindowId === "string" ? unlock.activeWindowId : null;
  const unlockedAt = unlock ? Number(unlock.unlockedAt) || null : null;

  if (!activeWindowId || !unlockedAt) {
    return cloneDefaultData().emergencyUnlock;
  }

  const stillExists = blockWindows.some((entry) => entry.id === activeWindowId);
  if (!stillExists) {
    return cloneDefaultData().emergencyUnlock;
  }

  return {
    activeWindowId,
    unlockedAt
  };
}

function sanitizeSettings(settings) {
  const defaults = cloneDefaultData().settings;
  const message = settings && typeof settings.blockMessage === "string" ? settings.blockMessage.trim() : "";
  const label = settings && typeof settings.emergencyLabel === "string" ? settings.emergencyLabel.trim() : "";

  return {
    blockMessage: message || defaults.blockMessage,
    emergencyLabel: label || defaults.emergencyLabel
  };
}

function sanitizeData(data) {
  const defaults = cloneDefaultData();
  const blockWindows = sanitizeBlockWindows((data && data.blockWindows) || defaults.blockWindows);

  return {
    blockedSites: sanitizeBlockedSites((data && data.blockedSites) || defaults.blockedSites),
    blockWindows,
    emergencyUnlock: sanitizeEmergencyUnlock((data && data.emergencyUnlock) || defaults.emergencyUnlock, blockWindows),
    settings: sanitizeSettings((data && data.settings) || defaults.settings)
  };
}

async function getData() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const merged = sanitizeData(stored[STORAGE_KEY] || cloneDefaultData());

  if (!stored[STORAGE_KEY]) {
    await setData(merged);
  }

  return merged;
}

async function setData(data) {
  const sanitized = sanitizeData(data);
  await chrome.storage.local.set({ [STORAGE_KEY]: sanitized });
  return sanitized;
}

async function updateData(updater) {
  const current = await getData();
  const nextValue = await updater(current);
  return setData(nextValue);
}

function matchesBlockedSite(hostname, blockedSites) {
  const cleanHostname = normalizeDomain(hostname) || String(hostname).toLowerCase().replace(/^www\./, "");
  return blockedSites.some((domain) => cleanHostname === domain || cleanHostname.endsWith(`.${domain}`));
}

function getActiveWindow(blockWindows, now = new Date()) {
  const nowMs = now.getTime();

  for (const entry of blockWindows || []) {
    const startAt = parseDateTimeValue(entry.startAt);
    const endAt = parseDateTimeValue(entry.endAt);
    if (!startAt || !endAt) {
      continue;
    }

    if (nowMs >= startAt.getTime() && nowMs < endAt.getTime()) {
      return entry;
    }
  }

  return null;
}

function getNextWindow(blockWindows, now = new Date()) {
  const nowMs = now.getTime();

  for (const entry of blockWindows || []) {
    const startAt = parseDateTimeValue(entry.startAt);
    if (startAt && startAt.getTime() > nowMs) {
      return entry;
    }
  }

  return null;
}

function getBlockState(data, now = new Date()) {
  const activeWindow = getActiveWindow(data.blockWindows, now);
  const unlockedForWindow = Boolean(
    activeWindow &&
      data.emergencyUnlock.activeWindowId &&
      data.emergencyUnlock.activeWindowId === activeWindow.id
  );

  return {
    blocked: Boolean(activeWindow) && !unlockedForWindow,
    reason: activeWindow ? "date-window" : "none",
    activeWindow,
    nextWindow: getNextWindow(data.blockWindows, now),
    emergencyUnlocked: unlockedForWindow
  };
}

function getBlockedPageUrl(targetUrl) {
  const url = new URL(chrome.runtime.getURL(BLOCKED_PAGE_PATH));
  url.searchParams.set("target", targetUrl);
  return url.toString();
}

async function maybeRedirectTab(tabId, tabUrl) {
  if (!tabUrl || !/^https?:/i.test(tabUrl)) {
    return;
  }

  const data = await getData();
  const hostname = new URL(tabUrl).hostname;
  if (!matchesBlockedSite(hostname, data.blockedSites)) {
    return;
  }

  const blockState = getBlockState(data);
  if (!blockState.blocked) {
    return;
  }

  const destination = getBlockedPageUrl(tabUrl);
  if (tabUrl === destination) {
    return;
  }

  await chrome.tabs.update(tabId, { url: destination });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "loading" && tab.url) {
    maybeRedirectTab(tabId, tab.url);
  }
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId);
  if (tab.url) {
    maybeRedirectTab(activeInfo.tabId, tab.url);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const action = message && message.type;

  (async () => {
    if (action === "get-state") {
      const data = await getData();
      sendResponse({ ok: true, data, blockState: getBlockState(data) });
      return;
    }

    if (action === "save-options") {
      const nextData = await updateData((data) => ({
        blockedSites: message.payload.blockedSites,
        blockWindows: message.payload.blockWindows,
        settings: {
          blockMessage: message.payload.settings.blockMessage,
          emergencyLabel: message.payload.settings.emergencyLabel
        },
        emergencyUnlock: {
          activeWindowId: null,
          unlockedAt: null
        }
      }));
      sendResponse({ ok: true, data: nextData, blockState: getBlockState(nextData) });
      return;
    }

    if (action === "emergency-unlock") {
      const currentData = await getData();
      const blockState = getBlockState(currentData);
      if (!blockState.activeWindow) {
        sendResponse({ ok: false, error: "emergency-unlock-not-available" });
        return;
      }

      const nextData = await updateData((data) => ({
        blockedSites: data.blockedSites,
        blockWindows: data.blockWindows,
        settings: data.settings,
        emergencyUnlock: {
          activeWindowId: blockState.activeWindow.id,
          unlockedAt: Date.now()
        }
      }));
      sendResponse({ ok: true, data: nextData, blockState: getBlockState(nextData) });
      return;
    }

    if (action === "open-target-tab") {
      const target = message && message.payload ? message.payload.targetUrl : null;
      if (!target) {
        sendResponse({ ok: false, error: "missing-target" });
        return;
      }

      if (sender.tab && sender.tab.id) {
        await chrome.tabs.update(sender.tab.id, { url: target });
      } else {
        await chrome.tabs.create({ url: target });
      }

      sendResponse({ ok: true });
      return;
    }

    sendResponse({ ok: false, error: "unknown-action" });
  })().catch((error) => {
    console.error("NopeTab action failed", action, error);
    sendResponse({ ok: false, error: String(error) });
  });

  return true;
});
