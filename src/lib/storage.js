const STORAGE_KEY = "nopetab-data";
const BLOCKED_PAGE_PATH = "src/blocked/blocked.html";
const RULE_TYPE_DATETIME_RANGE = "datetime-range";
const RULE_TYPE_WEEKLY_HOURS = "weekly-hours";
const WEEKDAY_LABELS = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];

const DEFAULT_DATA = {
  siteRules: [],
  emergencyUnlock: {
    activeSiteDomain: null,
    activeRuleId: null,
    occurrenceStart: null,
    unlockedAt: null
  },
  settings: {
    blockMessage: "NOPE!",
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
  if (!hostname || !hostname.includes(".")) {
    return null;
  }

  return hostname;
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

function isValidWeekday(value) {
  return Number.isInteger(value) && value >= 0 && value <= 6;
}

function parseTimeValue(value) {
  if (typeof value !== "string") {
    return null;
  }

  const match = value.trim().match(/^(\d{2}):(\d{2})$/);
  if (!match) {
    return null;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return {
    hours,
    minutes,
    totalMinutes: hours * 60 + minutes,
    value: `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
  };
}

function sortWeekdays(daysOfWeek) {
  return [...daysOfWeek].sort((left, right) => left - right);
}

function sanitizeRule(rule, now = new Date()) {
  if (!rule || typeof rule !== "object") {
    return null;
  }

  if (rule.type === RULE_TYPE_DATETIME_RANGE) {
    const startDate = parseDateTimeValue(rule.startAt);
    const endDate = parseDateTimeValue(rule.endAt);
    if (!startDate || !endDate) {
      return null;
    }

    const startAtMs = startDate.getTime();
    const endAtMs = endDate.getTime();
    if (endAtMs <= startAtMs || endAtMs <= now.getTime()) {
      return null;
    }

    return {
      id: typeof rule.id === "string" && rule.id ? rule.id : `${RULE_TYPE_DATETIME_RANGE}-${startAtMs}-${endAtMs}`,
      type: RULE_TYPE_DATETIME_RANGE,
      startAt: toDateTimeLocalString(startDate),
      endAt: toDateTimeLocalString(endDate)
    };
  }

  if (rule.type === RULE_TYPE_WEEKLY_HOURS) {
    const startTime = parseTimeValue(rule.startTime);
    const endTime = parseTimeValue(rule.endTime);
    if (!startTime || !endTime || startTime.totalMinutes === endTime.totalMinutes) {
      return null;
    }

    const uniqueDays = new Set();
    for (const day of rule.daysOfWeek || []) {
      const parsedDay = Number(day);
      if (isValidWeekday(parsedDay)) {
        uniqueDays.add(parsedDay);
      }
    }

    const daysOfWeek = sortWeekdays(Array.from(uniqueDays));
    if (!daysOfWeek.length) {
      return null;
    }

    return {
      id:
        typeof rule.id === "string" && rule.id
          ? rule.id
          : `${RULE_TYPE_WEEKLY_HOURS}-${daysOfWeek.join("-")}-${startTime.value}-${endTime.value}`,
      type: RULE_TYPE_WEEKLY_HOURS,
      daysOfWeek,
      startTime: startTime.value,
      endTime: endTime.value
    };
  }

  return null;
}

function compareRules(left, right) {
  const leftTypeOrder = left.type === RULE_TYPE_DATETIME_RANGE ? 0 : 1;
  const rightTypeOrder = right.type === RULE_TYPE_DATETIME_RANGE ? 0 : 1;
  if (leftTypeOrder !== rightTypeOrder) {
    return leftTypeOrder - rightTypeOrder;
  }

  if (left.type === RULE_TYPE_DATETIME_RANGE && right.type === RULE_TYPE_DATETIME_RANGE) {
    return left.startAt.localeCompare(right.startAt) || left.endAt.localeCompare(right.endAt);
  }

  if (left.type === RULE_TYPE_WEEKLY_HOURS && right.type === RULE_TYPE_WEEKLY_HOURS) {
    return (
      left.daysOfWeek.join(",").localeCompare(right.daysOfWeek.join(",")) ||
      left.startTime.localeCompare(right.startTime) ||
      left.endTime.localeCompare(right.endTime)
    );
  }

  return 0;
}

function sanitizeSiteEntry(entry, now = new Date()) {
  const domain = normalizeDomain(entry && entry.domain);
  if (!domain) {
    return null;
  }

  const rules = [];
  const uniqueRuleIds = new Set();
  for (const rawRule of entry.rules || []) {
    const normalizedRule = sanitizeRule(rawRule, now);
    if (!normalizedRule || uniqueRuleIds.has(normalizedRule.id)) {
      continue;
    }

    uniqueRuleIds.add(normalizedRule.id);
    rules.push(normalizedRule);
  }

  if (!rules.length) {
    return null;
  }

  return {
    domain,
    rules: rules.sort(compareRules)
  };
}

function migrateLegacySiteRules(data) {
  const blockedSites = Array.isArray(data && data.blockedSites) ? data.blockedSites : [];
  const blockWindows = Array.isArray(data && data.blockWindows) ? data.blockWindows : [];
  if (!blockedSites.length || !blockWindows.length) {
    return [];
  }

  const legacyRules = blockWindows.map((entry) => ({
    type: RULE_TYPE_DATETIME_RANGE,
    startAt: entry && entry.startAt,
    endAt: entry && entry.endAt
  }));

  return blockedSites.map((domain) => ({
    domain,
    rules: legacyRules
  }));
}

function sanitizeSiteRules(entries, now = new Date()) {
  const sourceEntries = Array.isArray(entries) ? entries : [];
  const uniqueDomains = new Set();
  const siteRules = [];

  for (const entry of sourceEntries) {
    const normalizedEntry = sanitizeSiteEntry(entry, now);
    if (!normalizedEntry || uniqueDomains.has(normalizedEntry.domain)) {
      continue;
    }

    uniqueDomains.add(normalizedEntry.domain);
    siteRules.push(normalizedEntry);
  }

  return siteRules.sort((left, right) => left.domain.localeCompare(right.domain));
}

function sanitizeEmergencyUnlock(unlock, siteRules) {
  const defaults = cloneDefaultData().emergencyUnlock;
  const activeSiteDomain =
    unlock && typeof unlock.activeSiteDomain === "string" ? normalizeDomain(unlock.activeSiteDomain) : null;
  const activeRuleId = unlock && typeof unlock.activeRuleId === "string" ? unlock.activeRuleId : null;
  const occurrenceStart = unlock && typeof unlock.occurrenceStart === "string" ? unlock.occurrenceStart : null;
  const unlockedAt = unlock ? Number(unlock.unlockedAt) || null : null;

  if (!activeSiteDomain || !activeRuleId || !occurrenceStart || !unlockedAt) {
    return defaults;
  }

  const matchingSite = siteRules.find((entry) => entry.domain === activeSiteDomain);
  if (!matchingSite || !matchingSite.rules.some((rule) => rule.id === activeRuleId)) {
    return defaults;
  }

  return {
    activeSiteDomain,
    activeRuleId,
    occurrenceStart,
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
  const rawSiteRules = Array.isArray(data && data.siteRules) ? data.siteRules : migrateLegacySiteRules(data);
  const siteRules = sanitizeSiteRules(rawSiteRules);

  return {
    siteRules,
    emergencyUnlock: sanitizeEmergencyUnlock((data && data.emergencyUnlock) || defaults.emergencyUnlock, siteRules),
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

function matchesBlockedSite(hostname, domain) {
  const cleanHostname = normalizeDomain(hostname) || String(hostname || "").toLowerCase().replace(/^www\./, "");
  return cleanHostname === domain || cleanHostname.endsWith(`.${domain}`);
}

function getMatchingSiteRule(hostname, siteRules) {
  const matches = (siteRules || []).filter((entry) => matchesBlockedSite(hostname, entry.domain));
  if (!matches.length) {
    return null;
  }

  return matches.sort((left, right) => right.domain.length - left.domain.length)[0];
}

function minutesFromTimeString(value) {
  const parsed = parseTimeValue(value);
  return parsed ? parsed.totalMinutes : null;
}

function addDays(date, days) {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

function startOfDay(date) {
  const next = new Date(date.getTime());
  next.setHours(0, 0, 0, 0);
  return next;
}

function setMinutesIntoDay(date, minutes) {
  const next = startOfDay(date);
  next.setMinutes(minutes, 0, 0);
  return next;
}

function formatRuleDays(daysOfWeek) {
  if (!Array.isArray(daysOfWeek) || !daysOfWeek.length) {
    return "";
  }

  if (daysOfWeek.length === 7) {
    return "todos los dias";
  }

  return daysOfWeek.map((day) => WEEKDAY_LABELS[day]).join(", ");
}

function getDatetimeRuleOccurrence(rule, now = new Date()) {
  const start = parseDateTimeValue(rule.startAt);
  const end = parseDateTimeValue(rule.endAt);
  if (!start || !end) {
    return null;
  }

  const nowMs = now.getTime();
  if (nowMs >= end.getTime()) {
    return null;
  }

  return {
    rule,
    occurrenceStart: rule.startAt,
    occurrenceEnd: rule.endAt,
    start: start.getTime() <= nowMs ? start : start,
    end,
    isActive: nowMs >= start.getTime() && nowMs < end.getTime()
  };
}

function getWeeklyRuleActiveOccurrence(rule, now = new Date()) {
  const startMinutes = minutesFromTimeString(rule.startTime);
  const endMinutes = minutesFromTimeString(rule.endTime);
  if (startMinutes === null || endMinutes === null) {
    return null;
  }

  const overnight = startMinutes > endMinutes;
  const today = startOfDay(now);
  const todayDay = today.getDay();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  if (!overnight) {
    if (!rule.daysOfWeek.includes(todayDay) || currentMinutes < startMinutes || currentMinutes >= endMinutes) {
      return null;
    }

    const start = setMinutesIntoDay(today, startMinutes);
    const end = setMinutesIntoDay(today, endMinutes);
    return {
      rule,
      occurrenceStart: toDateTimeLocalString(start),
      occurrenceEnd: toDateTimeLocalString(end),
      start,
      end,
      isActive: true
    };
  }

  if (rule.daysOfWeek.includes(todayDay) && currentMinutes >= startMinutes) {
    const start = setMinutesIntoDay(today, startMinutes);
    const end = setMinutesIntoDay(addDays(today, 1), endMinutes);
    return {
      rule,
      occurrenceStart: toDateTimeLocalString(start),
      occurrenceEnd: toDateTimeLocalString(end),
      start,
      end,
      isActive: true
    };
  }

  const previousDay = (todayDay + 6) % 7;
  if (rule.daysOfWeek.includes(previousDay) && currentMinutes < endMinutes) {
    const start = setMinutesIntoDay(addDays(today, -1), startMinutes);
    const end = setMinutesIntoDay(today, endMinutes);
    return {
      rule,
      occurrenceStart: toDateTimeLocalString(start),
      occurrenceEnd: toDateTimeLocalString(end),
      start,
      end,
      isActive: true
    };
  }

  return null;
}

function getWeeklyRuleNextOccurrence(rule, now = new Date()) {
  const activeOccurrence = getWeeklyRuleActiveOccurrence(rule, now);
  if (activeOccurrence) {
    return activeOccurrence;
  }

  const startMinutes = minutesFromTimeString(rule.startTime);
  const endMinutes = minutesFromTimeString(rule.endTime);
  if (startMinutes === null || endMinutes === null) {
    return null;
  }

  const overnight = startMinutes > endMinutes;
  const today = startOfDay(now);

  for (let offset = 0; offset < 14; offset += 1) {
    const candidateDay = addDays(today, offset);
    const candidateWeekday = candidateDay.getDay();
    if (!rule.daysOfWeek.includes(candidateWeekday)) {
      continue;
    }

    const start = setMinutesIntoDay(candidateDay, startMinutes);
    const end = overnight ? setMinutesIntoDay(addDays(candidateDay, 1), endMinutes) : setMinutesIntoDay(candidateDay, endMinutes);
    if (start.getTime() > now.getTime()) {
      return {
        rule,
        occurrenceStart: toDateTimeLocalString(start),
        occurrenceEnd: toDateTimeLocalString(end),
        start,
        end,
        isActive: false
      };
    }
  }

  return null;
}

function getRuleOccurrence(rule, now = new Date()) {
  if (!rule) {
    return null;
  }

  if (rule.type === RULE_TYPE_DATETIME_RANGE) {
    return getDatetimeRuleOccurrence(rule, now);
  }

  if (rule.type === RULE_TYPE_WEEKLY_HOURS) {
    return getWeeklyRuleNextOccurrence(rule, now);
  }

  return null;
}

function getActiveRule(siteEntry, now = new Date()) {
  if (!siteEntry || !Array.isArray(siteEntry.rules)) {
    return null;
  }

  for (const rule of siteEntry.rules) {
    const occurrence = getRuleOccurrence(rule, now);
    if (occurrence && occurrence.isActive) {
      return occurrence;
    }
  }

  return null;
}

function getNextRule(siteEntry, now = new Date()) {
  if (!siteEntry || !Array.isArray(siteEntry.rules)) {
    return null;
  }

  const candidates = [];
  for (const rule of siteEntry.rules) {
    const occurrence = getRuleOccurrence(rule, now);
    if (!occurrence || occurrence.isActive) {
      continue;
    }
    candidates.push(occurrence);
  }

  candidates.sort((left, right) => left.start.getTime() - right.start.getTime());
  return candidates[0] || null;
}

function getBlockState(data, hostname, now = new Date()) {
  const siteEntry = hostname ? getMatchingSiteRule(hostname, data.siteRules) : null;
  const activeRule = siteEntry ? getActiveRule(siteEntry, now) : null;
  const emergencyUnlocked = Boolean(
    activeRule &&
      data.emergencyUnlock.activeSiteDomain === siteEntry.domain &&
      data.emergencyUnlock.activeRuleId === activeRule.rule.id &&
      data.emergencyUnlock.occurrenceStart === activeRule.occurrenceStart
  );

  return {
    hostname: hostname || null,
    siteEntry,
    blocked: Boolean(activeRule) && !emergencyUnlocked,
    reason: activeRule ? activeRule.rule.type : "none",
    activeRule,
    nextRule: siteEntry ? getNextRule(siteEntry, now) : null,
    emergencyUnlocked
  };
}

function getBlockedPageUrl(targetUrl) {
  const url = new URL(chrome.runtime.getURL(BLOCKED_PAGE_PATH));
  url.searchParams.set("target", targetUrl);
  return url.toString();
}

globalThis.NopeTabStorage = {
  STORAGE_KEY,
  BLOCKED_PAGE_PATH,
  RULE_TYPE_DATETIME_RANGE,
  RULE_TYPE_WEEKLY_HOURS,
  WEEKDAY_LABELS,
  DEFAULT_DATA,
  cloneDefaultData,
  normalizeDomain,
  parseDateTimeValue,
  parseTimeValue,
  toDateTimeLocalString,
  formatRuleDays,
  sanitizeRule,
  sanitizeSiteRules,
  sanitizeSettings,
  sanitizeData,
  getData,
  setData,
  updateData,
  matchesBlockedSite,
  getMatchingSiteRule,
  getRuleOccurrence,
  getActiveRule,
  getNextRule,
  getBlockState,
  getBlockedPageUrl
};
