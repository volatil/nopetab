const storageApi = globalThis.NopeTabStorage || {};

const blockMessageInput = document.getElementById("blockMessageInput");
const emergencyLabelInput = document.getElementById("emergencyLabelInput");
const siteList = document.getElementById("siteList");
const siteEmptyState = document.getElementById("siteEmptyState");
const siteCardTemplate = document.getElementById("siteCardTemplate");
const datetimeRuleTemplate = document.getElementById("datetimeRuleTemplate");
const weeklyRuleTemplate = document.getElementById("weeklyRuleTemplate");
const addSiteButton = document.getElementById("addSiteButton");
const saveButton = document.getElementById("saveButton");
const reloadButton = document.getElementById("reloadButton");
const saveStatus = document.getElementById("saveStatus");

function sendMessage(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, payload });
}

function sanitizeSiteRules(entries) {
  if (typeof storageApi.sanitizeSiteRules === "function") {
    return storageApi.sanitizeSiteRules(entries);
  }

  return entries || [];
}

function sanitizeSettings(settings) {
  if (typeof storageApi.sanitizeSettings === "function") {
    return storageApi.sanitizeSettings(settings);
  }

  return settings || {};
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

function createDefaultDatetimeRule() {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return {
    type: "datetime-range",
    startAt: toDateTimeLocalString(start),
    endAt: toDateTimeLocalString(end)
  };
}

function createDefaultWeeklyRule() {
  return {
    type: "weekly-hours",
    startTime: "09:00",
    endTime: "18:00",
    daysOfWeek: [1, 2, 3, 4, 5]
  };
}

function updateSiteEmptyState() {
  siteEmptyState.hidden = siteList.children.length > 0;
}

function formatRuleCount(count) {
  return `${count} ${count === 1 ? "regla" : "reglas"}`;
}

function setSiteExpanded(siteCard, expanded) {
  const toggleButton = siteCard.querySelector('[data-action="toggle-site"]');
  const sitePanel = siteCard.querySelector('[data-role="site-panel"]');
  siteCard.dataset.expanded = expanded ? "true" : "false";
  toggleButton.textContent = expanded ? "Ocultar reglas" : "Ver reglas";
  toggleButton.setAttribute("aria-expanded", expanded ? "true" : "false");
  sitePanel.hidden = !expanded;
}

function updateRuleCount(siteCard) {
  const ruleCount = siteCard.querySelectorAll(".rule-card").length;
  siteCard.querySelector('[data-role="rule-count"]').textContent = formatRuleCount(ruleCount);
}

function updateRuleEmptyState(siteCard) {
  const ruleList = siteCard.querySelector('[data-role="rule-list"]');
  const emptyState = siteCard.querySelector('[data-role="rule-empty"]');
  emptyState.hidden = ruleList.children.length > 0;
  updateRuleCount(siteCard);
}

function attachRuleRemoval(ruleElement, siteCard) {
  ruleElement.querySelector('[data-action="remove-rule"]').addEventListener("click", () => {
    ruleElement.remove();
    updateRuleEmptyState(siteCard);
  });
}

function createDatetimeRule(siteCard, rule = createDefaultDatetimeRule()) {
  const fragment = datetimeRuleTemplate.content.cloneNode(true);
  const ruleElement = fragment.querySelector(".rule-card");
  ruleElement.querySelector('[data-field="startAt"]').value = rule.startAt || "";
  ruleElement.querySelector('[data-field="endAt"]').value = rule.endAt || "";
  attachRuleRemoval(ruleElement, siteCard);
  siteCard.querySelector('[data-role="rule-list"]').appendChild(ruleElement);
  updateRuleEmptyState(siteCard);
}

function createWeeklyRule(siteCard, rule = createDefaultWeeklyRule()) {
  const fragment = weeklyRuleTemplate.content.cloneNode(true);
  const ruleElement = fragment.querySelector(".rule-card");
  ruleElement.querySelector('[data-field="startTime"]').value = rule.startTime || "09:00";
  ruleElement.querySelector('[data-field="endTime"]').value = rule.endTime || "18:00";

  for (const input of ruleElement.querySelectorAll("[data-day]")) {
    input.checked = (rule.daysOfWeek || []).includes(Number(input.dataset.day));
  }

  attachRuleRemoval(ruleElement, siteCard);
  siteCard.querySelector('[data-role="rule-list"]').appendChild(ruleElement);
  updateRuleEmptyState(siteCard);
}

function createSiteCard(siteEntry = { domain: "", rules: [] }, options = {}) {
  const fragment = siteCardTemplate.content.cloneNode(true);
  const siteCard = fragment.querySelector(".site-card");
  const expanded = options.expanded ?? !(siteEntry.rules || []).length;

  siteCard.querySelector('[data-field="domain"]').value = siteEntry.domain || "";

  siteCard.querySelector('[data-action="remove-site"]').addEventListener("click", () => {
    siteCard.remove();
    updateSiteEmptyState();
  });

  siteCard.querySelector('[data-action="toggle-site"]').addEventListener("click", () => {
    setSiteExpanded(siteCard, siteCard.dataset.expanded !== "true");
  });

  siteCard.querySelector('[data-action="add-datetime-rule"]').addEventListener("click", () => {
    createDatetimeRule(siteCard);
  });

  siteCard.querySelector('[data-action="add-weekly-rule"]').addEventListener("click", () => {
    createWeeklyRule(siteCard);
  });

  for (const rule of siteEntry.rules || []) {
    if (rule.type === "weekly-hours") {
      createWeeklyRule(siteCard, rule);
    } else {
      createDatetimeRule(siteCard, rule);
    }
  }

  updateRuleEmptyState(siteCard);
  setSiteExpanded(siteCard, expanded);
  siteList.appendChild(siteCard);
  updateSiteEmptyState();
}

function readSiteRules() {
  const siteEntries = Array.from(siteList.querySelectorAll(".site-card")).map((siteCard) => {
    const domain = siteCard.querySelector('[data-field="domain"]').value;
    const rules = Array.from(siteCard.querySelectorAll(".rule-card")).map((ruleElement) => {
      if (ruleElement.dataset.ruleType === "weekly-hours") {
        return {
          type: "weekly-hours",
          startTime: ruleElement.querySelector('[data-field="startTime"]').value,
          endTime: ruleElement.querySelector('[data-field="endTime"]').value,
          daysOfWeek: Array.from(ruleElement.querySelectorAll("[data-day]"))
            .filter((input) => input.checked)
            .map((input) => Number(input.dataset.day))
        };
      }

      return {
        type: "datetime-range",
        startAt: ruleElement.querySelector('[data-field="startAt"]').value,
        endAt: ruleElement.querySelector('[data-field="endAt"]').value
      };
    });

    return { domain, rules };
  });

  return sanitizeSiteRules(siteEntries);
}

function renderOptions(data) {
  blockMessageInput.value = data.settings.blockMessage;
  emergencyLabelInput.value = data.settings.emergencyLabel;

  siteList.innerHTML = "";
  for (const entry of data.siteRules) {
    createSiteCard(entry);
  }
  updateSiteEmptyState();
}

async function loadOptions() {
  const response = await sendMessage("get-state");
  renderOptions(response.data);
  saveStatus.textContent = "Configuracion cargada.";
}

addSiteButton.addEventListener("click", () => createSiteCard());

saveButton.addEventListener("click", async () => {
  const siteRules = readSiteRules();
  const settings = sanitizeSettings({
    blockMessage: blockMessageInput.value,
    emergencyLabel: emergencyLabelInput.value
  });

  await sendMessage("save-options", {
    siteRules,
    settings
  });

  saveStatus.textContent = "Cambios guardados correctamente.";
  await loadOptions();
});

reloadButton.addEventListener("click", loadOptions);

loadOptions();
