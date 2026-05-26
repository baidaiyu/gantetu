const STORAGE_KEY = "local-demand-calendar-v3";
const LEGACY_STORAGE_KEYS = ["local-demand-calendar-v2", "local-demand-calendar-v1"];
const MANAGER_FILTER_STORAGE_KEY = "local-demand-calendar-manager-filters";

const defaultState = {
  people: [],
  requirements: [],
  versions: [],
  workItems: [],
  holidays: [],
  workdays: [],
};

const requirementStatusConfig = {
  未开始: { key: "planned", rank: 1 },
  进行中: { key: "active", rank: 2 },
  已完成: { key: "done", rank: 3 },
};

const versionPalette = [
  "#167f5f",
  "#286fbb",
  "#b87512",
  "#7157a8",
  "#bf4b40",
  "#1c898d",
  "#5f6fb8",
  "#8a6f1f",
  "#b24f7b",
  "#437f3d",
  "#9a5d2f",
  "#4b7f89",
];

const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const calendarWeekdays = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const personRoles = ["领导", "产品经理", "设计师", "研发人员", "测试人员", "管理员"];
const accountRoles = {
  admin: "管理员",
  leader: "领导",
  pm: "产品经理",
  designer: "设计师",
  developer: "研发人员",
  tester: "测试人员",
};
const accountRoleByPersonRole = Object.fromEntries(Object.entries(accountRoles).map(([key, value]) => [value, key]));
const PM_ASSIGNMENT_CONTENT = "产品经理分配";
let currentView = "requirement";
let requirementViewMode = "timeline";
let versionViewMode = "calendar";
let selectedMonth = monthKey(new Date());
let monthTouched = false;
let currentRole = "pm";
let currentPerson = "";
let selectedLoadPerson = "";
let personLoadManualSelection = false;
let people = [];
let requirements = [];
let versions = [];
let workItems = [];
let holidays = new Set();
let workdays = new Set();
let draftHolidays = new Set();
let draftWorkdays = new Set();
let calendarEditMonth = monthKey(new Date());
let workImageDraft = [];
let otherWorkImageDraft = [];
let lastSyncedState = null;
let saveQueue = Promise.resolve();
let currentUser = null;
let accounts = [];
let loginEventsBound = false;
let pendingDeletes = {
  people: new Set(),
  requirements: new Set(),
  versions: new Set(),
  workItems: new Set(),
};
const expandedVersions = new Set();
const expandedRequirements = new Set();

const els = {
  grid: document.querySelector("#timelineGrid"),
  summary: document.querySelector("#summaryStrip"),
  personFilter: document.querySelector("#personFilter"),
  statusFilter: document.querySelector("#statusFilter"),
  search: document.querySelector("#searchInput"),
  peopleLoad: document.querySelector("#peopleLoad"),
  rangeLabel: document.querySelector("#dateRangeLabel"),
  viewButtons: document.querySelectorAll(".view-button"),
  viewModeControl: document.querySelector("#viewModeControl"),
  viewModeButtons: document.querySelectorAll(".mode-button"),
  roleSelect: document.querySelector("#roleSelect"),
  currentUserBadge: document.querySelector("#currentUserBadge"),
  currentPersonField: document.querySelector("#currentPersonField"),
  currentPersonSelect: document.querySelector("#currentPersonSelect"),
  pendingWorkButton: document.querySelector("#pendingWorkButton"),
  peopleManageButton: document.querySelector("#peopleManageButton"),
  accountManageButton: document.querySelector("#accountManageButton"),
  logoutButton: document.querySelector("#logoutButton"),
  loginDialog: document.querySelector("#loginDialog"),
  loginForm: document.querySelector("#loginForm"),
  loginUsernameInput: document.querySelector("#loginUsernameInput"),
  loginPasswordInput: document.querySelector("#loginPasswordInput"),
  loginFormError: document.querySelector("#loginFormError"),
  resetPasswordDialog: document.querySelector("#resetPasswordDialog"),
  resetPasswordForm: document.querySelector("#resetPasswordForm"),
  currentPasswordInput: document.querySelector("#currentPasswordInput"),
  newPasswordInput: document.querySelector("#newPasswordInput"),
  confirmPasswordInput: document.querySelector("#confirmPasswordInput"),
  resetPasswordFormError: document.querySelector("#resetPasswordFormError"),
  toastStack: document.querySelector("#toastStack"),
  addRequirementButton: document.querySelector("#addRequirementButton"),
  addVersionButton: document.querySelector("#addVersionButton"),
  addWorkButton: document.querySelector("#addWorkButton"),
  addOtherWorkButton: document.querySelector("#addOtherWorkButton"),
  holidayButton: document.querySelector("#holidayButton"),
  requirementDialog: document.querySelector("#requirementDialog"),
  requirementForm: document.querySelector("#requirementForm"),
  requirementDialogTitle: document.querySelector("#requirementDialogTitle"),
  requirementId: document.querySelector("#requirementId"),
  requirementTitleInput: document.querySelector("#requirementTitleInput"),
  requirementLinkInput: document.querySelector("#requirementLinkInput"),
  requirementPeoplePicker: document.querySelector("#requirementPeoplePicker"),
  requirementStatusInput: document.querySelector("#requirementStatusInput"),
  closeRequirementDialog: document.querySelector("#closeRequirementDialog"),
  cancelRequirementButton: document.querySelector("#cancelRequirementButton"),
  deleteRequirementButton: document.querySelector("#deleteRequirementButton"),
  requirementFormError: document.querySelector("#requirementFormError"),
  requirementManagerDialog: document.querySelector("#requirementManagerDialog"),
  requirementManagerList: document.querySelector("#requirementManagerList"),
  requirementManagerHint: document.querySelector("#requirementManagerHint"),
  managerSearchInput: document.querySelector("#managerSearchInput"),
  managerStatusFilter: document.querySelector("#managerStatusFilter"),
  managerPersonFilter: document.querySelector("#managerPersonFilter"),
  managerVersionFilter: document.querySelector("#managerVersionFilter"),
  managerResetFiltersButton: document.querySelector("#managerResetFiltersButton"),
  closeRequirementManagerDialog: document.querySelector("#closeRequirementManagerDialog"),
  managerAddRequirementButton: document.querySelector("#managerAddRequirementButton"),
  versionDialog: document.querySelector("#versionDialog"),
  versionForm: document.querySelector("#versionForm"),
  versionDialogTitle: document.querySelector("#versionDialogTitle"),
  versionId: document.querySelector("#versionId"),
  versionNameInput: document.querySelector("#versionNameInput"),
  versionStartInput: document.querySelector("#versionStartInput"),
  versionEndInput: document.querySelector("#versionEndInput"),
  versionRequirementPicker: document.querySelector("#versionRequirementPicker"),
  closeVersionDialog: document.querySelector("#closeVersionDialog"),
  cancelVersionButton: document.querySelector("#cancelVersionButton"),
  deleteVersionButton: document.querySelector("#deleteVersionButton"),
  versionFormError: document.querySelector("#versionFormError"),
  workDialog: document.querySelector("#workDialog"),
  workForm: document.querySelector("#workForm"),
  workDialogTitle: document.querySelector("#workDialogTitle"),
  workId: document.querySelector("#workId"),
  workRequirementInput: document.querySelector("#workRequirementInput"),
  workMineOnlyField: document.querySelector("#workMineOnlyField"),
  workMineOnlyInput: document.querySelector("#workMineOnlyInput"),
  workPersonInput: document.querySelector("#workPersonInput"),
  workStartInput: document.querySelector("#workStartInput"),
  workEndInput: document.querySelector("#workEndInput"),
  workSingleFields: document.querySelectorAll(".work-single-field"),
  workAssignmentSection: document.querySelector("#workAssignmentSection"),
  workAssignmentList: document.querySelector("#workAssignmentList"),
  addAssignmentButton: document.querySelector("#addAssignmentButton"),
  workContentField: document.querySelector("#workContentField"),
  workContentInput: document.querySelector("#workContentInput"),
  workImagePasteBox: document.querySelector("#workImagePasteBox"),
  workImageList: document.querySelector("#workImageList"),
  closeWorkDialog: document.querySelector("#closeWorkDialog"),
  cancelWorkButton: document.querySelector("#cancelWorkButton"),
  deleteWorkButton: document.querySelector("#deleteWorkButton"),
  workFormError: document.querySelector("#workFormError"),
  pendingWorkDialog: document.querySelector("#pendingWorkDialog"),
  pendingWorkTitle: document.querySelector("#pendingWorkTitle"),
  pendingWorkList: document.querySelector("#pendingWorkList"),
  closePendingWorkDialog: document.querySelector("#closePendingWorkDialog"),
  otherWorkDialog: document.querySelector("#otherWorkDialog"),
  otherWorkForm: document.querySelector("#otherWorkForm"),
  otherWorkDialogTitle: document.querySelector("#otherWorkDialogTitle"),
  otherWorkId: document.querySelector("#otherWorkId"),
  otherWorkTitleInput: document.querySelector("#otherWorkTitleInput"),
  otherWorkStartInput: document.querySelector("#otherWorkStartInput"),
  otherWorkEndInput: document.querySelector("#otherWorkEndInput"),
  otherWorkStatusInput: document.querySelector("#otherWorkStatusInput"),
  otherWorkContentInput: document.querySelector("#otherWorkContentInput"),
  otherWorkImagePasteBox: document.querySelector("#otherWorkImagePasteBox"),
  otherWorkImageList: document.querySelector("#otherWorkImageList"),
  closeOtherWorkDialog: document.querySelector("#closeOtherWorkDialog"),
  cancelOtherWorkButton: document.querySelector("#cancelOtherWorkButton"),
  deleteOtherWorkButton: document.querySelector("#deleteOtherWorkButton"),
  otherWorkFormError: document.querySelector("#otherWorkFormError"),
  holidayDialog: document.querySelector("#holidayDialog"),
  holidayForm: document.querySelector("#holidayForm"),
  holidayMonthInput: document.querySelector("#holidayMonthInput"),
  holidayCalendarGrid: document.querySelector("#holidayCalendarGrid"),
  calendarPrevMonthButton: document.querySelector("#calendarPrevMonthButton"),
  calendarNextMonthButton: document.querySelector("#calendarNextMonthButton"),
  closeHolidayDialog: document.querySelector("#closeHolidayDialog"),
  cancelHolidayButton: document.querySelector("#cancelHolidayButton"),
  holidayFormError: document.querySelector("#holidayFormError"),
  workDetailDialog: document.querySelector("#workDetailDialog"),
  workDetailTitle: document.querySelector("#workDetailTitle"),
  workDetailBody: document.querySelector("#workDetailBody"),
  closeWorkDetailDialog: document.querySelector("#closeWorkDetailDialog"),
  peopleDialog: document.querySelector("#peopleDialog"),
  peopleForm: document.querySelector("#peopleForm"),
  peopleList: document.querySelector("#peopleList"),
  personId: document.querySelector("#personId"),
  personNameInput: document.querySelector("#personNameInput"),
  personRoleInput: document.querySelector("#personRoleInput"),
  newPersonButton: document.querySelector("#newPersonButton"),
  deletePersonButton: document.querySelector("#deletePersonButton"),
  closePeopleDialog: document.querySelector("#closePeopleDialog"),
  cancelPeopleButton: document.querySelector("#cancelPeopleButton"),
  personFormError: document.querySelector("#personFormError"),
  accountDialog: document.querySelector("#accountDialog"),
  accountForm: document.querySelector("#accountForm"),
  accountList: document.querySelector("#accountList"),
  accountId: document.querySelector("#accountId"),
  accountUsernameInput: document.querySelector("#accountUsernameInput"),
  accountPersonInput: document.querySelector("#accountPersonInput"),
  accountRoleInput: document.querySelector("#accountRoleInput"),
  newAccountButton: document.querySelector("#newAccountButton"),
  closeAccountDialog: document.querySelector("#closeAccountDialog"),
  cancelAccountButton: document.querySelector("#cancelAccountButton"),
  deleteAccountButton: document.querySelector("#deleteAccountButton"),
  accountFormError: document.querySelector("#accountFormError"),
};

