import Sortable from "https://cdn.jsdelivr.net/npm/sortablejs@1.15.7/modular/sortable.core.esm.js";

import { auth, db, HOUSEHOLD_ID } from "./firebase.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";

import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  increment,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) =>
  Array.from(root.querySelectorAll(selector));

function createItemFormFields({
  container,
  idPrefix,
  values = {},
  roomHidden = false,
}) {
  if (!container) {
    return null;
  }

  container.innerHTML = "";

  function fieldId(suffix) {
    return `${idPrefix}-${suffix}`;
  }

  function createLabel(text, controlId, { hidden = false } = {}) {
    const label = document.createElement("label");
    label.htmlFor = controlId;
    label.textContent = text;
    label.hidden = hidden;
    return label;
  }

  function createTextInput({
    suffix,
    value = "",
    required = false,
    maxLength,
    placeholder = "",
  }) {
    const input = document.createElement("input");
    input.type = "text";
    input.id = fieldId(suffix);
    input.value = value ?? "";
    input.required = required;
    input.autocomplete = "off";

    if (maxLength) {
      input.maxLength = maxLength;
    }

    if (placeholder) {
      input.placeholder = placeholder;
    }

    return input;
  }

  function createSelect({
    suffix,
    required = false,
    placeholder = null,
    hidden = false,
  }) {
    const select = document.createElement("select");
    select.id = fieldId(suffix);
    select.required = required;
    select.hidden = hidden;

    if (placeholder !== null) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = placeholder;
      select.append(option);
    }

    return select;
  }

  function createNumberInput({ suffix, value, min, step }) {
    const input = document.createElement("input");
    input.type = "number";
    input.id = fieldId(suffix);
    input.required = true;
    input.min = String(min);
    input.step = String(step);
    input.value = String(value);
    return input;
  }

  const nameInput = createTextInput({
    suffix: "name",
    value: values.name ?? "",
    required: true,
    maxLength: 80,
  });
  container.append(createLabel("Item name", nameInput.id), nameInput);

  const roomSelect = createSelect({
    suffix: "room",
    required: !roomHidden,
    placeholder: "Choose a room",
    hidden: roomHidden,
  });
  const roomLabel = createLabel("Room", roomSelect.id, {
    hidden: roomHidden,
  });
  roomLabel.id = fieldId("room-label");
  container.append(roomLabel, roomSelect);

  const productTypeSelect = createSelect({
    suffix: "product-type",
    required: true,
    placeholder: "Choose a product type",
  });
  container.append(
    createLabel("Product type", productTypeSelect.id),
    productTypeSelect,
  );

  const attributesInput = createTextInput({
    suffix: "specific-attributes",
    value: values.specificAttributes ?? "",
    maxLength: 100,
    placeholder: "e.g. 2 L, gluten-free, fragrance-free",
  });
  container.append(
    createLabel("Specific Attributes (optional)", attributesInput.id),
    attributesInput,
  );

  const storeSelect = createSelect({
    suffix: "store",
    placeholder: "Any matching store",
  });
  container.append(
    createLabel("Store (optional)", storeSelect.id),
    storeSelect,
  );

  const amountRow = document.createElement("div");
  amountRow.className = "amount-unit-step-row";

  const amountInput = createNumberInput({
    suffix: "default-amount",
    value: values.defaultAmount ?? 1,
    min: 0,
    step: "any",
  });
  const amountLabel = createLabel("Amount", amountInput.id);
  amountLabel.append(amountInput);

  const unitSelect = createSelect({
    suffix: "unit",
    required: true,
  });
  const unitLabel = createLabel("Unit", unitSelect.id);
  unitLabel.append(unitSelect);

  const incrementInput = createNumberInput({
    suffix: "increment",
    value: values.increment ?? 1,
    min: 0.01,
    step: "any",
  });
  const incrementLabel = createLabel("Step", incrementInput.id);
  incrementLabel.append(incrementInput);

  amountRow.append(amountLabel, unitLabel, incrementLabel);
  container.append(amountRow);

  return {
    nameInput,
    roomLabel,
    roomSelect,
    productTypeSelect,
    attributesInput,
    storeSelect,
    amountInput,
    unitSelect,
    incrementInput,
  };
}

createItemFormFields({
  container: $("#item-form-fields"),
  idPrefix: "item",
  roomHidden: true,
});

createItemFormFields({
  container: $("#settings-item-form-fields"),
  idPrefix: "settings-item",
});

function submitButtonFor(form) {
  return form?.querySelector('button[type="submit"]') ?? null;
}

async function withDisabledSubmit(form, operation) {
  const submitButton = submitButtonFor(form);

  if (submitButton) {
    submitButton.disabled = true;
  }

  try {
    return await operation();
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
    }
  }
}

function wireAsyncForm(form, handler, { errorLabel, errorMessage }) {
  if (!form) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      await withDisabledSubmit(form, () => handler(event));
    } catch (error) {
      console.error(`${errorLabel}:`, error);

      const message =
        typeof errorMessage === "function" ? errorMessage(error) : errorMessage;

      if (message) {
        alert(message);
      }
    }
  });
}

const navigationButtons = $$("[data-view]");

const views = {
  needing: $("#needing-view"),
  getting: $("#getting-view"),
  settings: $("#settings-view"),
};

const connectionStatus = $("#connection-status");
const bottomContextAction = $("#bottom-context-action");

/* Settings navigation */
const settingsHome = $("#settings-home");
const settingsCategoryButton = $("#settings-category-button");
const settingsCategoryOptions = $$(".settings-category-option");
const settingsCategoryPanels = $$(".settings-category-panel");
const settingsPanels = {
  stores: $("#settings-stores-panel"),
  "store-types": $("#settings-store-types-panel"),
  "product-types": $("#settings-product-types-panel"),
  items: $("#settings-items-panel"),
  rooms: $("#settings-rooms-panel"),
  units: $("#settings-units-panel"),
  access: $("#settings-access-panel"),
};
const settingsCategoryNames = {
  stores: "Stores",
  "store-types": "Store types",
  "product-types": "Product types",
  items: "Items and Specific Products",
  rooms: "Rooms",
  units: "Units",
  access: "Access and sharing",
};

function getVisibleSettingsCategory() {
  if (selectedSettingsCategory) {
    return selectedSettingsCategory;
  }

  const visiblePanel = Array.from(settingsCategoryPanels).find(
    (panel) => !panel.hidden,
  );

  return (
    Object.entries(settingsPanels).find(
      ([, panel]) => panel === visiblePanel,
    )?.[0] ?? null
  );
}

function getSettingsAddForm(categoryName) {
  return settingsCategoryConfig[categoryName]?.addForm ?? null;
}

function closeSettingsAddForms({ except = null } = {}) {
  let closedVisibleForm = false;

  Object.values(settingsAddForms).forEach((form) => {
    if (!form || form === except) {
      return;
    }

    closedVisibleForm ||= !form.hidden;
    form.hidden = true;
  });

  if (closedVisibleForm && (!except || except.hidden)) {
    clearFormPositioningScrollSpace();
  }
}

function moveSettingsAddFormToPanelTop(form) {
  const panel = form?.closest(".settings-category-panel");

  if (panel && panel.firstElementChild !== form) {
    panel.prepend(form);
  }
}

function toggleCurrentSettingsAddForm() {
  if (!canEditHousehold()) {
    return;
  }

  const categoryName = getVisibleSettingsCategory();
  const form = getSettingsAddForm(categoryName);

  if (!form) {
    return;
  }

  if (categoryName === "items") {
    prepareSettingsItemAddForm();
  }

  const willOpen = form.hidden;
  closeSettingsAddForms({ except: form });

  if (willOpen) {
    moveSettingsAddFormToPanelTop(form);
    form.hidden = false;

    const focusElement = form.querySelector(
      'input:not([type="hidden"]), select, textarea',
    );
    placeElementAtTop(form, focusElement);
  } else {
    form.hidden = true;
    clearFormPositioningScrollSpace();
  }
}

/* Rooms */
const addRoomForm = $("#add-room-form");
const roomNameInput = $("#room-name");
const settingsRoomsList = $("#settings-rooms-list");
const needingRoomsList = $("#rooms-list");

/* Units */
const addUnitForm = $("#add-unit-form");
const unitSymbolInput = $("#unit-symbol");
const settingsUnitsList = $("#settings-units-list");

/* Store types */
const addStoreTypeForm = $("#add-store-type-form");
const storeTypeNameInput = $("#store-type-name");
const settingsStoreTypesList = $("#settings-store-types-list");
const storeTypeSelect = $("#store-type-select");

/* Stores */
const addStoreForm = $("#add-store-form");
const storeNameInput = $("#store-name");
const settingsStoresList = $("#settings-stores-list");

/* Product types */
const addProductTypeForm = $("#add-product-type-form");
const productTypeNameInput = $("#product-type-name");
const productTypeStoreTypesContainer = $("#product-type-store-types");
const settingsProductTypesList = $("#settings-product-types-list");

/* Items */
const settingsItemsList = $("#settings-items-list");
const settingsItemsSearch = $("#settings-items-search");
const addSettingsItemForm = $("#add-settings-item-form");
const settingsItemNameInput = $("#settings-item-name");
const settingsItemRoomSelect = $("#settings-item-room");
const settingsItemProductTypeSelect = $("#settings-item-product-type");
const settingsItemStoreSelect = $("#settings-item-store");
const settingsItemSpecificAttributesInput = $(
  "#settings-item-specific-attributes",
);
const settingsItemDefaultAmountInput = $("#settings-item-default-amount");
const settingsItemUnitSelect = $("#settings-item-unit");
const settingsItemIncrementInput = $("#settings-item-increment");

const settingsAddForms = {
  stores: addStoreForm,
  "store-types": addStoreTypeForm,
  "product-types": addProductTypeForm,
  items: addSettingsItemForm,
  rooms: addRoomForm,
  units: addUnitForm,
};

const settingsCategoryConfig = Object.fromEntries(
  Object.keys(settingsPanels).map((categoryName) => [
    categoryName,
    {
      name: settingsCategoryNames[categoryName],
      panel: settingsPanels[categoryName],
      addForm: settingsAddForms[categoryName],
    },
  ]),
);

/* Access and sharing */
const accessGate = $("#access-gate");
const accessGateMessage = $("#access-gate-message");
const householdDevicesList = $("#household-devices-list");
const householdInvitesList = $("#household-invites-list");
const viewerInvitesList = $("#viewer-invites-list");
const createHouseholdLinkButton = $("#create-household-link");
const createViewerLinkButton = $("#create-viewer-link");
const householdLinkResult = $("#household-link-result");
const householdLinkOutput = $("#household-link-output");
const copyHouseholdLinkButton = $("#copy-household-link");
const viewerLinkResult = $("#viewer-link-result");
const viewerLinkOutput = $("#viewer-link-output");
const copyViewerLinkButton = $("#copy-viewer-link");

/* Needing room view */
const roomSelectorButton = $("#room-selector-button");
const needingHome = $("#needing-home");
const roomView = $("#room-view");
const roomViewTitle = $("#room-view-title");
const backToRoomsButton = $("#back-to-rooms");
const newItemButton = $("#new-item-button");
const newItemPanel = $("#new-item-panel");
const cancelNewItemButton = $("#cancel-new-item");
const itemProductTypeSelect = $("#item-product-type");
const itemStoreSelect = $("#item-store");
const itemSpecificAttributesInput = $("#item-specific-attributes");
const itemUnitSelect = $("#item-unit");
const itemIncrementInput = $("#item-increment");
const addItemForm = $("#add-item-form");
const itemNameInput = $("#item-name");
const itemRoomLabel = $("#item-room-label");
const itemRoomSelect = $("#item-room");
const itemDefaultAmountInput = $("#item-default-amount");
const oneOffItemPanel = $("#one-off-item-panel");
const addOneOffItemForm = $("#add-one-off-item-form");
const oneOffItemNameInput = $("#one-off-item-name");
const oneOffItemAttributesInput = $("#one-off-item-attributes");
const oneOffShoppingTargets = $("#one-off-shopping-targets");
const oneOffItemRoomSelect = $("#one-off-item-room");
const cancelOneOffItemButton = $("#cancel-one-off-item");
const roomItemsList = $("#room-items-list");
const roomItemsSearch = $("#room-items-search");
const specificProductPanel = $("#specific-product-panel");
const specificProductPanelTitle = $("#specific-product-panel-title");
const addSpecificProductForm = $("#add-specific-product-form");
const specificProductNameInput = $("#specific-product-name");
const specificProductAttributesInput = $("#specific-product-attributes");
const specificProductStoresContainer = $("#specific-product-stores");
const cancelSpecificProductButton = $("#cancel-specific-product");
const viewNeededListButton = $("#view-needed-list");
const fullNeededView = $("#full-needed-view");
const backFromNeededListButton = $("#back-from-needed-list");
const editItemsFromNeededListButton = $("#edit-items-from-needed-list");
const neededListSearch = $("#needed-list-search");
const fullNeededItems = $("#full-needed-items");
const temporaryNotePanel = $("#temporary-note-panel");
const temporaryNoteForm = $("#temporary-note-form");
const temporaryNoteItemName = $("#temporary-note-item-name");
const temporaryNoteText = $("#temporary-note-text");
const cancelTemporaryNoteButton = $("#cancel-temporary-note");
const clearTemporaryNoteButton = $("#clear-temporary-note");

/* Getting view */
const shoppingAtButton = $("#shopping-at-button");
const shoppingAtPanel = $("#shopping-at-panel");
const shoppingLocationOptions = $("#shopping-location-options");
const gettingItemsList = $("#getting-items-list");
const finishShopButton = $("#finish-shop-button");

/* Compact custom selectors */
const compactSelectPanel = $("#compact-select-panel");
const compactSelectTitle = $("#compact-select-title");
const compactSelectOptions = $("#compact-select-options");
const closeCompactSelectButton = $("#close-compact-select");
let activeCompactSelect = null;

const itemFormContexts = {
  room: {
    form: addItemForm,
    fields: {
      nameInput: itemNameInput,
      roomSelect: itemRoomSelect,
      productTypeSelect: itemProductTypeSelect,
      storeSelect: itemStoreSelect,
      attributesInput: itemSpecificAttributesInput,
      amountInput: itemDefaultAmountInput,
      unitSelect: itemUnitSelect,
      incrementInput: itemIncrementInput,
    },
  },
  settings: {
    form: addSettingsItemForm,
    fields: {
      nameInput: settingsItemNameInput,
      roomSelect: settingsItemRoomSelect,
      productTypeSelect: settingsItemProductTypeSelect,
      storeSelect: settingsItemStoreSelect,
      attributesInput: settingsItemSpecificAttributesInput,
      amountInput: settingsItemDefaultAmountInput,
      unitSelect: settingsItemUnitSelect,
      incrementInput: settingsItemIncrementInput,
    },
  },
};

const settingsSortables = new Map();

let selectedSettingsCategory = null;
let selectedRoomId = null;
let selectedShoppingTarget = null;
let editingSettingsKey = null;
let editingSettingsId = null;
let editingSettingsContextId = null;
let ignoreHeaderAutoHideUntil = 0;

const startedListeners = new Set();

let currentRooms = [];
let currentUnits = [];
let currentStoreTypes = [];
let currentStores = [];
let currentProductTypes = [];
let currentItems = [];
let currentSpecificProducts = [];
let currentNeededEntries = new Map();
let currentAccessMembers = [];
let currentAccessInvites = [];
let currentMemberRecord = null;
let currentAccessRole = null;
let accessMemberUnsubscribe = null;
let viewerInviteUnsubscribe = null;
let viewerExpiryTimer = null;
let accessListsUnsubscribes = [];
const dataListenerUnsubscribes = new Map();
const optimisticNeededAmounts = new Map();
let quickSpecificProductItemId = null;
let temporaryNoteEntryId = null;
let lastNonSettingsView = "needing";
let appHistoryDepth = 0;
let suppressAppHistory = false;

const ONE_OFF_ROOM_ID = "__one_off_stuff__";
const REGULAR_ROOM_ID = "__regular_stuff__";
const ALL_STUFF_ROOM_ID = "__all_stuff__";
const SETTINGS_MENU_ORDER_KEY = `listsForTheShop.settingsMenuOrder.${HOUSEHOLD_ID}`;
const SETTINGS_MENU_DEFAULT_ORDER = [
  "store-types",
  "stores",
  "product-types",
  "rooms",
  "units",
  "items",
  "access",
];
const LEGACY_SETTINGS_MENU_DEFAULT_ORDER = [
  "stores",
  "store-types",
  "product-types",
  "items",
  "rooms",
  "units",
];

const HOUSEHOLD_INVITE_LIFETIME_MS = 24 * 60 * 60 * 1000;
const VIEWER_INVITE_LIFETIME_MS = 14 * 24 * 60 * 60 * 1000;

/* ===== Device access and private sharing ===== */

function normalizedAccessRole(role) {
  if (role === "household" || role === "editor" || role === "owner") {
    return "household";
  }

  if (role === "viewer") {
    return "viewer";
  }

  return null;
}

function canEditHousehold() {
  return currentAccessRole === "household";
}

function defaultDeviceName() {
  const userAgent = navigator.userAgent;
  let browser = "Browser";
  let platform = "device";

  if (/Edg\//.test(userAgent)) {
    browser = "Edge";
  } else if (/OPR\//.test(userAgent)) {
    browser = "Opera";
  } else if (/Chrome\//.test(userAgent)) {
    browser = "Chrome";
  } else if (/Firefox\//.test(userAgent)) {
    browser = "Firefox";
  } else if (/Safari\//.test(userAgent)) {
    browser = "Safari";
  }

  if (/Windows/.test(userAgent)) {
    platform = "Windows";
  } else if (/Android/.test(userAgent)) {
    platform = "Android";
  } else if (/iPhone/.test(userAgent)) {
    platform = "iPhone";
  } else if (/iPad/.test(userAgent)) {
    platform = "iPad";
  } else if (/Macintosh|Mac OS X/.test(userAgent)) {
    platform = "Mac";
  } else if (/Linux/.test(userAgent)) {
    platform = "Linux";
  }

  return `${browser} on ${platform}`;
}

function inviteTokenFromLocation() {
  const hashParameters = new URLSearchParams(window.location.hash.slice(1));
  return hashParameters.get("invite")?.trim() ?? "";
}

function clearInviteFromLocation() {
  if (!window.location.hash) {
    return;
  }

  window.history.replaceState(
    window.history.state,
    "",
    `${window.location.pathname}${window.location.search}`,
  );
}

function bytesToBase64Url(bytes) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createPrivateToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function inviteUrlForToken(token) {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = new URLSearchParams({ invite: token }).toString();
  return url.toString();
}

