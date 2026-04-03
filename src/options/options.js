const storageApi = globalThis.NopeTabStorage || {};

const blockMessageInput = document.getElementById("blockMessageInput");
const emergencyLabelInput = document.getElementById("emergencyLabelInput");
const siteSearchInput = document.getElementById("siteSearchInput");
const siteList = document.getElementById("siteList");
const siteEmptyState = document.getElementById("siteEmptyState");
const siteCardTemplate = document.getElementById("siteCardTemplate");
const datetimeRuleTemplate = document.getElementById("datetimeRuleTemplate");
const weeklyRuleTemplate = document.getElementById("weeklyRuleTemplate");
const addSiteButton = document.getElementById("addSiteButton");
const saveButton = document.getElementById("saveButton");
const reloadButton = document.getElementById("reloadButton");
const saveStatus = document.getElementById("saveStatus");

let currentData = null;
let isDirty = false;
let draggedSiteCard = null;
let draggedRuleCard = null;
let draggedRuleOwner = null;

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

function parseTimeValue(value) {
  if (typeof storageApi.parseTimeValue === "function") {
    return storageApi.parseTimeValue(value);
  }

  return null;
}

function normalizeDomain(value) {
  if (typeof storageApi.normalizeDomain === "function") {
    return storageApi.normalizeDomain(value);
  }

  return value ? String(value).trim().toLowerCase() : null;
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

function formatRuleSummary(rule) {
  if (typeof storageApi.formatRuleSummary === "function") {
    return storageApi.formatRuleSummary(rule);
  }

  if (!rule) {
    return "Regla invalida";
  }

  return rule.type === "weekly-hours" ? `${rule.startTime} - ${rule.endTime}` : `${rule.startAt} - ${rule.endAt}`;
}

function formatOccurrenceSummary(occurrence) {
  if (typeof storageApi.formatOccurrenceSummary === "function") {
    return storageApi.formatOccurrenceSummary(occurrence);
  }

  return "Sin reglas futuras";
}

function getSitePreview(siteEntry) {
  if (typeof storageApi.getSitePreview === "function") {
    return storageApi.getSitePreview(siteEntry, (currentData && currentData.emergencyUnlock) || null);
  }

  return {
    blocked: false,
    activeRule: null,
    nextRule: null,
    emergencyUnlocked: false
  };
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

function markDirty(message = "Hay cambios sin guardar.") {
  isDirty = true;
  updateAllSiteCards();
  updateStatus(message);
}

function updateStatus(message) {
  saveStatus.textContent = message;
}

function getDropTarget(container, selector, y, draggingElement) {
  const elements = Array.from(container.querySelectorAll(selector)).filter((element) => element !== draggingElement);

  let bestMatch = null;
  let bestOffset = Number.NEGATIVE_INFINITY;

  for (const element of elements) {
    const rect = element.getBoundingClientRect();
    const offset = y - rect.top - rect.height / 2;
    if (offset < 0 && offset > bestOffset) {
      bestOffset = offset;
      bestMatch = element;
    }
  }

  return bestMatch;
}

function clearDropTargets() {
  for (const element of document.querySelectorAll(".drop-target")) {
    element.classList.remove("drop-target");
  }
}

function setValidationMessages(container, messages) {
  container.innerHTML = "";
  if (!messages.length) {
    container.hidden = true;
    return;
  }

  for (const message of messages) {
    const item = document.createElement("div");
    item.className = "validation-item";
    item.textContent = message;
    container.appendChild(item);
  }

  container.hidden = false;
}

function setInputError(input, active) {
  input.classList.toggle("input-error", Boolean(active));
}

function updateSiteEmptyState() {
  const visibleSiteCards = Array.from(siteList.children).filter((siteCard) => !siteCard.hidden);
  const totalSiteCards = siteList.children.length;

  if (!totalSiteCards) {
    siteEmptyState.hidden = false;
    siteEmptyState.textContent = "Todavia no hay sitios configurados.";
    return;
  }

  siteEmptyState.hidden = visibleSiteCards.length > 0;
  if (!visibleSiteCards.length) {
    siteEmptyState.textContent = "No hay sitios que coincidan con la busqueda.";
  }
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

function readRuleElement(ruleElement) {
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
}

function readSiteDraft(siteCard) {
  return {
    domain: siteCard.querySelector('[data-field="domain"]').value,
    rules: Array.from(siteCard.querySelectorAll(".rule-card")).map(readRuleElement)
  };
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

function getRuleValidation(ruleElement) {
  const now = new Date();
  const rule = readRuleElement(ruleElement);
  const messages = [];
  const invalidFields = [];

  if (rule.type === "datetime-range") {
    const startInput = ruleElement.querySelector('[data-field="startAt"]');
    const endInput = ruleElement.querySelector('[data-field="endAt"]');
    const startDate = parseDateTimeValue(rule.startAt);
    const endDate = parseDateTimeValue(rule.endAt);

    if (!startDate) {
      messages.push("La fecha de inicio no es valida.");
      invalidFields.push(startInput);
    }

    if (!endDate) {
      messages.push("La fecha de fin no es valida.");
      invalidFields.push(endInput);
    }

    if (startDate && endDate && endDate.getTime() <= startDate.getTime()) {
      messages.push("La fecha de fin debe ser posterior al inicio.");
      invalidFields.push(startInput, endInput);
    }

    if (endDate && endDate.getTime() <= now.getTime()) {
      messages.push("La regla termina en el pasado y no se guardara.");
      invalidFields.push(endInput);
    }
  } else {
    const startInput = ruleElement.querySelector('[data-field="startTime"]');
    const endInput = ruleElement.querySelector('[data-field="endTime"]');
    const startTime = parseTimeValue(rule.startTime);
    const endTime = parseTimeValue(rule.endTime);
    const dayInputs = Array.from(ruleElement.querySelectorAll("[data-day]"));

    if (!startTime) {
      messages.push("La hora de inicio no es valida.");
      invalidFields.push(startInput);
    }

    if (!endTime) {
      messages.push("La hora de fin no es valida.");
      invalidFields.push(endInput);
    }

    if (startTime && endTime && startTime.totalMinutes === endTime.totalMinutes) {
      messages.push("La hora de inicio y fin no pueden ser iguales.");
      invalidFields.push(startInput, endInput);
    }

    if (!rule.daysOfWeek.length) {
      messages.push("Selecciona al menos un dia.");
      invalidFields.push(...dayInputs);
    }
  }

  return { rule, messages, invalidFields };
}

function updateRuleCard(ruleElement) {
  const { rule, messages, invalidFields } = getRuleValidation(ruleElement);
  const summaryNode = ruleElement.querySelector('[data-role="rule-summary"]');
  const errorsNode = ruleElement.querySelector('[data-role="rule-errors"]');
  const allInputs = ruleElement.querySelectorAll("input");

  for (const input of allInputs) {
    setInputError(input, invalidFields.includes(input));
  }

  if (!messages.length) {
    const sanitizedRule = typeof storageApi.sanitizeRule === "function" ? storageApi.sanitizeRule(rule) : rule;
    summaryNode.textContent = formatRuleSummary(sanitizedRule || rule);
  } else {
    summaryNode.textContent = "Revisa esta regla antes de guardar";
  }

  setValidationMessages(errorsNode, messages);
  return messages;
}

function updateSiteOverview(siteCard, validRuleCount) {
  const statusBadge = siteCard.querySelector('[data-role="site-status"]');
  const summaryText = siteCard.querySelector('[data-role="site-summary-text"]');
  const nextText = siteCard.querySelector('[data-role="site-next-text"]');
  const draft = readSiteDraft(siteCard);
  const normalizedDomain = normalizeDomain(draft.domain);
  const sanitizedEntries = sanitizeSiteRules([draft]);
  const siteEntry = sanitizedEntries[0] || null;

  if (!normalizedDomain) {
    statusBadge.textContent = "Dominio invalido";
    statusBadge.className = "badge danger";
    summaryText.textContent = "Escribe un dominio valido para activar la vista previa.";
    nextText.textContent = "Todavia no se puede calcular el siguiente bloqueo.";
    return;
  }

  if (!siteEntry || !validRuleCount) {
    statusBadge.textContent = "Sin reglas validas";
    statusBadge.className = "badge warning";
    summaryText.textContent = `El dominio ${normalizedDomain} aun no tiene reglas listas para usarse.`;
    nextText.textContent = "Corrige las reglas para ver su estado y la siguiente ventana.";
    return;
  }

  const preview = getSitePreview(siteEntry);
  if (preview.blocked) {
    statusBadge.textContent = "Bloqueando ahora";
    statusBadge.className = "badge danger";
    summaryText.textContent = `Bloqueado ahora: ${formatRuleSummary(preview.activeRule.rule)}.`;
  } else if (preview.activeRule && preview.emergencyUnlocked) {
    statusBadge.textContent = "Bypass activo";
    statusBadge.className = "badge warning";
    summaryText.textContent = `La regla actual sigue corriendo, pero ${normalizedDomain} esta desbloqueado de emergencia.`;
  } else if (preview.nextRule) {
    statusBadge.textContent = "Listo";
    statusBadge.className = "badge active";
    summaryText.textContent = `${normalizedDomain} no esta bloqueado ahora.`;
  } else {
    statusBadge.textContent = "Sin proximas reglas";
    statusBadge.className = "badge";
    summaryText.textContent = `${normalizedDomain} esta configurado, pero no tiene ventanas futuras.`;
  }

  nextText.textContent = preview.nextRule
    ? formatOccurrenceSummary(preview.nextRule)
    : "No hay ninguna regla futura para este sitio.";
}

function validateSiteCard(siteCard) {
  const siteErrors = [];
  const domainInput = siteCard.querySelector('[data-field="domain"]');
  const siteErrorsNode = siteCard.querySelector('[data-role="site-errors"]');
  const draft = readSiteDraft(siteCard);
  const normalizedDomain = normalizeDomain(draft.domain);
  const ruleCards = Array.from(siteCard.querySelectorAll(".rule-card"));
  let invalidRuleCount = 0;
  let validRuleCount = 0;

  setInputError(domainInput, false);

  if (!normalizedDomain) {
    siteErrors.push("El dominio debe ser valido, por ejemplo youtube.com.");
    setInputError(domainInput, true);
  }

  if (!ruleCards.length) {
    siteErrors.push("Agrega al menos una regla para este sitio.");
  }

  for (const ruleCard of ruleCards) {
    const messages = updateRuleCard(ruleCard);
    if (messages.length) {
      invalidRuleCount += 1;
    } else {
      validRuleCount += 1;
    }
  }

  if (ruleCards.length && !validRuleCount) {
    siteErrors.push("El sitio no tiene ninguna regla valida para guardar.");
  }

  setValidationMessages(siteErrorsNode, siteErrors);
  updateRuleEmptyState(siteCard);
  updateSiteOverview(siteCard, validRuleCount);

  return {
    invalid: siteErrors.length + invalidRuleCount > 0
  };
}

function applySearchFilter() {
  const query = siteSearchInput.value.trim().toLowerCase();

  for (const siteCard of siteList.querySelectorAll(".site-card")) {
    const domainValue = siteCard.querySelector('[data-field="domain"]').value.trim().toLowerCase();
    const summaryValue = siteCard.querySelector('[data-role="site-summary-text"]').textContent.trim().toLowerCase();
    const nextValue = siteCard.querySelector('[data-role="site-next-text"]').textContent.trim().toLowerCase();
    const visible = !query || domainValue.includes(query) || summaryValue.includes(query) || nextValue.includes(query);
    siteCard.hidden = !visible;
  }

  updateSiteEmptyState();
}

function updateSaveAvailability() {
  const siteCards = Array.from(siteList.querySelectorAll(".site-card"));
  const hasInvalidSite = siteCards.some((siteCard) => validateSiteCard(siteCard).invalid);
  saveButton.disabled = hasInvalidSite;

  if (hasInvalidSite) {
    updateStatus("Corrige los errores marcados antes de guardar.");
  } else if (isDirty) {
    updateStatus("Hay cambios sin guardar.");
  }

  applySearchFilter();
}

function updateAllSiteCards() {
  updateSaveAvailability();
}

function createDatetimeRule(siteCard, rule = createDefaultDatetimeRule()) {
  const fragment = datetimeRuleTemplate.content.cloneNode(true);
  const ruleElement = fragment.querySelector(".rule-card");
  ruleElement.querySelector('[data-field="startAt"]').value = rule.startAt || "";
  ruleElement.querySelector('[data-field="endAt"]').value = rule.endAt || "";
  siteCard.querySelector('[data-role="rule-list"]').appendChild(ruleElement);
  updateRuleEmptyState(siteCard);
  updateAllSiteCards();
}

function createWeeklyRule(siteCard, rule = createDefaultWeeklyRule()) {
  const fragment = weeklyRuleTemplate.content.cloneNode(true);
  const ruleElement = fragment.querySelector(".rule-card");
  ruleElement.querySelector('[data-field="startTime"]').value = rule.startTime || "09:00";
  ruleElement.querySelector('[data-field="endTime"]').value = rule.endTime || "18:00";

  for (const input of ruleElement.querySelectorAll("[data-day]")) {
    input.checked = (rule.daysOfWeek || []).includes(Number(input.dataset.day));
  }

  siteCard.querySelector('[data-role="rule-list"]').appendChild(ruleElement);
  updateRuleEmptyState(siteCard);
  updateAllSiteCards();
}

function duplicateRule(siteCard, ruleElement) {
  const rule = readRuleElement(ruleElement);
  if (rule.type === "weekly-hours") {
    createWeeklyRule(siteCard, rule);
  } else {
    createDatetimeRule(siteCard, rule);
  }

  markDirty("Regla duplicada. Revisa el nuevo bloque y guarda cuando quieras.");
}

function createSiteCard(siteEntry = { domain: "", rules: [] }, options = {}) {
  const fragment = siteCardTemplate.content.cloneNode(true);
  const siteCard = fragment.querySelector(".site-card");
  const expanded = options.expanded ?? !(siteEntry.rules || []).length;

  siteCard.querySelector('[data-field="domain"]').value = siteEntry.domain || "";

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
  updateAllSiteCards();
  return siteCard;
}

function readSiteRules() {
  const siteEntries = Array.from(siteList.querySelectorAll(".site-card")).map((siteCard, siteIndex) => ({
    domain: siteCard.querySelector('[data-field="domain"]').value,
    sortOrder: siteIndex,
    rules: Array.from(siteCard.querySelectorAll(".rule-card")).map((ruleElement, ruleIndex) => ({
      ...readRuleElement(ruleElement),
      sortOrder: ruleIndex
    }))
  }));

  return sanitizeSiteRules(siteEntries);
}

function syncVisibleOrderMetadata() {
  Array.from(siteList.querySelectorAll(".site-card")).forEach((siteCard, siteIndex) => {
    siteCard.dataset.sortOrder = String(siteIndex);
    Array.from(siteCard.querySelectorAll(".rule-card")).forEach((ruleCard, ruleIndex) => {
      ruleCard.dataset.sortOrder = String(ruleIndex);
    });
  });
}

function renderOptions(data) {
  blockMessageInput.value = data.settings.blockMessage;
  emergencyLabelInput.value = data.settings.emergencyLabel;
  siteSearchInput.value = "";
  siteList.innerHTML = "";

  for (const entry of data.siteRules) {
    createSiteCard(entry);
  }

  updateSiteEmptyState();
}

async function loadOptions() {
  const response = await sendMessage("get-state");
  currentData = response.data;
  isDirty = false;
  renderOptions(response.data);
  updateStatus("Configuracion cargada.");
}

function handleSiteListClick(event) {
  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) {
    return;
  }

  const siteCard = actionButton.closest(".site-card");
  const ruleElement = actionButton.closest(".rule-card");
  const action = actionButton.dataset.action;

  if (action === "toggle-site" && siteCard) {
    setSiteExpanded(siteCard, siteCard.dataset.expanded !== "true");
    return;
  }

  if (action === "remove-site" && siteCard) {
    siteCard.remove();
    markDirty("Sitio eliminado. Guarda para confirmar el cambio.");
    return;
  }

  if (action === "add-datetime-rule" && siteCard) {
    createDatetimeRule(siteCard);
    markDirty("Nueva regla por fecha agregada.");
    return;
  }

  if (action === "add-weekly-rule" && siteCard) {
    createWeeklyRule(siteCard);
    markDirty("Nuevo horario semanal agregado.");
    return;
  }

  if (action === "remove-rule" && siteCard && ruleElement) {
    ruleElement.remove();
    markDirty("Regla eliminada. Guarda para mantener el nuevo orden.");
    return;
  }

  if (action === "duplicate-rule" && siteCard && ruleElement) {
    duplicateRule(siteCard, ruleElement);
  }
}

function handleSiteListInput() {
  markDirty();
}

function handleDragStart(event) {
  if (!event.target.closest(".drag-handle")) {
    return;
  }

  const ruleCard = event.target.closest(".rule-card");
  if (ruleCard) {
    draggedRuleCard = ruleCard;
    draggedRuleOwner = ruleCard.closest(".site-card");
    draggedRuleCard.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    return;
  }

  const siteCard = event.target.closest(".site-card");
  if (siteCard) {
    draggedSiteCard = siteCard;
    draggedSiteCard.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
  }
}

function handleDragOver(event) {
  const ruleList = event.target.closest('[data-role="rule-list"]');
  if (draggedRuleCard && draggedRuleOwner && ruleList && draggedRuleOwner.contains(ruleList)) {
    event.preventDefault();
    clearDropTargets();
    const dropTarget = getDropTarget(ruleList, ".rule-card", event.clientY, draggedRuleCard);
    if (dropTarget) {
      dropTarget.classList.add("drop-target");
      ruleList.insertBefore(draggedRuleCard, dropTarget);
    } else {
      ruleList.appendChild(draggedRuleCard);
    }
    return;
  }

  if (draggedSiteCard && event.target.closest("#siteList")) {
    event.preventDefault();
    clearDropTargets();
    const dropTarget = getDropTarget(siteList, ".site-card", event.clientY, draggedSiteCard);
    if (dropTarget) {
      dropTarget.classList.add("drop-target");
      siteList.insertBefore(draggedSiteCard, dropTarget);
    } else {
      siteList.appendChild(draggedSiteCard);
    }
  }
}

function handleDragEnd() {
  const movedSite = Boolean(draggedSiteCard);
  const movedRule = Boolean(draggedRuleCard);

  clearDropTargets();

  if (draggedSiteCard) {
    draggedSiteCard.classList.remove("is-dragging");
    draggedSiteCard = null;
  }

  if (draggedRuleCard) {
    draggedRuleCard.classList.remove("is-dragging");
    draggedRuleCard = null;
    draggedRuleOwner = null;
  }

  if (movedSite || movedRule) {
    syncVisibleOrderMetadata();
    markDirty("Orden actualizado. Guarda para conservarlo.");
  }
}

addSiteButton.addEventListener("click", () => {
  const siteCard = createSiteCard(undefined, { expanded: true });
  setSiteExpanded(siteCard, true);
  markDirty("Nuevo sitio agregado.");
});

saveButton.addEventListener("click", async () => {
  syncVisibleOrderMetadata();
  const siteRules = readSiteRules();
  const settings = sanitizeSettings({
    blockMessage: blockMessageInput.value,
    emergencyLabel: emergencyLabelInput.value
  });

  const response = await sendMessage("save-options", {
    siteRules,
    settings
  });

  currentData = response.data;
  isDirty = false;
  renderOptions(response.data);
  updateStatus("Cambios guardados correctamente.");
});

reloadButton.addEventListener("click", loadOptions);
siteSearchInput.addEventListener("input", applySearchFilter);
blockMessageInput.addEventListener("input", handleSiteListInput);
emergencyLabelInput.addEventListener("input", handleSiteListInput);
siteList.addEventListener("click", handleSiteListClick);
siteList.addEventListener("input", handleSiteListInput);
siteList.addEventListener("change", handleSiteListInput);
siteList.addEventListener("dragstart", handleDragStart);
siteList.addEventListener("dragover", handleDragOver);
siteList.addEventListener("dragend", handleDragEnd);
siteList.addEventListener("drop", (event) => event.preventDefault());

loadOptions();