function parseDate(dateText) {
  return new Date(`${dateText}T00:00:00`);
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function parseMonth(monthText) {
  return new Date(`${monthText}-01T00:00:00`);
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function monthLabel(date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

function todayKey() {
  return formatDate(new Date());
}

function addDays(date, amount) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function splitList(value) {
  return value
    .split(/[,\n，、]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function isValidDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parseDate(value).getTime());
}

function isDefaultWorkday(date) {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

function isWorkdayWithSets(date, restOverrides = holidays, workOverrides = workdays) {
  const key = formatDate(date);
  if (workOverrides.has(key)) return true;
  if (restOverrides.has(key)) return false;
  return isDefaultWorkday(date);
}

function isHiddenDate(date) {
  return !isWorkdayWithSets(date);
}

function rangeContains(range, dateKey) {
  return range.start <= dateKey && dateKey <= range.end;
}

function eachVisibleDay(start, end) {
  const days = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    if (!isHiddenDate(cursor)) days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function eachCalendarDay(start, end) {
  const days = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function requirementById(id) {
  return requirements.find((item) => item.id === id);
}

function versionById(id) {
  return versions.find((item) => item.id === id);
}

function requirementVersion(requirementId) {
  return versions.find((version) => version.requirementIds.includes(requirementId));
}

function workDays(work, visibleDays) {
  return visibleDays.filter((date) => rangeContains(work, formatDate(date))).length;
}

function requirementWorkDays(works, visibleDays) {
  return visibleDays.filter((date) => {
    const key = formatDate(date);
    return works.some((work) => rangeContains(work, key));
  }).length;
}

function dateBounds() {
  const dates = [
    ...versions.flatMap((version) => [parseDate(version.start), parseDate(version.end)]),
    ...workItems.flatMap((work) => [parseDate(work.start), parseDate(work.end)]),
  ];
  if (!dates.length) {
    const start = parseDate(todayKey());
    return { start, end: addDays(start, 20) };
  }
  return { start: new Date(Math.min(...dates)), end: new Date(Math.max(...dates)) };
}

function normalizeRequirement(input) {
  return {
    id: input.id || createId("req"),
    title: input.title || input.requirement || "未命名需求",
    link: input.link || "",
    people: Array.isArray(input.people) ? input.people : splitList(input.people || ""),
    status: requirementStatusConfig[input.status] ? input.status : "未开始",
    kind: input.kind === "other" ? "other" : "",
    createdBy: input.createdBy || input.created_by || "",
    createdByName: input.createdByName || input.created_by_name || "",
  };
}

function normalizePerson(input) {
  return {
    id: input.id || createId("person"),
    name: String(input.name || "").trim(),
    role: personRoles.includes(input.role) ? input.role : "研发人员",
  };
}

function normalizeVersion(input) {
  return {
    id: input.id || createId("ver"),
    name: input.name || input.version || "未命名版本",
    start: input.start,
    end: input.end,
    requirementIds: Array.isArray(input.requirementIds) ? input.requirementIds : [],
  };
}

function normalizeWork(input) {
  return {
    id: input.id || createId("work"),
    requirementId: input.requirementId,
    person: input.person,
    start: input.start,
    end: input.end,
    content: input.content || "",
    images: Array.isArray(input.images) ? input.images.filter(Boolean) : [],
  };
}

function migrateOldState(oldState) {
  const reqMap = new Map();
  const migratedRequirements = [];
  const migratedVersions = new Map();
  const migratedWork = [];

  (oldState.entries || []).forEach((entry) => {
    const reqKey = entry.requirement;
    if (!reqMap.has(reqKey)) {
      const req = normalizeRequirement({
        title: entry.requirement,
        people: entry.people || [],
        status: entry.status === "已完成" ? "已完成" : entry.status === "进行中" ? "进行中" : "未开始",
      });
      reqMap.set(reqKey, req.id);
      migratedRequirements.push(req);
    }
    const reqId = reqMap.get(reqKey);
    const versionName = entry.version || "未归属版本";
    if (versionName !== "未归属版本") {
      if (!migratedVersions.has(versionName)) {
        migratedVersions.set(
          versionName,
          normalizeVersion({
            name: versionName,
            start: entry.start,
            end: entry.end,
            requirementIds: [reqId],
          }),
        );
      } else {
        const version = migratedVersions.get(versionName);
        version.start = version.start < entry.start ? version.start : entry.start;
        version.end = version.end > entry.end ? version.end : entry.end;
        version.requirementIds = unique([...version.requirementIds, reqId]);
      }
    }
    (entry.people || []).forEach((person) => {
      migratedWork.push(
        normalizeWork({
          requirementId: reqId,
          person,
          start: entry.start,
          end: entry.end,
          content: "",
        }),
      );
    });
  });

  const migratedPeople = unique([
    ...migratedRequirements.flatMap((req) => req.people),
    ...migratedWork.map((work) => work.person),
  ]).map((name) => normalizePerson({ name }));

  return {
    people: migratedPeople,
    requirements: migratedRequirements,
    versions: [...migratedVersions.values()],
    workItems: migratedWork,
    holidays: oldState.holidays || [],
    workdays: oldState.workdays || [],
  };
}

async function loadState() {
  try {
    const remoteState = await loadRemoteState();
    if (hasStoredData(remoteState)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(remoteState));
      lastSyncedState = cloneState({ ...defaultState, ...remoteState });
      return { ...defaultState, ...remoteState };
    }
    const currentState = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (hasStoredData(currentState)) {
      saveRemoteState(currentState);
      lastSyncedState = cloneState({ ...defaultState, ...currentState });
      return { ...defaultState, ...currentState };
    }
    for (const key of LEGACY_STORAGE_KEYS) {
      const legacyState = JSON.parse(localStorage.getItem(key));
      if (!hasStoredData(legacyState)) continue;
      const migratedState = key.endsWith("-v1") ? { ...defaultState, ...migrateOldState(legacyState) } : { ...defaultState, ...legacyState };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migratedState));
      saveRemoteState(migratedState);
      lastSyncedState = cloneState(migratedState);
      return migratedState;
    }
    lastSyncedState = cloneState(defaultState);
    return { ...defaultState };
  } catch {
    lastSyncedState = cloneState(defaultState);
    return { ...defaultState };
  }
}

function hasStoredData(state) {
  if (!state || typeof state !== "object") return false;
  return ["people", "requirements", "versions", "workItems", "holidays", "workdays"].some((key) => Array.isArray(state[key]) && state[key].length);
}

async function loadRemoteState() {
  try {
    const response = await fetch("/api/state", { cache: "no-store" });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || "请求失败。");
  return payload;
}

async function loadSession() {
  try {
    const payload = await apiRequest("/api/session", { method: "GET" });
    return payload.user;
  } catch {
    return null;
  }
}

async function login(username, password) {
  const payload = await apiRequest("/api/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  return payload.user;
}

async function changePassword(currentPassword, newPassword) {
  await apiRequest("/api/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

async function logout() {
  await apiRequest("/api/logout", { method: "POST", body: "{}" });
  window.location.reload();
}

function currentStatePayload() {
  return {
    people,
    requirements,
    versions,
    workItems,
    holidays: [...holidays].sort(),
    workdays: [...workdays].sort(),
  };
}

function cloneState(state) {
  return JSON.parse(JSON.stringify({ ...defaultState, ...(state || {}) }));
}

function applyState(state) {
  const nextState = cloneState(state);
  people = nextState.people.map(normalizePerson);
  requirements = nextState.requirements.map(normalizeRequirement);
  versions = nextState.versions.map(normalizeVersion);
  workItems = nextState.workItems.map(normalizeWork);
  holidays = new Set(nextState.holidays || []);
  workdays = new Set(nextState.workdays || []);
  ensurePeopleFromExistingData();
}

function showToast(type, title, message = "") {
  if (!els.toastStack) return;
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<strong>${escapeHtml(title)}</strong>${message ? `<span>${escapeHtml(message)}</span>` : ""}`;
  els.toastStack.append(toast);
  window.setTimeout(() => toast.remove(), type === "error" ? 6500 : 2600);
}

function byId(items = []) {
  return new Map(items.map((item) => [item.id, item]));
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function changedItems(previousItems = [], currentItems = []) {
  const previous = byId(previousItems);
  return currentItems.filter((item) => stableStringify(previous.get(item.id)) !== stableStringify(item));
}

function baseItems(previousItems = [], changed = []) {
  const previous = byId(previousItems);
  return Object.fromEntries(changed.map((item) => [item.id, previous.get(item.id) || null]));
}

function queueDelete(type, id) {
  if (id && pendingDeletes[type]) pendingDeletes[type].add(id);
}

function queuedDeletes() {
  return Object.fromEntries(Object.entries(pendingDeletes).map(([key, values]) => [key, [...values]]));
}

function clearPendingDeletes() {
  pendingDeletes = {
    people: new Set(),
    requirements: new Set(),
    versions: new Set(),
    workItems: new Set(),
  };
}

function addedValues(previousValues = [], currentValues = []) {
  const previous = new Set(previousValues);
  return currentValues.filter((value) => !previous.has(value));
}

function removedValues(previousValues = [], currentValues = []) {
  const current = new Set(currentValues);
  return previousValues.filter((value) => !current.has(value));
}

function buildStatePatch(previousState, currentState) {
  const previous = cloneState(previousState);
  const current = cloneState(currentState);
  const upserts = {
    people: changedItems(previous.people, current.people),
    requirements: changedItems(previous.requirements, current.requirements),
    versions: changedItems(previous.versions, current.versions),
    workItems: changedItems(previous.workItems, current.workItems),
  };
  return {
    upserts,
    base: {
      people: baseItems(previous.people, upserts.people),
      requirements: baseItems(previous.requirements, upserts.requirements),
      versions: baseItems(previous.versions, upserts.versions),
      workItems: baseItems(previous.workItems, upserts.workItems),
    },
    deletes: queuedDeletes(),
    calendar: {
      addHolidays: addedValues(previous.holidays, current.holidays),
      removeHolidays: removedValues(previous.holidays, current.holidays),
      addWorkdays: addedValues(previous.workdays, current.workdays),
      removeWorkdays: removedValues(previous.workdays, current.workdays),
    },
  };
}

function patchHasChanges(patch) {
  return Object.values(patch.upserts).some((items) => items.length) || Object.values(patch.deletes).some((ids) => ids.length) || Object.values(patch.calendar).some((items) => items.length);
}

function saveRemoteState(state) {
  fetch("/api/state", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state),
  }).catch(() => {});
}

async function saveRemotePatch(patch) {
  let response;
  try {
    response = await fetch("/api/state", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  } catch {
    throw new Error("无法连接服务器：服务可能未启动或当前网络不可达，本次修改没有保存。");
  }
  const payload = await response.json().catch(() => null);
  if (response.status === 401) throw new Error("登录已失效，请刷新页面后重新登录。");
  if (!response.ok) throw new Error(payload?.error || "服务器拒绝保存，本次修改没有写入数据库。");
  return payload;
}

function saveState() {
  const state = currentStatePayload();
  const patch = buildStatePatch(lastSyncedState || defaultState, state);
  if (!patchHasChanges(patch)) return;
  saveQueue = saveQueue
    .then(() => saveRemotePatch(patch))
    .then((remoteState) => {
      lastSyncedState = cloneState(remoteState);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(remoteState));
      applyState(remoteState);
      clearPendingDeletes();
      showToast("success", "保存成功", "数据已写入服务器数据库。");
      render();
    })
    .catch((error) => {
      console.error(error);
      if (lastSyncedState) {
        applyState(lastSyncedState);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(lastSyncedState));
        render();
      }
      clearPendingDeletes();
      showToast("error", "保存失败", error.message || "请刷新后重试。");
    });
}

function canManageRequirement() {
  return currentRole === "admin" || currentRole === "pm" || currentRole === "designer" || currentRole === "developer" || currentRole === "tester";
}

function canCreateRequirement() {
  return currentRole === "pm";
}

function canManageVersion() {
  return currentRole === "admin" || currentRole === "pm";
}

function canManageWork() {
  return currentRole === "pm";
}

function canManagePeople() {
  return currentRole === "admin";
}

function isExecutorRole() {
  return currentRole === "designer" || currentRole === "developer" || currentRole === "tester";
}

function syncCurrentPersonOptions() {
  const names = workingPeople();
  const lockedName = currentUser && isExecutorRole() ? currentUser.name : "";
  const previous = lockedName || currentPerson || els.currentPersonSelect.value;
  els.currentPersonSelect.innerHTML = names.length
    ? names.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")
    : `<option value="">暂无人员</option>`;
  currentPerson = names.includes(previous) ? previous : names[0] || "";
  els.currentPersonSelect.value = currentPerson;
}

function pendingRequirementsForCurrentPerson() {
  if (!currentPerson) return [];
  return requirements.filter((req) => req.people.includes(currentPerson) && !workItems.some((work) => work.requirementId === req.id && work.person === currentPerson));
}

function isOtherWorkRequirement(req) {
  if (!req) return false;
  if (req.kind === "other") return true;
  const reqWorks = workItems.filter((work) => work.requirementId === req.id);
  return !requirementVersion(req.id) && req.people.length === 1 && reqWorks.length === 1 && reqWorks[0].person === req.people[0];
}

function canEditOtherWork(work) {
  return isExecutorRole() && work?.person === currentPerson && isOtherWorkRequirement(requirementById(work.requirementId));
}

function canEditOwnWork(work) {
  return isExecutorRole() && work?.person === currentPerson && work.content !== PM_ASSIGNMENT_CONTENT;
}

function applyRolePermissions() {
  syncCurrentPersonOptions();
  const showExecutorTools = isExecutorRole();
  els.currentPersonField.hidden = true;
  els.currentUserBadge.textContent = currentUser ? `${currentUser.name} · ${accountRoles[currentUser.role] || currentUser.role}` : "未登录";
  els.accountManageButton.hidden = currentRole !== "admin";
  els.peopleManageButton.hidden = !canManagePeople();
  els.addRequirementButton.hidden = !canCreateRequirement();
  els.addVersionButton.hidden = !canManageVersion();
  els.addWorkButton.hidden = !canManageWork();
  els.addOtherWorkButton.hidden = !showExecutorTools;
  els.holidayButton.hidden = currentRole !== "admin";
  const pendingCount = showExecutorTools ? pendingRequirementsForCurrentPerson().length : 0;
  els.pendingWorkButton.hidden = !showExecutorTools;
  els.pendingWorkButton.textContent = `待处理工作（${pendingCount}）`;
  els.pendingWorkButton.classList.toggle("has-pending", pendingCount > 0);
}

function allPeople() {
  return unique(people.map((person) => person.name).filter(Boolean)).sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function personByName(name) {
  return people.find((person) => person.name === name);
}

function isWorkingPersonName(name) {
  const person = personByName(name);
  return person?.role === "设计师" || person?.role === "研发人员" || person?.role === "测试人员";
}

function workingPeople() {
  return allPeople().filter(isWorkingPersonName);
}

function visibleWorkerNames(names) {
  return unique(names).filter(isWorkingPersonName);
}

function selectedOptions(select) {
  return [...select.selectedOptions].map((option) => option.value);
}

function selectedPeopleFromPicker() {
  return [...els.requirementPeoplePicker.querySelectorAll(".people-choice.is-selected")].map((button) => button.dataset.person);
}

function selectedRequirementsFromPicker() {
  return [...els.versionRequirementPicker.querySelectorAll(".requirement-choice.is-selected")].map((button) => button.dataset.id);
}

function renderPeoplePicker(selected = []) {
  const names = workingPeople();
  if (!names.length) {
    els.requirementPeoplePicker.innerHTML = `<div class="people-picker-empty">暂无人员，请先由管理员在人员管理中添加。</div>`;
    return;
  }
  els.requirementPeoplePicker.innerHTML = names
    .map((name) => {
      const checked = selected.includes(name);
      return `<button class="people-choice ${checked ? "is-selected" : ""}" type="button" data-person="${escapeHtml(name)}" aria-pressed="${checked}"><span class="choice-mark">${checked ? "✓" : "+"}</span>${escapeHtml(name)}</button>`;
    })
    .join("");
}

function renderVersionRequirementPicker(version) {
  const selectedIds = new Set(version?.requirementIds || []);
  const availableRequirements = requirements.filter((req) => {
    const owner = requirementVersion(req.id);
    return !owner || owner.id === version?.id;
  });
  if (!availableRequirements.length) {
    els.versionRequirementPicker.innerHTML = `<div class="people-picker-empty">暂无可加入版本的需求。已属于其他版本的需求不会在这里显示。</div>`;
    return;
  }
  els.versionRequirementPicker.innerHTML = availableRequirements
    .map((req) => {
      const checked = selectedIds.has(req.id);
      const peopleText = visibleWorkerNames(req.people).join("、") || "未分配";
      return `<button class="requirement-choice ${checked ? "is-selected" : ""}" type="button" data-id="${req.id}" aria-pressed="${checked}"><span class="choice-mark">${checked ? "✓" : "+"}</span><span class="requirement-choice-main"><b>${escapeHtml(req.title)}</b><small>${escapeHtml(req.status)} · ${escapeHtml(peopleText)}</small></span></button>`;
    })
    .join("");
}

function populatePeopleSelect(select, selected = [], placeholder = "") {
  select.innerHTML = "";
  if (placeholder) select.append(new Option(placeholder, ""));
  workingPeople().forEach((name) => select.append(new Option(name, name)));
  [...select.options].forEach((option) => {
    option.selected = selected.includes(option.value);
  });
}

function renderWorkImageList(target, images) {
  target.innerHTML = images.length
    ? images
        .map(
          (src, index) =>
            `<figure class="work-image-item"><img src="${escapeHtml(src)}" alt="工作内容图片 ${index + 1}" /><button class="icon-button" type="button" data-action="remove-work-image" data-index="${index}" aria-label="删除图片">×</button></figure>`,
        )
        .join("")
    : "";
}

function renderWorkImages() {
  renderWorkImageList(els.workImageList, workImageDraft);
  renderWorkImageList(els.otherWorkImageList, otherWorkImageDraft);
}

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function appendPastedImages(event, target) {
  const files = [...(event.clipboardData?.items || [])]
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter(Boolean);
  if (!files.length) return;
  event.preventDefault();
  const images = await Promise.all(files.map(readImageFile));
  if (target === "other") otherWorkImageDraft.push(...images);
  else workImageDraft.push(...images);
  renderWorkImages();
}

function removeWorkImage(target, index) {
  if (target === "other") otherWorkImageDraft.splice(index, 1);
  else workImageDraft.splice(index, 1);
  renderWorkImages();
}

function ensurePeopleFromExistingData() {
  const existingNames = new Set(people.map((person) => person.name));
  unique([...requirements.flatMap((req) => req.people), ...workItems.map((work) => work.person)]).forEach((name) => {
    if (!existingNames.has(name)) {
      people.push(normalizePerson({ name }));
      existingNames.add(name);
    }
  });
  people = people.filter((person) => person.name);
}

function fillSelect(select, values, allLabel, previousValue = "全部") {
  select.innerHTML = "";
  select.append(new Option(allLabel, "全部"));
  values.forEach((value) => select.append(new Option(value, value)));
  select.value = [...values, "全部"].includes(previousValue) ? previousValue : "全部";
}

function refreshFilters() {
  fillSelect(els.personFilter, workingPeople(), "全部同事", els.personFilter.value);
  fillSelect(els.statusFilter, Object.keys(requirementStatusConfig), "全部状态", els.statusFilter.value);
}

function filteredRequirements() {
  const person = els.personFilter.value;
  const status = els.statusFilter.value;
  const query = els.search.value.trim().toLowerCase();
  return requirements.filter((req) => {
    const relatedVersion = requirementVersion(req.id);
    const personMatch =
      person === "全部" || req.people.includes(person) || workItems.some((work) => work.requirementId === req.id && work.person === person);
    const statusMatch = status === "全部" || req.status === status;
    const queryText = `${req.title} ${visibleWorkerNames(req.people).join(" ")} ${relatedVersion?.name || ""}`.toLowerCase();
    return personMatch && statusMatch && (!query || queryText.includes(query));
  });
}

function filteredWorkItems(reqIds = filteredRequirements().map((req) => req.id)) {
  const person = els.personFilter.value;
  return workItems.filter((work) => reqIds.includes(work.requirementId) && isWorkingPersonName(work.person) && (person === "全部" || work.person === person));
}

function monthOptions() {
  const today = parseDate(todayKey());
  const bounds = dateBounds();
  const startBase = new Date(Math.min(bounds.start, today));
  const endBase = new Date(Math.max(bounds.end, today));
  const start = startOfMonth(new Date(startBase.getFullYear(), startBase.getMonth() - 6, 1));
  const end = startOfMonth(new Date(endBase.getFullYear(), endBase.getMonth() + 12, 1));
  const options = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    options.push({ label: monthLabel(cursor), value: monthKey(cursor) });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return options;
}

function versionColor(versionName, names) {
  return versionPalette[names.indexOf(versionName) % versionPalette.length];
}

function paletteColor(name, names) {
  const index = Math.max(0, names.indexOf(name));
  return versionPalette[index % versionPalette.length];
}

function renderPeopleBlockLabel(names) {
  if (!names.length) return "";
  if (names.length === 1) return `<span>${escapeHtml(names[0])}</span>`;
  if (names.length === 2) return names.map((person) => `<span>${escapeHtml(person)}</span>`).join("");
  return `<strong>${names.length}人</strong><small>参与</small>`;
}

function renderPersonWorkLabel(works) {
  if (!works.length) return "";
  if (works.length === 1) return `<span>${escapeHtml(requirementById(works[0].requirementId)?.title || "未知需求")}</span>`;
  return `<strong>${works.length}项</strong><small>工作</small>`;
}

function buildRequirementRows(reqs, visibleDays) {
  return reqs
    .map((req) => {
      const works = filteredWorkItems([req.id]);
      const visiblePeople = visibleWorkerNames(req.people);
      const dayPeople = {};
      visibleDays.forEach((date) => {
        const key = formatDate(date);
        dayPeople[key] = unique(works.filter((work) => rangeContains(work, key)).map((work) => work.person));
      });
      if (!works.length) {
        return {
          type: "requirement",
          id: req.id,
          link: req.link,
          primary: req.title,
          secondary: visiblePeople.join("、") || "未分配",
          meta: requirementVersion(req.id)?.name || "无目标版本",
          status: req.status,
          ranges: [],
          total: 0,
          dayPeople,
        };
      }
      return {
        type: "requirement",
        id: req.id,
        link: req.link,
        primary: req.title,
        secondary: visibleWorkerNames([...req.people, ...works.map((work) => work.person)]).join("、") || "未分配",
        meta: requirementVersion(req.id)?.name || "无目标版本",
        status: req.status,
        ranges: works.map((work) => ({ start: work.start, end: work.end })),
        total: requirementWorkDays(works, visibleDays),
        dayPeople,
      };
    })
    .sort((a, b) => `${a.primary}-${a.secondary}`.localeCompare(`${b.primary}-${b.secondary}`, "zh-CN"));
}

function buildPersonRows(reqs, visibleDays) {
  const personFilter = els.personFilter.value;
  const query = els.search.value.trim().toLowerCase();
  const reqIds = reqs.map((req) => req.id);
  const works = filteredWorkItems(reqIds);
  const personNames = workingPeople().filter((name) => personFilter === "全部" || name === personFilter);
  return personNames
    .map((name) => {
      const personWorks = works.filter((work) => work.person === name);
      const dayWorks = {};
      visibleDays.forEach((date) => {
        const key = formatDate(date);
        dayWorks[key] = personWorks.filter((work) => rangeContains(work, key));
      });
      const occupiedDays = visibleDays.filter((date) => dayWorks[formatDate(date)].length).length;
      const percent = visibleDays.length ? Math.round((occupiedDays / visibleDays.length) * 100) : 0;
      const workNames = unique(personWorks.map((work) => requirementById(work.requirementId)?.title || "未知需求"));
      const queryText = `${name} ${workNames.join(" ")}`.toLowerCase();
      return {
        type: "person-load",
        id: name,
        primary: name,
        secondary: `已占用 ${occupiedDays}/${visibleDays.length} 天`,
        meta: workNames.length ? `${workNames.length} 项工作` : "暂无工作安排",
        status: "进行中",
        ranges: personWorks.map((work) => ({ start: work.start, end: work.end })),
        total: occupiedDays,
        totalLabel: `${percent}%`,
        dayWorks,
        workCount: workNames.length,
        queryText,
      };
    })
    .filter((row) => !query || row.queryText.includes(query))
    .sort((a, b) => {
      if (isExecutorRole() && currentPerson) {
        if (a.primary === currentPerson) return -1;
        if (b.primary === currentPerson) return 1;
      }
      return a.primary.localeCompare(b.primary, "zh-CN");
    });
}

function buildVersionRows(reqs, visibleDays) {
  const reqIds = new Set(reqs.map((req) => req.id));
  return versions
    .filter((version) => version.requirementIds.some((id) => reqIds.has(id)))
    .map((version) => {
      const versionReqs = version.requirementIds.map(requirementById).filter(Boolean).filter((req) => reqIds.has(req.id));
      const people = visibleWorkerNames(versionReqs.flatMap((req) => req.people));
      return {
        type: "version",
        id: version.id,
        version,
        primary: version.name,
        secondary: people.join("、") || "未分配",
        meta: `${versionReqs.length}个需求 · ${versionReqs.map((req) => req.title).join("、")}`,
        status: versionReqs.some((req) => req.status === "进行中") ? "进行中" : versionReqs.every((req) => req.status === "已完成") ? "已完成" : "未开始",
        ranges: [{ start: version.start, end: version.end }],
        total: eachVisibleDay(parseDate(version.start), parseDate(version.end)).length,
        requirements: versionReqs,
      };
    });
}

function rowsForView(reqs, visibleDays) {
  if (currentView === "person") return buildPersonRows(reqs, visibleDays);
  if (currentView === "version") return buildVersionRows(reqs, visibleDays);
  return buildRequirementRows(reqs, visibleDays);
}

function rowWorksOn(row, key) {
  return row.ranges.some((range) => rangeContains(range, key));
}

function blockClass(row, visibleDays, index) {
  const key = formatDate(visibleDays[index]);
  if (!rowWorksOn(row, key)) return "";
  const prev = visibleDays[index - 1];
  const next = visibleDays[index + 1];
  const hasPrev = prev && rowWorksOn(row, formatDate(prev));
  const hasNext = next && rowWorksOn(row, formatDate(next));
  return ["work-block", `work-${requirementStatusConfig[row.status].key}`, hasPrev ? "joins-left" : "starts", hasNext ? "joins-right" : "ends"].join(" ");
}

function renderSummary(reqs, visibleDays) {
  const works = filteredWorkItems(reqs.map((req) => req.id));
  const personDays = new Map();
  works.forEach((work) => {
    visibleDays.forEach((date) => {
      const key = formatDate(date);
      if (rangeContains(work, key)) {
        const bucket = personDays.get(work.person) || new Set();
        bucket.add(key);
        personDays.set(work.person, bucket);
      }
    });
  });
  const total = [...personDays.values()].reduce((sum, days) => sum + days.size, 0);
  els.summary.innerHTML = [
    [currentView === "version" ? "版本数" : "需求数", currentView === "version" ? buildVersionRows(reqs, visibleDays).length : reqs.length, "当前筛选范围", "open-requirement-manager"],
    ["人天", total, "按人员占用工作日去重", ""],
    ["参与同事", personDays.size, `${visibleDays.length} 个工作日横轴`, ""],
  ]
    .map(([label, value, hint, action]) =>
      action
        ? `<button class="metric metric-button" type="button" data-action="${action}"><b>${value}</b><span>${label} · ${hint}</span></button>`
        : `<div class="metric"><b>${value}</b><span>${label} · ${hint}</span></div>`,
    )
    .join("");
}

function renderPeopleLoad() {
  els.peopleLoad.innerHTML = "";
}

function renderPersonLoadView(reqs) {
  const monthDate = parseMonth(selectedMonth);
  const start = startOfMonth(monthDate);
  const end = endOfMonth(monthDate);
  const visibleDays = eachVisibleDay(start, end);
  const rows = buildPersonRows(reqs, visibleDays);
  if (selectedLoadPerson && !rows.some((row) => row.primary === selectedLoadPerson)) selectedLoadPerson = "";
  if (isExecutorRole() && currentPerson && rows.some((row) => row.primary === currentPerson) && (!selectedLoadPerson || !personLoadManualSelection)) {
    selectedLoadPerson = currentPerson;
  }
  renderSummary(reqs, visibleDays);
  els.rangeLabel.textContent = monthLabel(start);
  els.grid.style.removeProperty("--days");

  const options = monthOptions();
  const leftHeader = `<div class="person-load-header"><span>人员</span><select id="personMonthFilter">${options
    .map((option) => `<option value="${option.value}" ${option.value === selectedMonth ? "selected" : ""}>${escapeHtml(option.label)}</option>`)
    .join("")}</select><span>本月负载</span><span>饱和度</span></div>`;
  const leftRows = rows.length
    ? rows
        .map(
          (row) =>
            `<button class="person-load-card ${row.primary === selectedLoadPerson ? "is-selected" : ""}" type="button" data-action="select-load-person" data-id="${escapeHtml(row.primary)}"><span><b>${escapeHtml(row.primary)}</b><small>${escapeHtml(row.meta)}</small></span><span class="person-chip">${escapeHtml(row.secondary)}</span><strong>${escapeHtml(row.totalLabel)}</strong></button>`,
        )
        .join("")
    : `<div class="empty-state people-empty">当前筛选下暂无人员工作安排。</div>`;
  els.grid.innerHTML = `<div class="person-load-board"><section class="person-load-list">${leftHeader}<div class="person-load-list-body">${leftRows}</div></section><section class="person-load-detail">${renderPersonLoadDetail(selectedLoadPerson, visibleDays)}</section></div>`;
}

function renderPersonLoadDetail(person, visibleDays) {
  if (!person) return `<div class="calendar-detail-placeholder person-placeholder">请点击左侧人员查看详情。</div>`;
  const monthDate = parseMonth(selectedMonth);
  const start = startOfMonth(monthDate);
  const end = endOfMonth(monthDate);
  const leading = (start.getDay() + 6) % 7;
  const days = eachCalendarDay(start, end);
  const works = workItems.filter((work) => work.person === person);
  const occupiedDays = visibleDays.filter((date) => works.some((work) => rangeContains(work, formatDate(date)))).length;
  const percent = visibleDays.length ? Math.round((occupiedDays / visibleDays.length) * 100) : 0;
  return `<section class="month-panel person-calendar-panel"><div class="month-title"><div><strong>${escapeHtml(person)}</strong><span>${monthLabel(start)} · 已占用 ${occupiedDays}/${visibleDays.length} 天 · ${percent}%</span></div></div><div class="month-grid">${calendarWeekdays.map((day) => `<div class="calendar-weekday">${day}</div>`).join("")}${Array.from({ length: leading }, () => `<div class="calendar-day calendar-pad"></div>`).join("")}${days
    .map((date) => {
      const key = formatDate(date);
      const dayWorks = isHiddenDate(date) ? [] : works.filter((work) => rangeContains(work, key));
      return `<div class="calendar-day ${isHiddenDate(date) ? "muted-day" : ""}"><div class="calendar-date">${date.getDate()}</div><div class="calendar-bars">${dayWorks
        .map((work) => {
          const req = requirementById(work.requirementId);
          const title = req?.title || "未知需求";
          const action = canEditOtherWork(work) ? "edit-other-work" : canEditOwnWork(work) ? "edit-own-work" : "person-day-detail";
          return `<button class="calendar-version-bar person-work-bar" type="button" data-action="${action}" data-id="${escapeHtml(action === "person-day-detail" ? person : work.id)}" data-date="${key}" title="${escapeHtml(title)}">${escapeHtml(title)}</button>`;
        })
        .join("")}</div></div>`;
    })
    .join("")}</div></section>`;
}

function renderTimeline(reqs) {
  if (currentView === "requirement" && requirementViewMode === "calendar") {
    renderRequirementCalendar(reqs);
    return;
  }
  if (currentView === "version" && versionViewMode === "calendar") {
    renderTimeCalendar(reqs);
    return;
  }
  if (currentView === "person") {
    renderPersonLoadView(reqs);
    return;
  }
  const monthDate = parseMonth(selectedMonth);
  const bounds =
    currentView === "person"
      ? { start: startOfMonth(monthDate), end: endOfMonth(monthDate) }
      : dateBounds();
  const visibleDays = eachVisibleDay(bounds.start, bounds.end);
  const rows = rowsForView(reqs, visibleDays);
  els.grid.style.setProperty("--days", visibleDays.length);
  els.rangeLabel.textContent = `${bounds.start.getMonth() + 1}/${bounds.start.getDate()} - ${bounds.end.getMonth() + 1}/${bounds.end.getDate()}`;
  renderSummary(reqs, visibleDays);

  const labels =
    currentView === "person"
      ? ["人员", "本月负载", "饱和度"]
      : currentView === "version"
        ? ["版本 / 需求", "人员 / 状态", "周期"]
        : ["需求 / 版本", "人员 / 状态", "天数"];
  const firstLabel =
    currentView === "person"
      ? `<label class="person-month-inline"><span>人员</span><select id="personMonthFilter">${monthOptions()
          .map((option) => `<option value="${option.value}" ${option.value === selectedMonth ? "selected" : ""}>${escapeHtml(option.label)}</option>`)
          .join("")}</select></label>`
      : `<span>${labels[0]}</span>`;
  const header = `<div class="grid-header"><div class="left-head">${firstLabel}${labels.slice(1).map((label) => `<span>${label}</span>`).join("")}</div>${visibleDays
    .map((date) => `<div class="day-head"><span class="weekday">${weekdays[date.getDay()]}</span><span class="date">${date.getMonth() + 1}/${date.getDate()}</span></div>`)
    .join("")}</div>`;

    if (!rows.length) {
      els.grid.innerHTML = `${header}<div class="empty-state wide-empty">暂无内容。</div>`;
      return;
    }

    els.grid.innerHTML =
      header +
      rows
        .map((row) => {
        const ownWork = workItems.find((work) => work.requirementId === row.id && work.person === currentPerson);
        const cells = visibleDays
          .map((date, index) => {
            const key = formatDate(date);
            const className = blockClass(row, visibleDays, index);
            const peopleInCell = row.type === "requirement" ? row.dayPeople?.[key] || [] : [];
            const personDayWorks = row.type === "person-load" ? row.dayWorks?.[key] || [] : [];
            const label =
              row.type === "work" && className
                ? escapeHtml(row.work.person)
                : row.type === "person-load"
                  ? renderPersonWorkLabel(personDayWorks)
                : renderPeopleBlockLabel(peopleInCell);
            const action = row.type === "requirement" ? "requirement-day-detail" : row.type === "person-load" ? "person-day-detail" : "work-detail";
            const title = row.type === "requirement" ? `title="${escapeHtml(peopleInCell.join("、"))}"` : "";
            const attrs = row.type === "requirement" || row.type === "person-load" ? `data-date="${key}" ${title}` : "";
            return `<div class="day-cell">${className ? `<button class="${className} ${peopleInCell.length > 1 || personDayWorks.length > 1 ? "multi-people-block" : ""} ${peopleInCell.length > 2 || personDayWorks.length > 1 ? "people-count-block" : ""}" data-action="${action}" data-id="${escapeHtml(row.id)}" ${attrs}>${label}</button>` : ""}</div>`;
          })
          .join("");
        const actions =
          row.type === "version"
            ? `<button type="button" data-action="toggle-version" data-id="${row.id}">${expandedVersions.has(row.id) ? "收起" : "展开"}</button>${canManageVersion() ? `<button type="button" data-action="edit-version" data-id="${row.id}">编辑</button>` : ""}`
            : row.type === "work"
              ? canManageWork()
                ? `<button type="button" data-action="edit-work" data-id="${row.id}">编辑工作</button>`
                : ""
              : row.type === "person-load"
                ? ""
              : canEditOtherWork(ownWork)
                ? `<button type="button" data-action="edit-other-work" data-id="${ownWork.id}">编辑其他工作</button>`
                : canEditOwnWork(ownWork)
                  ? `<button type="button" data-action="edit-own-work" data-id="${ownWork.id}">编辑我的工作</button>`
                : canManageRequirement()
                  ? `<button type="button" data-action="edit-requirement" data-id="${row.id}">编辑</button>`
                  : "";
        return `<div class="grid-row ${row.type === "person-load" ? "person-load-row" : ""}"><div class="task-cell"><div class="task-main"><div class="task-title">${renderRequirementTitle(row.primary, row.link)}</div><div class="task-meta">${escapeHtml(row.meta)}</div><div class="row-actions">${actions}</div></div><div class="row-tags"><span class="person-chip">${escapeHtml(row.secondary)}</span><span class="status-chip status-${requirementStatusConfig[row.status].key}">${row.status}</span></div><div class="total-hours">${row.totalLabel || `${row.total}天`}</div></div>${cells}</div>${renderVersionDetail(row)}`;
      })
      .join("");
}

function renderRequirementTitle(title, link) {
  return link
    ? `<a class="requirement-link" href="${escapeHtml(link)}" target="_blank" rel="noreferrer">${escapeHtml(title)}</a>`
    : escapeHtml(title);
}

function renderVersionDetail(row) {
  if (row.type !== "version" || !expandedVersions.has(row.id)) return "";
  return `<div class="version-detail-row"><div class="version-detail-panel"><div class="version-detail-title">${escapeHtml(row.primary)} · 需求清单</div><ol class="version-requirements">${row.requirements
    .map((req) => `<li>${renderRequirementTitle(req.title, req.link)}</li>`)
    .join("")}</ol></div></div>`;
}

function renderTimeCalendar(reqs) {
  const options = monthOptions();
  if (!options.some((option) => option.value === selectedMonth)) selectedMonth = monthKey(new Date());
  const monthDate = parseMonth(selectedMonth);
  const start = startOfMonth(monthDate);
  const end = endOfMonth(monthDate);
  const visibleDays = eachVisibleDay(start, end);
  const reqIds = new Set(reqs.map((req) => req.id));
  const visibleVersions = versions.filter((version) => version.requirementIds.some((id) => reqIds.has(id)));
  const versionNames = visibleVersions.map((version) => version.name);
  renderSummary(reqs, visibleDays);
  els.rangeLabel.textContent = monthLabel(start);
  els.grid.style.removeProperty("--days");

  const leading = (start.getDay() + 6) % 7;
  const days = eachCalendarDay(start, end);
  const activeVersion = visibleVersions.find((version) => expandedVersions.has(version.id));
  els.grid.innerHTML = `<div class="calendar-board"><div class="calendar-main"><section class="month-panel"><div class="month-title"><select class="calendar-month-select" id="calendarMonthFilter">${options
    .map((option) => `<option value="${option.value}" ${option.value === selectedMonth ? "selected" : ""}>${escapeHtml(option.label)}</option>`)
    .join("")}</select></div><div class="month-grid">${calendarWeekdays.map((day) => `<div class="calendar-weekday">${day}</div>`).join("")}${Array.from({ length: leading }, () => `<div class="calendar-day calendar-pad"></div>`).join("")}${days
    .map((date) => {
      const key = formatDate(date);
      return `<div class="calendar-day ${isHiddenDate(date) ? "muted-day" : ""}"><div class="calendar-date">${date.getDate()}</div><div class="calendar-bars">${visibleVersions
        .map((version) => {
          const active = version.start <= key && key <= version.end;
          if (!active) return `<div class="calendar-version-spacer"></div>`;
          const color = versionColor(version.name, versionNames);
          return `<button class="calendar-version-bar ${expandedVersions.has(version.id) ? "is-selected" : ""}" type="button" data-action="select-version" data-id="${version.id}" style="--version-color:${color}">${escapeHtml(version.name)}</button>`;
        })
        .join("")}</div></div>`;
    })
    .join("")}</div></section></div><aside class="calendar-side-panel ${activeVersion ? "is-open" : ""}">${renderCalendarSide(activeVersion, versionNames)}</aside></div>`;
}

function requirementActiveOn(req, key) {
  if (isHiddenDate(parseDate(key))) return false;
  return filteredWorkItems([req.id]).some((work) => rangeContains(work, key));
}

function renderRequirementCalendar(reqs) {
  const options = monthOptions();
  if (!options.some((option) => option.value === selectedMonth)) selectedMonth = monthKey(new Date());
  const monthDate = parseMonth(selectedMonth);
  const start = startOfMonth(monthDate);
  const end = endOfMonth(monthDate);
  const visibleDays = eachVisibleDay(start, end);
  const requirementNames = reqs.map((req) => req.title);
  const activeRequirement = reqs.find((req) => expandedRequirements.has(req.id));
  renderSummary(reqs, visibleDays);
  els.rangeLabel.textContent = monthLabel(start);
  els.grid.style.removeProperty("--days");

  const leading = (start.getDay() + 6) % 7;
  const days = eachCalendarDay(start, end);
  els.grid.innerHTML = `<div class="calendar-board"><div class="calendar-main"><section class="month-panel"><div class="month-title"><select class="calendar-month-select" id="calendarMonthFilter">${options
    .map((option) => `<option value="${option.value}" ${option.value === selectedMonth ? "selected" : ""}>${escapeHtml(option.label)}</option>`)
    .join("")}</select></div><div class="month-grid">${calendarWeekdays.map((day) => `<div class="calendar-weekday">${day}</div>`).join("")}${Array.from({ length: leading }, () => `<div class="calendar-day calendar-pad"></div>`).join("")}${days
    .map((date) => {
      const key = formatDate(date);
      return `<div class="calendar-day ${isHiddenDate(date) ? "muted-day" : ""}"><div class="calendar-date">${date.getDate()}</div><div class="calendar-bars">${reqs
        .filter((req) => requirementActiveOn(req, key))
        .map((req) => {
          const color = paletteColor(req.title, requirementNames);
          return `<button class="calendar-version-bar ${expandedRequirements.has(req.id) ? "is-selected" : ""}" type="button" data-action="select-requirement-calendar" data-id="${req.id}" style="--version-color:${color}" title="${escapeHtml(req.title)}">${escapeHtml(req.title)}</button>`;
        })
        .join("")}</div></div>`;
    })
    .join("")}</div></section></div><aside class="calendar-side-panel ${activeRequirement ? "is-open" : ""}">${renderRequirementCalendarSide(activeRequirement, requirementNames, visibleDays)}</aside></div>`;
}

function renderRequirementCalendarSide(req, requirementNames, visibleDays) {
  if (!req) return `<div class="calendar-detail-placeholder">点击月历中的需求色条查看详情。</div>`;
  const works = filteredWorkItems([req.id]);
  const version = requirementVersion(req.id);
  const color = paletteColor(req.title, requirementNames);
  const occupiedDays = requirementWorkDays(works, visibleDays);
  return `<div class="calendar-detail-card" style="--version-color:${color}"><div class="calendar-detail-head"><div><div class="version-detail-title">${renderRequirementTitle(req.title, req.link)}</div><div class="calendar-detail-meta">${escapeHtml(version?.name || "无目标版本")} · ${escapeHtml(req.status)}</div></div><button class="icon-button" type="button" data-action="close-detail">×</button></div><div class="detail-chip-row">${visibleWorkerNames([...req.people, ...works.map((work) => work.person)])
    .map((person) => `<span class="person-chip">${escapeHtml(person)}</span>`)
    .join("")}</div><div class="version-detail-title small-title">工作记录 · ${occupiedDays} 天</div><ol class="version-requirements">${works.length
    ? works
        .map(
          (work) =>
            `<li><b>${escapeHtml(work.person)}</b> · ${escapeHtml(work.start)} 至 ${escapeHtml(work.end)}${work.content ? ` · ${escapeHtml(work.content)}` : ""}</li>`,
        )
        .join("")
    : `<li>暂无已登记的工作时间。</li>`}</ol></div>`;
}

function renderCalendarSide(version, versionNames) {
  if (!version) return `<div class="calendar-detail-placeholder">点击月历中的版本色条查看详情。</div>`;
  const reqs = version.requirementIds.map(requirementById).filter(Boolean);
  const color = versionColor(version.name, versionNames);
  const actions = `${canManageVersion() ? `<button class="secondary-action compact" type="button" data-action="edit-version" data-id="${version.id}">编辑</button>` : ""}<button class="icon-button" type="button" data-action="close-detail">×</button>`;
  return `<div class="calendar-detail-card" style="--version-color:${color}"><div class="calendar-detail-head"><div><div class="version-detail-title">${escapeHtml(version.name)}</div><div class="calendar-detail-meta">${escapeHtml(version.start)} 至 ${escapeHtml(version.end)}</div></div><div class="calendar-detail-actions">${actions}</div></div><div class="detail-chip-row">${visibleWorkerNames(reqs.flatMap((req) => req.people))
    .map((person) => `<span class="person-chip">${escapeHtml(person)}</span>`)
    .join("")}</div><div class="version-detail-title small-title">需求清单</div><ol class="version-requirements">${reqs
    .map((req) => `<li>${renderRequirementTitle(req.title, req.link)}</li>`)
    .join("")}</ol></div>`;
}

function openRequirementDialog(req) {
  els.requirementFormError.textContent = "";
  els.requirementForm.reset();
  renderPeoplePicker(req?.people || []);
  els.requirementId.value = req?.id || "";
  els.requirementDialogTitle.textContent = req ? "编辑需求" : "新增需求";
  els.requirementTitleInput.value = req?.title || "";
  els.requirementLinkInput.value = req?.link || "";
  els.requirementStatusInput.value = req?.status || "未开始";
  els.deleteRequirementButton.hidden = !req;
  els.requirementDialog.showModal();
}

function saveRequirement() {
  const selectedPeople = selectedPeopleFromPicker();
  if (!els.requirementTitleInput.value.trim() || !selectedPeople.length) {
    els.requirementFormError.textContent = "请填写需求名称和执行人。";
    return;
  }
  const req = normalizeRequirement({
    id: els.requirementId.value || createId("req"),
    title: els.requirementTitleInput.value.trim(),
    link: els.requirementLinkInput.value.trim(),
    people: selectedPeople,
    status: els.requirementStatusInput.value,
    createdBy: requirementById(els.requirementId.value)?.createdBy || currentUser?.username || "",
    createdByName: requirementById(els.requirementId.value)?.createdByName || currentUser?.name || currentPerson || "",
  });
  const index = requirements.findIndex((item) => item.id === req.id);
  if (index >= 0) requirements.splice(index, 1, req);
  else requirements.push(req);
  saveState();
  els.requirementDialog.close();
  render();
  if (els.requirementManagerDialog.open) renderRequirementManager();
}

function requirementWorkSummary(req) {
  const works = workItems.filter((work) => work.requirementId === req.id);
  const peopleNames = visibleWorkerNames([...req.people, ...works.map((work) => work.person)]);
  const version = requirementVersion(req.id);
  return {
    peopleNames,
    versionName: version?.name || "无目标版本",
    workCount: works.length,
  };
}

function fillSimpleSelect(select, values, allLabel, previousValue = "全部") {
  select.innerHTML = "";
  select.append(new Option(allLabel, "全部"));
  values.forEach((value) => select.append(new Option(value, value)));
  select.value = [...values, "全部"].includes(previousValue) ? previousValue : "全部";
}

function refreshRequirementManagerFilters(baseReqs) {
  fillSimpleSelect(els.managerStatusFilter, Object.keys(requirementStatusConfig), "全部状态", els.managerStatusFilter.value);
  fillSimpleSelect(
    els.managerPersonFilter,
    unique(baseReqs.flatMap((req) => requirementWorkSummary(req).peopleNames)).sort((a, b) => a.localeCompare(b, "zh-CN")),
    "全部执行人",
    els.managerPersonFilter.value,
  );
  fillSimpleSelect(
    els.managerVersionFilter,
    unique(baseReqs.map((req) => requirementVersion(req.id)?.name || "无目标版本")).sort((a, b) => a.localeCompare(b, "zh-CN")),
    "全部版本",
    els.managerVersionFilter.value,
  );
}

function managerFilteredRequirements(baseReqs) {
  const query = els.managerSearchInput.value.trim().toLowerCase();
  const status = els.managerStatusFilter.value;
  const person = els.managerPersonFilter.value;
  const versionName = els.managerVersionFilter.value;
  return baseReqs.filter((req) => {
    const summary = requirementWorkSummary(req);
    const searchText = `${req.title} ${summary.versionName} ${summary.peopleNames.join(" ")} ${req.status}`.toLowerCase();
    const statusMatch = status === "全部" || req.status === status;
    const personMatch = person === "全部" || summary.peopleNames.includes(person);
    const versionMatch = versionName === "全部" || summary.versionName === versionName;
    return (!query || searchText.includes(query)) && statusMatch && personMatch && versionMatch;
  });
}

function readManagerFilters() {
  try {
    return JSON.parse(localStorage.getItem(MANAGER_FILTER_STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveManagerFilters() {
  localStorage.setItem(
    MANAGER_FILTER_STORAGE_KEY,
    JSON.stringify({
      search: els.managerSearchInput.value,
      status: els.managerStatusFilter.value,
      person: els.managerPersonFilter.value,
      version: els.managerVersionFilter.value,
    }),
  );
}

function applyManagerFilters() {
  const saved = readManagerFilters();
  els.managerSearchInput.value = saved.search || "";
  els.managerStatusFilter.value = saved.status || "全部";
  els.managerPersonFilter.value = saved.person || (isExecutorRole() && currentPerson ? currentPerson : "全部");
  els.managerVersionFilter.value = saved.version || "全部";
}

function renderRequirementManager() {
  const baseReqs = filteredRequirements();
  refreshRequirementManagerFilters(baseReqs);
  const reqs = managerFilteredRequirements(baseReqs);
  els.requirementManagerHint.textContent = `当前筛选范围 ${baseReqs.length} 个 · 已显示 ${reqs.length} 个`;
  els.managerAddRequirementButton.hidden = !canCreateRequirement();
  if (!reqs.length) {
    els.requirementManagerList.innerHTML = `<div class="empty-state people-empty">没有匹配的需求。</div>`;
    return;
  }
  els.requirementManagerList.innerHTML = reqs
    .map((req) => {
      const summary = requirementWorkSummary(req);
      const actions = canManageRequirement()
        ? `<button type="button" data-action="manager-edit-requirement" data-id="${req.id}">编辑</button><button class="danger-link" type="button" data-action="manager-delete-requirement" data-id="${req.id}">删除</button>`
        : "";
      return `<article class="requirement-manager-item"><div class="manager-item-main"><div class="task-title">${renderRequirementTitle(req.title, req.link)}</div><div class="task-meta">${escapeHtml(summary.versionName)} · ${summary.workCount} 条工作记录</div><div class="row-tags"><span class="person-chip">${escapeHtml(summary.peopleNames.join("、") || "未分配")}</span><span class="status-chip status-${requirementStatusConfig[req.status].key}">${escapeHtml(req.status)}</span></div></div><div class="row-actions manager-actions">${actions}</div></article>`;
    })
    .join("");
}

function openRequirementManagerDialog() {
  applyManagerFilters();
  renderRequirementManager();
  els.requirementManagerDialog.showModal();
}

function deleteRequirementById(id) {
  queueDelete("requirements", id);
  requirements = requirements.filter((req) => req.id !== id);
  workItems = workItems.filter((work) => work.requirementId !== id);
  versions.forEach((version) => (version.requirementIds = version.requirementIds.filter((reqId) => reqId !== id)));
  saveState();
}

function handleRequirementManagerClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const id = button.dataset.id;
  if (button.dataset.action === "manager-edit-requirement") {
    openRequirementDialog(requirementById(id));
  }
  if (button.dataset.action === "manager-delete-requirement") {
    const req = requirementById(id);
    if (!req || !confirm(`确认删除「${req.title}」吗？相关工作记录也会一并删除。`)) return;
    deleteRequirementById(id);
    render();
    renderRequirementManager();
  }
}

function openVersionDialog(version) {
  els.versionFormError.textContent = "";
  els.versionForm.reset();
  renderVersionRequirementPicker(version);
  els.versionId.value = version?.id || "";
  els.versionDialogTitle.textContent = version ? "编辑版本" : "新增版本";
  els.versionNameInput.value = version?.name || "";
  els.versionStartInput.value = version?.start || todayKey();
  els.versionEndInput.value = version?.end || formatDate(addDays(parseDate(todayKey()), 6));
  els.deleteVersionButton.hidden = !version;
  els.versionDialog.showModal();
}

function saveVersion() {
  const requirementIds = selectedRequirementsFromPicker();
  if (!els.versionNameInput.value.trim() || !isValidDateKey(els.versionStartInput.value) || !isValidDateKey(els.versionEndInput.value)) {
    els.versionFormError.textContent = "请填写版本名称和时间。";
    return;
  }
  const version = normalizeVersion({
    id: els.versionId.value || createId("ver"),
    name: els.versionNameInput.value.trim(),
    start: els.versionStartInput.value,
    end: els.versionEndInput.value,
    requirementIds,
  });
  const index = versions.findIndex((item) => item.id === version.id);
  if (index >= 0) versions.splice(index, 1, version);
  else versions.push(version);
  saveState();
  els.versionDialog.close();
  render();
}

function assignmentRowTemplate(data = {}) {
  const personOptions = workingPeople()
    .map((name) => `<option value="${escapeHtml(name)}" ${name === data.person ? "selected" : ""}>${escapeHtml(name)}</option>`)
    .join("");
  return `<div class="assignment-item"><label class="field"><span>负责人</span><select class="assignment-person" required><option value="">选择负责人</option>${personOptions}</select></label><label class="field"><span>开始日期</span><input class="assignment-start" required type="date" value="${escapeHtml(data.start || todayKey())}" /></label><label class="field"><span>结束日期</span><input class="assignment-end" required type="date" value="${escapeHtml(data.end || todayKey())}" /></label><button class="icon-button" type="button" data-action="remove-assignment" aria-label="移除">×</button></div>`;
}

function addAssignmentRow(data = {}) {
  els.workAssignmentList.insertAdjacentHTML("beforeend", assignmentRowTemplate(data));
}

function assignmentRows() {
  return [...els.workAssignmentList.querySelectorAll(".assignment-item")].map((row) => ({
    person: row.querySelector(".assignment-person").value,
    start: row.querySelector(".assignment-start").value,
    end: row.querySelector(".assignment-end").value,
  }));
}

function requirementCreatedByCurrentUser(req) {
  return Boolean(req && currentUser && (req.createdBy === currentUser.username || req.createdByName === currentUser.name));
}

function workDialogRequirements() {
  if (currentRole === "pm" && els.workMineOnlyInput.checked) return requirements.filter(requirementCreatedByCurrentUser);
  return requirements;
}

function renderWorkRequirementOptions(selectedId = "") {
  const options = workDialogRequirements();
  els.workRequirementInput.innerHTML = options.length
    ? options.map((req) => `<option value="${req.id}">${escapeHtml(req.title)}</option>`).join("")
    : `<option value="">暂无可选需求</option>`;
  els.workRequirementInput.value = selectedId && options.some((req) => req.id === selectedId) ? selectedId : options[0]?.id || "";
}

function openWorkDialog(work, preset = {}) {
  const source = work || preset;
  const isEdit = Boolean(work?.id);
  const lockAssignment = Boolean(preset.lockAssignment);
  const bulkAssign = !isEdit && !lockAssignment && currentRole === "pm";
  els.workFormError.textContent = "";
  els.workForm.reset();
  els.workRequirementInput.disabled = lockAssignment;
  els.workPersonInput.disabled = lockAssignment;
  els.workAssignmentList.innerHTML = "";
  els.workMineOnlyField.hidden = !bulkAssign;
  els.workMineOnlyInput.checked = false;
  renderWorkRequirementOptions(source?.requirementId);
  populatePeopleSelect(els.workPersonInput, source?.person ? [source.person] : [], "选择负责人");
  els.workId.value = work?.id || "";
  els.workDialogTitle.textContent = bulkAssign ? "分配需求工作" : isEdit ? "编辑工作" : "登记工作";
  els.workPersonInput.value = source?.person || "";
  els.workStartInput.value = source?.start || todayKey();
  els.workEndInput.value = source?.end || todayKey();
  els.workContentInput.value = source?.content || "";
  workImageDraft = [...(source?.images || [])];
  renderWorkImages();
  els.workContentInput.required = false;
  els.workSingleFields.forEach((field) => (field.hidden = bulkAssign));
  els.workSingleFields.forEach((field) => {
    field.querySelectorAll("select, input").forEach((control) => {
      control.disabled = bulkAssign || (lockAssignment && (control === els.workPersonInput || control === els.workRequirementInput));
    });
  });
  els.workAssignmentSection.hidden = !bulkAssign;
  els.workContentField.hidden = bulkAssign;
  els.workImagePasteBox.hidden = bulkAssign;
  els.workImageList.hidden = bulkAssign;
  if (bulkAssign) addAssignmentRow();
  els.deleteWorkButton.hidden = !isEdit;
  els.workDialog.classList.toggle("locked-assignment", lockAssignment);
  els.workDialog.classList.toggle("bulk-assignment", bulkAssign);
  els.workDialog.showModal();
}

function saveWork() {
  if (!els.workAssignmentSection.hidden) {
    const requirementId = els.workRequirementInput.value;
    const rows = assignmentRows();
    const invalid = rows.some((row) => !row.person || !isValidDateKey(row.start) || !isValidDateKey(row.end));
    if (!requirementId || !rows.length || invalid) {
      els.workFormError.textContent = "请至少添加一位负责人，并填写完整时间。";
      return;
    }
    const removedAssignments = workItems.filter((work) => work.requirementId === requirementId && work.content === PM_ASSIGNMENT_CONTENT);
    removedAssignments.forEach((work) => queueDelete("workItems", work.id));
    workItems = workItems.filter((work) => !(work.requirementId === requirementId && work.content === PM_ASSIGNMENT_CONTENT));
    rows.forEach((row) => {
      workItems.push(
        normalizeWork({
          requirementId,
          person: row.person,
          start: row.start,
          end: row.end,
          content: PM_ASSIGNMENT_CONTENT,
          images: [],
        }),
      );
    });
    const req = requirementById(requirementId);
    if (req) req.people = unique(rows.map((row) => row.person));
    saveState();
    els.workDialog.close();
    render();
    return;
  }
  const existingWork = workItems.find((item) => item.id === els.workId.value);
  if (existingWork && !canManageWork() && !canEditOwnWork(existingWork)) {
    els.workFormError.textContent = "只能修改自己登记的工作。";
    return;
  }
  if (!els.workRequirementInput.value || !els.workPersonInput.value || !isValidDateKey(els.workStartInput.value) || !isValidDateKey(els.workEndInput.value)) {
    els.workFormError.textContent = "请填写需求、负责人和时间。";
    return;
  }
  if (!els.workContentInput.value.trim() && !workImageDraft.length) {
    els.workFormError.textContent = "请填写工作内容，或粘贴至少一张图片。";
    return;
  }
  const work = normalizeWork({
    id: els.workId.value || createId("work"),
    requirementId: existingWork && !canManageWork() ? existingWork.requirementId : els.workRequirementInput.value,
    person: existingWork && !canManageWork() ? existingWork.person : els.workPersonInput.value,
    start: els.workStartInput.value,
    end: els.workEndInput.value,
    content: els.workContentInput.value.trim(),
    images: workImageDraft,
  });
  const index = workItems.findIndex((item) => item.id === work.id);
  if (index >= 0) workItems.splice(index, 1, work);
  else workItems.push(work);
  saveState();
  els.workDialog.close();
  render();
}

function openOtherWorkDialog(work) {
  const req = work ? requirementById(work.requirementId) : null;
  els.otherWorkFormError.textContent = "";
  els.otherWorkForm.reset();
  els.otherWorkId.value = work?.id || "";
  els.otherWorkDialogTitle.textContent = work ? "编辑其他工作" : "登记其他工作";
  els.otherWorkTitleInput.value = req?.title || "";
  els.otherWorkStartInput.value = work?.start || todayKey();
  els.otherWorkEndInput.value = work?.end || todayKey();
  els.otherWorkStatusInput.value = req?.status || "进行中";
  els.otherWorkContentInput.value = work?.content || "";
  otherWorkImageDraft = [...(work?.images || [])];
  renderWorkImages();
  els.deleteOtherWorkButton.hidden = !work;
  els.otherWorkDialog.showModal();
}

function saveOtherWork() {
  if (!currentPerson) {
    els.otherWorkFormError.textContent = "请先选择当前人员。";
    return;
  }
  if (!els.otherWorkTitleInput.value.trim() || !isValidDateKey(els.otherWorkStartInput.value) || !isValidDateKey(els.otherWorkEndInput.value)) {
    els.otherWorkFormError.textContent = "请填写工作标题和时间。";
    return;
  }
  if (!els.otherWorkContentInput.value.trim() && !otherWorkImageDraft.length) {
    els.otherWorkFormError.textContent = "请填写工作内容，或粘贴至少一张图片。";
    return;
  }
  const existingWork = workItems.find((work) => work.id === els.otherWorkId.value);
  if (existingWork) {
    if (!canEditOtherWork(existingWork)) {
      els.otherWorkFormError.textContent = "只能修改自己登记的其他工作。";
      return;
    }
    const req = requirementById(existingWork.requirementId);
    if (req) {
      req.title = els.otherWorkTitleInput.value.trim();
      req.people = [currentPerson];
      req.status = els.otherWorkStatusInput.value;
      req.kind = "other";
      req.createdBy = req.createdBy || currentUser?.username || "";
      req.createdByName = req.createdByName || currentUser?.name || currentPerson || "";
    }
    existingWork.start = els.otherWorkStartInput.value;
    existingWork.end = els.otherWorkEndInput.value;
    existingWork.content = els.otherWorkContentInput.value.trim();
    existingWork.images = otherWorkImageDraft;
    saveState();
    els.otherWorkDialog.close();
    render();
    return;
  }
  const req = normalizeRequirement({
    title: els.otherWorkTitleInput.value.trim(),
    people: [currentPerson],
    status: els.otherWorkStatusInput.value,
    kind: "other",
    createdBy: currentUser?.username || "",
    createdByName: currentUser?.name || currentPerson || "",
  });
  requirements.push(req);
  workItems.push(
    normalizeWork({
      requirementId: req.id,
      person: currentPerson,
      start: els.otherWorkStartInput.value,
      end: els.otherWorkEndInput.value,
      content: els.otherWorkContentInput.value.trim(),
      images: otherWorkImageDraft,
    }),
  );
  saveState();
  els.otherWorkDialog.close();
  render();
}

function deleteOtherWork() {
  const work = workItems.find((item) => item.id === els.otherWorkId.value);
  if (!work || !canEditOtherWork(work)) {
    els.otherWorkFormError.textContent = "只能删除自己登记的其他工作。";
    return;
  }
  const requirementId = work.requirementId;
  queueDelete("workItems", work.id);
  workItems = workItems.filter((item) => item.id !== work.id);
  if (!workItems.some((item) => item.requirementId === requirementId)) {
    queueDelete("requirements", requirementId);
    requirements = requirements.filter((req) => req.id !== requirementId);
  }
  saveState();
  els.otherWorkDialog.close();
  render();
}

function renderPendingWorkList() {
  const reqs = pendingRequirementsForCurrentPerson();
  els.pendingWorkTitle.textContent = `待处理工作（${reqs.length}）`;
  if (!currentPerson) {
    els.pendingWorkList.innerHTML = `<div class="empty-state people-empty">请先选择当前人员。</div>`;
    return;
  }
  if (!reqs.length) {
    els.pendingWorkList.innerHTML = `<div class="empty-state people-empty">当前没有待处理工作。</div>`;
    return;
  }
  els.pendingWorkList.innerHTML = reqs
    .map((req) => {
      const version = requirementVersion(req.id);
      const peopleText = visibleWorkerNames(req.people).join("、") || "未分配";
      return `<button class="pending-work-item" type="button" data-action="start-pending-work" data-id="${req.id}"><span class="choice-mark">+</span><span class="pending-work-main"><b>${escapeHtml(req.title)}</b><small>${escapeHtml(version?.name || "无目标版本")} · ${escapeHtml(req.status)} · ${escapeHtml(peopleText)}</small></span><strong>登记工作</strong></button>`;
    })
    .join("");
}

function openPendingWorkDialog() {
  renderPendingWorkList();
  els.pendingWorkDialog.showModal();
}

function handlePendingWorkClick(event) {
  const button = event.target.closest("button[data-action='start-pending-work']");
  if (!button) return;
  els.pendingWorkDialog.close();
  openWorkDialog(null, {
    requirementId: button.dataset.id,
    person: currentPerson,
    start: todayKey(),
    end: todayKey(),
    content: "",
    lockAssignment: true,
  });
}

function renderWorkDetailItem(work) {
  const req = requirementById(work.requirementId);
  const days = eachVisibleDay(parseDate(work.start), parseDate(work.end)).length;
  const images = work.images || [];
  return `<article class="work-detail-item"><div class="work-detail-meta"><b>${escapeHtml(work.person)}</b><span>${escapeHtml(req?.title || "未知需求")}</span><strong>${days}天</strong></div><p>${escapeHtml(work.content || "未填写工作内容").replaceAll("\n", "<br>")}</p>${
    images.length
      ? `<div class="work-detail-images">${images.map((src, index) => `<a href="${escapeHtml(src)}" target="_blank" rel="noreferrer"><img src="${escapeHtml(src)}" alt="工作内容图片 ${index + 1}" /></a>`).join("")}</div>`
      : ""
  }</article>`;
}

function openWorkDetailDialog(title, works) {
  els.workDetailTitle.textContent = title;
  els.workDetailBody.innerHTML = works.map(renderWorkDetailItem).join("");
  els.workDetailDialog.showModal();
}

function showWorkDetail(work) {
  if (!work) return;
  const req = requirementById(work.requirementId);
  openWorkDetailDialog(`${work.person} · ${req?.title || "未知需求"}`, [work]);
}

function showRequirementDayDetail(requirementId, dateKey) {
  if (isHiddenDate(parseDate(dateKey))) return;
  const req = requirementById(requirementId);
  const works = filteredWorkItems([requirementId]).filter((work) => rangeContains(work, dateKey));
  if (!req || !works.length) return;
  openWorkDetailDialog(`${req.title} · ${dateKey}`, works);
}

function showPersonDayDetail(person, dateKey) {
  if (isHiddenDate(parseDate(dateKey))) return;
  const works = workItems.filter((work) => work.person === person && rangeContains(work, dateKey));
  if (!works.length) return;
  openWorkDetailDialog(`${person} · ${dateKey}`, works);
}

function renderHolidayMonthOptions() {
  const options = monthOptions();
  if (!options.some((option) => option.value === calendarEditMonth)) {
    options.push({ label: monthLabel(parseMonth(calendarEditMonth)), value: calendarEditMonth });
    options.sort((a, b) => a.value.localeCompare(b.value));
  }
  els.holidayMonthInput.innerHTML = options.map((option) => `<option value="${option.value}">${escapeHtml(option.label)}</option>`).join("");
  els.holidayMonthInput.value = calendarEditMonth;
}

function renderHolidayCalendar() {
  renderHolidayMonthOptions();
  const start = startOfMonth(parseMonth(calendarEditMonth));
  const end = endOfMonth(start);
  const leading = (start.getDay() + 6) % 7;
  const days = eachCalendarDay(start, end);
  els.holidayCalendarGrid.innerHTML = `${calendarWeekdays.map((day) => `<div class="calendar-admin-weekday">${day}</div>`).join("")}${Array.from(
    { length: leading },
    () => `<div class="calendar-admin-day calendar-pad"></div>`,
  ).join("")}${days
    .map((date) => {
      const key = formatDate(date);
      const workday = isWorkdayWithSets(date, draftHolidays, draftWorkdays);
      const adjusted = draftHolidays.has(key) || draftWorkdays.has(key);
      return `<button class="calendar-admin-day ${workday ? "is-workday" : "is-restday"} ${adjusted ? "is-adjusted" : ""}" type="button" data-date="${key}" aria-pressed="${workday}" title="${key} · ${workday ? "工作日" : "休息日"}"><strong>${date.getDate()}</strong><span>${workday ? "工作日" : "休息日"}</span>${adjusted ? "<em>已调整</em>" : ""}</button>`;
    })
    .join("")}`;
}

function toggleCalendarDate(dateKey) {
  const date = parseDate(dateKey);
  const defaultWorkday = isDefaultWorkday(date);
  const nextWorkday = !isWorkdayWithSets(date, draftHolidays, draftWorkdays);
  draftHolidays.delete(dateKey);
  draftWorkdays.delete(dateKey);
  if (nextWorkday !== defaultWorkday) {
    if (nextWorkday) draftWorkdays.add(dateKey);
    else draftHolidays.add(dateKey);
  }
  renderHolidayCalendar();
}

function shiftCalendarEditMonth(amount) {
  const date = parseMonth(calendarEditMonth);
  date.setMonth(date.getMonth() + amount);
  calendarEditMonth = monthKey(date);
  renderHolidayCalendar();
}

function openHolidayDialog() {
  if (currentRole !== "admin") return;
  els.holidayFormError.textContent = "";
  calendarEditMonth = selectedMonth || monthKey(new Date());
  draftHolidays = new Set(holidays);
  draftWorkdays = new Set(workdays);
  renderHolidayCalendar();
  els.holidayDialog.showModal();
}

function saveHolidays() {
  holidays = new Set([...draftHolidays].filter(isValidDateKey));
  workdays = new Set([...draftWorkdays].filter(isValidDateKey));
  saveState();
  els.holidayDialog.close();
  render();
}

function renderPeopleManager(selectedId = els.personId.value) {
  const sortedPeople = [...people].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  els.peopleList.innerHTML = sortedPeople.length
    ? sortedPeople
        .map(
          (person) =>
            `<button class="people-row ${person.id === selectedId ? "is-active" : ""}" type="button" data-action="edit-person" data-id="${person.id}"><span>${escapeHtml(person.name)}</span><b>${escapeHtml(person.role)}</b></button>`,
        )
        .join("")
    : `<div class="empty-state people-empty">还没有人员，请先新建。</div>`;
}

function clearPersonForm() {
  els.personFormError.textContent = "";
  els.personId.value = "";
  els.personNameInput.value = "";
  els.personRoleInput.value = "研发人员";
  els.deletePersonButton.hidden = true;
  renderPeopleManager("");
}

function editPerson(person) {
  if (!person) return clearPersonForm();
  els.personFormError.textContent = "";
  els.personId.value = person.id;
  els.personNameInput.value = person.name;
  els.personRoleInput.value = person.role;
  els.deletePersonButton.hidden = false;
  renderPeopleManager(person.id);
}

function openPeopleDialog() {
  clearPersonForm();
  renderPeopleManager();
  els.peopleDialog.showModal();
}

function savePerson() {
  const name = els.personNameInput.value.trim();
  const role = els.personRoleInput.value;
  if (!name) {
    els.personFormError.textContent = "请填写姓名。";
    return;
  }
  const duplicate = people.find((person) => person.name === name && person.id !== els.personId.value);
  if (duplicate) {
    els.personFormError.textContent = "这个姓名已经存在。";
    return;
  }
  const id = els.personId.value || createId("person");
  const previous = people.find((person) => person.id === id);
  const next = normalizePerson({ id, name, role });
  if (previous && previous.name !== name) {
    requirements.forEach((req) => {
      req.people = req.people.map((personName) => (personName === previous.name ? name : personName));
    });
    workItems.forEach((work) => {
      if (work.person === previous.name) work.person = name;
    });
  }
  const index = people.findIndex((person) => person.id === id);
  if (index >= 0) people.splice(index, 1, next);
  else people.push(next);
  saveState();
  editPerson(next);
  render();
}

function deletePerson() {
  const person = people.find((item) => item.id === els.personId.value);
  if (!person) return;
  if (!confirm(`确认删除「${person.name}」吗？相关需求分配和工作记录也会一并移除。`)) return;
  queueDelete("people", person.id);
  workItems.filter((work) => work.person === person.name).forEach((work) => queueDelete("workItems", work.id));
  people = people.filter((item) => item.id !== person.id);
  requirements.forEach((req) => {
    req.people = req.people.filter((personName) => personName !== person.name);
  });
  workItems = workItems.filter((work) => work.person !== person.name);
  saveState();
  clearPersonForm();
  render();
}

async function loadAccounts() {
  const payload = await apiRequest("/api/accounts", { method: "GET" });
  accounts = payload.accounts || [];
  return accounts;
}

function renderAccountManager(selectedId = els.accountId.value) {
  els.accountList.innerHTML = accounts.length
    ? accounts
        .map(
          (account) =>
            `<button class="people-row ${account.id === selectedId ? "is-active" : ""}" type="button" data-action="edit-account" data-id="${account.id}"><span>${escapeHtml(account.username)}</span><b>${escapeHtml(account.name)} · ${escapeHtml(accountRoles[account.role] || account.role)}</b></button>`,
        )
        .join("")
    : `<div class="empty-state people-empty">还没有账号。</div>`;
}

function renderAccountPersonOptions(selectedPersonId = "") {
  const sortedPeople = [...people].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  els.accountPersonInput.innerHTML = [
    `<option value="">选择已有人员</option>`,
    ...sortedPeople.map((person) => `<option value="${escapeHtml(person.id)}">${escapeHtml(person.name)} · ${escapeHtml(person.role)}</option>`),
  ].join("");
  els.accountPersonInput.value = selectedPersonId && sortedPeople.some((person) => person.id === selectedPersonId) ? selectedPersonId : "";
  updateAccountRolePreview();
}

function updateAccountRolePreview() {
  const person = people.find((item) => item.id === els.accountPersonInput.value);
  els.accountRoleInput.value = person ? person.role : "请选择人员";
}

function clearAccountForm() {
  els.accountFormError.textContent = "";
  els.accountId.value = "";
  els.accountUsernameInput.value = "";
  renderAccountPersonOptions("");
  els.deleteAccountButton.hidden = true;
  renderAccountManager("");
}

function editAccount(account) {
  if (!account) return clearAccountForm();
  els.accountFormError.textContent = "";
  els.accountId.value = account.id;
  els.accountUsernameInput.value = account.username;
  renderAccountPersonOptions(account.personId);
  els.deleteAccountButton.hidden = account.username === "admin";
  renderAccountManager(account.id);
}

async function openAccountDialog() {
  if (currentRole !== "admin") return;
  try {
    await loadAccounts();
    clearAccountForm();
    els.accountDialog.showModal();
  } catch (error) {
    showToast("error", "账号列表加载失败", error.message);
  }
}

async function saveAccount() {
  const data = {
    id: els.accountId.value,
    username: els.accountUsernameInput.value.trim(),
    personId: els.accountPersonInput.value,
  };
  try {
    const payload = await apiRequest("/api/accounts", { method: "POST", body: JSON.stringify(data) });
    accounts = payload.accounts || [];
    renderAccountManager(data.id);
    showToast("success", "账号已保存", "新账号初始密码为 123456，首次登录后需要本人重设密码。");
    const remoteState = await loadRemoteState();
    if (remoteState) {
      lastSyncedState = cloneState(remoteState);
      applyState(remoteState);
      render();
    }
  } catch (error) {
    els.accountFormError.textContent = error.message;
  }
}

async function deleteAccount() {
  const id = els.accountId.value;
  const account = accounts.find((item) => item.id === id);
  if (!account || !confirm(`确认删除账号「${account.username}」吗？`)) return;
  try {
    const payload = await apiRequest(`/api/accounts?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    accounts = payload.accounts || [];
    clearAccountForm();
    showToast("success", "账号已删除", "该账号不能再登录。");
  } catch (error) {
    els.accountFormError.textContent = error.message;
  }
}

function handleGridClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const id = button.dataset.id;
  if (button.dataset.action === "work-detail") showWorkDetail(workItems.find((work) => work.id === id));
  if (button.dataset.action === "requirement-day-detail") showRequirementDayDetail(id, button.dataset.date);
  if (button.dataset.action === "person-day-detail") showPersonDayDetail(id, button.dataset.date);
  if (button.dataset.action === "edit-other-work") openOtherWorkDialog(workItems.find((work) => work.id === id));
  if (button.dataset.action === "edit-own-work") openWorkDialog(workItems.find((work) => work.id === id), { lockAssignment: true });
  if (button.dataset.action === "edit-work") openWorkDialog(workItems.find((work) => work.id === id));
  if (button.dataset.action === "edit-requirement") openRequirementDialog(requirementById(id));
  if (button.dataset.action === "edit-version") openVersionDialog(versionById(id));
  if (button.dataset.action === "toggle-version") {
    expandedVersions.has(id) ? expandedVersions.delete(id) : expandedVersions.add(id);
    render();
  }
  if (button.dataset.action === "select-version") {
    expandedVersions.clear();
    expandedVersions.add(id);
    render();
  }
  if (button.dataset.action === "select-requirement-calendar") {
    expandedRequirements.clear();
    expandedRequirements.add(id);
    render();
  }
  if (button.dataset.action === "select-load-person") {
    personLoadManualSelection = true;
    selectedLoadPerson = id;
    render();
  }
  if (button.dataset.action === "close-detail") {
    expandedVersions.clear();
    expandedRequirements.clear();
    render();
  }
}

function render() {
  if (currentUser) {
    currentRole = currentUser.role;
    currentPerson = currentUser.name || "";
    els.roleSelect.value = currentRole;
  } else {
    currentRole = els.roleSelect.value;
  }
  applyRolePermissions();
  refreshFilters();
  const activeViewMode = currentView === "requirement" ? requirementViewMode : versionViewMode;
  const supportsModeSwitch = currentView === "requirement" || currentView === "version";
  els.viewModeControl.hidden = !supportsModeSwitch;
  els.viewModeButtons.forEach((button) => button.classList.toggle("is-active", button.dataset.viewMode === activeViewMode));
  document.body.classList.toggle(
    "time-view",
    (currentView === "version" && versionViewMode === "calendar") || (currentView === "requirement" && requirementViewMode === "calendar"),
  );
  document.body.classList.toggle("person-view", currentView === "person");
  renderTimeline(filteredRequirements());
}

function openResetPasswordDialog() {
  document.body.classList.add("auth-view");
  els.resetPasswordFormError.textContent = "";
  els.currentPasswordInput.value = "";
  els.newPasswordInput.value = "";
  els.confirmPasswordInput.value = "";
  if (els.loginDialog.open) els.loginDialog.close();
  if (!els.resetPasswordDialog.open) els.resetPasswordDialog.showModal();
}

async function init() {
  if (!loginEventsBound) {
    loginEventsBound = true;
    els.loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      els.loginFormError.textContent = "";
      try {
        currentUser = await login(els.loginUsernameInput.value, els.loginPasswordInput.value);
        if (currentUser.mustResetPassword) {
          openResetPasswordDialog();
          return;
        }
        window.location.reload();
      } catch (error) {
        els.loginFormError.textContent = error.message;
      }
    });
    els.resetPasswordForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      els.resetPasswordFormError.textContent = "";
      const nextPassword = els.newPasswordInput.value;
      if (nextPassword !== els.confirmPasswordInput.value) {
        els.resetPasswordFormError.textContent = "两次输入的新密码不一致。";
        return;
      }
      try {
        await changePassword(els.currentPasswordInput.value, nextPassword);
        showToast("success", "密码已修改", "请使用新密码重新登录。");
        window.location.reload();
      } catch (error) {
        els.resetPasswordFormError.textContent = error.message;
      }
    });
  }
  currentUser = await loadSession();
  if (!currentUser) {
    document.body.classList.add("auth-view");
    els.loginUsernameInput.value = "admin";
    els.loginDialog.showModal();
    return;
  }
  if (currentUser.mustResetPassword) {
    openResetPasswordDialog();
    return;
  }
  document.body.classList.remove("auth-view");
  currentRole = currentUser.role;
  currentPerson = currentUser.name || "";
  els.roleSelect.value = currentRole;
  const state = await loadState();
  people = (state.people || []).map(normalizePerson).filter((person) => person.name);
  requirements = (state.requirements || []).map(normalizeRequirement);
  versions = (state.versions || []).map(normalizeVersion).filter((version) => isValidDateKey(version.start) && isValidDateKey(version.end));
  workItems = (state.workItems || []).map(normalizeWork).filter((work) => work.requirementId && work.person && isValidDateKey(work.start) && isValidDateKey(work.end));
  holidays = new Set(state.holidays || []);
  workdays = new Set(state.workdays || []);
  ensurePeopleFromExistingData();

  els.roleSelect.addEventListener("input", () => {
    personLoadManualSelection = false;
    selectedLoadPerson = "";
    render();
  });
  els.currentPersonSelect.addEventListener("input", () => {
    currentPerson = els.currentPersonSelect.value;
    selectedLoadPerson = currentPerson;
    personLoadManualSelection = false;
    render();
  });
  els.pendingWorkButton.addEventListener("click", openPendingWorkDialog);
  els.closePendingWorkDialog.addEventListener("click", () => els.pendingWorkDialog.close());
  els.pendingWorkList.addEventListener("click", handlePendingWorkClick);
  els.summary.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action='open-requirement-manager']");
    if (button) openRequirementManagerDialog();
  });
  els.personFilter.addEventListener("input", render);
  els.statusFilter.addEventListener("input", render);
  els.search.addEventListener("input", render);
  els.grid.addEventListener("click", handleGridClick);
  els.grid.addEventListener("input", (event) => {
    if (event.target.id === "calendarMonthFilter") {
      selectedMonth = event.target.value;
      monthTouched = true;
      render();
    }
    if (event.target.id === "personMonthFilter") {
      selectedMonth = event.target.value;
      monthTouched = true;
      render();
    }
  });
  els.viewButtons.forEach((button) => {
    button.addEventListener("click", () => {
      currentView = button.dataset.view;
      if (currentView === "person" && isExecutorRole() && currentPerson) {
        selectedLoadPerson = currentPerson;
        personLoadManualSelection = false;
      }
      els.viewButtons.forEach((item) => item.classList.toggle("is-active", item === button));
      render();
    });
  });
  els.viewModeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (currentView === "requirement") requirementViewMode = button.dataset.viewMode;
      if (currentView === "version") versionViewMode = button.dataset.viewMode;
      render();
    });
  });
  els.addRequirementButton.addEventListener("click", () => openRequirementDialog());
  els.managerAddRequirementButton.addEventListener("click", () => {
    els.requirementManagerDialog.close();
    openRequirementDialog();
  });
  els.addVersionButton.addEventListener("click", () => openVersionDialog());
  els.addWorkButton.addEventListener("click", () => openWorkDialog());
  els.addOtherWorkButton.addEventListener("click", () => openOtherWorkDialog());
  els.peopleManageButton.addEventListener("click", openPeopleDialog);
  els.accountManageButton.addEventListener("click", openAccountDialog);
  els.logoutButton.addEventListener("click", logout);
  els.holidayButton.addEventListener("click", openHolidayDialog);
  els.holidayMonthInput.addEventListener("input", () => {
    calendarEditMonth = els.holidayMonthInput.value;
    renderHolidayCalendar();
  });
  els.calendarPrevMonthButton.addEventListener("click", () => shiftCalendarEditMonth(-1));
  els.calendarNextMonthButton.addEventListener("click", () => shiftCalendarEditMonth(1));
  els.holidayCalendarGrid.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-date]");
    if (!button) return;
    toggleCalendarDate(button.dataset.date);
  });
  els.closeRequirementDialog.addEventListener("click", () => els.requirementDialog.close());
  els.cancelRequirementButton.addEventListener("click", () => els.requirementDialog.close());
  els.requirementPeoplePicker.addEventListener("click", (event) => {
    const button = event.target.closest(".people-choice");
    if (!button) return;
    const selected = button.classList.toggle("is-selected");
    button.setAttribute("aria-pressed", String(selected));
    button.querySelector(".choice-mark").textContent = selected ? "✓" : "+";
  });
  els.versionRequirementPicker.addEventListener("click", (event) => {
    const button = event.target.closest(".requirement-choice");
    if (!button) return;
    const selected = button.classList.toggle("is-selected");
    button.setAttribute("aria-pressed", String(selected));
    button.querySelector(".choice-mark").textContent = selected ? "✓" : "+";
  });
  els.closeRequirementManagerDialog.addEventListener("click", () => els.requirementManagerDialog.close());
  els.requirementManagerList.addEventListener("click", handleRequirementManagerClick);
  [els.managerSearchInput, els.managerStatusFilter, els.managerPersonFilter, els.managerVersionFilter].forEach((control) => {
    control.addEventListener("input", () => {
      saveManagerFilters();
      renderRequirementManager();
    });
  });
  els.managerResetFiltersButton.addEventListener("click", () => {
    els.managerSearchInput.value = "";
    els.managerStatusFilter.value = "全部";
    els.managerPersonFilter.value = isExecutorRole() && currentPerson ? currentPerson : "全部";
    els.managerVersionFilter.value = "全部";
    saveManagerFilters();
    renderRequirementManager();
  });
  els.closeVersionDialog.addEventListener("click", () => els.versionDialog.close());
  els.cancelVersionButton.addEventListener("click", () => els.versionDialog.close());
  els.closeWorkDialog.addEventListener("click", () => els.workDialog.close());
  els.cancelWorkButton.addEventListener("click", () => els.workDialog.close());
  els.addAssignmentButton.addEventListener("click", () => addAssignmentRow());
  els.workMineOnlyInput.addEventListener("input", () => renderWorkRequirementOptions(els.workRequirementInput.value));
  els.workAssignmentList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action='remove-assignment']");
    if (!button) return;
    button.closest(".assignment-item").remove();
    if (!els.workAssignmentList.children.length) addAssignmentRow();
  });
  [els.workContentInput, els.workImagePasteBox].forEach((target) => {
    target.addEventListener("paste", (event) => appendPastedImages(event, "work"));
  });
  els.workImageList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action='remove-work-image']");
    if (!button) return;
    removeWorkImage("work", Number(button.dataset.index));
  });
  els.closeOtherWorkDialog.addEventListener("click", () => els.otherWorkDialog.close());
  els.cancelOtherWorkButton.addEventListener("click", () => els.otherWorkDialog.close());
  [els.otherWorkContentInput, els.otherWorkImagePasteBox].forEach((target) => {
    target.addEventListener("paste", (event) => appendPastedImages(event, "other"));
  });
  els.otherWorkImageList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action='remove-work-image']");
    if (!button) return;
    removeWorkImage("other", Number(button.dataset.index));
  });
  els.closeWorkDetailDialog.addEventListener("click", () => els.workDetailDialog.close());
  els.closeHolidayDialog.addEventListener("click", () => els.holidayDialog.close());
  els.cancelHolidayButton.addEventListener("click", () => els.holidayDialog.close());
  els.closePeopleDialog.addEventListener("click", () => els.peopleDialog.close());
  els.cancelPeopleButton.addEventListener("click", () => els.peopleDialog.close());
  els.closeAccountDialog.addEventListener("click", () => els.accountDialog.close());
  els.cancelAccountButton.addEventListener("click", () => els.accountDialog.close());
  els.newAccountButton.addEventListener("click", clearAccountForm);
  els.accountPersonInput.addEventListener("input", updateAccountRolePreview);
  els.accountList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action='edit-account']");
    if (!button) return;
    editAccount(accounts.find((account) => account.id === button.dataset.id));
  });
  els.newPersonButton.addEventListener("click", clearPersonForm);
  els.peopleList.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action='edit-person']");
    if (!button) return;
    editPerson(people.find((person) => person.id === button.dataset.id));
  });
  els.requirementForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveRequirement();
  });
  els.versionForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveVersion();
  });
  els.workForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveWork();
  });
  els.otherWorkForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveOtherWork();
  });
  els.holidayForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveHolidays();
  });
  els.peopleForm.addEventListener("submit", (event) => {
    event.preventDefault();
    savePerson();
  });
  els.accountForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveAccount();
  });
  els.deleteRequirementButton.addEventListener("click", () => {
    deleteRequirementById(els.requirementId.value);
    els.requirementDialog.close();
    render();
  });
  els.deleteVersionButton.addEventListener("click", () => {
    queueDelete("versions", els.versionId.value);
    versions = versions.filter((version) => version.id !== els.versionId.value);
    saveState();
    els.versionDialog.close();
    render();
  });
  els.deleteWorkButton.addEventListener("click", () => {
    const work = workItems.find((item) => item.id === els.workId.value);
    if (!work || (!canManageWork() && !canEditOwnWork(work))) {
      els.workFormError.textContent = "只能删除自己登记的工作。";
      return;
    }
    queueDelete("workItems", els.workId.value);
    workItems = workItems.filter((item) => item.id !== els.workId.value);
    saveState();
    els.workDialog.close();
    render();
  });
  els.deleteOtherWorkButton.addEventListener("click", deleteOtherWork);
  els.deletePersonButton.addEventListener("click", deletePerson);
  els.deleteAccountButton.addEventListener("click", deleteAccount);
  render();
}

init();