function firestoreDate(value) {
  if (!value) {
    return null;
  }

  if (typeof value.toDate === "function") {
    return value.toDate();
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatAccessDate(value) {
  const date = firestoreDate(value);

  if (!date) {
    return "Unknown date";
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year:
      date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

async function copyTextToClipboard(value, button) {
  if (!value) {
    return;
  }

  try {
    await navigator.clipboard.writeText(value);
  } catch (error) {
    const temporaryInput = document.createElement("textarea");
    temporaryInput.value = value;
    temporaryInput.style.position = "fixed";
    temporaryInput.style.opacity = "0";
    document.body.append(temporaryInput);
    temporaryInput.select();
    document.execCommand("copy");
    temporaryInput.remove();
  }

  if (button) {
    const originalText = button.textContent;
    button.textContent = "Copied";
    window.setTimeout(() => {
      button.textContent = originalText;
    }, 1300);
  }
}

function showAccessGate(message) {
  document.body.classList.remove("access-household", "access-viewer");
  document.body.classList.add("access-denied");
  accessGate.hidden = false;
  accessGateMessage.textContent = message;
  connectionStatus.textContent = "No access";
}

function applyAccessMode(role) {
  currentAccessRole = normalizedAccessRole(role);
  document.body.classList.remove(
    "access-pending",
    "access-denied",
    "access-household",
    "access-viewer",
  );
  document.body.classList.add(
    currentAccessRole === "viewer" ? "access-viewer" : "access-household",
  );
  accessGate.hidden = true;
  connectionStatus.textContent =
    currentAccessRole === "viewer" ? "View only" : "Online";

  if (currentAccessRole === "viewer" && !views.settings.hidden) {
    showView("needing");
  }

  refreshViews("roomItems", "fullNeededList", "gettingItems");
  updateBottomContextAction();
}

function stopAccessListListeners() {
  accessListsUnsubscribes.forEach((unsubscribe) => unsubscribe());
  accessListsUnsubscribes = [];
  currentAccessMembers = [];
  currentAccessInvites = [];
}

function stopDataListeners() {
  dataListenerUnsubscribes.forEach((unsubscribe) => unsubscribe());
  dataListenerUnsubscribes.clear();
  startedListeners.clear();
}

function stopAccessMonitoring() {
  accessMemberUnsubscribe?.();
  accessMemberUnsubscribe = null;
  viewerInviteUnsubscribe?.();
  viewerInviteUnsubscribe = null;
  window.clearTimeout(viewerExpiryTimer);
  viewerExpiryTimer = null;
  stopAccessListListeners();
}

function accessRecordRow({ title, detail = "", actions = [] }) {
  const row = document.createElement("div");
  row.className = "access-record-row";

  const text = document.createElement("div");
  text.className = "access-record-text";

  const titleElement = document.createElement("strong");
  titleElement.textContent = title;
  text.append(titleElement);

  if (detail) {
    const detailElement = document.createElement("span");
    detailElement.textContent = detail;
    text.append(detailElement);
  }

  row.append(text);

  if (actions.length > 0) {
    const actionContainer = document.createElement("div");
    actionContainer.className = "access-record-actions";
    actions.forEach((action) => actionContainer.append(action));
    row.append(actionContainer);
  }

  return row;
}

function createAccessActionButton(text, onClick, { danger = false } = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `access-record-button${danger ? " is-danger" : ""}`;
  button.textContent = text;
  button.addEventListener("click", onClick);
  return button;
}

function activeAccessInvite(invite, kind) {
  const expiresAt = firestoreDate(invite.expiresAt);
  return (
    invite.kind === kind &&
    invite.active === true &&
    expiresAt &&
    expiresAt.getTime() > Date.now()
  );
}

function renderAccessSettings() {
  if (!householdDevicesList || !canEditHousehold()) {
    return;
  }

  householdDevicesList.innerHTML = "";

  const householdMembers = currentAccessMembers
    .filter((member) => normalizedAccessRole(member.role) === "household")
    .sort((a, b) => {
      if (a.id === auth.currentUser?.uid) return -1;
      if (b.id === auth.currentUser?.uid) return 1;
      return String(a.deviceName ?? "").localeCompare(
        String(b.deviceName ?? ""),
      );
    });

  if (householdMembers.length === 0) {
    householdDevicesList.innerHTML = "<p>No household devices found.</p>";
  } else {
    householdMembers.forEach((member) => {
      const isCurrentDevice = member.id === auth.currentUser?.uid;
      const actions = [];

      if (!isCurrentDevice) {
        actions.push(
          createAccessActionButton(
            "Revoke",
            async () => {
              if (
                !confirm(
                  `Revoke access for ${member.deviceName || "this device"}?`,
                )
              ) {
                return;
              }

              try {
                await deleteDoc(householdDocument("members", member.id));
              } catch (error) {
                console.error("Could not revoke device:", error);
                alert("The device could not be revoked.");
              }
            },
            { danger: true },
          ),
        );
      }

      householdDevicesList.append(
        accessRecordRow({
          title: member.deviceName || "Existing household device",
          detail: isCurrentDevice
            ? "This device"
            : `Last seen ${formatAccessDate(member.lastSeenAt)}`,
          actions,
        }),
      );
    });
  }

  function renderInviteList(container, kind, emptyText) {
    container.innerHTML = "";
    const matchingInvites = currentAccessInvites
      .filter((invite) => activeAccessInvite(invite, kind))
      .sort((a, b) => {
        const aDate = firestoreDate(a.createdAt)?.getTime() ?? 0;
        const bDate = firestoreDate(b.createdAt)?.getTime() ?? 0;
        return bDate - aDate;
      });

    if (matchingInvites.length === 0) {
      container.innerHTML = `<p>${emptyText}</p>`;
      return;
    }

    matchingInvites.forEach((invite) => {
      const actions = [];

      if (invite.token) {
        actions.push(
          createAccessActionButton("Copy", async (event) => {
            await copyTextToClipboard(
              inviteUrlForToken(invite.token),
              event.currentTarget,
            );
          }),
        );
      }

      actions.push(
        createAccessActionButton(
          "Revoke",
          async () => {
            try {
              await updateDoc(householdDocument("accessInvites", invite.id), {
                active: false,
                revokedAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
            } catch (error) {
              console.error("Could not revoke link:", error);
              alert("The link could not be revoked.");
            }
          },
          { danger: true },
        ),
      );

      container.append(
        accessRecordRow({
          title:
            kind === "viewer"
              ? "Read-only sharing link"
              : "Household device link",
          detail: `Expires ${formatAccessDate(invite.expiresAt)} · ${Number(invite.uses ?? 0)} use${Number(invite.uses ?? 0) === 1 ? "" : "s"}`,
          actions,
        }),
      );
    });
  }

  renderInviteList(
    householdInvitesList,
    "household",
    "No pending device links.",
  );
  renderInviteList(viewerInvitesList, "viewer", "No active sharing links.");
}

function startAccessListListeners() {
  stopAccessListListeners();

  if (!canEditHousehold()) {
    return;
  }

  accessListsUnsubscribes = [
    onSnapshot(
      householdCollection("members"),
      (snapshot) => {
        currentAccessMembers = snapshotRecords(snapshot);
        renderAccessSettings();
      },
      (error) => console.error("Could not load household devices:", error),
    ),
    onSnapshot(
      householdCollection("accessInvites"),
      (snapshot) => {
        currentAccessInvites = snapshotRecords(snapshot);
        renderAccessSettings();
      },
      (error) => console.error("Could not load sharing links:", error),
    ),
  ];
}

async function createAccessInvite(kind) {
  if (!canEditHousehold() || !auth.currentUser) {
    throw new Error("This device cannot create access links.");
  }

  const token = createPrivateToken();
  const inviteId = await sha256Hex(token);
  const lifetime =
    kind === "household"
      ? HOUSEHOLD_INVITE_LIFETIME_MS
      : VIEWER_INVITE_LIFETIME_MS;

  await setDoc(householdDocument("accessInvites", inviteId), {
    kind,
    active: true,
    token,
    uses: 0,
    createdBy: auth.currentUser.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    expiresAt: new Date(Date.now() + lifetime),
  });

  return inviteUrlForToken(token);
}

async function redeemAccessInvite(token, user) {
  const inviteId = await sha256Hex(token);
  const inviteRef = householdDocument("accessInvites", inviteId);
  const memberRef = householdDocument("members", user.uid);

  await runTransaction(db, async (transaction) => {
    const inviteSnapshot = await transaction.get(inviteRef);
    const memberSnapshot = await transaction.get(memberRef);

    if (!inviteSnapshot.exists()) {
      throw new Error("This access link is not valid.");
    }

    const invite = inviteSnapshot.data();
    const expiresAt = firestoreDate(invite.expiresAt);

    if (
      invite.active !== true ||
      !expiresAt ||
      expiresAt.getTime() <= Date.now()
    ) {
      throw new Error("This access link has expired or been revoked.");
    }

    if (!["household", "viewer"].includes(invite.kind)) {
      throw new Error("This access link is not valid.");
    }

    const uses = Number(invite.uses ?? 0);

    if (invite.kind === "household" && uses >= 1) {
      throw new Error("This household device link has already been used.");
    }

    const existingMember = memberSnapshot.exists() ? memberSnapshot.data() : {};
    const memberData = {
      role: invite.kind,
      active: true,
      inviteId,
      deviceName: existingMember.deviceName || defaultDeviceName(),
      createdAt: existingMember.createdAt || serverTimestamp(),
      lastSeenAt: serverTimestamp(),
    };

    transaction.set(memberRef, memberData);
    transaction.update(inviteRef, {
      uses: uses + 1,
      active: invite.kind === "household" ? false : true,
      lastUsedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
}

function monitorViewerInvite(inviteId) {
  viewerInviteUnsubscribe?.();
  viewerInviteUnsubscribe = null;
  window.clearTimeout(viewerExpiryTimer);
  viewerExpiryTimer = null;

  if (!inviteId) {
    showAccessGate(
      "This read-only access is incomplete. Open the original sharing link again.",
    );
    return;
  }

  viewerInviteUnsubscribe = onSnapshot(
    householdDocument("accessInvites", inviteId),
    (snapshot) => {
      const invite = snapshot.exists() ? snapshot.data() : null;
      const expiresAt = firestoreDate(invite?.expiresAt);

      if (
        !invite ||
        invite.kind !== "viewer" ||
        invite.active !== true ||
        !expiresAt ||
        expiresAt.getTime() <= Date.now()
      ) {
        stopDataListeners();
        showAccessGate(
          "This read-only sharing link has expired or been revoked.",
        );
        return;
      }

      const remainingTime = expiresAt.getTime() - Date.now();
      window.clearTimeout(viewerExpiryTimer);
      viewerExpiryTimer = window.setTimeout(() => {
        stopDataListeners();
        showAccessGate(
          "This read-only sharing link has expired or been revoked.",
        );
      }, remainingTime);
    },
    () => {
      stopDataListeners();
      showAccessGate(
        "This read-only sharing link has expired or been revoked.",
      );
    },
  );
}

async function activateMemberAccess(user, member) {
  const role = normalizedAccessRole(member.role);

  if (!role || member.active === false) {
    throw new Error("This device does not have household access.");
  }

  currentMemberRecord = { id: user.uid, ...member };
  applyAccessMode(role);
  startListeners();

  try {
    await updateDoc(householdDocument("members", user.uid), {
      deviceName: member.deviceName || defaultDeviceName(),
      lastSeenAt: serverTimestamp(),
    });
  } catch (error) {
    console.warn("Could not update device activity:", error);
  }

  if (role === "household") {
    startAccessListListeners();
  } else {
    monitorViewerInvite(member.inviteId);
  }
}

function monitorCurrentMembership(user) {
  accessMemberUnsubscribe?.();

  accessMemberUnsubscribe = onSnapshot(
    householdDocument("members", user.uid),
    async (snapshot) => {
      if (!snapshot.exists()) {
        stopDataListeners();
        stopAccessListListeners();
        showAccessGate(
          "This device does not have access. Open a household device or read-only sharing link on this device.",
        );
        return;
      }

      const member = snapshot.data();
      const nextRole = normalizedAccessRole(member.role);

      if (!nextRole || member.active === false) {
        stopDataListeners();
        stopAccessListListeners();
        showAccessGate("Access for this device has been revoked.");
        return;
      }

      const roleChanged = nextRole !== currentAccessRole;
      currentMemberRecord = { id: user.uid, ...member };

      if (roleChanged) {
        applyAccessMode(nextRole);

        if (nextRole === "household") {
          viewerInviteUnsubscribe?.();
          viewerInviteUnsubscribe = null;
          startAccessListListeners();
        } else {
          stopAccessListListeners();
          monitorViewerInvite(member.inviteId);
        }
      }
    },
    (error) => {
      console.error("Could not monitor device access:", error);
      stopDataListeners();
      showAccessGate("This device no longer has access to the household.");
    },
  );
}

async function initializeDeviceAccess(user) {
  connectionStatus.textContent = "Checking access…";
  accessGate.hidden = false;
  accessGateMessage.textContent = "Checking this device’s access…";

  const memberRef = householdDocument("members", user.uid);
  const inviteToken = inviteTokenFromLocation();

  try {
    let memberSnapshot = await getDoc(memberRef);
    const existingRole = memberSnapshot.exists()
      ? normalizedAccessRole(memberSnapshot.data().role)
      : null;

    /* A full household device must never be downgraded by opening a viewer
     * link. Viewer devices may still use a household link to become a full
     * household device. */
    if (inviteToken && existingRole === "household") {
      clearInviteFromLocation();
    } else if (inviteToken) {
      try {
        await redeemAccessInvite(inviteToken, user);
        clearInviteFromLocation();
        memberSnapshot = await getDoc(memberRef);
      } catch (error) {
        console.error("Could not redeem access link:", error);
        showAccessGate(error.message || "This access link could not be used.");
        return;
      }
    }

    if (!memberSnapshot.exists()) {
      showAccessGate(
        "This device does not have access. Open a household device or read-only sharing link on this device.",
      );
      return;
    }

    await activateMemberAccess(user, memberSnapshot.data());
    monitorCurrentMembership(user);
  } catch (error) {
    console.error("Could not check device access:", error);
    showAccessGate("The app could not verify this device’s access.");
  }
}

/* ===== Navigation and view state ===== */

function isOneOffRoomSelected() {
  return selectedRoomId === ONE_OFF_ROOM_ID;
}

function isRegularRoomSelected() {
  return selectedRoomId === REGULAR_ROOM_ID;
}

function isAllStuffSelected() {
  return selectedRoomId === ALL_STUFF_ROOM_ID;
}

function itemIsRegular(item) {
  return item.regularList === true;
}

function getSelectedRoomName() {
  if (isOneOffRoomSelected()) {
    return "One-off stuff";
  }

  if (isRegularRoomSelected()) {
    return "Regular stuff";
  }

  if (isAllStuffSelected()) {
    return "All stuff";
  }

  return (
    currentRooms.find((room) => room.id === selectedRoomId)?.name ?? "Room"
  );
}

function recordAppNavigation() {
  if (suppressAppHistory || !window.history?.pushState) {
    return;
  }

  appHistoryDepth += 1;

  window.history.pushState(
    {
      listsForTheShop: true,
      depth: appHistoryDepth,
    },
    "",
    window.location.href,
  );
}

function runWithoutHistory(callback) {
  suppressAppHistory = true;

  try {
    callback();
  } finally {
    suppressAppHistory = false;
  }
}

function getOpenSettingsAddForm() {
  return (
    Object.values(settingsAddForms).find((form) => form && !form.hidden) ?? null
  );
}

function closeOpenSettingsEditPanel() {
  if (!editingSettingsKey && !editingSettingsId) {
    return false;
  }

  clearFormPositioningScrollSpace();

  const categoryName = getVisibleSettingsCategory();

  editingSettingsKey = null;
  editingSettingsId = null;
  editingSettingsContextId = null;

  if (categoryName === "items") {
    renderSettingsItems();
  } else if (categoryName === "stores") {
    renderStores(currentStores);
  } else if (categoryName === "store-types") {
    renderStoreTypes(currentStoreTypes);
  } else if (categoryName === "product-types") {
    renderProductTypes(currentProductTypes);
  } else if (categoryName === "rooms") {
    renderRooms(currentRooms);
  } else if (categoryName === "units") {
    renderUnits(currentUnits);
  }

  updateBottomContextAction();
  return true;
}

function closeFullNeededListToPreviousView() {
  fullNeededView.hidden = true;

  if (selectedRoomId) {
    roomSelectorButton.hidden = false;
    needingHome.hidden = true;
    roomView.hidden = false;
    roomSelectorButton.setAttribute("aria-expanded", "false");
    updateSelectedRoomLabel();
    renderRoomItems();
  } else {
    showNeedingHome();
  }

  updateBottomContextAction();
}

function handleAppBackButton() {
  if (compactSelectPanel && !compactSelectPanel.hidden) {
    closeCompactSelect();
    return true;
  }

  if (temporaryNotePanel && !temporaryNotePanel.hidden) {
    closeTemporaryNotePanel();
    return true;
  }

  if (!specificProductPanel?.hidden) {
    closeSpecificProductQuickAdd();
    return true;
  }

  if (oneOffItemPanel && !oneOffItemPanel.hidden) {
    oneOffItemPanel.hidden = true;

    if (newItemButton) {
      newItemButton.hidden = false;
    }

    return true;
  }

  if (newItemPanel && !newItemPanel.hidden) {
    clearFormPositioningScrollSpace();
    newItemPanel.hidden = true;

    if (newItemButton) {
      newItemButton.hidden = false;
    }

    return true;
  }

  const openSettingsAddForm = getOpenSettingsAddForm();

  if (openSettingsAddForm) {
    clearFormPositioningScrollSpace();
    openSettingsAddForm.hidden = true;
    updateBottomContextAction();
    return true;
  }

  if (closeOpenSettingsEditPanel()) {
    return true;
  }

  if (!views.needing.hidden && !fullNeededView.hidden) {
    closeFullNeededListToPreviousView();
    return true;
  }

  if (!views.needing.hidden && selectedRoomId) {
    showNeedingHome();
    updateBottomContextAction();
    return true;
  }

  if (!views.getting.hidden && selectedShoppingTarget) {
    resetGettingToShoppingList();
    return true;
  }

  if (!views.settings.hidden && selectedSettingsCategory) {
    showSettingsHome();
    updateBottomContextAction();
    return true;
  }

  if (!views.settings.hidden) {
    showView(lastNonSettingsView || "needing");
    return true;
  }

  if (!views.getting.hidden) {
    showView("needing");
    return true;
  }

  return false;
}

function setupAutoHidingHeader() {
  const header = $(".app-header");

  if (!header) {
    return;
  }

  let lastScrollY = window.scrollY;
  let ticking = false;

  function updateHeader() {
    const currentScrollY = Math.max(0, window.scrollY);

    if (performance.now() < ignoreHeaderAutoHideUntil) {
      header.classList.remove("is-hidden");
      lastScrollY = currentScrollY;
      ticking = false;
      return;
    }

    const movedUp = currentScrollY < lastScrollY - 2;
    const movedDown = currentScrollY > lastScrollY + 2;

    if (currentScrollY <= 8 || movedUp) {
      header.classList.remove("is-hidden");
    } else if (movedDown && currentScrollY > header.offsetHeight) {
      header.classList.add("is-hidden");
    }

    lastScrollY = currentScrollY;
    ticking = false;
  }

  window.addEventListener(
    "scroll",
    () => {
      if (!ticking) {
        window.requestAnimationFrame(updateHeader);
        ticking = true;
      }
    },
    { passive: true },
  );
}

function setupBrowserBackButton() {
  if (!window.history?.replaceState) {
    return;
  }

  window.history.replaceState(
    {
      listsForTheShop: true,
      depth: appHistoryDepth,
    },
    "",
    window.location.href,
  );

  window.addEventListener("popstate", () => {
    if (appHistoryDepth > 0) {
      appHistoryDepth -= 1;
    }

    runWithoutHistory(() => {
      const handled = handleAppBackButton();

      if (!handled && appHistoryDepth > 0) {
        appHistoryDepth -= 1;
      }
    });
  });
}

function showSettingsHome() {
  clearFormPositioningScrollSpace();
  selectedSettingsCategory = null;
  settingsCategoryButton.hidden = true;
  settingsCategoryButton.textContent = "";
  settingsHome.hidden = false;

  settingsCategoryPanels.forEach((panel) => {
    panel.hidden = true;
  });

  closeSettingsAddForms();
}

function scrollAppToTop() {
  requestAnimationFrame(() => {
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: "auto",
    });
  });
}

function openSettingsHomeFromShortcut() {
  if (!canEditHousehold()) {
    return;
  }

  editingSettingsKey = null;
  editingSettingsId = null;
  editingSettingsContextId = null;
  selectedSettingsCategory = null;
  showView("settings");
  scrollAppToTop();
}

function openSettingsItemsFromShortcut() {
  if (!canEditHousehold()) {
    return;
  }

  editingSettingsKey = null;
  editingSettingsId = null;
  editingSettingsContextId = null;
  selectedSettingsCategory = "items";
  showView("settings");
  openSettingsCategory("items");
  renderSettingsItems();
}

function openFullNeededList() {
  roomSelectorButton.hidden = true;
  needingHome.hidden = true;
  roomView.hidden = true;
  fullNeededView.hidden = false;
  renderFullNeededList();
  updateBottomContextAction();
}

function updateBottomContextAction() {
  if (!bottomContextAction) {
    return;
  }

  if (!canEditHousehold()) {
    bottomContextAction.textContent = "";
    bottomContextAction.disabled = true;
    bottomContextAction.hidden = true;
    bottomContextAction.removeAttribute("aria-label");
    return;
  }

  if (!views.needing.hidden) {
    const allStuffRoomIsOpen =
      isAllStuffSelected() && roomView && !roomView.hidden;

    bottomContextAction.textContent = allStuffRoomIsOpen
      ? "Edit items"
      : "Full list";
    bottomContextAction.disabled = false;
    bottomContextAction.hidden = false;
    bottomContextAction.setAttribute(
      "aria-label",
      allStuffRoomIsOpen
        ? "Open Items and Specific Products settings"
        : "Open full needed list",
    );
    return;
  }

  if (!views.getting.hidden) {
    bottomContextAction.textContent = "Finish shop";
    bottomContextAction.hidden = false;
    bottomContextAction.setAttribute("aria-label", "Finish shop");

    if (!selectedShoppingTarget) {
      bottomContextAction.disabled = true;
      return;
    }

    const selectedStore =
      selectedShoppingTarget.kind === "store"
        ? currentStores.find((store) => store.id === selectedShoppingTarget.id)
        : null;

    const selectedStoreTypeId =
      selectedShoppingTarget.kind === "store"
        ? selectedShoppingTarget.storeTypeId
        : selectedShoppingTarget.id;

    const hasCollectedVisibleItems = currentNeededRecords().some((record) => {
      if (record.entry.status !== "collected") {
        return false;
      }

      if (!neededRecordBelongsToStoreType(record, selectedStoreTypeId)) {
        return false;
      }

      return neededRecordIsAvailableAtStore(record, selectedStore?.id);
    });

    bottomContextAction.disabled = !hasCollectedVisibleItems;
    return;
  }

  if (!views.settings.hidden) {
    const categoryName = getVisibleSettingsCategory();
    const form = getSettingsAddForm(categoryName);

    bottomContextAction.textContent = form ? "New" : "";
    bottomContextAction.disabled = !form;
    bottomContextAction.hidden = false;

    if (form) {
      bottomContextAction.setAttribute(
        "aria-label",
        categoryName === "items"
          ? "New item"
          : `New ${settingsCategoryNames[categoryName]}`,
      );
    } else {
      bottomContextAction.removeAttribute("aria-label");
    }

    return;
  }

  bottomContextAction.textContent = "";
  bottomContextAction.disabled = true;
  bottomContextAction.hidden = false;
  bottomContextAction.removeAttribute("aria-label");
}

function openSettingsCategory(categoryName) {
  if (!canEditHousehold()) {
    return;
  }

  const panel = settingsPanels[categoryName];

  if (!panel) {
    return;
  }

  const categoryChanged = selectedSettingsCategory !== categoryName;

  selectedSettingsCategory = categoryName;
  settingsHome.hidden = true;
  setContextButtonLabel(
    settingsCategoryButton,
    settingsCategoryNames[categoryName],
  );
  settingsCategoryButton.hidden = false;

  settingsCategoryPanels.forEach((categoryPanel) => {
    categoryPanel.hidden = categoryPanel !== panel;
  });

  closeSettingsAddForms({ except: getSettingsAddForm(categoryName) });
  updateBottomContextAction();

  if (categoryName === "access") {
    renderAccessSettings();
  }

  if (categoryChanged) {
    scrollAppToTop();
  }
}

function showView(viewName) {
  clearFormPositioningScrollSpace();
  closeCompactSelect();

  if (viewName !== "settings") {
    lastNonSettingsView = viewName;
  }

  Object.entries(views).forEach(([name, element]) => {
    element.hidden = name !== viewName;
  });

  navigationButtons.forEach((button) => {
    const isActive = button.dataset.view === viewName;
    button.setAttribute("aria-pressed", String(isActive));
  });

  if (viewName === "needing") {
    fullNeededView.hidden = true;

    if (selectedRoomId) {
      roomSelectorButton.hidden = false;
      needingHome.hidden = true;
      roomView.hidden = false;
      roomSelectorButton.setAttribute("aria-expanded", "false");
      updateSelectedRoomLabel();
      renderRoomItems();
    } else {
      showNeedingHome();
    }

    updateBottomContextAction();
  }

  if (viewName === "getting") {
    setShoppingLocationPanelOpen(!selectedShoppingTarget);
  }

  if (viewName === "settings") {
    if (selectedSettingsCategory) {
      openSettingsCategory(selectedSettingsCategory);
    } else {
      showSettingsHome();
    }
  }

  updateBottomContextAction();
}

function showNeedingHome() {
  clearFormPositioningScrollSpace();
  selectedRoomId = null;
  roomSelectorButton.hidden = true;
  roomSelectorButton.textContent = "";
  needingHome.hidden = false;
  fullNeededView.hidden = true;
  roomView.hidden = true;

  if (newItemButton) {
    newItemButton.textContent = "New item";
  }

  updateBottomContextAction();
}

function resetNeedingToRoomList() {
  selectedRoomId = null;

  if (newItemPanel) {
    newItemPanel.hidden = true;
  }

  if (oneOffItemPanel) {
    oneOffItemPanel.hidden = true;
  }

  if (newItemButton) {
    newItemButton.hidden = false;
  }

  showNeedingHome();
}

function setShoppingLocationPanelOpen(isOpen) {
  shoppingAtPanel.hidden = !isOpen;
  shoppingAtButton.setAttribute("aria-expanded", String(isOpen));
  gettingItemsList.hidden = isOpen;

  if (isOpen) {
    finishShopButton.hidden = true;
  }
}

function resetGettingToShoppingList() {
  selectedShoppingTarget = null;
  setContextButtonLabel(shoppingAtButton, "Shopping at");
  setShoppingLocationPanelOpen(true);
  renderGettingItems();
  updateBottomContextAction();
}

function openRoomView({ id, name, newItemLabel = "New item" }) {
  clearFormPositioningScrollSpace();
  selectedRoomId = id;

  roomSelectorButton.hidden = false;
  setRoomSelectorLabel(name);
  roomSelectorButton.setAttribute("aria-expanded", "false");

  needingHome.hidden = true;
  fullNeededView.hidden = true;
  roomView.hidden = false;
  roomViewTitle.textContent = name;

  if (newItemPanel) {
    newItemPanel.hidden = true;
  }

  if (oneOffItemPanel) {
    oneOffItemPanel.hidden = true;
  }

  if (newItemButton) {
    newItemButton.hidden = false;
    newItemButton.textContent = newItemLabel;
  }

  renderRoomItems();
  updateBottomContextAction();
}

function openRoom(room) {
  openRoomView({ id: room.id, name: room.name });
}

function openOneOffRoom() {
  openRoomView({
    id: ONE_OFF_ROOM_ID,
    name: "One-off stuff",
  });
}

function openRegularRoom() {
  openRoomView({
    id: REGULAR_ROOM_ID,
    name: "Regular stuff",
    newItemLabel: "Edit regulars",
  });
}

function openAllStuff() {
  openRoomView({
    id: ALL_STUFF_ROOM_ID,
    name: "All stuff",
  });
}

function setContextButtonLabel(button, label) {
  button.innerHTML = "";

  const name = document.createElement("span");
  name.className = "context-button-name";
  name.textContent = label;

  const exitIcon = document.createElement("span");
  exitIcon.className = "context-exit-icon";
  exitIcon.textContent = "←";
  exitIcon.setAttribute("aria-hidden", "true");

  button.append(name, exitIcon);
}

function setRoomSelectorLabel(roomName) {
  setContextButtonLabel(roomSelectorButton, roomName);
}

function updateSelectedRoomLabel() {
  if (!selectedRoomId) {
    return;
  }

  const roomName = getSelectedRoomName();
  setRoomSelectorLabel(roomName);
  roomViewTitle.textContent = roomName;

  if (newItemButton) {
    newItemButton.textContent = isRegularRoomSelected()
      ? "Edit regulars"
      : "New item";
  }
}

function getSortOrder(value) {
  return typeof value.sortOrder === "number"
    ? value.sortOrder
    : Number.POSITIVE_INFINITY;
}

function sortBySavedOrderThenName(a, b) {
  const orderDifference = getSortOrder(a) - getSortOrder(b);

  if (orderDifference !== 0) {
    return orderDifference;
  }

  return String(a.name ?? "").localeCompare(String(b.name ?? ""));
}

function storeTypeIdsForItem(item) {
  const storeTypeIds = new Set();

  if (item?.oneOff === true) {
    (Array.isArray(item.storeTypeIds) ? item.storeTypeIds : []).forEach(
      (id) => {
        storeTypeIds.add(String(id));
      },
    );

    (Array.isArray(item.storeIds) ? item.storeIds : []).forEach((storeId) => {
      const store = currentStores.find(
        (candidate) => String(candidate.id) === String(storeId),
      );

      if (store?.storeTypeId) {
        storeTypeIds.add(String(store.storeTypeId));
      }
    });

    return Array.from(storeTypeIds);
  }

  /* Catalogue items are routed by their current product type. Older item
   * documents may still contain hidden storeTypeIds/storeIds fields from
   * earlier versions; those stale fields must not place an item in an
   * unrelated Getting list. */
  const productType = currentProductTypes.find(
    (candidate) => String(candidate.id) === String(item?.productTypeId),
  );

  if (productType) {
    productTypeStoreTypeIds(productType).forEach((id) => {
      storeTypeIds.add(String(id));
    });
  }

  return Array.from(storeTypeIds);
}

function itemBelongsToStoreType(item, storeTypeId) {
  if (!storeTypeId) {
    return false;
  }

  return storeTypeIdsForItem(item).some(
    (candidateId) => String(candidateId) === String(storeTypeId),
  );
}

function householdCollection(collectionName) {
  return collection(db, "households", HOUSEHOLD_ID, collectionName);
}

function householdDocument(collectionName, id) {
  return doc(db, "households", HOUSEHOLD_ID, collectionName, id);
}

/* ===== Shared UI helpers ===== */

function createIconButton({ className = "", icon, label, onClick }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = icon;
  button.setAttribute("aria-label", label);

  if (onClick) {
    button.addEventListener("click", onClick);
  }

  return button;
}

/* ===== Pointer and gesture helpers ===== */

function addLongPressHandler(
  element,
  handler,
  {
    duration = 350,
    ignoreSelector = null,
    allowScroll = false,
    moveTolerance = 28,
  } = {},
) {
  let pressTimer = null;
  let startX = 0;
  let startY = 0;
  let pressReady = false;
  let pressActive = false;
  let suppressClick = false;
  let activeTouchId = null;
  let mouseIsDown = false;
  let recentTouchUntil = 0;

  function shouldIgnore(event) {
    return Boolean(ignoreSelector && event.target?.closest?.(ignoreSelector));
  }

  function clearPressState() {
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }

    pressReady = false;
    pressActive = false;
    activeTouchId = null;
    mouseIsDown = false;
    element.classList.remove("is-long-pressing");
  }

  function beginPress(x, y) {
    clearPressState();
    startX = x;
    startY = y;
    pressActive = true;
    element.classList.add("is-long-pressing");

    pressTimer = setTimeout(() => {
      pressTimer = null;

      if (pressActive) {
        pressReady = true;
      }
    }, duration);
  }

  function movedTooFar(x, y) {
    return Math.hypot(x - startX, y - startY) > moveTolerance;
  }

  async function finishPress(event) {
    const shouldActivate = pressActive && pressReady;
    clearPressState();

    if (!shouldActivate) {
      return;
    }

    suppressClick = true;
    await handler(event);
  }

  element.classList.add("has-long-press");

  if (allowScroll) {
    element.classList.add("long-press-allows-scroll");
  }

  /*
   * Touch tracking deliberately never calls preventDefault while the finger is
   * down or moving. That leaves vertical scrolling entirely to the browser.
   * A successful long press is actioned only when the finger is released.
   */
  element.addEventListener(
    "touchstart",
    (event) => {
      if (
        element.disabled ||
        shouldIgnore(event) ||
        event.touches.length !== 1
      ) {
        return;
      }

      const touch = event.changedTouches[0];
      recentTouchUntil = Date.now() + 800;
      beginPress(touch.clientX, touch.clientY);
      activeTouchId = touch.identifier;
    },
    { passive: true },
  );

  element.addEventListener(
    "touchmove",
    (event) => {
      if (!pressActive || activeTouchId === null) {
        return;
      }

      const touch = Array.from(event.changedTouches).find(
        (candidate) => candidate.identifier === activeTouchId,
      );

      if (touch && movedTooFar(touch.clientX, touch.clientY)) {
        clearPressState();
      }
    },
    { passive: true },
  );

  element.addEventListener(
    "touchend",
    async (event) => {
      if (!pressActive || activeTouchId === null) {
        return;
      }

      const touchEnded = Array.from(event.changedTouches).some(
        (touch) => touch.identifier === activeTouchId,
      );

      if (!touchEnded) {
        return;
      }

      const shouldActivate = pressReady;

      if (shouldActivate) {
        event.preventDefault();
        event.stopPropagation();
      }

      await finishPress(event);
    },
    { passive: false },
  );

  element.addEventListener("touchcancel", clearPressState, {
    passive: true,
  });

  /* Mouse support is kept separate so synthetic mouse events after touch do
   * not start a second press. */
  element.addEventListener("mousedown", (event) => {
    if (
      Date.now() < recentTouchUntil ||
      event.button !== 0 ||
      element.disabled ||
      shouldIgnore(event)
    ) {
      return;
    }

    beginPress(event.clientX, event.clientY);
    mouseIsDown = true;
  });

  element.addEventListener("mousemove", (event) => {
    if (mouseIsDown && movedTooFar(event.clientX, event.clientY)) {
      clearPressState();
    }
  });

  element.addEventListener("mouseup", async (event) => {
    if (!mouseIsDown) {
      return;
    }

    if (pressReady) {
      event.preventDefault();
      event.stopPropagation();
    }

    await finishPress(event);
  });

  element.addEventListener("mouseleave", () => {
    if (mouseIsDown) {
      clearPressState();
    }
  });

  element.addEventListener("contextmenu", (event) => {
    if (!shouldIgnore(event)) {
      event.preventDefault();
    }
  });

  element.addEventListener("click", (event) => {
    if (suppressClick) {
      event.preventDefault();
      event.stopPropagation();
      suppressClick = false;
    }
  });
}

function addScrollableHoldHandler(
  element,
  handler,
  {
    duration = 450,
    moveTolerance = 20,
    ignoreSelector = "button, input, select, textarea, a",
  } = {},
) {
  let timer = null;
  let active = false;
  let fired = false;
  let startX = 0;
  let startY = 0;
  let activeTouchId = null;
  let suppressNextClick = false;
  let recentTouchUntil = 0;

  function shouldIgnore(event) {
    return Boolean(ignoreSelector && event.target?.closest?.(ignoreSelector));
  }

  function cancelHold() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }

    active = false;
    activeTouchId = null;
    element.classList.remove("is-long-pressing");
  }

  function beginHold(x, y) {
    cancelHold();
    active = true;
    fired = false;
    startX = x;
    startY = y;
    element.classList.add("is-long-pressing");

    timer = window.setTimeout(async () => {
      timer = null;

      if (!active || fired) {
        return;
      }

      fired = true;
      suppressNextClick = true;
      element.classList.remove("is-long-pressing");
      await handler();
    }, duration);
  }

  function movedTooFar(x, y) {
    return Math.hypot(x - startX, y - startY) > moveTolerance;
  }

  element.classList.add("has-long-press", "long-press-allows-scroll");

  element.addEventListener(
    "touchstart",
    (event) => {
      if (
        element.disabled ||
        shouldIgnore(event) ||
        event.touches.length !== 1
      ) {
        return;
      }

      const touch = event.changedTouches[0];
      recentTouchUntil = Date.now() + 900;
      activeTouchId = touch.identifier;
      beginHold(touch.clientX, touch.clientY);
      activeTouchId = touch.identifier;
    },
    { passive: true },
  );

  element.addEventListener(
    "touchmove",
    (event) => {
      if (!active || activeTouchId === null) {
        return;
      }

      const touch = Array.from(event.changedTouches).find(
        (candidate) => candidate.identifier === activeTouchId,
      );

      if (touch && movedTooFar(touch.clientX, touch.clientY)) {
        cancelHold();
      }
    },
    { passive: true },
  );

  element.addEventListener("touchend", cancelHold, {
    passive: true,
  });
  element.addEventListener("touchcancel", cancelHold, {
    passive: true,
  });

  element.addEventListener("mousedown", (event) => {
    if (
      Date.now() < recentTouchUntil ||
      event.button !== 0 ||
      element.disabled ||
      shouldIgnore(event)
    ) {
      return;
    }

    beginHold(event.clientX, event.clientY);
  });

  element.addEventListener("mousemove", (event) => {
    if (active && movedTooFar(event.clientX, event.clientY)) {
      cancelHold();
    }
  });

  element.addEventListener("mouseup", cancelHold);
  element.addEventListener("mouseleave", cancelHold);

  element.addEventListener("contextmenu", (event) => {
    if (!shouldIgnore(event)) {
      event.preventDefault();
    }
  });

  element.addEventListener("click", (event) => {
    if (!suppressNextClick) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    suppressNextClick = false;
  });
}

function addDoubleTapHandler(
  element,
  handler,
  {
    maxDelay = 440,
    moveTolerance = 18,
    ignoreSelector = "button, input, select, textarea, a",
  } = {},
) {
  let lastTapTime = 0;
  let lastTapX = 0;
  let lastTapY = 0;
  let activeTouchId = null;
  let touchStartX = 0;
  let touchStartY = 0;
  let touchMoved = false;
  let recentTouchUntil = 0;

  function shouldIgnore(event) {
    return Boolean(ignoreSelector && event.target?.closest?.(ignoreSelector));
  }

  function resetCurrentTouch() {
    activeTouchId = null;
    touchMoved = false;
  }

  function registerTap(event, x, y) {
    const now = Date.now();
    const closeEnough = Math.hypot(x - lastTapX, y - lastTapY) <= 48;

    if (lastTapTime > 0 && now - lastTapTime <= maxDelay && closeEnough) {
      lastTapTime = 0;
      event.preventDefault();
      event.stopPropagation();
      handler(event);
      return;
    }

    lastTapTime = now;
    lastTapX = x;
    lastTapY = y;
  }

  element.classList.add("has-double-tap");

  element.addEventListener(
    "touchstart",
    (event) => {
      if (shouldIgnore(event) || event.touches.length !== 1) {
        resetCurrentTouch();
        return;
      }

      const touch = event.changedTouches[0];
      activeTouchId = touch.identifier;
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      touchMoved = false;
      recentTouchUntil = Date.now() + 800;
    },
    { passive: true },
  );

  element.addEventListener(
    "touchmove",
    (event) => {
      if (activeTouchId === null) {
        return;
      }

      const touch = Array.from(event.changedTouches).find(
        (candidate) => candidate.identifier === activeTouchId,
      );

      if (
        touch &&
        Math.hypot(touch.clientX - touchStartX, touch.clientY - touchStartY) >
          moveTolerance
      ) {
        touchMoved = true;
        lastTapTime = 0;
      }
    },
    { passive: true },
  );

  element.addEventListener(
    "touchend",
    (event) => {
      if (activeTouchId === null) {
        return;
      }

      const touch = Array.from(event.changedTouches).find(
        (candidate) => candidate.identifier === activeTouchId,
      );

      if (!touch) {
        return;
      }

      const wasMoved = touchMoved;
      resetCurrentTouch();

      if (wasMoved || shouldIgnore(event)) {
        lastTapTime = 0;
        return;
      }

      registerTap(event, touch.clientX, touch.clientY);
    },
    { passive: false },
  );

  element.addEventListener(
    "touchcancel",
    () => {
      resetCurrentTouch();
      lastTapTime = 0;
    },
    { passive: true },
  );

  element.addEventListener("dblclick", (event) => {
    if (Date.now() < recentTouchUntil || shouldIgnore(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    handler(event);
  });
}

/* ===== Compact select controls ===== */

function compactControlLabelText(label) {
  const clone = label.cloneNode(true);
  clone
    .querySelectorAll("select, input, textarea, button")
    .forEach((control) => control.remove());

  return clone.textContent.replace(/\s+/g, " ").trim();
}

function compactSelectFieldLabel(select) {
  if (select.id) {
    const labelled = $(`label[for="${CSS.escape(select.id)}"]`);

    if (labelled) {
      return compactControlLabelText(labelled) || "Choose";
    }
  }

  const parentLabel = select.closest("label");

  if (parentLabel) {
    return compactControlLabelText(parentLabel) || "Choose";
  }

  return select.getAttribute("aria-label") || "Choose";
}

function selectedCompactOption(select) {
  return (
    Array.from(select.options).find(
      (option) => option.value === select.value,
    ) ??
    select.options[select.selectedIndex] ??
    null
  );
}

function refreshCompactSelect(select) {
  const button = select?._compactSelectButton;

  if (!button) {
    return;
  }

  const selectedOption = selectedCompactOption(select);
  const text = selectedOption?.textContent?.trim() || "Choose";
  button.textContent = text;
  button.setAttribute(
    "aria-label",
    `${compactSelectFieldLabel(select)}: ${text}`,
  );
  button.classList.toggle("is-placeholder", !select.value);
  button.disabled = select.disabled;
  button.hidden = select.hidden;
  button.setAttribute("aria-expanded", String(activeCompactSelect === select));
}

function closeCompactSelect() {
  if (activeCompactSelect) {
    refreshCompactSelect(activeCompactSelect);
  }

  activeCompactSelect = null;
  compactSelectPanel.hidden = true;
  compactSelectOptions.innerHTML = "";
}

function appendCompactSelectOption(select, option, groupLabel = "") {
  if (option.hidden) {
    return;
  }

  const button = document.createElement("button");
  button.type = "button";
  button.className = "compact-select-option";
  button.disabled = option.disabled;
  button.dataset.value = option.value;

  if (groupLabel) {
    button.dataset.groupLabel = groupLabel;
  }

  const text = document.createElement("span");
  text.textContent = option.textContent.trim();

  const marker = document.createElement("span");
  marker.className = "compact-select-selected-marker";
  marker.textContent = option.value === select.value ? "✓" : "";

  if (option.value === select.value) {
    button.classList.add("is-selected");
  }

  button.append(text, marker);
  button.addEventListener("click", () => {
    select.value = option.value;
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
    refreshCompactSelect(select);
    closeCompactSelect();
    select._compactSelectButton?.focus({ preventScroll: true });
  });

  compactSelectOptions.append(button);
}

function openCompactSelect(select) {
  if (!select || select.disabled) {
    return;
  }

  activeCompactSelect = select;
  compactSelectTitle.textContent = compactSelectFieldLabel(select);
  compactSelectOptions.innerHTML = "";

  Array.from(select.children).forEach((child) => {
    if (child.tagName === "OPTGROUP") {
      const heading = document.createElement("div");
      heading.className = "compact-select-group-heading";
      heading.textContent = child.label;
      compactSelectOptions.append(heading);

      Array.from(child.children).forEach((option) => {
        appendCompactSelectOption(select, option, child.label);
      });
      return;
    }

    if (child.tagName === "OPTION") {
      appendCompactSelectOption(select, child);
    }
  });

  compactSelectPanel.hidden = false;
  refreshCompactSelect(select);

  requestAnimationFrame(() => {
    const selectedButton = compactSelectOptions.querySelector(
      ".compact-select-option.is-selected",
    );
    const focusButton =
      selectedButton ??
      compactSelectOptions.querySelector(
        ".compact-select-option:not(:disabled)",
      );

    selectedButton?.scrollIntoView({ block: "nearest" });
    focusButton?.focus({ preventScroll: true });
  });
}

function enhanceCompactSelect(select) {
  if (
    !select ||
    select.multiple ||
    select.dataset.compactSelectEnhanced === "true"
  ) {
    return;
  }

  select.dataset.compactSelectEnhanced = "true";
  select.dataset.compactSelectRequired = String(select.required);
  select.required = false;
  select.classList.add("compact-select-source");

  const button = document.createElement("button");
  button.type = "button";
  button.className = "compact-select-button";
  button.setAttribute("aria-haspopup", "dialog");
  button.addEventListener("click", () => openCompactSelect(select));
  select.insertAdjacentElement("afterend", button);
  select._compactSelectButton = button;

  const observer = new MutationObserver(() => refreshCompactSelect(select));
  observer.observe(select, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["disabled", "hidden", "label"],
  });

  select.addEventListener("change", () => refreshCompactSelect(select));
  refreshCompactSelect(select);
}

function enhanceCompactSelects(root = document) {
  if (root.matches?.("select")) {
    enhanceCompactSelect(root);
  }

  root.querySelectorAll?.("select").forEach(enhanceCompactSelect);
}

function setupCompactSelects() {
  enhanceCompactSelects(document);

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          enhanceCompactSelects(node);
        }
      });
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });

  document.addEventListener(
    "reset",
    (event) => {
      requestAnimationFrame(() => {
        event.target.querySelectorAll?.("select").forEach(refreshCompactSelect);
      });
    },
    true,
  );

  closeCompactSelectButton?.addEventListener("click", closeCompactSelect);
  compactSelectPanel?.addEventListener("click", (event) => {
    if (event.target === compactSelectPanel) {
      closeCompactSelect();
    }
  });
}

/* ===== Shared settings components ===== */

function createSettingsRow({
  id,
  label,
  sublabel = "",
  editLabel,
  deleteLabel,
  onEdit,
  onDelete,
}) {
  const row = document.createElement("div");
  row.className = "settings-list-item settings-order-row";
  row.dataset.documentId = id;

  const handle = document.createElement("span");
  handle.className = "settings-order-handle";
  handle.textContent = "☰";
  handle.setAttribute("aria-hidden", "true");

  const text = document.createElement("span");
  text.className = "settings-order-text";

  const name = document.createElement("span");
  name.className = "settings-order-name";
  name.textContent = label;
  text.append(name);

  if (sublabel) {
    const detail = document.createElement("span");
    detail.className = "settings-order-sublabel";
    detail.textContent = sublabel;
    text.append(detail);
  }

  const actions = document.createElement("span");
  actions.className = "settings-row-actions";

  const editButton = createIconButton({
    className: "settings-row-icon-button settings-row-edit-button",
    icon: "✏️",
    label: editLabel,
    onClick: (event) => {
      event.stopPropagation();
      recordAppNavigation();
      onEdit();
    },
  });

  const deleteButton = createIconButton({
    className: "settings-row-icon-button settings-row-delete-button",
    icon: "🗑️",
    label: deleteLabel,
    onClick: async (event) => {
      event.stopPropagation();
      await onDelete();
    },
  });

  actions.append(editButton, deleteButton);
  row.append(handle, text, actions);

  return row;
}

function updateSettingsChoiceVisual(checkbox, box, graphic) {
  box.setAttribute("aria-pressed", String(checkbox.checked));
  graphic.textContent = checkbox.checked ? "✓" : "";
}

function createSettingsCheckboxOption({ value, text, checked = false }) {
  const optionLabel = document.createElement("label");
  optionLabel.className = "settings-checkbox-option";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "settings-choice-input";
  checkbox.value = value;
  checkbox.checked = checked;

  const box = document.createElement("span");
  box.className = "collect-checkbox-button settings-choice-box";
  box.setAttribute("aria-hidden", "true");

  const graphic = document.createElement("span");
  graphic.className = "collect-checkbox-graphic";

  const labelText = document.createElement("span");
  labelText.className = "settings-checkbox-text";
  labelText.textContent = text;

  box.append(graphic);
  updateSettingsChoiceVisual(checkbox, box, graphic);

  checkbox.addEventListener("change", () => {
    updateSettingsChoiceVisual(checkbox, box, graphic);
  });

  optionLabel.append(checkbox, box, labelText);

  return {
    optionLabel,
    checkbox,
  };
}

function createCheckboxField(field) {
  const fieldset = document.createElement("fieldset");
  fieldset.className = "settings-checkbox-field";

  const legend = document.createElement("legend");
  legend.textContent = field.label;
  fieldset.append(legend);

  const list = document.createElement("div");
  list.className = "settings-checkbox-list";

  const selectedValues = new Set(
    (field.value() ?? []).map((value) => String(value)),
  );

  const inputs = [];

  field.options().forEach((optionData) => {
    const { optionLabel, checkbox } = createSettingsCheckboxOption({
      value: optionData.value,
      text: optionData.text,
      checked: selectedValues.has(String(optionData.value)),
    });

    list.append(optionLabel);
    inputs.push(checkbox);
  });

  fieldset.append(list);

  return {
    label: fieldset,
    input: inputs,
  };
}

function createFormField(field) {
  if (field.type === "checkboxes") {
    return createCheckboxField(field);
  }

  const label = document.createElement("label");
  label.textContent = field.label;

  let input;

  if (field.type === "select") {
    input = document.createElement("select");
    input.required = field.required !== false;

    if (field.emptyText !== null) {
      const emptyOption = document.createElement("option");
      emptyOption.value = "";
      emptyOption.textContent = field.emptyText ?? "Choose";
      input.append(emptyOption);
    }

    const selectedValue = field.value();
    const selectedState = {
      hasSelected: false,
    };

    function appendOption(optionData, parentElement) {
      const option = document.createElement("option");
      option.value = optionData.value;
      option.textContent = optionData.text;

      if (
        String(optionData.value) === String(selectedValue) &&
        !selectedState.hasSelected
      ) {
        option.selected = true;
        selectedState.hasSelected = true;
      }

      parentElement.append(option);
    }

    field.options().forEach((optionData) => {
      if (Array.isArray(optionData.options)) {
        const group = document.createElement("optgroup");
        group.label = optionData.label;

        optionData.options.forEach((groupedOption) => {
          appendOption(groupedOption, group);
        });

        input.append(group);
        return;
      }

      appendOption(optionData, input);
    });
  } else {
    input = document.createElement("input");
    input.type = field.type ?? "text";
    input.required = field.required !== false;

    if (field.maxLength) {
      input.maxLength = field.maxLength;
    }

    if (field.min !== undefined) {
      input.min = String(field.min);
    }

    if (field.step !== undefined) {
      input.step = String(field.step);
    }

    if (field.placeholder) {
      input.placeholder = field.placeholder;
    }

    input.value = field.value() ?? "";
  }

  input.dataset.fieldKey = field.key;
  label.append(input);

  return {
    label,
    input,
  };
}

function setContextualFormHeading(heading, leadText, contextText) {
  heading.replaceChildren();

  const lead = document.createElement("span");
  lead.className = "form-heading-lead";
  lead.textContent = leadText;

  const context = document.createElement("span");
  context.className = "form-heading-context";
  context.textContent = contextText;

  heading.append(lead, document.createElement("br"), context);
}

function appendSettingsEditPanel({
  listElement,
  rowElement = null,
  settingsKey,
  contextId = null,
  item,
  fields,
  onSave,
  extraContent = null,
}) {
  if (
    editingSettingsKey !== settingsKey ||
    editingSettingsId !== item.id ||
    String(editingSettingsContextId ?? "") !== String(contextId ?? "")
  ) {
    return null;
  }

  rowElement?.classList.add("is-editing");

  const panel = document.createElement("section");
  panel.className = "settings-inline-edit-panel settings-form";

  const form = document.createElement("form");

  const headingRow = document.createElement("div");
  headingRow.className = "form-heading-row";

  const heading = document.createElement("h3");
  const itemHeading = String(item.name ?? item.symbol ?? "item").trim();

  if (itemHeading) {
    setContextualFormHeading(heading, "Edit", itemHeading);
  } else {
    heading.textContent = "Edit item";
  }

  const actions = document.createElement("div");
  actions.className = "form-heading-actions";

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.textContent = "×";
  cancelButton.setAttribute("aria-label", "Cancel editing");
  cancelButton.title = "Cancel";

  const saveButton = document.createElement("button");
  saveButton.type = "submit";
  saveButton.textContent = "✓";
  saveButton.setAttribute("aria-label", "Save changes");
  saveButton.title = "Save";

  actions.append(cancelButton, saveButton);
  headingRow.append(heading, actions);

  const fieldContainer = document.createElement("div");
  fieldContainer.className = "settings-form-fields";

  const inputMap = new Map();

  fields.forEach((field) => {
    const { label, input } = createFormField(field);
    inputMap.set(field.key, {
      input,
      field,
    });
    fieldContainer.append(label);
  });

  if (extraContent) {
    const extraElement = extraContent(item, inputMap);

    if (extraElement) {
      fieldContainer.append(extraElement);
    }
  }

  cancelButton.addEventListener("click", () => {
    editingSettingsKey = null;
    editingSettingsId = null;
    editingSettingsContextId = null;
    clearFormPositioningScrollSpace();
    renderSettingsLists();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const values = {};

    inputMap.forEach(({ input, field }, key) => {
      if (Array.isArray(input)) {
        values[key] = input
          .filter((checkbox) => checkbox.checked)
          .map((checkbox) => checkbox.value);
      } else if (field.type === "number") {
        values[key] = Number(input.value);
      } else {
        values[key] = input.value.trim();
      }
    });

    saveButton.disabled = true;
    cancelButton.disabled = true;

    try {
      await onSave(values, item);
      editingSettingsKey = null;
      editingSettingsId = null;
      editingSettingsContextId = null;
      clearFormPositioningScrollSpace();
      renderSettingsLists();
    } catch (error) {
      console.error("Could not save settings item:", error);
      alert(error.message || "The item could not be saved.");
    } finally {
      saveButton.disabled = false;
      cancelButton.disabled = false;
    }
  });

  form.append(headingRow, fieldContainer);
  panel.dataset.settingsEditKey = settingsKey;
  panel.dataset.settingsEditId = String(item.id);
  panel.dataset.settingsEditContextId = String(contextId ?? "");

  panel.append(form);
  listElement.append(panel);

  return panel;
}

function clearFormPositioningScrollSpace() {
  $$(".form-positioning-scroll-space, .settings-edit-scroll-space").forEach(
    (element) => element.remove(),
  );
}

function clearSettingsEditScrollSpace() {
  clearFormPositioningScrollSpace();
}

function placeElementAtTop(element, focusElement = null) {
  if (!element) {
    return;
  }

  clearFormPositioningScrollSpace();

  requestAnimationFrame(() => {
    const elementStyle = window.getComputedStyle(element);

    if (elementStyle.position === "fixed") {
      element.scrollTop = 0;

      if (focusElement) {
        try {
          focusElement.focus({ preventScroll: true });
        } catch (_error) {
          focusElement.focus();
        }
      }

      return;
    }

    const header = $(".app-header");
    header?.classList.remove("is-hidden");

    const scrollRoot = document.scrollingElement;
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const headerHeight = header?.offsetHeight ?? 0;
    const elementDocumentTop =
      window.scrollY + element.getBoundingClientRect().top;
    const targetScrollTop = Math.max(0, elementDocumentTop - headerHeight);
    const requiredDocumentHeight = targetScrollTop + viewportHeight;
    const missingHeight = Math.max(
      0,
      requiredDocumentHeight - (scrollRoot?.scrollHeight ?? 0),
    );

    if (missingHeight > 0) {
      const scrollSpace = document.createElement("div");
      scrollSpace.className = "form-positioning-scroll-space";
      scrollSpace.setAttribute("aria-hidden", "true");
      scrollSpace.style.height = `${missingHeight + 1}px`;
      scrollSpace.style.pointerEvents = "none";

      const positioningRoot =
        element.closest(
          "#needing-view, #getting-view, #settings-view, #compact-select-panel",
        ) ?? $("main");
      positioningRoot?.append(scrollSpace);
    }

    ignoreHeaderAutoHideUntil = performance.now() + 500;

    requestAnimationFrame(() => {
      window.scrollTo({
        top: targetScrollTop,
        left: 0,
        behavior: "auto",
      });

      if (focusElement) {
        try {
          focusElement.focus({ preventScroll: true });
        } catch (_error) {
          focusElement.focus();
        }
      }
    });
  });
}

function scrollEditFormToTop(panel) {
  placeElementAtTop(panel);
}

function scrollOpenSettingsEditToTop() {
  let attempts = 0;

  function alignEditPanel() {
    attempts += 1;

    const editPanel = $(".settings-inline-edit-panel");

    if (!editPanel) {
      if (attempts < 8) {
        requestAnimationFrame(alignEditPanel);
      }

      return;
    }

    placeElementAtTop(editPanel);
  }

  requestAnimationFrame(alignEditPanel);
}

function setEditingSettings(settingsKey, id) {
  clearSettingsEditScrollSpace();

  const isClosing =
    editingSettingsKey === settingsKey &&
    editingSettingsId === id &&
    editingSettingsContextId === null;

  if (isClosing) {
    editingSettingsKey = null;
    editingSettingsId = null;
    editingSettingsContextId = null;
  } else {
    editingSettingsKey = settingsKey;
    editingSettingsId = id;
    editingSettingsContextId = null;
  }

  renderSettingsLists();

  if (!isClosing) {
    scrollOpenSettingsEditToTop();
  }
}

function setEditingProductType(id, storeTypeId) {
  clearSettingsEditScrollSpace();

  const isClosing =
    editingSettingsKey === "product-types" &&
    editingSettingsId === id &&
    String(editingSettingsContextId) === String(storeTypeId);

  if (isClosing) {
    editingSettingsKey = null;
    editingSettingsId = null;
    editingSettingsContextId = null;
  } else {
    editingSettingsKey = "product-types";
    editingSettingsId = id;
    editingSettingsContextId = storeTypeId;
  }

  renderSettingsLists();

  if (!isClosing) {
    scrollOpenSettingsEditToTop();
  }
}

/* ===== Catalogue relationships and dependencies ===== */

function pluralize(count, singular, plural = `${singular}s`) {
  return count === 1 ? singular : plural;
}

function activeItems() {
  return currentItems.filter((item) => item.active !== false);
}

function displayRecordName(record, fallback = "Unnamed record") {
  const name = String(record?.name ?? "").trim();
  return name || fallback;
}

function itemNameForId(itemId) {
  const item = currentItems.find(
    (candidate) => String(candidate.id) === String(itemId),
  );

  return displayRecordName(item, `Item ${itemId}`);
}

function dependencyNames(records, getName) {
  return records
    .map((record) => String(getName(record) ?? "").trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

function dependencyListLine(label, names) {
  if (names.length === 0) {
    return "";
  }

  const visibleNames = names.slice(0, 10);
  const extraCount = names.length - visibleNames.length;
  const suffix = extraCount > 0 ? `, and ${extraCount} more` : "";

  return `${label}: ${visibleNames.join(", ")}${suffix}`;
}

function showDependencyBlock(label, lines) {
  const usefulLines = lines.filter(Boolean);

  alert(`${label} cannot be deleted yet.

${usefulLines.join("\n")}

Change, move, or remove those records first.`);
}

function confirmSettingsDelete(label, detail = "") {
  return window.confirm(
    `Delete ${label}?

This will permanently remove it from the app.${detail ? `\n\n${detail}` : ""}`,
  );
}

async function deleteSettingsDocument(collectionName, id) {
  await deleteDoc(householdDocument(collectionName, id));
}

async function deactivateRoom(room) {
  const matchingItems = activeItems().filter(
    (item) => item.locationId === room.id,
  );

  if (matchingItems.length > 0) {
    showDependencyBlock(room.name, [
      dependencyListLine(
        "Items in this room",
        dependencyNames(matchingItems, (item) => item.name),
      ),
    ]);
    return;
  }

  if (!confirmSettingsDelete(room.name)) {
    return;
  }

  await deleteSettingsDocument("locations", room.id);

  if (selectedRoomId === room.id) {
    resetNeedingToRoomList();
  }
}

async function deactivateUnit(unit) {
  const matchingItems = activeItems().filter((item) => item.unitId === unit.id);

  const matchingNeededEntries = Array.from(
    currentNeededEntries.values(),
  ).filter((entry) => entry.unitId === unit.id);

  if (matchingItems.length > 0 || matchingNeededEntries.length > 0) {
    showDependencyBlock(unit.name, [
      dependencyListLine(
        "Items using this unit",
        dependencyNames(matchingItems, (item) => item.name),
      ),
      dependencyListLine(
        "Needed-list entries using this unit",
        dependencyNames(matchingNeededEntries, (entry) =>
          itemNameForId(entry.itemId ?? entry.id),
        ),
      ),
    ]);
    return;
  }

  if (!confirmSettingsDelete(unit.name)) {
    return;
  }

  await deleteSettingsDocument("units", unit.id);
}

async function deactivateStoreType(storeType) {
  const matchingStores = currentStores.filter(
    (store) => store.storeTypeId === storeType.id,
  );

  const matchingProductTypes = currentProductTypes.filter((productType) =>
    productTypeBelongsToStoreType(productType, storeType.id),
  );

  const matchingOneOffEntries = allNeededEntries().filter(
    (entry) =>
      entry.oneOff === true &&
      Array.isArray(entry.storeTypeIds) &&
      entry.storeTypeIds.some(
        (storeTypeId) => String(storeTypeId) === String(storeType.id),
      ),
  );

  if (
    matchingStores.length > 0 ||
    matchingProductTypes.length > 0 ||
    matchingOneOffEntries.length > 0
  ) {
    showDependencyBlock(storeType.name, [
      dependencyListLine(
        "Stores using this store type",
        dependencyNames(matchingStores, (store) => store.name),
      ),
      dependencyListLine(
        "Product types using this store type",
        dependencyNames(
          matchingProductTypes,
          (productType) => productType.name,
        ),
      ),
      dependencyListLine(
        "One-off items using this store type",
        dependencyNames(matchingOneOffEntries, (entry) => entry.itemName),
      ),
    ]);
    return;
  }

  if (!confirmSettingsDelete(storeType.name)) {
    return;
  }

  await deleteSettingsDocument("storeTypes", storeType.id);

  if (
    selectedShoppingTarget?.kind === "storeType" &&
    selectedShoppingTarget.id === storeType.id
  ) {
    resetGettingToShoppingList();
  }
}

async function deactivateStore(store) {
  const matchingItems = activeItems().filter(
    (item) => String(item.storeId ?? "") === String(store.id),
  );

  const matchingSpecificProducts = currentSpecificProducts.filter(
    (product) =>
      product.active !== false &&
      Array.isArray(product.storeIds) &&
      product.storeIds.some((storeId) => String(storeId) === String(store.id)),
  );

  const matchingOneOffEntries = allNeededEntries().filter(
    (entry) =>
      entry.oneOff === true &&
      Array.isArray(entry.storeIds) &&
      entry.storeIds.some((storeId) => String(storeId) === String(store.id)),
  );

  if (
    matchingItems.length > 0 ||
    matchingSpecificProducts.length > 0 ||
    matchingOneOffEntries.length > 0
  ) {
    showDependencyBlock(store.name, [
      dependencyListLine(
        "Items assigned to this store",
        dependencyNames(matchingItems, (item) => item.name),
      ),
      dependencyListLine(
        "Specific products recorded for this store",
        dependencyNames(matchingSpecificProducts, (product) => {
          const item = currentItems.find(
            (candidate) => String(candidate.id) === String(product.itemId),
          );

          return item ? `${item.name} ${product.name}` : product.name;
        }),
      ),
      dependencyListLine(
        "One-off items assigned to this store",
        dependencyNames(matchingOneOffEntries, (entry) => entry.itemName),
      ),
    ]);
    return;
  }

  if (
    !confirmSettingsDelete(
      store.name,
      "Any custom product type order saved for this store will also be removed.",
    )
  ) {
    return;
  }

  await deleteSettingsDocument("stores", store.id);

  if (
    selectedShoppingTarget?.kind === "store" &&
    selectedShoppingTarget.id === store.id
  ) {
    resetGettingToShoppingList();
  }
}

async function deactivateProductType(productType) {
  const matchingItems = activeItems().filter(
    (item) => item.productTypeId === productType.id,
  );

  if (matchingItems.length > 0) {
    showDependencyBlock(productType.name, [
      dependencyListLine(
        "Items using this product type",
        dependencyNames(matchingItems, (item) => item.name),
      ),
    ]);
    return;
  }

  if (!confirmSettingsDelete(productType.name)) {
    return;
  }

  const batch = writeBatch(db);

  batch.delete(householdDocument("productTypes", productType.id));

  currentStores.forEach((store) => {
    const excludedProductTypeIds = getStoreExcludedProductTypeIds(store);
    const hasSavedOrder = storeProductTypeOrderContains(store, productType.id);
    const isExcluded = excludedProductTypeIds.some(
      (candidateId) => String(candidateId) === String(productType.id),
    );

    if (!hasSavedOrder && !isExcluded) {
      return;
    }

    const updates = {
      excludedProductTypeIds: excludedProductTypeIds.filter(
        (candidateId) => String(candidateId) !== String(productType.id),
      ),
      updatedAt: serverTimestamp(),
    };

    if (hasSavedOrder) {
      updates[`productTypeOrders.${productType.id}`] = deleteField();
    }

    batch.update(householdDocument("stores", store.id), updates);
  });

  await batch.commit();
}

function storeTypeOptions() {
  return currentStoreTypes.map((storeType) => ({
    value: storeType.id,
    text: storeType.name,
  }));
}

function storeOptions() {
  return currentStores.map((store) => ({
    value: store.id,
    text: store.name,
  }));
}

function storesForProductType(productTypeId) {
  const productType = currentProductTypes.find(
    (candidate) => String(candidate.id) === String(productTypeId),
  );

  if (!productType) {
    return [];
  }

  const allowedStoreTypeIds = new Set(
    productTypeStoreTypeIds(productType).map((id) => String(id)),
  );

  return currentStores
    .filter((store) => allowedStoreTypeIds.has(String(store.storeTypeId)))
    .sort(sortBySavedOrderThenName);
}

function itemStoreOptions(productTypeId) {
  return storesForProductType(productTypeId).map((store) => ({
    value: store.id,
    text: store.name,
  }));
}

function itemStoreIsAllowed(productTypeId, storeId) {
  if (!storeId) {
    return true;
  }

  return storesForProductType(productTypeId).some(
    (store) => String(store.id) === String(storeId),
  );
}

function populateItemStoreSelect(
  selectElement,
  productTypeId,
  selectedStoreId = "",
) {
  if (!selectElement) {
    return;
  }

  const stores = storesForProductType(productTypeId);
  selectElement.innerHTML = "";

  const emptyOption = document.createElement("option");
  emptyOption.value = "";
  emptyOption.textContent =
    stores.length > 0 ? "Any matching store" : "No matching stores";
  selectElement.append(emptyOption);

  stores.forEach((store) => {
    const option = document.createElement("option");
    option.value = store.id;
    option.textContent = store.name;
    selectElement.append(option);
  });

  const hasSelectedStore = stores.some(
    (store) => String(store.id) === String(selectedStoreId),
  );

  selectElement.value = hasSelectedStore ? selectedStoreId : "";
  selectElement.disabled = stores.length === 0;
}

function getItemStoreName(item) {
  if (!item?.storeId) {
    return "";
  }

  return (
    currentStores.find((store) => String(store.id) === String(item.storeId))
      ?.name ?? ""
  );
}

function roomOptions() {
  return currentRooms.map((room) => ({
    value: room.id,
    text: room.name,
  }));
}

function activeCatalogueItems() {
  return currentItems.filter((item) => item.active !== false);
}

function itemOptions() {
  const groups = [];

  orderedProductTypesForDefaultRoomView().forEach((productType) => {
    const options = activeCatalogueItems()
      .filter((item) => String(item.productTypeId) === String(productType.id))
      .sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")))
      .map((item) => ({
        value: item.id,
        text: item.name,
      }));

    if (options.length > 0) {
      groups.push({
        label: productType.name,
        options,
      });
    }
  });

  const groupedIds = new Set(
    groups.flatMap((group) =>
      group.options.map((option) => String(option.value)),
    ),
  );

  const remainingOptions = activeCatalogueItems()
    .filter((item) => !groupedIds.has(String(item.id)))
    .sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")))
    .map((item) => ({
      value: item.id,
      text: item.name,
    }));

  if (remainingOptions.length > 0) {
    groups.push({
      label: "Product type not set",
      options: remainingOptions,
    });
  }

  return groups;
}

function getItemName(itemId) {
  const item = currentItems.find(
    (candidate) => String(candidate.id) === String(itemId),
  );

  return item?.name ?? "Item not set";
}

function getStoreName(storeId) {
  const store = currentStores.find(
    (candidate) => String(candidate.id) === String(storeId),
  );

  return store?.name ?? "Store not set";
}

function getStoreNames(storeIds = []) {
  const names = storeIds
    .map((storeId) => getStoreName(storeId))
    .filter((name) => name !== "Store not set");

  return names.length > 0 ? names.join(", ") : "Stores not set";
}

function productTypeOptions() {
  const groups = [];

  currentStoreTypes.forEach((storeType) => {
    const options = getProductTypesForStoreType(storeType.id)
      .sort(sortProductTypesForStoreType(storeType.id))
      .map((productType) => ({
        value: productType.id,
        text: productType.name,
      }));

    if (options.length > 0) {
      groups.push({
        label: storeType.name,
        options,
      });
    }
  });

  const unassignedOptions = currentProductTypes
    .filter((productType) => productTypeStoreTypeIds(productType).length === 0)
    .sort(sortBySavedOrderThenName)
    .map((productType) => ({
      value: productType.id,
      text: productType.name,
    }));

  if (unassignedOptions.length > 0) {
    groups.push({
      label: "Store type not set",
      options: unassignedOptions,
    });
  }

  return groups;
}

function unitOptions() {
  return currentUnits.map((unit) => ({
    value: unit.id,
    text: `${unit.name} (${unit.symbol})`,
  }));
}

function getStoreTypeName(storeTypeId) {
  const storeType = currentStoreTypes.find(
    (candidate) => candidate.id === storeTypeId,
  );

  return storeType?.name ?? "Store type not set";
}

function productTypeStoreTypeIds(productType) {
  if (
    Array.isArray(productType.storeTypeIds) &&
    productType.storeTypeIds.length > 0
  ) {
    return productType.storeTypeIds.map((id) => String(id));
  }

  if (productType.storeTypeId) {
    return [String(productType.storeTypeId)];
  }

  return [];
}

function productTypeBelongsToStoreType(productType, storeTypeId) {
  return productTypeStoreTypeIds(productType).some(
    (candidateId) => String(candidateId) === String(storeTypeId),
  );
}

function pruneObjectByKeys(sourceObject = {}, keysToKeep = []) {
  const keptKeys = new Set(keysToKeep.map((key) => String(key)));
  const nextObject = {};

  Object.entries(sourceObject ?? {}).forEach(([key, value]) => {
    if (keptKeys.has(String(key))) {
      nextObject[key] = value;
    }
  });

  return nextObject;
}

function storeProductTypeOrderContains(store, productTypeId) {
  return Object.prototype.hasOwnProperty.call(
    store.productTypeOrders ?? {},
    productTypeId,
  );
}

function getStoreExcludedProductTypeIds(store) {
  return Array.isArray(store?.excludedProductTypeIds)
    ? store.excludedProductTypeIds.map((productTypeId) => String(productTypeId))
    : [];
}

function storeExcludesProductType(store, productTypeId) {
  return getStoreExcludedProductTypeIds(store).some(
    (candidateId) => String(candidateId) === String(productTypeId),
  );
}

function getStoreTypeNames(storeTypeIds) {
  const names = storeTypeIds
    .map((storeTypeId) => getStoreTypeName(storeTypeId))
    .filter((name) => name !== "Store type not set");

  return names.length > 0 ? names.join(", ") : "Store type not set";
}

function getProductTypeSortOrder(productType, storeTypeId) {
  const groupedOrder = productType.storeTypeOrders?.[storeTypeId];

  return typeof groupedOrder === "number"
    ? groupedOrder
    : getSortOrder(productType);
}

function sortProductTypesForStoreType(storeTypeId) {
  return (a, b) => {
    const orderDifference =
      getProductTypeSortOrder(a, storeTypeId) -
      getProductTypeSortOrder(b, storeTypeId);

    if (orderDifference !== 0) {
      return orderDifference;
    }

    return String(a.name ?? "").localeCompare(String(b.name ?? ""));
  };
}

function getStoreProductTypeOrder(store, productTypeId) {
  const order = store?.productTypeOrders?.[productTypeId];

  return typeof order === "number" ? order : null;
}

function sortProductTypesForStore(store, storeTypeId) {
  const defaultSort = sortProductTypesForStoreType(storeTypeId);

  return (a, b) => {
    const aOrder = getStoreProductTypeOrder(store, a.id);
    const bOrder = getStoreProductTypeOrder(store, b.id);

    if (aOrder !== null && bOrder !== null && aOrder !== bOrder) {
      return aOrder - bOrder;
    }

    if (aOrder !== null && bOrder === null) {
      return -1;
    }

    if (aOrder === null && bOrder !== null) {
      return 1;
    }

    return defaultSort(a, b);
  };
}

function getProductTypesForStoreType(storeTypeId) {
  return currentProductTypes.filter((productType) =>
    productTypeBelongsToStoreType(productType, storeTypeId),
  );
}

function getOrderedProductTypesForShoppingTarget(storeTypeId, store = null) {
  const productTypes = getProductTypesForStoreType(storeTypeId).filter(
    (productType) => !store || !storeExcludesProductType(store, productType.id),
  );

  return productTypes.sort(
    store
      ? sortProductTypesForStore(store, storeTypeId)
      : sortProductTypesForStoreType(storeTypeId),
  );
}

async function removeProductTypeFromStore(store, productType) {
  const scrollY = window.scrollY;
  const updates = {
    excludedProductTypeIds: arrayUnion(String(productType.id)),
    updatedAt: serverTimestamp(),
  };

  if (storeProductTypeOrderContains(store, productType.id)) {
    updates[`productTypeOrders.${productType.id}`] = deleteField();
  }

  await updateDoc(householdDocument("stores", store.id), updates);
  restoreScrollPosition(scrollY);
}

function createStoreProductTypeOrderRow(productType, store) {
  const row = document.createElement("div");
  row.className =
    "settings-list-item settings-order-row store-product-type-order-row";
  row.dataset.documentId = productType.id;

  const handle = document.createElement("span");
  handle.className = "settings-order-handle";
  handle.textContent = "☰";
  handle.setAttribute("aria-hidden", "true");

  const text = document.createElement("span");
  text.className = "settings-order-text";

  const name = document.createElement("span");
  name.className = "settings-order-name";
  name.textContent = productType.name;

  text.append(name);

  const actions = document.createElement("span");
  actions.className = "settings-row-actions";

  const deleteButton = createIconButton({
    className: "settings-row-icon-button settings-row-delete-button",
    icon: "🗑️",
    label: `Remove ${productType.name} from ${store.name}`,
    onClick: async (event) => {
      event.stopPropagation();
      deleteButton.disabled = true;

      try {
        await removeProductTypeFromStore(store, productType);
      } catch (error) {
        console.error("Could not remove product type from store:", error);
        alert("The product type could not be removed from this store.");
        deleteButton.disabled = false;
      }
    },
  });

  actions.append(deleteButton);
  row.append(handle, text, actions);

  return row;
}

function createStoreProductTypeOrderPanel(store) {
  const wrapper = document.createElement("div");
  wrapper.className = "store-product-type-order-panel";

  const title = document.createElement("div");
  title.className = "settings-field-label";
  title.textContent = "Product type order for this store";
  wrapper.append(title);

  if (!store.storeTypeId) {
    const message = document.createElement("p");
    message.className = "settings-help-text";
    message.textContent =
      "Choose and save a store type before setting product type order.";
    wrapper.append(message);
    return wrapper;
  }

  const allProductTypesForStore = getProductTypesForStoreType(
    store.storeTypeId,
  );

  if (allProductTypesForStore.length === 0) {
    const message = document.createElement("p");
    message.className = "settings-help-text";
    message.textContent =
      "No product types are associated with this store type yet.";
    wrapper.append(message);
    return wrapper;
  }

  const productTypesForStore = allProductTypesForStore
    .filter((productType) => !storeExcludesProductType(store, productType.id))
    .sort(sortProductTypesForStore(store, store.storeTypeId));

  if (productTypesForStore.length > 0) {
    const list = document.createElement("div");
    list.className = "store-product-type-order-list";
    list.dataset.storeId = store.id;

    productTypesForStore.forEach((productType) => {
      list.append(createStoreProductTypeOrderRow(productType, store));
    });

    wrapper.append(list);

    queueMicrotask(() => {
      enableStoreProductTypeOrdering(list, store);
    });
  } else {
    const message = document.createElement("p");
    message.className = "settings-help-text";
    message.textContent =
      "All product types have been removed from this store. Reset to restore the default list.";
    wrapper.append(message);
  }

  const resetButton = document.createElement("button");
  resetButton.type = "button";
  resetButton.className =
    "settings-secondary-button store-product-type-reset-button";
  resetButton.textContent = "Reset to default order";

  resetButton.addEventListener("click", async () => {
    resetButton.disabled = true;

    try {
      await resetStoreProductTypeOrder(store);
    } catch (error) {
      console.error("Could not reset store product type order:", error);
      alert("The product type order could not be reset.");
    } finally {
      resetButton.disabled = false;
    }
  });

  wrapper.append(resetButton);

  return wrapper;
}

async function saveStoreProductTypeOrder(groupList, store) {
  const scrollY = window.scrollY;

  const rows = Array.from(groupList.querySelectorAll(".settings-order-row"));

  const productTypeOrders = {
    ...(store.productTypeOrders ?? {}),
  };

  rows.forEach((row, index) => {
    productTypeOrders[row.dataset.documentId] = index;
  });

  await updateDoc(householdDocument("stores", store.id), {
    productTypeOrders,
    updatedAt: serverTimestamp(),
  });

  restoreScrollPosition(scrollY);
}

async function resetStoreProductTypeOrder(store) {
  const scrollY = window.scrollY;

  await updateDoc(householdDocument("stores", store.id), {
    productTypeOrders: {},
    excludedProductTypeIds: deleteField(),
    updatedAt: serverTimestamp(),
  });

  restoreScrollPosition(scrollY);
}

function enableStoreProductTypeOrdering(groupList, store) {
  const sortableKey = `store-product-types::${store.id}`;

  if (settingsSortables.has(sortableKey)) {
    settingsSortables.get(sortableKey).destroy();
    settingsSortables.delete(sortableKey);
  }

  const orderableRows = groupList.querySelectorAll(".settings-order-row");

  if (orderableRows.length < 2) {
    return;
  }

  const sortable = Sortable.create(groupList, {
    animation: 150,
    draggable: ".settings-order-row",
    handle: ".settings-order-handle",
    delay: 220,
    delayOnTouchOnly: true,
    touchStartThreshold: 8,
    forceFallback: true,
    fallbackTolerance: 5,
    ghostClass: "settings-sort-ghost",
    chosenClass: "settings-sort-chosen",
    onEnd: async (event) => {
      if (event.oldIndex === event.newIndex) {
        return;
      }

      try {
        await saveStoreProductTypeOrder(groupList, store);
      } catch (error) {
        console.error("Could not save store product type order:", error);
        alert("The new product type order could not be saved.");
      }
    },
  });

  settingsSortables.set(sortableKey, sortable);
}

function getProductTypeStoreTypeIdsFromForm() {
  return Array.from(
    productTypeStoreTypesContainer.querySelectorAll(
      "input[type='checkbox']:checked",
    ),
  ).map((checkbox) => checkbox.value);
}

function clearProductTypeStoreTypeForm() {
  productTypeStoreTypesContainer
    .querySelectorAll("input[type='checkbox']")
    .forEach((checkbox) => {
      checkbox.checked = false;
    });
}

function createStoreTypeCheckboxList(container, selectedStoreTypeIds = []) {
  container.innerHTML = "";
  container.className = "settings-checkbox-list";

  const selectedValues = new Set(selectedStoreTypeIds.map((id) => String(id)));

  if (currentStoreTypes.length === 0) {
    container.innerHTML = "<p>No store types are available.</p>";
    return;
  }

  currentStoreTypes.forEach((storeType) => {
    const { optionLabel } = createSettingsCheckboxOption({
      value: storeType.id,
      text: storeType.name,
      checked: selectedValues.has(String(storeType.id)),
    });

    container.append(optionLabel);
  });
}

function populateOneOffRoomSelect() {
  if (!oneOffItemRoomSelect) {
    return;
  }

  const selectedValue = oneOffItemRoomSelect.value;
  oneOffItemRoomSelect.innerHTML =
    '<option value="">No additional room</option>';

  currentRooms.forEach((room) => {
    const option = document.createElement("option");
    option.value = room.id;
    option.textContent = room.name;
    oneOffItemRoomSelect.append(option);
  });

  if (currentRooms.some((room) => String(room.id) === String(selectedValue))) {
    oneOffItemRoomSelect.value = selectedValue;
  }

  refreshCompactSelect(oneOffItemRoomSelect);
}

function renderOneOffShoppingTargets({ preserveSelection = true } = {}) {
  if (!oneOffShoppingTargets) {
    return;
  }

  const selectedValues = preserveSelection
    ? new Set(
        Array.from(
          oneOffShoppingTargets.querySelectorAll(
            "input[type='checkbox']:checked",
          ),
        ).map((checkbox) => checkbox.value),
      )
    : new Set();

  oneOffShoppingTargets.innerHTML = "";

  if (currentStoreTypes.length === 0) {
    oneOffShoppingTargets.innerHTML = "<p>No store types are available.</p>";
    return;
  }

  currentStoreTypes.forEach((storeType) => {
    const group = document.createElement("div");
    group.className = "one-off-shopping-target-group";

    const storeTypeChoice = createSettingsCheckboxOption({
      value: `storeType:${storeType.id}`,
      text: storeType.name,
      checked: selectedValues.has(`storeType:${storeType.id}`),
    });
    storeTypeChoice.optionLabel.classList.add("one-off-shopping-target-option");
    group.append(storeTypeChoice.optionLabel);

    currentStores
      .filter((store) => String(store.storeTypeId) === String(storeType.id))
      .sort(sortBySavedOrderThenName)
      .forEach((store) => {
        const storeChoice = createSettingsCheckboxOption({
          value: `store:${store.id}`,
          text: store.name,
          checked: selectedValues.has(`store:${store.id}`),
        });
        storeChoice.optionLabel.classList.add("one-off-shopping-target-option");
        group.append(storeChoice.optionLabel);
      });

    oneOffShoppingTargets.append(group);
  });
}

function selectedOneOffShoppingTargets() {
  const storeTypeIds = [];
  const storeIds = [];

  oneOffShoppingTargets
    .querySelectorAll("input[type='checkbox']:checked")
    .forEach((checkbox) => {
      const [kind, id] = checkbox.value.split(":");

      if (kind === "storeType" && id) {
        storeTypeIds.push(id);
      }

      if (kind === "store" && id) {
        storeIds.push(id);
      }
    });

  return { storeTypeIds, storeIds };
}

function resetOneOffItemForm() {
  addOneOffItemForm?.reset();
  renderOneOffShoppingTargets({ preserveSelection: false });
  populateOneOffRoomSelect();
}

async function saveOneOffItem() {
  const name = oneOffItemNameInput.value.trim();
  const specificAttributes = oneOffItemAttributesInput.value.trim();
  const roomId = oneOffItemRoomSelect.value || null;
  const { storeTypeIds, storeIds } = selectedOneOffShoppingTargets();

  if (!name) {
    throw new Error("Please enter an item name.");
  }

  if (storeTypeIds.length === 0 && storeIds.length === 0) {
    throw new Error("Please choose at least one store type or store.");
  }

  await addDoc(householdCollection("neededEntries"), {
    oneOff: true,
    itemName: name,
    specificAttributes,
    roomId,
    storeTypeIds,
    storeIds,
    amount: 1,
    unitId: null,
    status: "needed",
    addedAt: serverTimestamp(),
    adjustedAt: serverTimestamp(),
    statusChangedAt: serverTimestamp(),
    collectedAt: null,
  });
}

async function saveSettingsOrder({ listElement, collectionName }) {
  const rows = Array.from(listElement.querySelectorAll(".settings-order-row"));

  const batch = writeBatch(db);

  rows.forEach((row, index) => {
    const documentRef = householdDocument(
      collectionName,
      row.dataset.documentId,
    );

    batch.update(documentRef, {
      sortOrder: index,
      updatedAt: serverTimestamp(),
    });
  });

  await batch.commit();
}

async function saveProductTypeGroupOrder(groupList, storeTypeId) {
  const scrollY = window.scrollY;

  const rows = Array.from(groupList.querySelectorAll(".settings-order-row"));

  const batch = writeBatch(db);
  const orderField = `storeTypeOrders.${storeTypeId}`;

  rows.forEach((row, index) => {
    batch.update(householdDocument("productTypes", row.dataset.documentId), {
      [orderField]: index,
      updatedAt: serverTimestamp(),
    });
  });

  await batch.commit();

  restoreScrollPosition(scrollY);
}

function destroySortablesByPrefix(prefix) {
  Array.from(settingsSortables.keys())
    .filter((key) => key.startsWith(prefix))
    .forEach((key) => {
      settingsSortables.get(key).destroy();
      settingsSortables.delete(key);
    });
}

function restoreScrollPosition(scrollY) {
  requestAnimationFrame(() => {
    window.scrollTo({
      top: scrollY,
      left: 0,
      behavior: "auto",
    });
  });
}

function settingsMenuOrdersMatch(firstOrder, secondOrder) {
  return (
    firstOrder.length === secondOrder.length &&
    firstOrder.every(
      (categoryName, index) => categoryName === secondOrder[index],
    )
  );
}

function applySavedSettingsMenuOrder() {
  if (!settingsHome) {
    return;
  }

  let savedOrder = [];

  try {
    const storedValue = localStorage.getItem(SETTINGS_MENU_ORDER_KEY);
    savedOrder = storedValue ? JSON.parse(storedValue) : [];
  } catch (error) {
    console.warn("Could not read Settings menu order:", error);
  }

  if (!Array.isArray(savedOrder)) {
    savedOrder = [];
  }

  const optionsByKey = new Map(
    Array.from(
      settingsHome.querySelectorAll(
        ".settings-menu-order-row[data-settings-category]",
      ),
    ).map((option) => [option.dataset.settingsCategory, option]),
  );

  const validSavedOrder = savedOrder.filter((categoryName) =>
    optionsByKey.has(categoryName),
  );
  const orderToApply =
    validSavedOrder.length > 0 &&
    !settingsMenuOrdersMatch(
      validSavedOrder,
      LEGACY_SETTINGS_MENU_DEFAULT_ORDER,
    )
      ? validSavedOrder
      : SETTINGS_MENU_DEFAULT_ORDER;

  orderToApply.forEach((categoryName) => {
    const option = optionsByKey.get(categoryName);

    if (option) {
      settingsHome.append(option);
      optionsByKey.delete(categoryName);
    }
  });

  optionsByKey.forEach((option) => {
    settingsHome.append(option);
  });
}

function saveSettingsMenuOrder() {
  const order = Array.from(
    settingsHome.querySelectorAll(
      ".settings-menu-order-row[data-settings-category]",
    ),
  ).map((option) => option.dataset.settingsCategory);

  try {
    localStorage.setItem(SETTINGS_MENU_ORDER_KEY, JSON.stringify(order));
  } catch (error) {
    console.warn("Could not save Settings menu order:", error);
  }
}

function enableSettingsMenuOrdering() {
  if (!settingsHome) {
    return;
  }

  const sortableKey = "settings-menu";

  if (settingsSortables.has(sortableKey)) {
    settingsSortables.get(sortableKey).destroy();
    settingsSortables.delete(sortableKey);
  }

  applySavedSettingsMenuOrder();

  const sortable = Sortable.create(settingsHome, {
    animation: 150,
    draggable: ".settings-menu-order-row",
    handle: ".settings-order-handle",
    delay: 220,
    delayOnTouchOnly: true,
    touchStartThreshold: 8,
    forceFallback: true,
    fallbackTolerance: 5,
    ghostClass: "settings-sort-ghost",
    chosenClass: "settings-sort-chosen",
    onEnd: saveSettingsMenuOrder,
  });

  settingsSortables.set(sortableKey, sortable);
}

function enableProductTypeGroupOrdering(groupList, storeTypeId) {
  const sortableKey = `product-types::${storeTypeId}`;

  if (settingsSortables.has(sortableKey)) {
    settingsSortables.get(sortableKey).destroy();
    settingsSortables.delete(sortableKey);
  }

  const orderableRows = groupList.querySelectorAll(".settings-order-row");

  if (orderableRows.length < 2) {
    return;
  }

  const sortable = Sortable.create(groupList, {
    animation: 150,
    draggable: ".settings-order-row",
    handle: ".settings-order-handle",
    delay: 220,
    delayOnTouchOnly: true,
    touchStartThreshold: 8,
    forceFallback: true,
    fallbackTolerance: 5,
    ghostClass: "settings-sort-ghost",
    chosenClass: "settings-sort-chosen",
    onEnd: async (event) => {
      if (event.oldIndex === event.newIndex) {
        return;
      }

      try {
        await saveProductTypeGroupOrder(groupList, storeTypeId);
      } catch (error) {
        console.error("Could not save product type order:", error);
        alert("The new order could not be saved.");
      }
    },
  });

  settingsSortables.set(sortableKey, sortable);
}

function enableSettingsOrdering({ listElement, collectionName }) {
  const sortableKey = listElement.id;

  if (settingsSortables.has(sortableKey)) {
    settingsSortables.get(sortableKey).destroy();
    settingsSortables.delete(sortableKey);
  }

  const orderableRows = listElement.querySelectorAll(".settings-order-row");

  if (orderableRows.length < 2) {
    return;
  }

  const sortable = Sortable.create(listElement, {
    animation: 150,
    draggable: ".settings-order-row",
    handle: ".settings-order-handle",
    delay: 220,
    delayOnTouchOnly: true,
    touchStartThreshold: 8,
    forceFallback: true,
    fallbackTolerance: 5,
    ghostClass: "settings-sort-ghost",
    chosenClass: "settings-sort-chosen",
    onEnd: async (event) => {
      if (event.oldIndex === event.newIndex) {
        return;
      }

      try {
        await saveSettingsOrder({
          listElement,
          collectionName,
        });
      } catch (error) {
        console.error("Could not save order:", error);
        alert("The new order could not be saved.");
      }
    },
  });

  settingsSortables.set(sortableKey, sortable);
}

/* ===== Settings renderers ===== */

function renderSettingsRows({
  settingsKey,
  listElement,
  collectionName,
  items,
  emptyMessage,
  label,
  sublabel,
  fields,
  onSave,
  onDelete,
  extraContent = null,
}) {
  listElement.innerHTML = "";

  if (items.length === 0) {
    listElement.innerHTML = `<p>${emptyMessage}</p>`;
    return;
  }

  items.forEach((item) => {
    const itemLabel = label(item);

    const row = createSettingsRow({
      id: item.id,
      label: itemLabel,
      sublabel: sublabel ? sublabel(item) : "",
      editLabel: `Edit ${itemLabel}`,
      deleteLabel: `Delete ${itemLabel}`,
      onEdit: () => {
        setEditingSettings(settingsKey, item.id);
      },
      onDelete: async () => {
        try {
          await onDelete(item);
        } catch (error) {
          console.error("Could not remove settings item:", error);
          alert(error.message || "The item could not be removed.");
        }
      },
    });

    listElement.append(row);

    appendSettingsEditPanel({
      listElement,
      rowElement: row,
      settingsKey,
      item,
      fields,
      onSave,
      extraContent,
    });
  });

  enableSettingsOrdering({
    listElement,
    collectionName,
  });
}

function renderSettingsLists() {
  if (!editingSettingsKey || !editingSettingsId) {
    clearSettingsEditScrollSpace();
  }

  renderRooms(currentRooms);
  renderUnits(currentUnits);
  renderStoreTypes(currentStoreTypes);
  renderStores(currentStores);
  renderProductTypes(currentProductTypes);
  renderSettingsItems();
}

function renderRooms(rooms) {
  currentRooms = rooms;
  populateSettingsItemRoomSelect();
  populateOneOffRoomSelect();

  renderSettingsRows({
    settingsKey: "rooms",
    listElement: settingsRoomsList,
    collectionName: "locations",
    items: rooms,
    emptyMessage: "No rooms have been created yet.",
    label: (room) => room.name,
    fields: [
      {
        key: "name",
        label: "Room name",
        maxLength: 50,
        value: () =>
          rooms.find((room) => room.id === editingSettingsId)?.name ?? "",
      },
    ],
    onSave: async (values, room) => {
      if (!values.name) {
        throw new Error("Please enter a room name.");
      }

      await updateDoc(householdDocument("locations", room.id), {
        name: values.name,
        updatedAt: serverTimestamp(),
      });
    },
    onDelete: deactivateRoom,
  });

  needingRoomsList.innerHTML = "";

  const oneOffButton = document.createElement("button");
  oneOffButton.type = "button";
  oneOffButton.className =
    "room-button shopping-location-option one-off-room-button";
  oneOffButton.textContent = "One-off stuff";
  oneOffButton.addEventListener("click", () => {
    recordAppNavigation();
    openOneOffRoom();
  });
  needingRoomsList.append(oneOffButton);

  const regularButton = document.createElement("button");
  regularButton.type = "button";
  regularButton.className =
    "room-button shopping-location-option regular-room-button";
  regularButton.textContent = "Regular stuff";
  regularButton.addEventListener("click", () => {
    recordAppNavigation();
    openRegularRoom();
  });
  needingRoomsList.append(regularButton);

  rooms.forEach((room) => {
    const roomButton = document.createElement("button");
    roomButton.type = "button";
    roomButton.className = "room-button shopping-location-option";
    roomButton.textContent = `${room.name} stuff`;
    roomButton.addEventListener("click", () => {
      recordAppNavigation();
      openRoom(room);
    });
    needingRoomsList.append(roomButton);
  });

  const allStuffButton = document.createElement("button");
  allStuffButton.type = "button";
  allStuffButton.className =
    "room-button shopping-location-option all-stuff-room-button";
  allStuffButton.textContent = "All stuff";
  allStuffButton.addEventListener("click", () => {
    recordAppNavigation();
    openAllStuff();
  });
  needingRoomsList.append(allStuffButton);

  updateSelectedRoomLabel();
  renderSettingsItems();
}

function renderUnits(units) {
  currentUnits = units;

  renderSettingsRows({
    settingsKey: "units",
    listElement: settingsUnitsList,
    collectionName: "units",
    items: units,
    emptyMessage: "No units have been created yet.",
    label: (unit) => unit.symbol ?? unit.name,
    fields: [
      {
        key: "symbol",
        label: "Unit symbol",
        maxLength: 10,
        value: () =>
          units.find((unit) => unit.id === editingSettingsId)?.symbol ?? "",
      },
    ],
    onSave: async (values, unit) => {
      if (!values.symbol) {
        throw new Error("Please enter a unit symbol.");
      }

      await updateDoc(householdDocument("units", unit.id), {
        name: values.symbol,
        symbol: values.symbol,
        displayMode: values.symbol === "×" ? "multiplier" : "suffix",
        updatedAt: serverTimestamp(),
      });
    },
    onDelete: deactivateUnit,
  });

  populateUnitDropdown();
}

function renderStoreTypes(storeTypes) {
  currentStoreTypes = storeTypes;

  renderSettingsRows({
    settingsKey: "store-types",
    listElement: settingsStoreTypesList,
    collectionName: "storeTypes",
    items: storeTypes,
    emptyMessage: "No store types have been created yet.",
    label: (storeType) => storeType.name,
    fields: [
      {
        key: "name",
        label: "Store type name",
        maxLength: 50,
        value: () =>
          storeTypes.find((storeType) => storeType.id === editingSettingsId)
            ?.name ?? "",
      },
    ],
    onSave: async (values, storeType) => {
      if (!values.name) {
        throw new Error("Please enter a store type name.");
      }

      await updateDoc(householdDocument("storeTypes", storeType.id), {
        name: values.name,
        updatedAt: serverTimestamp(),
      });
    },
    onDelete: deactivateStoreType,
  });

  populateStoreTypeDropdowns();
  renderStores(currentStores);
  renderProductTypes(currentProductTypes);
  renderShoppingLocations();
  renderOneOffShoppingTargets();
}

function renderStores(stores) {
  currentStores = stores;
  destroySortablesByPrefix("store-product-types::");

  renderSettingsRows({
    settingsKey: "stores",
    listElement: settingsStoresList,
    collectionName: "stores",
    items: stores,
    emptyMessage: "No stores have been created yet.",
    label: (store) => store.name,
    sublabel: (store) => getStoreTypeName(store.storeTypeId),
    fields: [
      {
        key: "name",
        label: "Store name",
        maxLength: 80,
        value: () =>
          stores.find((store) => store.id === editingSettingsId)?.name ?? "",
      },
      {
        key: "storeTypeId",
        label: "Store type",
        type: "select",
        emptyText: "Choose a store type",
        options: storeTypeOptions,
        value: () =>
          stores.find((store) => store.id === editingSettingsId)?.storeTypeId ??
          "",
      },
    ],
    onSave: async (values, store) => {
      if (!values.name || !values.storeTypeId) {
        throw new Error("Please complete all required fields.");
      }

      const storeTypeChanged =
        String(store.storeTypeId) !== String(values.storeTypeId);

      await updateDoc(householdDocument("stores", store.id), {
        name: values.name,
        storeTypeId: values.storeTypeId,
        productTypeOrders: storeTypeChanged
          ? {}
          : (store.productTypeOrders ?? {}),
        excludedProductTypeIds: storeTypeChanged
          ? deleteField()
          : getStoreExcludedProductTypeIds(store),
        updatedAt: serverTimestamp(),
      });
    },
    onDelete: deactivateStore,
    extraContent: (store) => createStoreProductTypeOrderPanel(store),
  });

  renderShoppingLocations();
  renderOneOffShoppingTargets();
  populateItemStoreSelect(
    itemStoreSelect,
    itemProductTypeSelect?.value,
    itemStoreSelect?.value,
  );
  populateItemStoreSelect(
    settingsItemStoreSelect,
    settingsItemProductTypeSelect?.value,
    settingsItemStoreSelect?.value,
  );
}

function productTypeEditFields(productTypes) {
  return [
    {
      key: "name",
      label: "Product type name",
      maxLength: 50,
      value: () =>
        productTypes.find((productType) => productType.id === editingSettingsId)
          ?.name ?? "",
    },
    {
      key: "storeTypeIds",
      label: "Store types",
      type: "checkboxes",
      options: storeTypeOptions,
      value: () => {
        const productType = productTypes.find(
          (candidate) => candidate.id === editingSettingsId,
        );

        return productType ? productTypeStoreTypeIds(productType) : [];
      },
    },
  ];
}

async function cleanStoreProductTypeOrdersForProductType(
  batch,
  productTypeId,
  validStoreTypeIds,
) {
  const validStoreTypeIdSet = new Set(
    validStoreTypeIds.map((storeTypeId) => String(storeTypeId)),
  );

  currentStores.forEach((store) => {
    if (validStoreTypeIdSet.has(String(store.storeTypeId))) {
      return;
    }

    const excludedProductTypeIds = getStoreExcludedProductTypeIds(store);
    const hasSavedOrder = storeProductTypeOrderContains(store, productTypeId);
    const isExcluded = excludedProductTypeIds.some(
      (candidateId) => String(candidateId) === String(productTypeId),
    );

    if (!hasSavedOrder && !isExcluded) {
      return;
    }

    const updates = {
      excludedProductTypeIds: excludedProductTypeIds.filter(
        (candidateId) => String(candidateId) !== String(productTypeId),
      ),
      updatedAt: serverTimestamp(),
    };

    if (hasSavedOrder) {
      updates[`productTypeOrders.${productTypeId}`] = deleteField();
    }

    batch.update(householdDocument("stores", store.id), updates);
  });
}

async function saveProductType(values, productType) {
  const storeTypeIds = values.storeTypeIds ?? [];

  if (!values.name || storeTypeIds.length === 0) {
    throw new Error("Please enter a name and choose at least one store type.");
  }

  const batch = writeBatch(db);

  batch.update(householdDocument("productTypes", productType.id), {
    name: values.name,
    storeTypeIds,
    storeTypeOrders: pruneObjectByKeys(
      productType.storeTypeOrders,
      storeTypeIds,
    ),
    updatedAt: serverTimestamp(),
  });

  await cleanStoreProductTypeOrdersForProductType(
    batch,
    productType.id,
    storeTypeIds,
  );

  await batch.commit();
}

function appendProductTypeGroup({ storeTypeId, headingText, productTypes }) {
  const group = document.createElement("section");
  group.className = "settings-group";

  const heading = document.createElement("div");
  heading.className = "settings-group-heading";
  heading.textContent = headingText;
  group.append(heading);

  const groupList = document.createElement("div");
  groupList.className = "settings-group-list";
  groupList.dataset.storeTypeId = storeTypeId;

  productTypes.forEach((productType) => {
    const itemLabel = productType.name;

    const row = createSettingsRow({
      id: productType.id,
      label: itemLabel,
      sublabel: getStoreTypeNames(productTypeStoreTypeIds(productType)),
      editLabel: `Edit ${itemLabel}`,
      deleteLabel: `Delete ${itemLabel}`,
      onEdit: () => {
        setEditingProductType(productType.id, storeTypeId);
      },
      onDelete: async () => {
        try {
          await deactivateProductType(productType);
        } catch (error) {
          console.error("Could not remove product type:", error);
          alert(error.message || "The product type could not be removed.");
        }
      },
    });

    groupList.append(row);

    appendSettingsEditPanel({
      listElement: groupList,
      rowElement: row,
      settingsKey: "product-types",
      contextId: storeTypeId,
      item: productType,
      fields: productTypeEditFields(currentProductTypes),
      onSave: saveProductType,
    });
  });

  group.append(groupList);
  settingsProductTypesList.append(group);
  enableProductTypeGroupOrdering(groupList, storeTypeId);
}

function renderProductTypes(productTypes) {
  currentProductTypes = productTypes;
  destroySortablesByPrefix("product-types::");

  settingsProductTypesList.innerHTML = "";

  if (productTypes.length === 0) {
    settingsProductTypesList.innerHTML =
      "<p>No product types have been created yet.</p>";

    populateProductTypeDropdown();
    renderRoomItems();
    renderSettingsItems();
    renderGettingItems();
    return;
  }

  currentStoreTypes.forEach((storeType) => {
    const productTypesForStoreType = productTypes
      .filter((productType) =>
        productTypeBelongsToStoreType(productType, storeType.id),
      )
      .sort(sortProductTypesForStoreType(storeType.id));

    if (productTypesForStoreType.length === 0) {
      return;
    }

    appendProductTypeGroup({
      storeTypeId: storeType.id,
      headingText: storeType.name,
      productTypes: productTypesForStoreType,
    });
  });

  const unassignedProductTypes = productTypes
    .filter((productType) => productTypeStoreTypeIds(productType).length === 0)
    .sort(sortBySavedOrderThenName);

  if (unassignedProductTypes.length > 0) {
    appendProductTypeGroup({
      storeTypeId: "unassigned",
      headingText: "Store type not set",
      productTypes: unassignedProductTypes,
    });
  }

  populateProductTypeDropdown();
  renderRoomItems();
  renderSettingsItems();
  renderGettingItems();
}

function getRoomName(roomId) {
  const room = currentRooms.find(
    (candidate) => String(candidate.id) === String(roomId),
  );

  return room?.name ?? "Room not set";
}

function getUnitDisplay(unitId) {
  const unit = currentUnits.find(
    (candidate) => String(candidate.id) === String(unitId),
  );

  return unit ? unit.symbol : "Unit not set";
}

function itemSettingsSublabel(item) {
  const productType = productTypeForItem(item);
  const parts = [
    productType?.name ?? "Product type not set",
    item.specificAttributes,
    getRoomName(item.locationId),
    getUnitDisplay(item.unitId),
    getItemStoreName(item),
  ].filter(Boolean);

  return parts.join(" · ");
}

function itemMatchesSettingsSearch(item, searchText) {
  if (!searchText) {
    return true;
  }

  const productType = productTypeForItem(item);
  const roomName = getRoomName(item.locationId);
  const unitName = getUnitDisplay(item.unitId);
  const storeName = getItemStoreName(item);

  return [
    item.name,
    item.specificAttributes,
    productType?.name,
    roomName,
    unitName,
    storeName,
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(searchText));
}

function showBriefToast(message) {
  $$(".brief-toast").forEach((toast) => toast.remove());

  const toast = document.createElement("div");
  toast.className = "brief-toast";
  toast.textContent = message;
  document.body.append(toast);

  window.setTimeout(() => {
    toast.classList.add("is-hiding");
  }, 900);

  window.setTimeout(() => {
    toast.remove();
  }, 1300);
}

async function toggleItemRegularList(item) {
  const nextValue = !itemIsRegular(item);

  try {
    await updateDoc(householdDocument("items", item.id), {
      regularList: nextValue,
      updatedAt: serverTimestamp(),
    });

    showBriefToast(
      nextValue ? "Added to regular list" : "Removed from regular list",
    );
  } catch (error) {
    console.error("Could not update regular list:", error);
    alert("The regular list could not be updated.");
  }
}

function createRegularListToggleButton(item) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "settings-row-icon-button settings-row-regular-button";
  button.setAttribute("aria-pressed", String(itemIsRegular(item)));
  button.setAttribute(
    "aria-label",
    itemIsRegular(item)
      ? `Remove ${item.name} from regular list`
      : `Add ${item.name} to regular list`,
  );

  const graphic = document.createElement("span");
  graphic.className = "collect-checkbox-graphic settings-regular-graphic";
  graphic.textContent = itemIsRegular(item) ? "✓" : "";

  button.append(graphic);

  button.addEventListener("click", async (event) => {
    event.stopPropagation();
    button.disabled = true;
    await toggleItemRegularList(item);
    button.disabled = false;
  });

  return button;
}

async function deactivateSettingsItem(item) {
  if (neededEntriesForItem(item.id).length > 0) {
    alert(
      `${item.name} is currently on the needed list. Remove all generic and specific entries for it before removing it from Items.`,
    );
    return;
  }

  const linkedSpecificProducts = currentSpecificProducts.filter(
    (product) => String(product.itemId) === String(item.id),
  );

  if (linkedSpecificProducts.length > 0) {
    showDependencyBlock(item.name, [
      dependencyListLine(
        "Specific products linked to this item",
        dependencyNames(linkedSpecificProducts, (product) => product.name),
      ),
    ]);
    return;
  }

  if (
    !window.confirm(
      `Remove ${item.name}?\n\nThis will remove it from normal item lists.`,
    )
  ) {
    return;
  }

  await updateDoc(householdDocument("items", item.id), {
    active: false,
    updatedAt: serverTimestamp(),
  });

  if (editingSettingsKey === "items" && editingSettingsId === item.id) {
    editingSettingsKey = null;
    editingSettingsId = null;
    editingSettingsContextId = null;
  }
}

function createSettingsItemRow(item) {
  const row = document.createElement("div");
  row.className = "settings-list-item settings-item-edit-row";
  row.dataset.documentId = item.id;

  const text = document.createElement("span");
  text.className = "settings-order-text";

  const name = document.createElement("span");
  name.className = "settings-order-name";
  name.textContent = item.name;
  text.append(name);

  const detail = document.createElement("span");
  detail.className = "settings-order-sublabel";
  detail.textContent = itemSettingsSublabel(item);
  text.append(detail);

  const actions = document.createElement("span");
  actions.className = "settings-row-actions";

  const regularButton = createRegularListToggleButton(item);

  const editButton = createIconButton({
    className: "settings-row-icon-button settings-row-edit-button",
    icon: "✏️",
    label: `Edit ${item.name}`,
    onClick: () => {
      setEditingSettings("items", item.id);
    },
  });

  const deleteButton = createIconButton({
    className: "settings-row-icon-button settings-row-delete-button",
    icon: "🗑️",
    label: `Remove ${item.name}`,
    onClick: async () => {
      try {
        await deactivateSettingsItem(item);
      } catch (error) {
        console.error("Could not remove item:", error);
        alert(error.message || "The item could not be removed.");
      }
    },
  });

  actions.append(regularButton, editButton, deleteButton);
  row.append(text, actions);

  addScrollableHoldHandler(
    row,
    () => {
      openSpecificProductQuickAdd(item);
    },
    {
      duration: 450,
      moveTolerance: 20,
    },
  );

  return row;
}

async function saveSettingsItem(values, item) {
  const validationMessage = validateItemFormValues(values);

  if (validationMessage) {
    throw new Error(validationMessage);
  }

  await updateDoc(householdDocument("items", item.id), {
    name: values.name,
    locationId: values.locationId,
    productTypeId: values.productTypeId,
    storeId: values.storeId || null,
    specificAttributes: values.specificAttributes,
    defaultAmount: values.defaultAmount,
    unitId: values.unitId,
    increment: values.increment,
    updatedAt: serverTimestamp(),
  });
}

function appendSettingsItemEditPanel(item, listElement, rowElement) {
  if (
    editingSettingsKey !== "items" ||
    editingSettingsId !== item.id ||
    editingSettingsContextId !== null
  ) {
    return null;
  }

  rowElement?.classList.add("is-editing");

  const panel = document.createElement("section");
  panel.className = "settings-inline-edit-panel settings-form item-form-panel";
  panel.dataset.settingsEditKey = "items";
  panel.dataset.settingsEditId = String(item.id);
  panel.dataset.settingsEditContextId = "";

  const form = document.createElement("form");

  const headingRow = document.createElement("div");
  headingRow.className = "form-heading-row";

  const heading = document.createElement("h3");
  setContextualFormHeading(heading, "Edit item", item.name);

  const actions = document.createElement("div");
  actions.className = "form-heading-actions";

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.textContent = "×";
  cancelButton.setAttribute("aria-label", "Cancel editing");
  cancelButton.title = "Cancel";

  const saveButton = document.createElement("button");
  saveButton.type = "submit";
  saveButton.textContent = "✓";
  saveButton.setAttribute("aria-label", "Save changes");
  saveButton.title = "Save";

  actions.append(cancelButton, saveButton);
  headingRow.append(heading, actions);

  const fieldContainer = document.createElement("div");
  fieldContainer.className = "settings-form-fields";

  const fields = createItemFormFields({
    container: fieldContainer,
    idPrefix: `settings-item-edit-${item.id}`,
    values: item,
  });

  populateRoomSelect(fields.roomSelect, item.locationId);
  populateProductTypeSelect(fields.productTypeSelect, item.productTypeId);
  populateUnitSelect(fields.unitSelect, item.unitId);
  populateItemStoreSelect(
    fields.storeSelect,
    item.productTypeId,
    item.storeId ?? "",
  );

  fields.productTypeSelect.addEventListener("change", () => {
    populateItemStoreSelect(
      fields.storeSelect,
      fields.productTypeSelect.value,
      fields.storeSelect.value,
    );
  });

  fields.unitSelect.addEventListener("change", () => {
    updateIncrementFromUnit(fields.unitSelect, fields.incrementInput);
  });

  cancelButton.addEventListener("click", () => {
    editingSettingsKey = null;
    editingSettingsId = null;
    editingSettingsContextId = null;
    clearFormPositioningScrollSpace();
    renderSettingsLists();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const values = readItemFormValues(fields);
    saveButton.disabled = true;
    cancelButton.disabled = true;

    try {
      await saveSettingsItem(values, item);
      editingSettingsKey = null;
      editingSettingsId = null;
      editingSettingsContextId = null;
      clearFormPositioningScrollSpace();
      renderSettingsLists();
    } catch (error) {
      console.error("Could not save settings item:", error);
      alert(error.message || "The item could not be saved.");
    } finally {
      saveButton.disabled = false;
      cancelButton.disabled = false;
    }
  });

  form.append(headingRow, fieldContainer);
  panel.append(form);
  listElement.append(panel);

  return panel;
}

function recordedStoreNames(storeIds = []) {
  if (!Array.isArray(storeIds) || storeIds.length === 0) {
    return "";
  }

  return storeIds
    .map(
      (storeId) =>
        currentStores.find((store) => String(store.id) === String(storeId))
          ?.name ?? "",
    )
    .map((name) => String(name).trim())
    .filter(Boolean)
    .join(", ");
}

function specificProductSublabel(product, { includeItem = true } = {}) {
  const parts = [
    includeItem ? getItemName(product.itemId) : "",
    product.specificAttributes ?? product.size,
    recordedStoreNames(product.storeIds),
  ]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean);

  return parts.join(" · ");
}

function specificProductMatchesSearch(product, searchText) {
  if (!searchText) {
    return true;
  }

  return [
    product.name,
    getItemName(product.itemId),
    product.specificAttributes ?? product.size,
    recordedStoreNames(product.storeIds),
  ]
    .map((value) => String(value ?? "").toLowerCase())
    .some((value) => value.includes(searchText));
}

function createSettingsSpecificProductRow(product, { nested = false } = {}) {
  const row = document.createElement("div");
  row.className = "settings-list-item settings-specific-product-row";
  row.dataset.documentId = product.id;

  if (nested) {
    row.classList.add("settings-item-specific-product-row");
  }

  const text = document.createElement("span");
  text.className = "settings-order-text";

  const name = document.createElement("span");
  name.className = "settings-order-name";
  name.textContent = product.name;
  text.append(name);

  const sublabel = specificProductSublabel(product, {
    includeItem: !nested,
  });

  if (sublabel) {
    const detail = document.createElement("span");
    detail.className = "settings-order-sublabel";
    detail.textContent = sublabel;
    text.append(detail);
  }

  const actions = document.createElement("span");
  actions.className = "settings-row-actions";

  const editButton = createIconButton({
    className: "settings-row-icon-button settings-row-edit-button",
    icon: "✏️",
    label: `Edit ${product.name}`,
    onClick: () => {
      setEditingSettings("specific-products", product.id);
    },
  });

  const deleteButton = createIconButton({
    className: "settings-row-icon-button settings-row-delete-button",
    icon: "🗑️",
    label: `Delete ${product.name}`,
    onClick: async () => {
      if (specificNeededEntryForProduct(product.id)) {
        alert(
          `${product.name} is currently on the needed list. Remove it from the needed list before deleting it.`,
        );
        return;
      }

      if (!confirmSettingsDelete(product.name)) {
        return;
      }

      await deleteSettingsDocument("specificProducts", product.id);
    },
  });

  actions.append(editButton, deleteButton);
  row.append(text, actions);

  const parentItem = currentItems.find(
    (item) => String(item.id) === String(product.itemId),
  );

  if (parentItem) {
    addScrollableHoldHandler(row, () => {
      openSpecificProductQuickAdd(parentItem);
    });
  }

  return row;
}

function specificProductEditFields(products) {
  return [
    {
      key: "itemId",
      label: "Item",
      type: "select",
      emptyText: "Choose an item",
      options: itemOptions,
      value: () =>
        products.find((product) => product.id === editingSettingsId)?.itemId ??
        "",
    },
    {
      key: "name",
      label: "Product name",
      maxLength: 100,
      value: () =>
        products.find((product) => product.id === editingSettingsId)?.name ??
        "",
    },
    {
      key: "specificAttributes",
      label: "Specific Attributes (optional)",
      required: false,
      maxLength: 100,
      placeholder: "e.g. 2 L, gluten-free, fragrance-free",
      value: () => {
        const product = products.find(
          (candidate) => candidate.id === editingSettingsId,
        );

        return product?.specificAttributes ?? product?.size ?? "";
      },
    },
    {
      key: "storeIds",
      label: "Stores",
      type: "checkboxes",
      options: storeOptions,
      required: false,
      value: () =>
        products.find((product) => product.id === editingSettingsId)
          ?.storeIds ?? [],
    },
  ];
}

async function saveSettingsSpecificProduct(values, product) {
  if (!values.itemId || !values.name) {
    throw new Error("Please choose an item and enter a product name.");
  }

  await updateDoc(householdDocument("specificProducts", product.id), {
    itemId: values.itemId,
    name: values.name,
    specificAttributes: values.specificAttributes ?? "",
    storeIds: values.storeIds ?? [],
    updatedAt: serverTimestamp(),
  });
}

function appendSettingsSpecificProductEditPanel(
  product,
  listElement,
  rowElement,
) {
  const panel = appendSettingsEditPanel({
    listElement,
    rowElement,
    settingsKey: "specific-products",
    item: product,
    fields: specificProductEditFields(currentSpecificProducts),
    onSave: saveSettingsSpecificProduct,
  });

  if (panel) {
    panel.classList.add("settings-item-specific-product-edit-panel");
  }
}

function activeSpecificProductsForSettingsItem(itemId) {
  return currentSpecificProducts
    .filter(
      (product) =>
        product.active !== false && String(product.itemId) === String(itemId),
    )
    .sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")));
}

function settingsItemRecord(item, searchText) {
  const products = activeSpecificProductsForSettingsItem(item.id);

  if (!searchText) {
    return {
      item,
      products,
    };
  }

  const itemMatches = itemMatchesSettingsSearch(item, searchText);
  const matchingProducts = products.filter((product) =>
    specificProductMatchesSearch(product, searchText),
  );

  if (!itemMatches && matchingProducts.length === 0) {
    return null;
  }

  return {
    item,
    products: itemMatches ? products : matchingProducts,
  };
}

function appendSettingsSpecificProductsUnderItem({ itemRecord, listElement }) {
  if (itemRecord.products.length === 0) {
    return;
  }

  itemRecord.products.forEach((product) => {
    const row = createSettingsSpecificProductRow(product, {
      nested: true,
    });

    listElement.append(row);

    appendSettingsSpecificProductEditPanel(product, listElement, row);
  });
}

function appendSettingsItemRecord(itemRecord, listElement) {
  const row = createSettingsItemRow(itemRecord.item);
  listElement.append(row);
  appendSettingsItemEditPanel(itemRecord.item, listElement, row);
  appendSettingsSpecificProductsUnderItem({
    itemRecord,
    listElement,
  });
}

function appendSettingsItemsForProductType({
  container,
  productType,
  itemRecords,
  renderedItemIds,
}) {
  const productTypeItems = itemRecords
    .filter(({ item }) => String(item.productTypeId) === String(productType.id))
    .sort((a, b) =>
      String(a.item.name ?? "").localeCompare(String(b.item.name ?? "")),
    );

  if (productTypeItems.length === 0) {
    return;
  }

  const group = document.createElement("section");
  group.className = "settings-group settings-items-group";

  const heading = document.createElement("div");
  heading.className = "settings-group-heading";
  heading.textContent = productType.name;
  group.append(heading);

  const groupList = document.createElement("div");
  groupList.className = "settings-group-list";

  productTypeItems.forEach((itemRecord) => {
    appendSettingsItemRecord(itemRecord, groupList);
    renderedItemIds.add(itemRecord.item.id);
  });

  group.append(groupList);
  container.append(group);
}

function renderSettingsItems() {
  if (!settingsItemsList) {
    return;
  }

  const searchText = (settingsItemsSearch?.value ?? "").trim().toLowerCase();

  const itemRecords = currentItems
    .filter((item) => item.active !== false)
    .map((item) => settingsItemRecord(item, searchText))
    .filter(Boolean);

  settingsItemsList.innerHTML = "";

  if (itemRecords.length === 0) {
    settingsItemsList.innerHTML = searchText
      ? "<p>No matching items or specific products.</p>"
      : "<p>No items have been created yet.</p>";
    return;
  }

  const renderedItemIds = new Set();

  orderedProductTypesForDefaultRoomView().forEach((productType) => {
    appendSettingsItemsForProductType({
      container: settingsItemsList,
      productType,
      itemRecords,
      renderedItemIds,
    });
  });

  const ungroupedItems = itemRecords
    .filter(({ item }) => !renderedItemIds.has(item.id))
    .sort((a, b) =>
      String(a.item.name ?? "").localeCompare(String(b.item.name ?? "")),
    );

  if (ungroupedItems.length > 0) {
    const group = document.createElement("section");
    group.className = "settings-group settings-items-group";

    const heading = document.createElement("div");
    heading.className = "settings-group-heading";
    heading.textContent = "Product type not set";
    group.append(heading);

    const groupList = document.createElement("div");
    groupList.className = "settings-group-list";

    ungroupedItems.forEach((itemRecord) => {
      appendSettingsItemRecord(itemRecord, groupList);
    });

    group.append(groupList);
    settingsItemsList.append(group);
  }
}

/* ===== Form preparation and catalogue item entry ===== */

function populateStoreTypeDropdowns() {
  storeTypeSelect.innerHTML = '<option value="">Choose a store type</option>';

  currentStoreTypes.forEach((storeType) => {
    const storeOption = document.createElement("option");
    storeOption.value = storeType.id;
    storeOption.textContent = storeType.name;
    storeTypeSelect.append(storeOption);
  });

  createStoreTypeCheckboxList(productTypeStoreTypesContainer);
}
function populateRoomSelect(
  selectElement,
  selectedRoomId = "",
  emptyLabel = "Choose a room",
) {
  if (!selectElement) {
    return;
  }

  selectElement.innerHTML = "";

  const emptyOption = document.createElement("option");
  emptyOption.value = "";
  emptyOption.textContent = emptyLabel;
  selectElement.append(emptyOption);

  currentRooms.forEach((room) => {
    const option = document.createElement("option");
    option.value = room.id;
    option.textContent = room.name;
    selectElement.append(option);
  });

  if (currentRooms.some((room) => String(room.id) === String(selectedRoomId))) {
    selectElement.value = selectedRoomId;
  }
}

function populateSettingsItemRoomSelect(
  selectedRoomId = settingsItemRoomSelect?.value ?? "",
) {
  populateRoomSelect(settingsItemRoomSelect, selectedRoomId);
}

function populateUnitSelect(selectElement, selectedUnitId = "") {
  if (!selectElement) {
    return false;
  }

  selectElement.innerHTML = "";

  currentUnits.forEach((unit) => {
    const option = document.createElement("option");
    option.value = unit.id;
    option.textContent = unit.symbol;
    option.dataset.increment = unit.defaultIncrement ?? 1;
    selectElement.append(option);
  });

  const hasSelectedUnit = currentUnits.some(
    (unit) => String(unit.id) === String(selectedUnitId),
  );

  if (hasSelectedUnit) {
    selectElement.value = selectedUnitId;
  } else if (currentUnits.length > 0) {
    selectElement.value = currentUnits[0].id;
  }

  return hasSelectedUnit;
}

function populateSettingsItemUnitSelect(
  selectedUnitId = settingsItemUnitSelect?.value ?? "",
) {
  populateUnitSelect(settingsItemUnitSelect, selectedUnitId);
  updateSettingsItemIncrementFromUnit();
}

function selectedUnitIncrement(unitSelect) {
  const selectedOption = unitSelect?.options[unitSelect.selectedIndex];
  const suggestedIncrement = Number(selectedOption?.dataset.increment);

  return Number.isFinite(suggestedIncrement) ? suggestedIncrement : 1;
}

function updateIncrementFromUnit(unitSelect, incrementInput) {
  if (!unitSelect || !incrementInput) {
    return;
  }

  const selectedOption = unitSelect.options[unitSelect.selectedIndex];
  const suggestedIncrement = Number(selectedOption?.dataset.increment);

  if (Number.isFinite(suggestedIncrement)) {
    incrementInput.value = suggestedIncrement;
  }
}

function updateSettingsItemIncrementFromUnit() {
  updateIncrementFromUnit(settingsItemUnitSelect, settingsItemIncrementInput);
}

function prepareSettingsItemAddForm() {
  const previousRoomId = settingsItemRoomSelect?.value ?? "";
  const previousProductTypeId = settingsItemProductTypeSelect?.value ?? "";
  const previousStoreId = settingsItemStoreSelect?.value ?? "";
  const previousUnitId = settingsItemUnitSelect?.value ?? "";
  const previousAmount = settingsItemDefaultAmountInput?.value ?? "1";
  const previousIncrement = settingsItemIncrementInput?.value ?? "1";

  populateSettingsItemRoomSelect(previousRoomId);
  populateProductTypeSelect(
    settingsItemProductTypeSelect,
    previousProductTypeId,
  );
  populateSettingsItemUnitSelect(previousUnitId);
  populateItemStoreSelect(
    settingsItemStoreSelect,
    settingsItemProductTypeSelect?.value,
    previousStoreId,
  );

  if (settingsItemDefaultAmountInput) {
    settingsItemDefaultAmountInput.value = previousAmount || "1";
  }

  if (settingsItemIncrementInput) {
    settingsItemIncrementInput.value = previousIncrement || "1";
  }
}

function resetSettingsItemAddForm() {
  if (settingsItemNameInput) {
    settingsItemNameInput.value = "";
  }

  if (settingsItemSpecificAttributesInput) {
    settingsItemSpecificAttributesInput.value = "";
  }
}

function createStoreCheckboxList(
  container,
  selectedStoreIds = [],
  {
    allowedStoreTypeIds = null,
    emptyMessage = "No stores are available.",
  } = {},
) {
  if (!container) {
    return;
  }

  container.innerHTML = "";
  container.className = "settings-checkbox-list";

  const selectedValues = new Set(selectedStoreIds.map((id) => String(id)));

  const allowedStoreTypeIdSet = Array.isArray(allowedStoreTypeIds)
    ? new Set(allowedStoreTypeIds.map((id) => String(id)))
    : null;

  const availableStores = currentStores.filter(
    (store) =>
      !allowedStoreTypeIdSet ||
      allowedStoreTypeIdSet.has(String(store.storeTypeId)),
  );

  if (availableStores.length === 0) {
    container.innerHTML = `<p>${emptyMessage}</p>`;
    return;
  }

  availableStores.forEach((store) => {
    const { optionLabel } = createSettingsCheckboxOption({
      value: store.id,
      text: store.name,
      checked: selectedValues.has(String(store.id)),
    });

    container.append(optionLabel);
  });
}

function getCheckedValues(container) {
  if (!container) {
    return [];
  }

  return Array.from(
    container.querySelectorAll("input[type='checkbox']:checked"),
  ).map((checkbox) => checkbox.value);
}

function prepareQuickSpecificProductForm(item) {
  quickSpecificProductItemId = item.id;
  setContextualFormHeading(
    specificProductPanelTitle,
    "Add specific product to",
    item.name,
  );
  addSpecificProductForm.reset();

  const productType = currentProductTypes.find(
    (candidate) => candidate.id === item.productTypeId,
  );

  const allowedStoreTypeIds = productType
    ? productTypeStoreTypeIds(productType)
    : [];

  createStoreCheckboxList(specificProductStoresContainer, [], {
    allowedStoreTypeIds,
    emptyMessage: "No stores are available for this item's product type.",
  });
}

function openSpecificProductQuickAdd(item) {
  if (!canEditHousehold()) {
    return;
  }

  if (!specificProductPanel || !addSpecificProductForm) {
    return;
  }

  clearFormPositioningScrollSpace();
  recordAppNavigation();

  if (newItemPanel) {
    newItemPanel.hidden = true;
  }

  prepareQuickSpecificProductForm(item);
  specificProductPanel.hidden = false;
  specificProductPanel.scrollTop = 0;
}

function closeSpecificProductQuickAdd() {
  quickSpecificProductItemId = null;
  addSpecificProductForm?.reset();

  if (specificProductStoresContainer) {
    specificProductStoresContainer.innerHTML = "";
  }

  if (specificProductPanel) {
    specificProductPanel.hidden = true;
  }
}

function appendProductTypeOptionsForStoreType({
  selectElement,
  storeType,
  selectedProductTypeId,
  selectedState,
}) {
  const productTypesForStoreType = currentProductTypes
    .filter((productType) =>
      productTypeBelongsToStoreType(productType, storeType.id),
    )
    .sort(sortProductTypesForStoreType(storeType.id));

  if (productTypesForStoreType.length === 0) {
    return;
  }

  const group = document.createElement("optgroup");
  group.label = storeType.name;

  productTypesForStoreType.forEach((productType) => {
    const option = document.createElement("option");
    option.value = productType.id;
    option.textContent = productType.name;

    if (
      String(productType.id) === String(selectedProductTypeId) &&
      !selectedState.hasSelected
    ) {
      option.selected = true;
      selectedState.hasSelected = true;
    }

    group.append(option);
  });

  selectElement.append(group);
}

function populateProductTypeSelect(selectElement, selectedProductTypeId = "") {
  selectElement.innerHTML = '<option value="">Choose a product type</option>';

  const selectedState = {
    hasSelected: false,
  };

  currentStoreTypes.forEach((storeType) => {
    appendProductTypeOptionsForStoreType({
      selectElement,
      storeType,
      selectedProductTypeId,
      selectedState,
    });
  });

  const unassignedProductTypes = currentProductTypes
    .filter((productType) => productTypeStoreTypeIds(productType).length === 0)
    .sort(sortBySavedOrderThenName);

  if (unassignedProductTypes.length > 0) {
    const group = document.createElement("optgroup");
    group.label = "Store type not set";

    unassignedProductTypes.forEach((productType) => {
      const option = document.createElement("option");
      option.value = productType.id;
      option.textContent = productType.name;

      if (
        String(productType.id) === String(selectedProductTypeId) &&
        !selectedState.hasSelected
      ) {
        option.selected = true;
        selectedState.hasSelected = true;
      }

      group.append(option);
    });

    selectElement.append(group);
  }
}

function populateProductTypeDropdown() {
  Object.values(itemFormContexts).forEach(({ fields }) => {
    const { productTypeSelect, storeSelect } = fields;

    if (!productTypeSelect) {
      return;
    }

    populateProductTypeSelect(productTypeSelect, productTypeSelect.value);
    populateItemStoreSelect(
      storeSelect,
      productTypeSelect.value,
      storeSelect?.value,
    );
  });
}

function selectedItemUnitIncrement() {
  return selectedUnitIncrement(itemUnitSelect);
}

function applyDefaultItemUnit() {
  if (currentUnits.length === 0) {
    itemUnitSelect.innerHTML = "";
    return;
  }

  itemUnitSelect.value = currentUnits[0].id;
  itemIncrementInput.value = selectedItemUnitIncrement();
}

function populateUnitDropdown(selectedUnitId = itemUnitSelect.value) {
  const hasSelectedUnit = populateUnitSelect(itemUnitSelect, selectedUnitId);

  if (!hasSelectedUnit && currentUnits.length > 0) {
    updateIncrementFromUnit(itemUnitSelect, itemIncrementInput);
  }

  populateSettingsItemUnitSelect();
}

function resetNewItemForm() {
  addItemForm.reset();
  itemDefaultAmountInput.value = 1;
  applyDefaultItemUnit();
}

function readItemFormValues({
  nameInput,
  roomSelect,
  productTypeSelect,
  storeSelect,
  attributesInput,
  amountInput,
  unitSelect,
  incrementInput,
  locationId = roomSelect?.value ?? "",
}) {
  return {
    name: nameInput?.value.trim() ?? "",
    locationId,
    productTypeId: productTypeSelect?.value ?? "",
    storeId: storeSelect?.value ?? "",
    specificAttributes: attributesInput?.value.trim() ?? "",
    defaultAmount: Number(amountInput?.value),
    unitId: unitSelect?.value ?? "",
    increment: Number(incrementInput?.value),
  };
}

function validateItemFormValues(values, { rejectRegularRoom = false } = {}) {
  if (
    !values.locationId ||
    (rejectRegularRoom && isRegularRoomSelected()) ||
    !values.name ||
    !values.productTypeId ||
    !values.unitId ||
    !Number.isFinite(values.defaultAmount) ||
    !Number.isFinite(values.increment)
  ) {
    return "Please complete all required fields.";
  }

  const selectedProductType = currentProductTypes.find(
    (productType) => productType.id === values.productTypeId,
  );

  if (
    !selectedProductType ||
    productTypeStoreTypeIds(selectedProductType).length === 0
  ) {
    return "Please choose a product type that has at least one store type set.";
  }

  if (!itemStoreIsAllowed(values.productTypeId, values.storeId)) {
    return "Please choose a store that matches the selected product type.";
  }

  return "";
}

function itemDocumentData(values) {
  return {
    name: values.name,
    active: true,
    locationId: values.locationId,
    productTypeId: values.productTypeId,
    storeId: values.storeId || null,
    specificAttributes: values.specificAttributes,
    defaultAmount: values.defaultAmount,
    unitId: values.unitId,
    increment: values.increment,
    addCount: 0,
    lastAddedAt: null,
    lastAdjustedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

async function createCatalogueItem(values) {
  await addDoc(householdCollection("items"), itemDocumentData(values));
}

function orderedProductTypesForDefaultRoomView() {
  const orderedProductTypes = [];
  const seenProductTypeIds = new Set();

  currentStoreTypes.forEach((storeType) => {
    getProductTypesForStoreType(storeType.id)
      .sort(sortProductTypesForStoreType(storeType.id))
      .forEach((productType) => {
        if (seenProductTypeIds.has(productType.id)) {
          return;
        }

        seenProductTypeIds.add(productType.id);
        orderedProductTypes.push(productType);
      });
  });

  currentProductTypes
    .filter((productType) => !seenProductTypeIds.has(productType.id))
    .sort(sortBySavedOrderThenName)
    .forEach((productType) => {
      seenProductTypeIds.add(productType.id);
      orderedProductTypes.push(productType);
    });

  return orderedProductTypes;
}

/* ===== Needed-entry model and lookup helpers ===== */

function specificProductsForItem(itemId) {
  return currentSpecificProducts
    .filter(
      (product) =>
        product.active !== false && String(product.itemId) === String(itemId),
    )
    .sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")));
}

function specificProductDetailText(product) {
  return [
    product.specificAttributes ?? product.size,
    recordedStoreNames(product.storeIds),
  ]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(" · ");
}

function specificProductForNeededEntry(neededEntry) {
  if (!neededEntry?.specificProductId) {
    return null;
  }

  return (
    currentSpecificProducts.find(
      (product) => String(product.id) === String(neededEntry.specificProductId),
    ) ?? null
  );
}

function allNeededEntries() {
  return Array.from(currentNeededEntries.values());
}

function genericNeededEntryForItem(itemId) {
  return (
    allNeededEntries().find(
      (entry) =>
        String(entry.itemId ?? entry.id) === String(itemId) &&
        !entry.specificProductId,
    ) ?? null
  );
}

function specificNeededEntryForProduct(productId) {
  return (
    allNeededEntries().find(
      (entry) =>
        entry.specificProductId &&
        String(entry.specificProductId) === String(productId),
    ) ?? null
  );
}

function neededEntriesForItem(itemId) {
  return allNeededEntries().filter(
    (entry) => String(entry.itemId ?? entry.id) === String(itemId),
  );
}

function itemHasAnyNeededEntry(itemId) {
  return neededEntriesForItem(itemId).length > 0;
}

function specificNeededEntryDocumentId(productId) {
  return `specific-${productId}`;
}

function neededEntryDocumentIdFor(
  item,
  specificProduct = null,
  neededEntry = null,
) {
  if (specificProduct?.id) {
    const canonicalId = specificNeededEntryDocumentId(specificProduct.id);

    if (currentNeededEntries.has(canonicalId)) {
      return canonicalId;
    }
  }

  if (neededEntry?.id) {
    return neededEntry.id;
  }

  return item?.id ?? null;
}

function itemForNeededEntry(entry) {
  if (entry?.oneOff === true) {
    return {
      id: `one-off-${entry.id}`,
      name: entry.itemName ?? "One-off item",
      specificAttributes: entry.specificAttributes ?? "",
      storeTypeIds: Array.isArray(entry.storeTypeIds) ? entry.storeTypeIds : [],
      storeIds: Array.isArray(entry.storeIds) ? entry.storeIds : [],
      locationId: entry.roomId ?? null,
      defaultAmount: 1,
      increment: 1,
      unitId: null,
      active: true,
      oneOff: true,
    };
  }

  return (
    currentItems.find(
      (item) => String(item.id) === String(entry.itemId ?? entry.id),
    ) ?? null
  );
}

function neededRecordForEntry(entry) {
  const item = itemForNeededEntry(entry);

  if (!item || item.active === false) {
    return null;
  }

  return {
    item,
    entry,
    specificProduct: specificProductForNeededEntry(entry),
  };
}

function currentNeededRecords() {
  return allNeededEntries().map(neededRecordForEntry).filter(Boolean);
}

function neededRecordMatchesSearch(record, searchText) {
  if (!searchText) {
    return true;
  }

  const productType = currentProductTypes.find(
    (candidate) => String(candidate.id) === String(record.item.productTypeId),
  );

  return [
    record.item.name,
    record.item.specificAttributes,
    productType?.name,
    record.specificProduct?.name,
    specificProductDetailText(record.specificProduct ?? {}),
    record.entry.temporaryNote,
    storeTypeIdsForItem(record.item)
      .map((id) => getStoreTypeName(id))
      .join(" "),
    recordedStoreNames(record.item.storeIds),
  ]
    .map((value) => String(value ?? "").toLowerCase())
    .some((value) => value.includes(searchText));
}

function compareNeededRecords(a, b) {
  const itemNameDifference = String(a.item.name ?? "").localeCompare(
    String(b.item.name ?? ""),
  );

  if (itemNameDifference !== 0) {
    return itemNameDifference;
  }

  if (!a.specificProduct && b.specificProduct) {
    return -1;
  }

  if (a.specificProduct && !b.specificProduct) {
    return 1;
  }

  return String(a.specificProduct?.name ?? "").localeCompare(
    String(b.specificProduct?.name ?? ""),
  );
}

function specificProductIsAvailableAtStore(specificProduct, storeId) {
  if (!specificProduct || !storeId) {
    return true;
  }

  const storeIds = Array.isArray(specificProduct.storeIds)
    ? specificProduct.storeIds
    : [];

  return (
    storeIds.length === 0 ||
    storeIds.some((candidateId) => String(candidateId) === String(storeId))
  );
}

function neededRecordBelongsToStoreType(record, storeTypeId) {
  if (!record || !storeTypeId) {
    return false;
  }

  if (record.item.oneOff) {
    return itemBelongsToStoreType(record.item, storeTypeId);
  }

  if (!itemBelongsToStoreType(record.item, storeTypeId)) {
    return false;
  }

  const specificStoreIds = Array.isArray(record.specificProduct?.storeIds)
    ? record.specificProduct.storeIds
    : [];

  if (specificStoreIds.length === 0) {
    return true;
  }

  return specificStoreIds.some((storeId) => {
    const store = currentStores.find(
      (candidate) => String(candidate.id) === String(storeId),
    );

    return String(store?.storeTypeId ?? "") === String(storeTypeId);
  });
}

function neededRecordIsAvailableAtStore(record, storeId) {
  if (!storeId) {
    return true;
  }

  const selectedStore = currentStores.find(
    (store) => String(store.id) === String(storeId),
  );

  const itemStoreIds = Array.isArray(record.item.storeIds)
    ? record.item.storeIds
    : [];

  if (record.item.oneOff) {
    const explicitStoreTypeIds = Array.isArray(record.item.storeTypeIds)
      ? record.item.storeTypeIds
      : [];

    return (
      itemStoreIds.some(
        (candidateId) => String(candidateId) === String(storeId),
      ) ||
      explicitStoreTypeIds.some(
        (candidateId) =>
          String(candidateId) === String(selectedStore?.storeTypeId),
      )
    );
  }

  const specificStoreIds = Array.isArray(record.specificProduct?.storeIds)
    ? record.specificProduct.storeIds
    : [];

  /*
   * An explicit Specific Product store assignment is more specific than the
   * store's excluded Product type list. It remains available at its assigned
   * stores even when its parent Product type has been removed from the store.
   */
  if (specificStoreIds.length > 0) {
    return specificStoreIds.some(
      (candidateId) => String(candidateId) === String(storeId),
    );
  }

  /* The same exception applies to an Item assigned directly to this store. */
  if (record.item.storeId && String(record.item.storeId) === String(storeId)) {
    return true;
  }

  if (
    selectedStore &&
    record.item.productTypeId &&
    storeExcludesProductType(selectedStore, record.item.productTypeId)
  ) {
    return false;
  }

  return !record.item.storeId;
}

async function migrateLegacySpecificEntryBeforeGenericAdd(item) {
  const legacyEntry = currentNeededEntries.get(item.id);

  if (!legacyEntry?.specificProductId) {
    return;
  }

  const { id, ...entryData } = legacyEntry;
  const replacementId = specificNeededEntryDocumentId(
    legacyEntry.specificProductId,
  );

  const batch = writeBatch(db);

  batch.set(
    householdDocument("neededEntries", replacementId),
    {
      ...entryData,
      itemId: item.id,
      adjustedAt: serverTimestamp(),
    },
    { merge: true },
  );

  batch.delete(householdDocument("neededEntries", item.id));
  await batch.commit();
}

function combinedItemSpecificProductName(item, specificProduct) {
  if (!specificProduct) {
    return item?.name ?? "";
  }

  return `${item?.name ?? ""} - ${specificProduct.name ?? ""}`.trim();
}

function createItemNameDisplay(
  item,
  specificProduct = null,
  { includeParentName = false, temporaryNote = "" } = {},
) {
  const wrapper = document.createElement("span");
  wrapper.className = "item-name-display";

  if (specificProduct) {
    wrapper.classList.add("is-specific-product");
  }

  const name = document.createElement("span");
  name.className = "item-name";

  if (specificProduct && includeParentName) {
    name.classList.add("item-name-with-specific-product");

    const parentName = document.createElement("span");
    parentName.className = "parent-item-name";
    parentName.textContent = item.name;

    const specificName = document.createElement("span");
    specificName.className = "specific-product-name-suffix";
    specificName.textContent = specificProduct.name;

    name.append(parentName, document.createTextNode(" - "), specificName);
  } else {
    name.textContent = specificProduct ? specificProduct.name : item.name;
  }

  wrapper.append(name);

  const extra = specificProduct
    ? specificProductDetailText(specificProduct)
    : String(item.specificAttributes ?? "").trim();

  if (extra) {
    const detail = document.createElement("span");
    detail.className = "item-specific-product-detail";
    detail.textContent = extra;
    wrapper.append(detail);
  }

  const noteText = String(temporaryNote ?? "").trim();

  if (noteText) {
    const note = document.createElement("span");
    note.className = "item-temporary-note";
    note.textContent = noteText;
    wrapper.append(note);
  }

  return wrapper;
}

function temporaryNoteItemLabel(item, specificProduct = null) {
  return combinedItemSpecificProductName(item, specificProduct);
}

function closeTemporaryNotePanel() {
  temporaryNoteEntryId = null;

  if (temporaryNotePanel) {
    temporaryNotePanel.hidden = true;
  }
}

function openTemporaryNotePanel(item, neededEntry, specificProduct = null) {
  if (!canEditHousehold()) {
    return;
  }

  if (!temporaryNotePanel || !neededEntry) {
    return;
  }

  const entryId = neededEntryDocumentIdFor(item, specificProduct, neededEntry);

  if (!entryId) {
    return;
  }

  recordAppNavigation();
  closeSpecificProductQuickAdd();

  temporaryNoteEntryId = entryId;
  temporaryNoteItemName.textContent = temporaryNoteItemLabel(
    item,
    specificProduct,
  );
  temporaryNoteText.value = neededEntry.temporaryNote ?? "";
  temporaryNotePanel.hidden = false;
  temporaryNotePanel.scrollTop = 0;

  requestAnimationFrame(() => {
    temporaryNoteText.focus({ preventScroll: true });
    temporaryNoteText.setSelectionRange(
      temporaryNoteText.value.length,
      temporaryNoteText.value.length,
    );
  });
}

async function saveTemporaryNote() {
  if (!temporaryNoteEntryId) {
    return;
  }

  const entryRef = householdDocument("neededEntries", temporaryNoteEntryId);
  const note = temporaryNoteText.value.trim();

  await updateDoc(entryRef, {
    temporaryNote: note || deleteField(),
    adjustedAt: serverTimestamp(),
  });
}

function oneOffNeededRecordsForRoom() {
  return currentNeededRecords()
    .filter((record) => record.item.oneOff)
    .filter((record) => {
      if (isOneOffRoomSelected() || isAllStuffSelected()) {
        return true;
      }

      if (isRegularRoomSelected()) {
        return false;
      }

      return String(record.item.locationId ?? "") === String(selectedRoomId);
    });
}

function appendOneOffNeededRow(record, targetList = roomItemsList) {
  const { item, entry } = record;
  const row = document.createElement("div");
  row.className = "item-row room-item-row is-needed one-off-needed-row";

  const details = document.createElement("div");
  details.className = "item-row-details";
  details.append(
    createItemNameDisplay(item, null, {
      temporaryNote: entry.temporaryNote,
    }),
  );

  const amountDisplay = document.createElement("strong");
  amountDisplay.className = "room-current-quantity";
  setNeededAmountDisplay(amountDisplay, entry);
  details.append(amountDisplay);

  const controls = document.createElement("div");
  controls.className = "room-item-controls";

  const increaseButton = createIconButton({
    className: "room-icon-button increase-needed-button",
    icon: "+",
    label: `Increase ${item.name}`,
    onClick: async () => {
      await changeNeededAmount(item, entry, 1);
    },
  });

  const decreaseButton = createIconButton({
    className: "room-icon-button decrease-needed-button",
    icon: "−",
    label: `Decrease ${item.name}`,
    onClick: async () => {
      await changeNeededAmount(item, entry, -1);
    },
  });

  controls.append(increaseButton, decreaseButton);
  row.append(details, controls);

  addDoubleTapHandler(row, () => {
    openTemporaryNotePanel(item, entry);
  });

  targetList.append(row);
}

/* ===== Needing view rendering ===== */

function renderRoomItems() {
  roomItemsList.innerHTML = "";

  if (!selectedRoomId) {
    return;
  }

  const roomSearchText = roomItemsSearch?.value.trim().toLowerCase() ?? "";
  const allOneOffRecords = oneOffNeededRecordsForRoom();
  const oneOffRecords = allOneOffRecords.filter((record) =>
    neededRecordMatchesSearch(record, roomSearchText),
  );

  if (isOneOffRoomSelected()) {
    if (allOneOffRecords.length === 0) {
      roomItemsList.innerHTML = "<p>No one-off items are currently needed.</p>";
      return;
    }

    if (oneOffRecords.length === 0) {
      roomItemsList.innerHTML = "<p>No matching one-off items.</p>";
      return;
    }

    oneOffRecords
      .sort(compareNeededRecords)
      .forEach((record) => appendOneOffNeededRow(record));
    return;
  }

  const allRoomItems = currentItems.filter((item) => {
    if (item.active === false) {
      return false;
    }

    if (isRegularRoomSelected()) {
      return itemIsRegular(item);
    }

    if (isAllStuffSelected()) {
      return true;
    }

    return item.locationId === selectedRoomId;
  });

  const roomItems = allRoomItems.filter((item) => {
    if (!roomSearchText) {
      return true;
    }

    const productType = currentProductTypes.find(
      (candidate) => String(candidate.id) === String(item.productTypeId),
    );

    const specificProductText = specificProductsForItem(item.id)
      .flatMap((product) => [product.name, specificProductDetailText(product)])
      .join(" ");

    return `${item.name} ${item.specificAttributes ?? ""} ${productType?.name ?? ""} ${specificProductText}`
      .toLowerCase()
      .includes(roomSearchText);
  });

  if (allRoomItems.length === 0 && allOneOffRecords.length === 0) {
    roomItemsList.innerHTML = isAllStuffSelected()
      ? "<p>No items have been created yet.</p>"
      : "<p>No items have been created for this room yet.</p>";
    return;
  }

  if (roomItems.length === 0 && oneOffRecords.length === 0) {
    roomItemsList.innerHTML = "<p>No matching room items.</p>";
    return;
  }

  oneOffRecords
    .sort(compareNeededRecords)
    .forEach((record) => appendOneOffNeededRow(record));

  const renderedItemIds = new Set();

  function sortItemsByNeedThenName(a, b) {
    const needDifference =
      Number(!itemHasAnyNeededEntry(a.id)) -
      Number(!itemHasAnyNeededEntry(b.id));

    if (needDifference !== 0) {
      return needDifference;
    }

    return String(a.name ?? "").localeCompare(String(b.name ?? ""));
  }

  function createQuantityControls(
    item,
    neededEntry,
    labelName,
    specificProduct = null,
  ) {
    const controls = document.createElement("div");
    controls.className = "room-item-controls";

    const amountDisplay = document.createElement("strong");
    amountDisplay.className = "room-current-quantity";
    setNeededAmountDisplay(amountDisplay, neededEntry);

    const increaseButton = createIconButton({
      className: "room-icon-button increase-needed-button",
      icon: "+",
      label: `Increase ${labelName}`,
      onClick: async () => {
        await changeNeededAmount(
          item,
          neededEntry,
          item.increment ?? 1,
          specificProduct,
        );
      },
    });

    const decreaseButton = createIconButton({
      className: "room-icon-button decrease-needed-button",
      icon: "−",
      label: `Decrease ${labelName}`,
      onClick: async () => {
        await changeNeededAmount(
          item,
          neededEntry,
          -(item.increment ?? 1),
          specificProduct,
        );
      },
    });

    return {
      amountDisplay,
      controls,
      buttons: [increaseButton, decreaseButton],
    };
  }

  function appendSpecificProductRows(item) {
    specificProductsForItem(item.id).forEach((product) => {
      const neededEntry = specificNeededEntryForProduct(product.id);
      const isNeeded = Boolean(neededEntry);

      const row = document.createElement("div");
      row.className = "item-row room-item-row specific-product-offer-row";
      row.classList.add(isNeeded ? "is-needed" : "is-available");

      const details = document.createElement("div");
      details.className = "item-row-details";
      details.append(
        createItemNameDisplay(item, product, {
          temporaryNote: neededEntry?.temporaryNote,
        }),
      );

      const controls = document.createElement("div");
      controls.className = "room-item-controls";

      if (!isNeeded) {
        const addButton = createIconButton({
          className: "room-icon-button room-add-button add-needed-button",
          icon: "Add",
          label: `Add ${item.name} ${product.name} to needed list`,
          onClick: async () => {
            await addSpecificProductToNeededList(item, product);
          },
        });

        controls.append(addButton);
      } else {
        const quantity = createQuantityControls(
          item,
          neededEntry,
          `${item.name} ${product.name}`,
          product,
        );

        details.append(quantity.amountDisplay);
        controls.append(...quantity.buttons);
      }

      row.append(details, controls);

      addScrollableHoldHandler(row, () => {
        openSpecificProductQuickAdd(item);
      });

      if (isNeeded) {
        addDoubleTapHandler(row, () => {
          openTemporaryNotePanel(item, neededEntry, product);
        });
      }

      roomItemsList.append(row);
    });
  }

  function appendRoomItemRow(item) {
    const neededEntry = genericNeededEntryForItem(item.id);
    const isNeeded = Boolean(neededEntry);

    const row = document.createElement("div");
    row.className = "item-row room-item-row";
    row.classList.add(isNeeded ? "is-needed" : "is-available");

    const details = document.createElement("div");
    details.className = "item-row-details";
    details.append(
      createItemNameDisplay(item, null, {
        temporaryNote: neededEntry?.temporaryNote,
      }),
    );

    const controls = document.createElement("div");
    controls.className = "room-item-controls";

    if (!isNeeded) {
      const addButton = createIconButton({
        className: "room-icon-button room-add-button add-needed-button",
        icon: "Add",
        label: `Add ${item.name} to needed list`,
        onClick: async () => {
          await addItemToNeededList(item);
        },
      });

      controls.append(addButton);
    } else {
      const quantity = createQuantityControls(item, neededEntry, item.name);

      details.append(quantity.amountDisplay);
      controls.append(...quantity.buttons);
    }

    row.append(details, controls);

    addScrollableHoldHandler(row, () => {
      openSpecificProductQuickAdd(item);
    });

    if (isNeeded) {
      addDoubleTapHandler(row, () => {
        openTemporaryNotePanel(item, neededEntry);
      });
    }

    roomItemsList.append(row);
    appendSpecificProductRows(item);
    renderedItemIds.add(item.id);
  }

  function appendProductTypeBlock(productType) {
    roomItems
      .filter((item) => String(item.productTypeId) === String(productType.id))
      .sort(sortItemsByNeedThenName)
      .forEach(appendRoomItemRow);
  }

  orderedProductTypesForDefaultRoomView().forEach(appendProductTypeBlock);

  roomItems
    .filter((item) => !renderedItemIds.has(item.id))
    .sort(sortItemsByNeedThenName)
    .forEach(appendRoomItemRow);
}

function appendFullNeededStoreHeading(label) {
  const heading = document.createElement("div");
  heading.className = "full-needed-store-heading";
  heading.textContent = label;
  fullNeededItems.append(heading);
}

function appendFullNeededProductHeading(label) {
  const heading = document.createElement("div");
  heading.className = "full-needed-product-heading";
  heading.textContent = label;
  fullNeededItems.append(heading);
}

function productTypeForItem(item) {
  return currentProductTypes.find(
    (productType) => String(productType.id) === String(item.productTypeId),
  );
}

function appendFullNeededItemRow(record) {
  const { item, entry, specificProduct } = record;

  const row = document.createElement("div");
  row.className = "item-row full-needed-item-row is-needed";

  if (specificProduct) {
    row.classList.add("specific-product-needed-row");
  }

  const details = document.createElement("div");
  details.className = "item-row-details";
  details.append(
    createItemNameDisplay(item, specificProduct, {
      includeParentName: Boolean(specificProduct),
      temporaryNote: entry.temporaryNote,
    }),
  );

  const amountDisplay = document.createElement("strong");
  amountDisplay.className = "room-current-quantity";
  setNeededAmountDisplay(amountDisplay, entry);
  details.append(amountDisplay);

  const controls = document.createElement("div");
  controls.className = "room-item-controls full-needed-controls";

  const increaseButton = createIconButton({
    className: "room-icon-button increase-needed-button",
    icon: "+",
    label: `Increase ${item.name}`,
    onClick: async () => {
      await changeNeededAmount(
        item,
        entry,
        item.increment ?? 1,
        specificProduct,
      );
    },
  });

  const decreaseButton = createIconButton({
    className: "room-icon-button decrease-needed-button",
    icon: "−",
    label: `Decrease ${item.name}`,
    onClick: async () => {
      await changeNeededAmount(
        item,
        entry,
        -(item.increment ?? 1),
        specificProduct,
      );
    },
  });

  controls.append(increaseButton, decreaseButton);
  row.append(details, controls);

  if (!item.oneOff) {
    addScrollableHoldHandler(row, () => {
      openSpecificProductQuickAdd(item);
    });
  }

  addDoubleTapHandler(row, () => {
    openTemporaryNotePanel(item, entry, specificProduct);
  });
  fullNeededItems.append(row);
}

function appendFullNeededProductGroup(productType, records) {
  const groupedRecords = records
    .filter(
      (record) => String(record.item.productTypeId) === String(productType.id),
    )
    .sort(compareNeededRecords);

  if (groupedRecords.length === 0) {
    return false;
  }

  groupedRecords.forEach(appendFullNeededItemRow);
  return true;
}

function renderFullNeededList() {
  fullNeededItems.innerHTML = "";

  const searchText = neededListSearch.value.trim().toLowerCase();

  const neededRecords = currentNeededRecords().filter((record) =>
    neededRecordMatchesSearch(record, searchText),
  );

  if (neededRecords.length === 0) {
    fullNeededItems.innerHTML = "<p>No matching needed items.</p>";
    return;
  }

  let renderedAny = false;

  currentStoreTypes.forEach((storeType) => {
    const storeTypeRecords = neededRecords.filter((record) =>
      itemBelongsToStoreType(record.item, storeType.id),
    );

    if (storeTypeRecords.length === 0) {
      return;
    }

    appendFullNeededStoreHeading(storeType.name);

    currentProductTypes
      .filter((productType) =>
        productTypeBelongsToStoreType(productType, storeType.id),
      )
      .sort(sortProductTypesForStoreType(storeType.id))
      .forEach((productType) => {
        if (appendFullNeededProductGroup(productType, storeTypeRecords)) {
          renderedAny = true;
        }
      });

    storeTypeRecords
      .filter((record) => record.item.oneOff)
      .sort(compareNeededRecords)
      .forEach((record) => {
        appendFullNeededItemRow(record);
        renderedAny = true;
      });
  });

  const unassignedRecords = neededRecords
    .filter((record) => storeTypeIdsForItem(record.item).length === 0)
    .sort(compareNeededRecords);

  if (unassignedRecords.length > 0) {
    appendFullNeededStoreHeading("Store type not set");
    unassignedRecords.forEach(appendFullNeededItemRow);
    renderedAny = true;
  }

  if (!renderedAny) {
    fullNeededItems.innerHTML = "<p>No matching needed items.</p>";
  }
}

/* ===== Getting view rendering ===== */

function renderShoppingLocations() {
  shoppingLocationOptions.innerHTML = "";

  const validStoreTypes = currentStoreTypes.filter(
    (storeType) =>
      typeof storeType.name === "string" && storeType.name.trim() !== "",
  );

  if (validStoreTypes.length === 0) {
    return;
  }

  validStoreTypes.forEach((storeType) => {
    const group = document.createElement("div");
    group.className = "shopping-location-group";

    const storeTypeButton = document.createElement("button");
    storeTypeButton.type = "button";
    storeTypeButton.className = "shopping-location-option";
    storeTypeButton.textContent = storeType.name.trim();

    storeTypeButton.addEventListener("click", () => {
      recordAppNavigation();
      selectedShoppingTarget = {
        kind: "storeType",
        id: storeType.id,
        name: storeType.name.trim(),
      };

      setContextButtonLabel(
        shoppingAtButton,
        `Shopping at a ${storeType.name.trim()}`,
      );
      setShoppingLocationPanelOpen(false);
      renderGettingItems();
    });

    group.append(storeTypeButton);

    const storesForType = currentStores
      .filter(
        (store) =>
          store.storeTypeId === storeType.id &&
          typeof store.name === "string" &&
          store.name.trim() !== "",
      )
      .sort(sortBySavedOrderThenName);

    storesForType.forEach((store) => {
      const storeButton = document.createElement("button");
      storeButton.type = "button";
      storeButton.className = "shopping-location-option";
      storeButton.textContent = store.name.trim();

      storeButton.addEventListener("click", () => {
        recordAppNavigation();
        selectedShoppingTarget = {
          kind: "store",
          id: store.id,
          storeTypeId: store.storeTypeId,
          name: store.name.trim(),
        };

        setContextButtonLabel(
          shoppingAtButton,
          `Shopping at ${store.name.trim()}`,
        );
        setShoppingLocationPanelOpen(false);
        renderGettingItems();
      });

      group.append(storeButton);
    });

    shoppingLocationOptions.append(group);
  });
}

function renderGettingItems() {
  gettingItemsList.innerHTML = "";
  gettingItemsList.hidden = !shoppingAtPanel.hidden;
  finishShopButton.hidden = true;

  if (!selectedShoppingTarget) {
    updateBottomContextAction();
    return;
  }

  const selectedStore =
    selectedShoppingTarget.kind === "store"
      ? currentStores.find((store) => store.id === selectedShoppingTarget.id)
      : null;

  const selectedStoreTypeId =
    selectedShoppingTarget.kind === "store"
      ? selectedShoppingTarget.storeTypeId
      : selectedShoppingTarget.id;

  if (!selectedStoreTypeId) {
    gettingItemsList.innerHTML = "<p>Choose where you are shopping.</p>";
    updateBottomContextAction();
    return;
  }

  const matchingRecords = currentNeededRecords().filter((record) => {
    if (!neededRecordBelongsToStoreType(record, selectedStoreTypeId)) {
      return false;
    }

    if (
      selectedStore &&
      !neededRecordIsAvailableAtStore(record, selectedStore.id)
    ) {
      return false;
    }

    return true;
  });

  if (matchingRecords.length === 0) {
    gettingItemsList.innerHTML = "<p>No needed items for this shop.</p>";
    updateBottomContextAction();
    return;
  }

  const collectedRecords = matchingRecords.filter(
    (record) => record.entry.status === "collected",
  );

  finishShopButton.hidden =
    !shoppingAtPanel.hidden || collectedRecords.length === 0;
  updateBottomContextAction();

  const renderedEntryIds = new Set();

  function appendGettingRecord(record) {
    const { item, entry, specificProduct } = record;
    const isCollected = entry.status === "collected";

    const row = document.createElement("div");
    row.className = "item-row getting-item-row";

    if (specificProduct) {
      row.classList.add("specific-product-needed-row");
    }

    if (isCollected) {
      row.classList.add("is-collected");
    }

    const details = document.createElement("div");
    details.className = "item-row-details";
    details.append(
      createItemNameDisplay(item, specificProduct, {
        includeParentName: true,
        temporaryNote: entry.temporaryNote,
      }),
    );

    const amount = document.createElement("span");
    amount.className = "item-amount";
    setNeededAmountDisplay(amount, entry);
    details.append(amount);

    const collectButton = document.createElement("button");
    collectButton.type = "button";
    collectButton.className = "collect-checkbox-button";
    collectButton.setAttribute("aria-pressed", String(isCollected));
    collectButton.setAttribute(
      "aria-label",
      isCollected
        ? `Mark ${item.name} as not collected`
        : `Mark ${item.name} as collected`,
    );

    const checkboxGraphic = document.createElement("span");
    checkboxGraphic.className = "collect-checkbox-graphic";
    checkboxGraphic.textContent = isCollected ? "✓" : "";
    collectButton.append(checkboxGraphic);

    addLongPressHandler(collectButton, async () => {
      collectButton.disabled = true;
      await setNeededItemCollected(item, entry, !isCollected);
    });

    row.append(details, collectButton);
    gettingItemsList.append(row);
    renderedEntryIds.add(entry.id);
  }

  const orderedProductTypes = getOrderedProductTypesForShoppingTarget(
    selectedStoreTypeId,
    selectedStore,
  );

  orderedProductTypes.forEach((productType) => {
    matchingRecords
      .filter(
        (record) =>
          String(record.item.productTypeId) === String(productType.id),
      )
      .sort(compareNeededRecords)
      .forEach(appendGettingRecord);
  });

  matchingRecords
    .filter((record) => !renderedEntryIds.has(record.entry.id))
    .sort(compareNeededRecords)
    .forEach(appendGettingRecord);
}

/* ===== Realtime data listeners ===== */

const viewRefreshers = {
  rooms: () => renderRooms(currentRooms),
  units: () => renderUnits(currentUnits),
  storeTypes: () => renderStoreTypes(currentStoreTypes),
  stores: () => renderStores(currentStores),
  productTypes: () => renderProductTypes(currentProductTypes),
  roomItems: renderRoomItems,
  fullNeededList: renderFullNeededList,
  settingsItems: renderSettingsItems,
  gettingItems: renderGettingItems,
};

function refreshViews(...viewNames) {
  new Set(viewNames).forEach((viewName) => {
    viewRefreshers[viewName]?.();
  });
}

function snapshotRecords(snapshot) {
  return snapshot.docs.map((documentSnapshot) => ({
    id: documentSnapshot.id,
    ...documentSnapshot.data(),
  }));
}

function activeSortedRecords(snapshot, predicate = () => true) {
  return snapshotRecords(snapshot)
    .filter((record) => record.active !== false && predicate(record))
    .sort(sortBySavedOrderThenName);
}

const listenerDefinitions = [
  {
    key: "rooms",
    collectionName: "locations",
    errorLabel: "Could not load rooms",
    applySnapshot(snapshot) {
      currentRooms = activeSortedRecords(
        snapshot,
        (room) => room.level === "room",
      );
      refreshViews("rooms");
    },
  },
  {
    key: "units",
    collectionName: "units",
    errorLabel: "Could not load units",
    applySnapshot(snapshot) {
      currentUnits = activeSortedRecords(snapshot);
      refreshViews(
        "units",
        "roomItems",
        "fullNeededList",
        "settingsItems",
        "gettingItems",
      );
    },
  },
  {
    key: "storeTypes",
    collectionName: "storeTypes",
    errorLabel: "Could not load store types",
    applySnapshot(snapshot) {
      currentStoreTypes = activeSortedRecords(snapshot);
      refreshViews("storeTypes");
    },
  },
  {
    key: "stores",
    collectionName: "stores",
    errorLabel: "Could not load stores",
    applySnapshot(snapshot) {
      currentStores = activeSortedRecords(snapshot);
      refreshViews("stores", "settingsItems");
    },
  },
  {
    key: "productTypes",
    collectionName: "productTypes",
    errorLabel: "Could not load product types",
    applySnapshot(snapshot) {
      currentProductTypes = activeSortedRecords(snapshot);
      refreshViews("productTypes");
    },
  },
  {
    key: "items",
    collectionName: "items",
    errorLabel: "Could not load items",
    applySnapshot(snapshot) {
      currentItems = snapshotRecords(snapshot);
      refreshViews(
        "roomItems",
        "fullNeededList",
        "settingsItems",
        "gettingItems",
      );
    },
  },
  {
    key: "specificProducts",
    collectionName: "specificProducts",
    errorLabel: "Could not load specific products",
    applySnapshot(snapshot) {
      currentSpecificProducts = snapshotRecords(snapshot)
        .filter((product) => product.active !== false)
        .sort((a, b) =>
          String(a.name ?? "").localeCompare(String(b.name ?? "")),
        );
      refreshViews(
        "roomItems",
        "fullNeededList",
        "settingsItems",
        "gettingItems",
      );
    },
  },
  {
    key: "neededEntries",
    collectionName: "neededEntries",
    errorLabel: "Could not load needed items",
    applySnapshot(snapshot) {
      const snapshotEntries = new Map(
        snapshotRecords(snapshot).map((entry) => [entry.id, entry]),
      );

      optimisticNeededAmounts.forEach((optimisticAmount, entryId) => {
        const snapshotEntry = snapshotEntries.get(entryId);
        const snapshotAmount = Number(snapshotEntry?.amount);

        if (
          (optimisticAmount <= 0 && !snapshotEntry) ||
          (snapshotEntry && snapshotAmount === optimisticAmount)
        ) {
          optimisticNeededAmounts.delete(entryId);
        }
      });

      currentNeededEntries = snapshotEntries;
      refreshViews("roomItems", "fullNeededList", "gettingItems");
    },
  },
];

function startCollectionListener(definition) {
  if (startedListeners.has(definition.key)) {
    return;
  }

  startedListeners.add(definition.key);

  const unsubscribe = onSnapshot(
    householdCollection(definition.collectionName),
    definition.applySnapshot,
    (error) => {
      console.error(`${definition.errorLabel}:`, error);
    },
  );

  dataListenerUnsubscribes.set(definition.key, unsubscribe);
}

/* ===== Needed-entry actions ===== */

function formatAmount(amount, unitId) {
  const unit = currentUnits.find((candidate) => candidate.id === unitId);

  if (!unit) {
    return String(amount);
  }

  const isMultiplier =
    unit.displayMode === "multiplier" ||
    ["x", "×"].includes(unit.symbol.trim().toLowerCase());

  if (isMultiplier) {
    return `×${amount}`;
  }

  return `${amount} ${unit.symbol}`;
}

function neededAmountForDisplay(neededEntry) {
  if (!neededEntry?.id) {
    return neededEntry?.amount;
  }

  return optimisticNeededAmounts.has(neededEntry.id)
    ? optimisticNeededAmounts.get(neededEntry.id)
    : neededEntry.amount;
}

function setNeededAmountDisplay(element, neededEntry) {
  element.dataset.neededEntryId = String(neededEntry.id);
  element.textContent = formatAmount(
    neededAmountForDisplay(neededEntry),
    neededEntry.unitId,
  );
}

function refreshNeededAmountDisplays(entryId, amount, unitId) {
  $$("[data-needed-entry-id]").forEach((element) => {
    if (element.dataset.neededEntryId === String(entryId)) {
      element.textContent = formatAmount(amount, unitId);
    }
  });
}

function closeSpecificProductChoicePanel() {
  $$(".specific-product-choice-panel").forEach((panel) => panel.remove());
}

function openSpecificProductChoicePanel(item) {
  const products = specificProductsForItem(item.id);

  if (products.length === 0) {
    addItemToNeededList(item);
    return;
  }

  closeSpecificProductChoicePanel();

  const panel = document.createElement("section");
  panel.className = "specific-product-choice-panel settings-form";

  const title = document.createElement("h3");
  title.textContent = `Add ${item.name}`;

  const list = document.createElement("div");
  list.className = "specific-product-choice-list";

  const genericButton = document.createElement("button");
  genericButton.type = "button";
  genericButton.className = "specific-product-choice-row";
  genericButton.textContent = item.name;
  genericButton.addEventListener("click", async () => {
    await addItemToNeededList(item);
    closeSpecificProductChoicePanel();
  });

  list.append(genericButton);

  products.forEach((product) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "specific-product-choice-row";

    const name = document.createElement("span");
    name.className = "specific-product-choice-name";
    name.textContent = product.name;
    button.append(name);

    const detailText = specificProductDetailText(product);

    if (detailText) {
      const detail = document.createElement("span");
      detail.className = "specific-product-choice-detail";
      detail.textContent = detailText;
      button.append(detail);
    }

    button.addEventListener("click", async () => {
      await addItemToNeededList(item, product);
      closeSpecificProductChoicePanel();
    });

    list.append(button);
  });

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = "settings-add-button";
  cancelButton.textContent = "Cancel";
  cancelButton.addEventListener("click", closeSpecificProductChoicePanel);

  panel.append(title, list, cancelButton);
  document.body.append(panel);

  requestAnimationFrame(() => {
    panel.scrollIntoView({
      block: "end",
      behavior: "smooth",
    });
  });
}

function addItemToNeededListWithProductChoice(item) {
  addItemToNeededList(item);
}

async function addOrSelectSpecificProduct(item, specificProduct) {
  await addSpecificProductToNeededList(item, specificProduct);
}

async function addItemToNeededList(item) {
  if (genericNeededEntryForItem(item.id)) {
    alert(`${item.name} is already on the needed list.`);
    return;
  }

  try {
    await migrateLegacySpecificEntryBeforeGenericAdd(item);

    const neededEntryRef = householdDocument("neededEntries", item.id);

    const itemRef = householdDocument("items", item.id);

    await setDoc(neededEntryRef, {
      itemId: item.id,
      amount: item.defaultAmount,
      unitId: item.unitId,
      specificProductId: null,
      status: "needed",
      addedAt: serverTimestamp(),
      adjustedAt: serverTimestamp(),
      statusChangedAt: serverTimestamp(),
      collectedAt: null,
    });

    await setDoc(
      itemRef,
      {
        addCount: increment(1),
        lastAddedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (error) {
    console.error("Could not add item to needed list:", error);
    alert("The item could not be added to the needed list.");
  }
}

async function addSpecificProductToNeededList(item, specificProduct) {
  if (specificNeededEntryForProduct(specificProduct.id)) {
    alert(
      `${combinedItemSpecificProductName(
        item,
        specificProduct,
      )} is already on the needed list.`,
    );
    return;
  }

  try {
    const neededEntryRef = householdDocument(
      "neededEntries",
      specificNeededEntryDocumentId(specificProduct.id),
    );

    const itemRef = householdDocument("items", item.id);

    await setDoc(neededEntryRef, {
      itemId: item.id,
      amount: item.defaultAmount,
      unitId: item.unitId,
      specificProductId: specificProduct.id,
      status: "needed",
      addedAt: serverTimestamp(),
      adjustedAt: serverTimestamp(),
      statusChangedAt: serverTimestamp(),
      collectedAt: null,
    });

    await setDoc(
      itemRef,
      {
        addCount: increment(1),
        lastAddedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (error) {
    console.error("Could not add specific product to needed list:", error);
    alert("The specific product could not be added to the needed list.");
  }
}

async function changeNeededAmount(
  item,
  neededEntry,
  change,
  specificProduct = null,
) {
  const neededEntryId = neededEntryDocumentIdFor(
    item,
    specificProduct,
    neededEntry,
  );

  if (!neededEntryId) {
    return;
  }

  const currentAmount = optimisticNeededAmounts.has(neededEntryId)
    ? optimisticNeededAmounts.get(neededEntryId)
    : Number(neededEntry.amount);

  const requestedAmount = currentAmount + Number(change);
  const nextAmount = Math.max(0, requestedAmount);
  const appliedChange = nextAmount - currentAmount;

  if (!Number.isFinite(nextAmount) || appliedChange === 0) {
    return;
  }

  optimisticNeededAmounts.set(neededEntryId, nextAmount);
  refreshNeededAmountDisplays(neededEntryId, nextAmount, neededEntry.unitId);

  const neededEntryRef = householdDocument("neededEntries", neededEntryId);
  const itemRef = item.oneOff ? null : householdDocument("items", item.id);
  const batch = writeBatch(db);

  if (nextAmount <= 0) {
    batch.delete(neededEntryRef);
  } else if (currentAmount <= 0) {
    const { id: _entryId, ...entryData } = neededEntry;

    batch.set(
      neededEntryRef,
      {
        ...entryData,
        amount: nextAmount,
        adjustedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } else {
    batch.update(neededEntryRef, {
      amount: increment(appliedChange),
      adjustedAt: serverTimestamp(),
    });
  }

  if (itemRef) {
    batch.set(
      itemRef,
      {
        lastAdjustedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  try {
    await batch.commit();
  } catch (error) {
    optimisticNeededAmounts.delete(neededEntryId);
    refreshViews("roomItems", "fullNeededList", "gettingItems");
    console.error("Could not change quantity:", error);
    alert("The quantity could not be changed.");
  }
}

async function removeNeededItem(neededEntry) {
  const neededEntryRef = householdDocument("neededEntries", neededEntry.id);

  try {
    await deleteDoc(neededEntryRef);
  } catch (error) {
    console.error("Could not remove needed item:", error);
    alert("The item could not be removed.");
  }
}

async function setNeededItemCollected(item, neededEntry, isCollected) {
  const neededEntryRef = householdDocument("neededEntries", neededEntry.id);

  try {
    await updateDoc(neededEntryRef, {
      status: isCollected ? "collected" : "needed",
      collectedAt: isCollected ? serverTimestamp() : null,
      statusChangedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error("Could not update collected status:", error);
    alert("The item could not be updated.");
  }
}

async function finishCurrentShop() {
  if (!selectedShoppingTarget) {
    updateBottomContextAction();
    return;
  }

  const selectedStore =
    selectedShoppingTarget.kind === "store"
      ? currentStores.find((store) => store.id === selectedShoppingTarget.id)
      : null;

  const selectedStoreTypeId =
    selectedShoppingTarget.kind === "store"
      ? selectedShoppingTarget.storeTypeId
      : selectedShoppingTarget.id;

  const collectedRecords = currentNeededRecords().filter((record) => {
    if (record.entry.status !== "collected") {
      return false;
    }

    if (!neededRecordBelongsToStoreType(record, selectedStoreTypeId)) {
      return false;
    }

    return neededRecordIsAvailableAtStore(record, selectedStore?.id);
  });

  if (collectedRecords.length === 0) {
    return;
  }

  finishShopButton.disabled = true;

  try {
    const batch = writeBatch(db);

    collectedRecords.forEach((record) => {
      batch.delete(householdDocument("neededEntries", record.entry.id));
    });

    await batch.commit();
  } catch (error) {
    console.error("Could not finish shop:", error);
    alert("The collected items could not be removed.");
  } finally {
    finishShopButton.disabled = false;
    updateBottomContextAction();
  }
}

/* ===== Event wiring and startup ===== */

function wireNavigation() {
  const needingTabButton = $(".main-tabs button[data-view='needing']");

  const gettingTabButton = $(".main-tabs button[data-view='getting']");

  const settingsShortcutButton = $(".settings-shortcut[data-view='settings']");

  needingTabButton.addEventListener("click", () => {
    recordAppNavigation();
    resetNeedingToRoomList();
    showView("needing");
  });

  gettingTabButton.addEventListener("click", () => {
    recordAppNavigation();
    resetGettingToShoppingList();
    showView("getting");
  });

  settingsShortcutButton.addEventListener("click", () => {
    recordAppNavigation();
    openSettingsHomeFromShortcut();
  });

  if (bottomContextAction) {
    bottomContextAction.addEventListener("click", () => {
      if (!views.needing.hidden) {
        recordAppNavigation();

        if (isAllStuffSelected() && roomView && !roomView.hidden) {
          openSettingsItemsFromShortcut();
        } else {
          openFullNeededList();
        }

        return;
      }

      if (!views.settings.hidden && !bottomContextAction.disabled) {
        recordAppNavigation();
        toggleCurrentSettingsAddForm();
        return;
      }
    });

    addLongPressHandler(
      bottomContextAction,
      async () => {
        if (views.getting.hidden || bottomContextAction.disabled) {
          return;
        }

        const confirmed = confirm(
          "Finish shop and remove collected items from the needed list?",
        );

        if (confirmed) {
          await finishCurrentShop();
        }
      },
      { duration: 450 },
    );
  }

  settingsCategoryOptions.forEach((button) => {
    button.addEventListener("click", () => {
      recordAppNavigation();
      openSettingsCategory(button.dataset.settingsCategory);
    });
  });

  if (settingsItemsSearch) {
    settingsItemsSearch.addEventListener("input", () => {
      renderSettingsItems();
    });
  }

  settingsCategoryButton.addEventListener("click", () => {
    recordAppNavigation();
    editingSettingsKey = null;
    editingSettingsId = null;
    editingSettingsContextId = null;
    showSettingsHome();
  });

  roomSelectorButton.addEventListener("click", () => {
    recordAppNavigation();
    showNeedingHome();
  });

  backToRoomsButton.addEventListener("click", () => {
    recordAppNavigation();
    showNeedingHome();
  });

  newItemButton.addEventListener("click", () => {
    recordAppNavigation();

    if (isRegularRoomSelected()) {
      openSettingsItemsFromShortcut();
      return;
    }

    if (isOneOffRoomSelected()) {
      clearFormPositioningScrollSpace();
      closeSpecificProductQuickAdd();
      newItemPanel.hidden = true;
      resetOneOffItemForm();
      oneOffItemPanel.hidden = false;
      oneOffItemPanel.scrollTop = 0;
      newItemButton.hidden = true;
      placeElementAtTop(oneOffItemPanel, oneOffItemNameInput);
      return;
    }

    closeSpecificProductQuickAdd();

    const chooseRoom = isAllStuffSelected();
    itemRoomLabel.hidden = !chooseRoom;
    itemRoomSelect.hidden = !chooseRoom;
    itemRoomSelect.required = chooseRoom;
    populateRoomSelect(itemRoomSelect);
    populateProductTypeSelect(
      itemProductTypeSelect,
      itemProductTypeSelect.value,
    );
    populateItemStoreSelect(
      itemStoreSelect,
      itemProductTypeSelect.value,
      itemStoreSelect?.value ?? "",
    );

    if (!itemUnitSelect.value) {
      applyDefaultItemUnit();
    }

    newItemPanel.hidden = false;
    newItemButton.hidden = true;

    placeElementAtTop(newItemPanel, itemNameInput);
  });

  cancelNewItemButton.addEventListener("click", () => {
    clearFormPositioningScrollSpace();
    newItemPanel.hidden = true;
    newItemButton.hidden = false;
  });

  cancelOneOffItemButton?.addEventListener("click", () => {
    oneOffItemPanel.hidden = true;
    newItemButton.hidden = false;
  });

  if (cancelSpecificProductButton) {
    cancelSpecificProductButton.addEventListener("click", () => {
      closeSpecificProductQuickAdd();
    });
  }

  cancelTemporaryNoteButton?.addEventListener("click", closeTemporaryNotePanel);

  clearTemporaryNoteButton?.addEventListener("click", async () => {
    temporaryNoteText.value = "";

    try {
      await saveTemporaryNote();
      closeTemporaryNotePanel();
    } catch (error) {
      console.error("Could not clear temporary note:", error);
      alert("The temporary note could not be cleared.");
    }
  });

  temporaryNoteForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitButton = temporaryNoteForm.querySelector(
      'button[type="submit"]',
    );
    submitButton.disabled = true;

    try {
      await saveTemporaryNote();
      closeTemporaryNotePanel();
    } catch (error) {
      console.error("Could not save temporary note:", error);
      alert("The temporary note could not be saved.");
    } finally {
      submitButton.disabled = false;
    }
  });

  shoppingAtButton.addEventListener("click", () => {
    if (!shoppingAtPanel.hidden) {
      return;
    }

    recordAppNavigation();
    resetGettingToShoppingList();
  });

  addLongPressHandler(
    finishShopButton,
    async () => {
      const confirmed = confirm(
        "Finish shop and remove collected items from the needed list?",
      );

      if (confirmed) {
        await finishCurrentShop();
      }
    },
    { duration: 450 },
  );

  viewNeededListButton.addEventListener("click", () => {
    recordAppNavigation();
    openFullNeededList();
  });

  neededListSearch.addEventListener("input", () => {
    renderFullNeededList();
  });

  if (roomItemsSearch) {
    roomItemsSearch.addEventListener("input", () => {
      renderRoomItems();
    });
  }

  if (editItemsFromNeededListButton) {
    editItemsFromNeededListButton.addEventListener("click", () => {
      recordAppNavigation();
      openSettingsItemsFromShortcut();
    });
  }

  backFromNeededListButton.addEventListener("click", () => {
    recordAppNavigation();
    closeFullNeededListToPreviousView();
  });
}

function wireItemFormDependencies({
  productTypeSelect,
  storeSelect,
  unitSelect,
  incrementInput,
}) {
  productTypeSelect?.addEventListener("change", () => {
    populateItemStoreSelect(
      storeSelect,
      productTypeSelect.value,
      storeSelect?.value ?? "",
    );
  });

  unitSelect?.addEventListener("change", () => {
    updateIncrementFromUnit(unitSelect, incrementInput);
  });
}

function wireForms() {
  Object.values(itemFormContexts).forEach(({ fields }) => {
    wireItemFormDependencies(fields);
  });

  wireAsyncForm(
    addRoomForm,
    async () => {
      const roomName = roomNameInput.value.trim();

      if (!roomName) {
        return;
      }

      await addDoc(householdCollection("locations"), {
        name: roomName,
        parentId: null,
        level: "room",
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      addRoomForm.reset();
      clearFormPositioningScrollSpace();
      addRoomForm.hidden = true;
    },
    {
      errorLabel: "Could not add room",
      errorMessage: "The room could not be added.",
    },
  );

  wireAsyncForm(
    addUnitForm,
    async () => {
      const unitSymbol = unitSymbolInput.value.trim();

      if (!unitSymbol) {
        return;
      }

      await addDoc(householdCollection("units"), {
        name: unitSymbol,
        symbol: unitSymbol,
        displayMode: unitSymbol === "×" ? "multiplier" : "suffix",
        defaultIncrement: 1,
        decimalPlaces: 0,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      addUnitForm.reset();
      clearFormPositioningScrollSpace();
      addUnitForm.hidden = true;
    },
    {
      errorLabel: "Could not add unit",
      errorMessage: "The unit could not be added.",
    },
  );

  wireAsyncForm(
    addStoreTypeForm,
    async () => {
      const storeTypeName = storeTypeNameInput.value.trim();

      if (!storeTypeName) {
        return;
      }

      await addDoc(householdCollection("storeTypes"), {
        name: storeTypeName,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      addStoreTypeForm.reset();
      clearFormPositioningScrollSpace();
      addStoreTypeForm.hidden = true;
    },
    {
      errorLabel: "Could not add store type",
      errorMessage: "The store type could not be added.",
    },
  );

  wireAsyncForm(
    addStoreForm,
    async () => {
      const storeName = storeNameInput.value.trim();
      const storeTypeId = storeTypeSelect.value;

      if (!storeName || !storeTypeId) {
        return;
      }

      await addDoc(householdCollection("stores"), {
        name: storeName,
        storeTypeId,
        productTypeOrders: {},
        excludedProductTypeIds: [],
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      addStoreForm.reset();
      clearFormPositioningScrollSpace();
      addStoreForm.hidden = true;
    },
    {
      errorLabel: "Could not add store",
      errorMessage: "The store could not be added.",
    },
  );

  wireAsyncForm(
    addProductTypeForm,
    async () => {
      const productTypeName = productTypeNameInput.value.trim();
      const storeTypeIds = getProductTypeStoreTypeIdsFromForm();

      if (!productTypeName || storeTypeIds.length === 0) {
        alert(
          "Please enter a product type name and choose at least one store type.",
        );
        return;
      }

      await addDoc(householdCollection("productTypes"), {
        name: productTypeName,
        storeTypeIds,
        storeTypeOrders: {},
        parentId: null,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      productTypeNameInput.value = "";
      createStoreTypeCheckboxList(productTypeStoreTypesContainer, storeTypeIds);
      productTypeNameInput.focus();
    },
    {
      errorLabel: "Could not add product type",
      errorMessage: "The product type could not be added.",
    },
  );

  wireAsyncForm(
    addSettingsItemForm,
    async () => {
      const values = readItemFormValues(itemFormContexts.settings.fields);

      const validationMessage = validateItemFormValues(values);

      if (validationMessage) {
        alert(validationMessage);
        return;
      }

      await createCatalogueItem(values);
      resetSettingsItemAddForm();
      clearFormPositioningScrollSpace();
      addSettingsItemForm.hidden = true;
    },
    {
      errorLabel: "Could not add item",
      errorMessage: "The item could not be saved.",
    },
  );

  wireAsyncForm(
    addSpecificProductForm,
    async () => {
      const productName = specificProductNameInput.value.trim();
      const specificAttributes = specificProductAttributesInput.value.trim();
      const storeIds = getCheckedValues(specificProductStoresContainer);

      if (!quickSpecificProductItemId || !productName) {
        alert("Please enter a product name.");
        return;
      }

      await addDoc(householdCollection("specificProducts"), {
        itemId: quickSpecificProductItemId,
        name: productName,
        specificAttributes,
        storeIds,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      closeSpecificProductQuickAdd();
    },
    {
      errorLabel: "Could not add specific product",
      errorMessage: "The specific product could not be saved.",
    },
  );

  wireAsyncForm(
    addOneOffItemForm,
    async () => {
      await saveOneOffItem();
      resetOneOffItemForm();
      oneOffItemPanel.hidden = true;
      newItemButton.hidden = false;
    },
    {
      errorLabel: "Could not add one-off item",
      errorMessage: (error) =>
        error.message || "The one-off item could not be added.",
    },
  );

  wireAsyncForm(
    addItemForm,
    async () => {
      const values = readItemFormValues({
        ...itemFormContexts.room.fields,
        locationId: isAllStuffSelected()
          ? itemRoomSelect.value
          : selectedRoomId,
      });

      const validationMessage = validateItemFormValues(values, {
        rejectRegularRoom: true,
      });

      if (validationMessage) {
        alert(validationMessage);
        return;
      }

      await createCatalogueItem(values);

      itemNameInput.value = "";

      if (itemSpecificAttributesInput) {
        itemSpecificAttributesInput.value = "";
      }

      clearFormPositioningScrollSpace();
      newItemPanel.hidden = true;
      newItemButton.hidden = false;
    },
    {
      errorLabel: "Could not add item",
      errorMessage: "The item could not be saved.",
    },
  );
}

function startListeners() {
  listenerDefinitions.forEach(startCollectionListener);
}

function wireAccessControls() {
  createHouseholdLinkButton?.addEventListener("click", async () => {
    createHouseholdLinkButton.disabled = true;

    try {
      const link = await createAccessInvite("household");
      householdLinkOutput.value = link;
      householdLinkResult.hidden = false;
      householdLinkOutput.select();
    } catch (error) {
      console.error("Could not create household device link:", error);
      alert(error.message || "The household device link could not be created.");
    } finally {
      createHouseholdLinkButton.disabled = false;
    }
  });

  createViewerLinkButton?.addEventListener("click", async () => {
    createViewerLinkButton.disabled = true;

    try {
      const link = await createAccessInvite("viewer");
      viewerLinkOutput.value = link;
      viewerLinkResult.hidden = false;
      viewerLinkOutput.select();
    } catch (error) {
      console.error("Could not create read-only sharing link:", error);
      alert(
        error.message || "The read-only sharing link could not be created.",
      );
    } finally {
      createViewerLinkButton.disabled = false;
    }
  });

  copyHouseholdLinkButton?.addEventListener("click", async () => {
    await copyTextToClipboard(
      householdLinkOutput.value,
      copyHouseholdLinkButton,
    );
  });

  copyViewerLinkButton?.addEventListener("click", async () => {
    await copyTextToClipboard(viewerLinkOutput.value, copyViewerLinkButton);
  });
}

wireNavigation();
wireForms();
wireAccessControls();
setupCompactSelects();
enableSettingsMenuOrdering();
setupBrowserBackButton();
setupAutoHidingHeader();

onAuthStateChanged(auth, async (user) => {
  stopAccessMonitoring();
  stopDataListeners();
  currentMemberRecord = null;
  currentAccessRole = null;

  if (!user) {
    document.body.classList.remove(
      "access-denied",
      "access-household",
      "access-viewer",
    );
    document.body.classList.add("access-pending");
    accessGate.hidden = false;
    accessGateMessage.textContent = "Connecting securely…";
    connectionStatus.textContent = "Connecting…";
    return;
  }

  await initializeDeviceAccess(user);
});

showView("needing");
