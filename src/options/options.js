const storageApi = globalThis.NopeTabStorage || {};

const blockMessageInput = document.getElementById("blockMessageInput");
const emergencyLabelInput = document.getElementById("emergencyLabelInput");
const groupSearchInput = document.getElementById("groupSearchInput");
const groupList = document.getElementById("groupList");
const groupEmptyState = document.getElementById("groupEmptyState");
const groupCardTemplate = document.getElementById("groupCardTemplate");
const domainRowTemplate = document.getElementById("domainRowTemplate");
const datetimeRuleTemplate = document.getElementById("datetimeRuleTemplate");
const weeklyRuleTemplate = document.getElementById("weeklyRuleTemplate");
const addGroupButton = document.getElementById("addGroupButton");
const saveButton = document.getElementById("saveButton");
const reloadButton = document.getElementById("reloadButton");
const saveStatus = document.getElementById("saveStatus");

let currentData = null;
let isDirty = false;
let draggedGroupCard = null;
let draggedRuleCard = null;
let draggedRuleOwner = null;

function sendMessage(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, payload });
}

function sanitizeRuleGroups(entries) {
  if (typeof storageApi.sanitizeRuleGroups === "function") {
    return storageApi.sanitizeRuleGroups(entries);
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

function formatDomainCount(count) {
  if (typeof storageApi.formatDomainCount === "function") {
    return storageApi.formatDomainCount(count);
  }

  return `${count} ${count === 1 ? "web" : "webs"}`;
}

function getGroupPreview(groupEntry, previewDomain) {
  if (typeof storageApi.getGroupPreview === "function") {
    return storageApi.getGroupPreview(groupEntry, (currentData && currentData.emergencyUnlock) || null, new Date(), previewDomain);
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
  updateAllGroupCards();
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

function updateGroupEmptyState() {
  const visibleGroupCards = Array.from(groupList.children).filter((groupCard) => !groupCard.hidden);
  const totalGroupCards = groupList.children.length;

  if (!totalGroupCards) {
    groupEmptyState.hidden = false;
    groupEmptyState.textContent = "Todavia no hay grupos configurados.";
    return;
  }

  groupEmptyState.hidden = visibleGroupCards.length > 0;
  if (!visibleGroupCards.length) {
    groupEmptyState.textContent = "No hay grupos que coincidan con la busqueda.";
  }
}

function formatRuleCount(count) {
  return `${count} ${count === 1 ? "regla" : "reglas"}`;
}

function setGroupExpanded(groupCard, expanded) {
  const toggleButton = groupCard.querySelector('[data-action="toggle-group"]');
  const groupPanel = groupCard.querySelector('[data-role="group-panel"]');
  groupCard.dataset.expanded = expanded ? "true" : "false";
  toggleButton.textContent = expanded ? "Ocultar reglas" : "Ver reglas";
  toggleButton.setAttribute("aria-expanded", expanded ? "true" : "false");
  groupPanel.hidden = !expanded;
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

function readGroupDraft(groupCard) {
  return {
    domains: Array.from(groupCard.querySelectorAll(".domain-row [data-field='domain']")).map((input) => input.value),
    rules: Array.from(groupCard.querySelectorAll(".rule-card")).map(readRuleElement)
  };
}

function updateRuleCount(groupCard) {
  const ruleCount = groupCard.querySelectorAll(".rule-card").length;
  groupCard.querySelector('[data-role="rule-count"]').textContent = formatRuleCount(ruleCount);
}

function updateDomainCount(groupCard) {
  const domainCount = groupCard.querySelectorAll(".domain-row").length;
  groupCard.querySelector('[data-role="domain-count"]').textContent = formatDomainCount(domainCount);
}

function updateRuleEmptyState(groupCard) {
  const ruleList = groupCard.querySelector('[data-role="rule-list"]');
  const emptyState = groupCard.querySelector('[data-role="rule-empty"]');
  emptyState.hidden = ruleList.children.length > 0;
  updateRuleCount(groupCard);
}

function updateDomainEmptyState(groupCard) {
  const domainList = groupCard.querySelector('[data-role="domain-list"]');
  const emptyState = groupCard.querySelector('[data-role="domain-empty"]');
  emptyState.hidden = domainList.children.length > 0;
  updateDomainCount(groupCard);
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

function getNormalizedDomains(groupCard) {
  return Array.from(groupCard.querySelectorAll(".domain-row [data-field='domain']"))
    .map((input) => normalizeDomain(input.value))
    .filter(Boolean);
}

function updateGroupOverview(groupCard, validRuleCount, validDomainCount) {
  const statusBadge = groupCard.querySelector('[data-role="group-status"]');
  const summaryText = groupCard.querySelector('[data-role="group-summary-text"]');
  const nextText = groupCard.querySelector('[data-role="group-next-text"]');
  const domainSummary = groupCard.querySelector('[data-role="group-domain-summary"]');
  const normalizedDomains = getNormalizedDomains(groupCard);
  const sanitizedGroups = sanitizeRuleGroups([readGroupDraft(groupCard)]);
  const groupEntry = sanitizedGroups[0] || null;
  const previewDomain = normalizedDomains[0] || null;

  domainSummary.textContent = normalizedDomains.length
    ? normalizedDomains.join(", ")
    : "Sin webs todavia.";

  if (!validDomainCount) {
    statusBadge.textContent = "Webs invalidas";
    statusBadge.className = "badge danger";
    summaryText.textContent = "Agrega al menos una web valida para activar la vista previa.";
    nextText.textContent = "Todavia no se puede calcular el siguiente bloqueo.";
    return;
  }

  if (!groupEntry || !validRuleCount) {
    statusBadge.textContent = "Sin reglas validas";
    statusBadge.className = "badge warning";
    summaryText.textContent = `${formatDomainCount(validDomainCount)} en este grupo, pero aun no hay reglas listas para usarse.`;
    nextText.textContent = "Corrige las reglas para ver su estado y la siguiente ventana.";
    return;
  }

  const preview = getGroupPreview(groupEntry, previewDomain);
  if (preview.blocked) {
    statusBadge.textContent = "Bloqueando ahora";
    statusBadge.className = "badge danger";
    summaryText.textContent = `Bloqueando ${formatDomainCount(groupEntry.domains.length)}: ${formatRuleSummary(preview.activeRule.rule)}.`;
  } else if (preview.activeRule && preview.emergencyUnlocked) {
    statusBadge.textContent = "Bypass activo";
    statusBadge.className = "badge warning";
    summaryText.textContent = `La regla actual sigue corriendo, pero ${preview.activeDomain} esta desbloqueado de emergencia.`;
  } else if (preview.nextRule) {
    statusBadge.textContent = "Listo";
    statusBadge.className = "badge active";
    summaryText.textContent = `${formatDomainCount(groupEntry.domains.length)} configuradas y sin bloqueo activo ahora.`;
  } else {
    statusBadge.textContent = "Sin proximas reglas";
    statusBadge.className = "badge";
    summaryText.textContent = `${formatDomainCount(groupEntry.domains.length)} configuradas, pero sin ventanas futuras.`;
  }

  nextText.textContent = preview.nextRule
    ? formatOccurrenceSummary(preview.nextRule)
    : "No hay ninguna regla futura para este grupo.";
}

function validateGroupCard(groupCard, duplicateDomainCounts) {
  const groupErrors = [];
  const groupErrorsNode = groupCard.querySelector('[data-role="group-errors"]');
  const domainInputs = Array.from(groupCard.querySelectorAll(".domain-row [data-field='domain']"));
  const ruleCards = Array.from(groupCard.querySelectorAll(".rule-card"));
  const normalizedDomains = [];
  const localDomainCounts = new Map();
  const normalizedDomainInputs = domainInputs.map((input) => ({
    input,
    normalizedDomain: normalizeDomain(input.value)
  }));
  let invalidDomainCount = 0;
  let validDomainCount = 0;
  let invalidRuleCount = 0;
  let validRuleCount = 0;

  for (const item of normalizedDomainInputs) {
    if (!item.normalizedDomain) {
      continue;
    }

    localDomainCounts.set(item.normalizedDomain, (localDomainCounts.get(item.normalizedDomain) || 0) + 1);
  }

  if (!domainInputs.length) {
    groupErrors.push("Agrega al menos una web para este grupo.");
  }

  for (const { input, normalizedDomain } of normalizedDomainInputs) {
    const domainMessages = [];

    if (!normalizedDomain) {
      domainMessages.push("La web debe ser valida, por ejemplo youtube.com.");
      invalidDomainCount += 1;
    } else {
      normalizedDomains.push(normalizedDomain);

      if ((localDomainCounts.get(normalizedDomain) || 0) > 1) {
        domainMessages.push("Esta web esta repetida dentro del mismo grupo.");
      }

      if ((duplicateDomainCounts.get(normalizedDomain) || 0) > 1) {
        domainMessages.push("Esta web ya aparece en otro grupo.");
      }

      if (!domainMessages.length) {
        validDomainCount += 1;
      } else {
        invalidDomainCount += 1;
      }
    }

    setInputError(input, domainMessages.length > 0);
    input.title = domainMessages.join(" ");
  }

  if (normalizedDomains.length && !validDomainCount) {
    groupErrors.push("El grupo no tiene ninguna web valida para guardar.");
  }

  if (!ruleCards.length) {
    groupErrors.push("Agrega al menos una regla compartida para este grupo.");
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
    groupErrors.push("El grupo no tiene ninguna regla valida para guardar.");
  }

  setValidationMessages(groupErrorsNode, groupErrors);
  updateDomainEmptyState(groupCard);
  updateRuleEmptyState(groupCard);
  updateGroupOverview(groupCard, validRuleCount, validDomainCount);

  return {
    invalid: groupErrors.length + invalidDomainCount + invalidRuleCount > 0
  };
}

function applySearchFilter() {
  const query = groupSearchInput.value.trim().toLowerCase();

  for (const groupCard of groupList.querySelectorAll(".group-card")) {
    const domainValues = Array.from(groupCard.querySelectorAll(".domain-row [data-field='domain']"))
      .map((input) => input.value.trim().toLowerCase())
      .join(" ");
    const summaryValue = groupCard.querySelector('[data-role="group-summary-text"]').textContent.trim().toLowerCase();
    const nextValue = groupCard.querySelector('[data-role="group-next-text"]').textContent.trim().toLowerCase();
    const visible = !query || domainValues.includes(query) || summaryValue.includes(query) || nextValue.includes(query);
    groupCard.hidden = !visible;
  }

  updateGroupEmptyState();
}

function getDuplicateDomainCounts() {
  const counts = new Map();

  for (const groupCard of groupList.querySelectorAll(".group-card")) {
    const uniqueDomains = new Set(getNormalizedDomains(groupCard));
    for (const domain of uniqueDomains) {
      counts.set(domain, (counts.get(domain) || 0) + 1);
    }
  }

  return counts;
}

function updateSaveAvailability() {
  const groupCards = Array.from(groupList.querySelectorAll(".group-card"));
  const duplicateDomainCounts = getDuplicateDomainCounts();
  const hasInvalidGroup = groupCards.some((groupCard) => validateGroupCard(groupCard, duplicateDomainCounts).invalid);
  saveButton.disabled = hasInvalidGroup;

  if (hasInvalidGroup) {
    updateStatus("Corrige los errores marcados antes de guardar.");
  } else if (isDirty) {
    updateStatus("Hay cambios sin guardar.");
  }

  applySearchFilter();
}

function updateAllGroupCards() {
  updateSaveAvailability();
}

function createDomainRow(groupCard, domain = "", options = {}) {
  const fragment = domainRowTemplate.content.cloneNode(true);
  const row = fragment.querySelector(".domain-row");
  row.querySelector('[data-field="domain"]').value = domain || "";
  groupCard.querySelector('[data-role="domain-list"]').appendChild(row);
  if (!options.skipRefresh) {
    updateDomainEmptyState(groupCard);
    updateAllGroupCards();
  }
}

function createDatetimeRule(groupCard, rule = createDefaultDatetimeRule(), options = {}) {
  const fragment = datetimeRuleTemplate.content.cloneNode(true);
  const ruleElement = fragment.querySelector(".rule-card");
  ruleElement.querySelector('[data-field="startAt"]').value = rule.startAt || "";
  ruleElement.querySelector('[data-field="endAt"]').value = rule.endAt || "";
  groupCard.querySelector('[data-role="rule-list"]').appendChild(ruleElement);
  if (!options.skipRefresh) {
    updateRuleEmptyState(groupCard);
    updateAllGroupCards();
  }
}

function createWeeklyRule(groupCard, rule = createDefaultWeeklyRule(), options = {}) {
  const fragment = weeklyRuleTemplate.content.cloneNode(true);
  const ruleElement = fragment.querySelector(".rule-card");
  ruleElement.querySelector('[data-field="startTime"]').value = rule.startTime || "09:00";
  ruleElement.querySelector('[data-field="endTime"]').value = rule.endTime || "18:00";

  for (const input of ruleElement.querySelectorAll("[data-day]")) {
    input.checked = (rule.daysOfWeek || []).includes(Number(input.dataset.day));
  }

  groupCard.querySelector('[data-role="rule-list"]').appendChild(ruleElement);
  if (!options.skipRefresh) {
    updateRuleEmptyState(groupCard);
    updateAllGroupCards();
  }
}

function duplicateRule(groupCard, ruleElement) {
  const rule = readRuleElement(ruleElement);
  if (rule.type === "weekly-hours") {
    createWeeklyRule(groupCard, rule);
  } else {
    createDatetimeRule(groupCard, rule);
  }

  markDirty("Regla duplicada. Revisa el nuevo bloque y guarda cuando quieras.");
}

function createGroupCard(groupEntry = { domains: [], rules: [] }, options = {}) {
  const fragment = groupCardTemplate.content.cloneNode(true);
  const groupCard = fragment.querySelector(".group-card");
  const expanded = options.expanded ?? !(groupEntry.rules || []).length;
  const groupId = groupEntry.id || "";

  groupCard.dataset.groupId = groupId;
  groupList.appendChild(groupCard);

  for (const domain of groupEntry.domains || []) {
    createDomainRow(groupCard, domain, { skipRefresh: true });
  }

  for (const rule of groupEntry.rules || []) {
    if (rule.type === "weekly-hours") {
      createWeeklyRule(groupCard, rule, { skipRefresh: true });
    } else {
      createDatetimeRule(groupCard, rule, { skipRefresh: true });
    }
  }

  updateDomainEmptyState(groupCard);
  updateRuleEmptyState(groupCard);
  setGroupExpanded(groupCard, expanded);
  updateAllGroupCards();
  return groupCard;
}

function readRuleGroups() {
  const groupEntries = Array.from(groupList.querySelectorAll(".group-card")).map((groupCard, groupIndex) => ({
    id: groupCard.dataset.groupId || undefined,
    sortOrder: groupIndex,
    domains: Array.from(groupCard.querySelectorAll(".domain-row [data-field='domain']")).map((input) => input.value),
    rules: Array.from(groupCard.querySelectorAll(".rule-card")).map((ruleElement, ruleIndex) => ({
      ...readRuleElement(ruleElement),
      sortOrder: ruleIndex
    }))
  }));

  return sanitizeRuleGroups(groupEntries);
}

function syncVisibleOrderMetadata() {
  Array.from(groupList.querySelectorAll(".group-card")).forEach((groupCard, groupIndex) => {
    groupCard.dataset.sortOrder = String(groupIndex);
    Array.from(groupCard.querySelectorAll(".rule-card")).forEach((ruleCard, ruleIndex) => {
      ruleCard.dataset.sortOrder = String(ruleIndex);
    });
  });
}

function renderOptions(data) {
  blockMessageInput.value = data.settings.blockMessage;
  emergencyLabelInput.value = data.settings.emergencyLabel;
  groupSearchInput.value = "";
  groupList.innerHTML = "";

  for (const entry of data.ruleGroups) {
    createGroupCard(entry);
  }

  updateGroupEmptyState();
}

async function loadOptions() {
  const response = await sendMessage("get-state");
  currentData = response.data;
  isDirty = false;
  renderOptions(response.data);
  updateStatus("Configuracion cargada.");
}

function handleGroupListClick(event) {
  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) {
    return;
  }

  const groupCard = actionButton.closest(".group-card");
  const ruleElement = actionButton.closest(".rule-card");
  const domainRow = actionButton.closest(".domain-row");
  const action = actionButton.dataset.action;

  if (action === "toggle-group" && groupCard) {
    setGroupExpanded(groupCard, groupCard.dataset.expanded !== "true");
    return;
  }

  if (action === "remove-group" && groupCard) {
    groupCard.remove();
    markDirty("Grupo eliminado. Guarda para confirmar el cambio.");
    return;
  }

  if (action === "add-domain" && groupCard) {
    createDomainRow(groupCard);
    markDirty("Nueva web agregada al grupo.");
    return;
  }

  if (action === "remove-domain" && groupCard && domainRow) {
    domainRow.remove();
    markDirty("Web eliminada del grupo.");
    return;
  }

  if (action === "add-datetime-rule" && groupCard) {
    createDatetimeRule(groupCard);
    markDirty("Nueva regla por fecha agregada.");
    return;
  }

  if (action === "add-weekly-rule" && groupCard) {
    createWeeklyRule(groupCard);
    markDirty("Nuevo horario semanal agregado.");
    return;
  }

  if (action === "remove-rule" && groupCard && ruleElement) {
    ruleElement.remove();
    markDirty("Regla eliminada. Guarda para mantener el nuevo orden.");
    return;
  }

  if (action === "duplicate-rule" && groupCard && ruleElement) {
    duplicateRule(groupCard, ruleElement);
  }
}

function handleGroupListInput() {
  markDirty();
}

function handleDragStart(event) {
  if (!event.target.closest(".drag-handle")) {
    return;
  }

  const ruleCard = event.target.closest(".rule-card");
  if (ruleCard) {
    draggedRuleCard = ruleCard;
    draggedRuleOwner = ruleCard.closest(".group-card");
    draggedRuleCard.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    return;
  }

  const groupCard = event.target.closest(".group-card");
  if (groupCard) {
    draggedGroupCard = groupCard;
    draggedGroupCard.classList.add("is-dragging");
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

  if (draggedGroupCard && event.target.closest("#groupList")) {
    event.preventDefault();
    clearDropTargets();
    const dropTarget = getDropTarget(groupList, ".group-card", event.clientY, draggedGroupCard);
    if (dropTarget) {
      dropTarget.classList.add("drop-target");
      groupList.insertBefore(draggedGroupCard, dropTarget);
    } else {
      groupList.appendChild(draggedGroupCard);
    }
  }
}

function handleDragEnd() {
  const movedGroup = Boolean(draggedGroupCard);
  const movedRule = Boolean(draggedRuleCard);

  clearDropTargets();

  if (draggedGroupCard) {
    draggedGroupCard.classList.remove("is-dragging");
    draggedGroupCard = null;
  }

  if (draggedRuleCard) {
    draggedRuleCard.classList.remove("is-dragging");
    draggedRuleCard = null;
    draggedRuleOwner = null;
  }

  if (movedGroup || movedRule) {
    syncVisibleOrderMetadata();
    markDirty("Orden actualizado. Guarda para conservarlo.");
  }
}

addGroupButton.addEventListener("click", () => {
  const groupCard = createGroupCard(undefined, { expanded: true });
  setGroupExpanded(groupCard, true);
  createDomainRow(groupCard);
  markDirty("Nuevo grupo agregado.");
});

saveButton.addEventListener("click", async () => {
  syncVisibleOrderMetadata();
  const ruleGroups = readRuleGroups();
  const settings = sanitizeSettings({
    blockMessage: blockMessageInput.value,
    emergencyLabel: emergencyLabelInput.value
  });

  const response = await sendMessage("save-options", {
    ruleGroups,
    settings
  });

  currentData = response.data;
  isDirty = false;
  renderOptions(response.data);
  updateStatus("Cambios guardados correctamente.");
});

reloadButton.addEventListener("click", loadOptions);
groupSearchInput.addEventListener("input", applySearchFilter);
blockMessageInput.addEventListener("input", handleGroupListInput);
emergencyLabelInput.addEventListener("input", handleGroupListInput);
groupList.addEventListener("click", handleGroupListClick);
groupList.addEventListener("input", handleGroupListInput);
groupList.addEventListener("change", handleGroupListInput);
groupList.addEventListener("dragstart", handleDragStart);
groupList.addEventListener("dragover", handleDragOver);
groupList.addEventListener("dragend", handleDragEnd);
groupList.addEventListener("drop", (event) => event.preventDefault());

loadOptions();
