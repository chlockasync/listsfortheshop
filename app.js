import Sortable from
  "https://cdn.jsdelivr.net/npm/sortablejs@1.15.7/modular/sortable.core.esm.js";

import {
  auth,
  db,
  HOUSEHOLD_ID
} from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";

import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  increment,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

function ensureSpecificAttributesField({
  formSelector,
  afterSelector,
  inputId
}) {
  if (document.querySelector(`#${inputId}`)) {
    return;
  }

  const form = document.querySelector(formSelector);
  const afterElement = form?.querySelector(afterSelector);

  if (!form || !afterElement) {
    return;
  }

  const label = document.createElement("label");
  label.htmlFor = inputId;
  label.textContent = "Specific Attributes (optional)";

  const input = document.createElement("input");
  input.type = "text";
  input.id = inputId;
  input.maxLength = 100;
  input.autocomplete = "off";
  input.placeholder = "e.g. 2 L, gluten-free, fragrance-free";

  afterElement.insertAdjacentElement("afterend", input);
  input.insertAdjacentElement("beforebegin", label);
}

ensureSpecificAttributesField({
  formSelector: "#add-item-form",
  afterSelector: "#item-store",
  inputId: "item-specific-attributes"
});

ensureSpecificAttributesField({
  formSelector: "#add-settings-item-form",
  afterSelector: "#settings-item-store",
  inputId: "settings-item-specific-attributes"
});

const navigationButtons = document.querySelectorAll("[data-view]");

const views = {
  needing: document.querySelector("#needing-view"),
  getting: document.querySelector("#getting-view"),
  settings: document.querySelector("#settings-view")
};

const connectionStatus = document.querySelector("#connection-status");
const bottomContextAction = document.querySelector("#bottom-context-action");

/* Settings navigation */
const settingsHome = document.querySelector("#settings-home");
const settingsCategoryButton = document.querySelector("#settings-category-button");
const settingsCategoryOptions = document.querySelectorAll(".settings-category-option");
const settingsCategoryPanels = document.querySelectorAll(".settings-category-panel");
const settingsPanels = {
  stores: document.querySelector("#settings-stores-panel"),
  "store-types": document.querySelector("#settings-store-types-panel"),
  "product-types": document.querySelector("#settings-product-types-panel"),
  items: document.querySelector("#settings-items-panel"),
  rooms: document.querySelector("#settings-rooms-panel"),
  units: document.querySelector("#settings-units-panel")
};
const settingsCategoryNames = {
  stores: "Stores",
  "store-types": "Store types",
  "product-types": "Product types",
  items: "Items and Specific Products",
  rooms: "Rooms",
  units: "Units"
};

function getVisibleSettingsCategory() {
  if (selectedSettingsCategory) {
    return selectedSettingsCategory;
  }

  const visiblePanel = Array.from(settingsCategoryPanels).find(
    (panel) => !panel.hidden
  );

  return Object.entries(settingsPanels).find(
    ([, panel]) => panel === visiblePanel
  )?.[0] ?? null;
}

function getSettingsAddForm(categoryName) {
  return {
    stores: addStoreForm,
    "store-types": addStoreTypeForm,
    "product-types": addProductTypeForm,
    items: addSettingsItemForm,
    rooms: addRoomForm,
    units: addUnitForm
  }[categoryName] ?? null;
}

function closeSettingsAddForms({ except = null } = {}) {
  [
    addStoreForm,
    addStoreTypeForm,
    addProductTypeForm,
    addSettingsItemForm,
    addRoomForm,
    addUnitForm
  ].forEach((form) => {
    if (!form || form === except) {
      return;
    }

    form.hidden = true;
  });
}

function toggleCurrentSettingsAddForm() {
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
  form.hidden = !willOpen;

  if (willOpen && categoryName === "items") {
    placeElementAtTop(form, settingsItemNameInput);
  }
}

/* Rooms */
const addRoomForm = document.querySelector("#add-room-form");
const roomNameInput = document.querySelector("#room-name");
const settingsRoomsList = document.querySelector("#settings-rooms-list");
const needingRoomsList = document.querySelector("#rooms-list");

/* Units */
const addUnitForm = document.querySelector("#add-unit-form");
const unitNameInput = document.querySelector("#unit-name");
const unitSymbolInput = document.querySelector("#unit-symbol");
const settingsUnitsList = document.querySelector("#settings-units-list");

/* Store types */
const addStoreTypeForm = document.querySelector("#add-store-type-form");
const storeTypeNameInput = document.querySelector("#store-type-name");
const settingsStoreTypesList = document.querySelector("#settings-store-types-list");
const storeTypeSelect = document.querySelector("#store-type-select");

/* Stores */
const addStoreForm = document.querySelector("#add-store-form");
const storeNameInput = document.querySelector("#store-name");
const settingsStoresList = document.querySelector("#settings-stores-list");

/* Product types */
const addProductTypeForm = document.querySelector("#add-product-type-form");
const productTypeNameInput = document.querySelector("#product-type-name");
const productTypeStoreTypesContainer = document.querySelector("#product-type-store-types");
const settingsProductTypesList = document.querySelector("#settings-product-types-list");

/* Items */
const settingsItemsList = document.querySelector("#settings-items-list");
const settingsItemsSearch = document.querySelector("#settings-items-search");
const addSettingsItemForm = document.querySelector("#add-settings-item-form");
const settingsItemNameInput = document.querySelector("#settings-item-name");
const settingsItemRoomSelect = document.querySelector("#settings-item-room");
const settingsItemProductTypeSelect = document.querySelector("#settings-item-product-type");
const settingsItemStoreSelect = document.querySelector("#settings-item-store");
const settingsItemSpecificAttributesInput = document.querySelector("#settings-item-specific-attributes");
const settingsItemDefaultAmountInput = document.querySelector("#settings-item-default-amount");
const settingsItemUnitSelect = document.querySelector("#settings-item-unit");
const settingsItemIncrementInput = document.querySelector("#settings-item-increment");

/* Needing room view */
const roomSelectorButton = document.querySelector("#room-selector-button");
const needingHome = document.querySelector("#needing-home");
const roomView = document.querySelector("#room-view");
const roomViewTitle = document.querySelector("#room-view-title");
const backToRoomsButton = document.querySelector("#back-to-rooms");
const newItemButton = document.querySelector("#new-item-button");
const newItemPanel = document.querySelector("#new-item-panel");
const cancelNewItemButton = document.querySelector("#cancel-new-item");
const itemProductTypeSelect = document.querySelector("#item-product-type");
const itemStoreSelect = document.querySelector("#item-store");
const itemSpecificAttributesInput = document.querySelector("#item-specific-attributes");
const itemUnitSelect = document.querySelector("#item-unit");
const itemIncrementInput = document.querySelector("#item-increment");
const addItemForm = document.querySelector("#add-item-form");
const itemNameInput = document.querySelector("#item-name");
const itemDefaultAmountInput = document.querySelector("#item-default-amount");
const roomItemsList = document.querySelector("#room-items-list");
const roomItemsSearch = document.querySelector("#room-items-search");
const specificProductPanel = document.querySelector("#specific-product-panel");
const specificProductPanelTitle = document.querySelector("#specific-product-panel-title");
const addSpecificProductForm = document.querySelector("#add-specific-product-form");
const specificProductNameInput = document.querySelector("#specific-product-name");
const specificProductAttributesInput = document.querySelector("#specific-product-attributes");
const specificProductStoresContainer = document.querySelector("#specific-product-stores");
const cancelSpecificProductButton = document.querySelector("#cancel-specific-product");
const viewNeededListButton = document.querySelector("#view-needed-list");
const fullNeededView = document.querySelector("#full-needed-view");
const backFromNeededListButton = document.querySelector("#back-from-needed-list");
const editItemsFromNeededListButton = document.querySelector("#edit-items-from-needed-list");
const neededListSearch = document.querySelector("#needed-list-search");
const fullNeededItems = document.querySelector("#full-needed-items");

/* Getting view */
const shoppingAtButton = document.querySelector("#shopping-at-button");
const shoppingAtPanel = document.querySelector("#shopping-at-panel");
const shoppingLocationOptions = document.querySelector("#shopping-location-options");
const gettingItemsList = document.querySelector("#getting-items-list");
const finishShopButton = document.querySelector("#finish-shop-button");

const settingsSortables = new Map();

let selectedSettingsCategory = null;
let selectedRoomId = null;
let selectedShoppingTarget = null;
let editingItemId = null;
let editingSettingsKey = null;
let editingSettingsId = null;
let editingSettingsContextId = null;
let pendingEditFormScroll = false;

let roomsListenerStarted = false;
let unitsListenerStarted = false;
let storeTypesListenerStarted = false;
let storesListenerStarted = false;
let productTypesListenerStarted = false;
let itemsListenerStarted = false;
let neededEntriesListenerStarted = false;
let specificProductsListenerStarted = false;

let currentRooms = [];
let currentUnits = [];
let currentStoreTypes = [];
let currentStores = [];
let currentProductTypes = [];
let currentItems = [];
let currentSpecificProducts = [];
let currentNeededEntries = new Map();
let quickSpecificProductItemId = null;
let lastNonSettingsView = "needing";
let appHistoryDepth = 0;
let suppressAppHistory = false;

const REGULAR_ROOM_ID = "__regular_stuff__";

function isRegularRoomSelected() {
  return selectedRoomId === REGULAR_ROOM_ID;
}

function itemIsRegular(item) {
  return item.regularList === true;
}

function getSelectedRoomName() {
  if (isRegularRoomSelected()) {
    return "Regular stuff";
  }

  return currentRooms.find(
    (room) => room.id === selectedRoomId
  )?.name ?? "Room";
}


function recordAppNavigation() {
  if (suppressAppHistory || !window.history?.pushState) {
    return;
  }

  appHistoryDepth += 1;

  window.history.pushState(
    {
      listsForTheShop: true,
      depth: appHistoryDepth
    },
    "",
    window.location.href
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
  return [
    addStoreForm,
    addStoreTypeForm,
    addProductTypeForm,
    addSettingsItemForm,
    addRoomForm,
    addUnitForm
  ].find((form) => form && !form.hidden) ?? null;
}

function closeOpenSettingsEditPanel() {
  if (!editingSettingsKey && !editingSettingsId) {
    return false;
  }

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
  if (!specificProductPanel?.hidden) {
    closeSpecificProductQuickAdd();
    return true;
  }

  if (newItemPanel && !newItemPanel.hidden) {
    newItemPanel.hidden = true;

    if (newItemButton) {
      newItemButton.hidden = false;
    }

    return true;
  }

  const openSettingsAddForm = getOpenSettingsAddForm();

  if (openSettingsAddForm) {
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
  const header = document.querySelector(".app-header");

  if (!header) {
    return;
  }

  let lastScrollY = window.scrollY;
  let ticking = false;

  function updateHeader() {
    const currentScrollY = Math.max(0, window.scrollY);
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
    { passive: true }
  );
}

function setupBrowserBackButton() {
  if (!window.history?.replaceState) {
    return;
  }

  window.history.replaceState(
    {
      listsForTheShop: true,
      depth: appHistoryDepth
    },
    "",
    window.location.href
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
      behavior: "auto"
    });
  });
}

function openSettingsHomeFromShortcut() {
  editingSettingsKey = null;
  editingSettingsId = null;
  editingSettingsContextId = null;
  selectedSettingsCategory = null;
  showView("settings");
  scrollAppToTop();
}

function openSettingsItemsFromShortcut() {
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

  if (!views.needing.hidden) {
    bottomContextAction.textContent = "Full list";
    bottomContextAction.disabled = false;
    bottomContextAction.hidden = false;
    bottomContextAction.setAttribute(
      "aria-label",
      "Open full needed list"
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
        ? currentStores.find(
            (store) => store.id === selectedShoppingTarget.id
          )
        : null;

    const selectedStoreTypeId =
      selectedShoppingTarget.kind === "store"
        ? selectedShoppingTarget.storeTypeId
        : selectedShoppingTarget.id;

    const hasCollectedVisibleItems = currentNeededRecords().some(
      (record) => {
        if (record.entry.status !== "collected") {
          return false;
        }

        if (
          !itemBelongsToStoreType(
            record.item,
            selectedStoreTypeId
          )
        ) {
          return false;
        }

        return specificProductIsAvailableAtStore(
          record.specificProduct,
          selectedStore?.id
        );
      }
    );

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
          : `New ${settingsCategoryNames[categoryName]}`
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
  const panel = settingsPanels[categoryName];

  if (!panel) {
    return;
  }

  const categoryChanged = selectedSettingsCategory !== categoryName;

  selectedSettingsCategory = categoryName;
  settingsHome.hidden = true;
  setContextButtonLabel(
    settingsCategoryButton,
    settingsCategoryNames[categoryName]
  );
  settingsCategoryButton.hidden = false;

  settingsCategoryPanels.forEach((categoryPanel) => {
    categoryPanel.hidden = categoryPanel !== panel;
  });

  closeSettingsAddForms({ except: getSettingsAddForm(categoryName) });
  updateBottomContextAction();

  if (categoryChanged) {
    scrollAppToTop();
  }
}

function showView(viewName) {
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

  if (viewName === "getting" && !selectedShoppingTarget) {
    shoppingAtPanel.hidden = false;
    shoppingAtButton.setAttribute("aria-expanded", "true");
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
  selectedRoomId = null;
  editingItemId = null;
  roomSelectorButton.hidden = true;
  roomSelectorButton.textContent = "";
  needingHome.hidden = false;
  fullNeededView.hidden = true;
  roomView.hidden = true;

  if (newItemButton) {
    newItemButton.textContent = "New item";
  }
}

function resetNeedingToRoomList() {
  selectedRoomId = null;
  editingItemId = null;

  if (newItemPanel) {
    newItemPanel.hidden = true;
  }

  if (newItemButton) {
    newItemButton.hidden = false;
  }

  showNeedingHome();
}

function resetGettingToShoppingList() {
  selectedShoppingTarget = null;
  setContextButtonLabel(shoppingAtButton, "Shopping at");
  shoppingAtPanel.hidden = false;
  shoppingAtButton.setAttribute("aria-expanded", "true");
  renderGettingItems();
  updateBottomContextAction();
}

function openRoom(room) {
  selectedRoomId = room.id;
  roomSelectorButton.hidden = false;
  setRoomSelectorLabel(room.name);
  roomSelectorButton.setAttribute("aria-expanded", "false");
  needingHome.hidden = true;
  fullNeededView.hidden = true;
  roomView.hidden = false;
  roomViewTitle.textContent = room.name;
  editingItemId = null;

  if (newItemPanel) {
    newItemPanel.hidden = true;
  }

  if (newItemButton) {
    newItemButton.hidden = false;
    newItemButton.textContent = "New item";
  }

  renderRoomItems();
}

function openRegularRoom() {
  selectedRoomId = REGULAR_ROOM_ID;
  roomSelectorButton.hidden = false;
  setRoomSelectorLabel("Regular stuff");
  roomSelectorButton.setAttribute("aria-expanded", "false");
  needingHome.hidden = true;
  fullNeededView.hidden = true;
  roomView.hidden = false;
  roomViewTitle.textContent = "Regular stuff";
  editingItemId = null;

  if (newItemPanel) {
    newItemPanel.hidden = true;
  }

  if (newItemButton) {
    newItemButton.hidden = false;
    newItemButton.textContent = "Edit regulars";
  }

  renderRoomItems();
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

function itemBelongsToStoreType(item, storeTypeId) {
  if (!storeTypeId) {
    return false;
  }

  const productType = currentProductTypes.find(
    (candidate) => candidate.id === item.productTypeId
  );

  if (productType) {
    return productTypeBelongsToStoreType(productType, storeTypeId);
  }

  if (Array.isArray(item.storeTypeIds)) {
    return item.storeTypeIds.some(
      (itemStoreTypeId) => String(itemStoreTypeId) === String(storeTypeId)
    );
  }

  return false;
}

function householdCollection(collectionName) {
  return collection(
    db,
    "households",
    HOUSEHOLD_ID,
    collectionName
  );
}

function householdDocument(collectionName, id) {
  return doc(
    db,
    "households",
    HOUSEHOLD_ID,
    collectionName,
    id
  );
}

function createIconButton({
  className = "",
  icon,
  label,
  onClick
}) {
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

function addLongPressHandler(
  element,
  handler,
  {
    duration = 350,
    ignoreSelector = null
  } = {}
) {
  let pressTimer = null;
  let startX = 0;
  let startY = 0;
  let longPressReady = false;
  let suppressClick = false;
  let pointerIsDown = false;

  function shouldIgnore(event) {
    return Boolean(
      ignoreSelector &&
      event.target?.closest?.(ignoreSelector)
    );
  }

  function resetPress() {
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }

    longPressReady = false;
    pointerIsDown = false;
    element.classList.remove("is-long-pressing");
  }

  element.addEventListener("pointerdown", (event) => {
    if (element.disabled || shouldIgnore(event)) {
      return;
    }

    event.preventDefault();
    resetPress();
    suppressClick = false;
    pointerIsDown = true;
    startX = event.clientX;
    startY = event.clientY;
    element.classList.add("is-long-pressing");

    if (element.setPointerCapture) {
      try {
        element.setPointerCapture(event.pointerId);
      } catch (error) {
        // Some browsers/elements do not allow pointer capture.
      }
    }

    pressTimer = setTimeout(() => {
      pressTimer = null;

      if (pointerIsDown) {
        longPressReady = true;
      }
    }, duration);
  });

  element.addEventListener("pointermove", (event) => {
    if (!pointerIsDown) {
      return;
    }

    const movedDistance = Math.hypot(
      event.clientX - startX,
      event.clientY - startY
    );

    if (movedDistance > 28) {
      resetPress();
    }
  });

  element.addEventListener("pointerup", async (event) => {
    if (!pointerIsDown) {
      return;
    }

    const shouldActivate = longPressReady;
    resetPress();

    if (!shouldActivate) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    suppressClick = true;
    await handler(event);
  });

  element.addEventListener("pointercancel", resetPress);

  ["contextmenu", "selectstart", "dragstart"].forEach(
    (eventName) => {
      element.addEventListener(eventName, (event) => {
        if (!shouldIgnore(event)) {
          event.preventDefault();
        }
      });
    }
  );

  element.addEventListener("click", (event) => {
    if (suppressClick) {
      event.preventDefault();
      event.stopPropagation();
      suppressClick = false;
    }
  });
}

function createSettingsRow({
  id,
  label,
  sublabel = "",
  editLabel,
  deleteLabel,
  onEdit,
  onDelete
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
    }
  });

  const deleteButton = createIconButton({
    className: "settings-row-icon-button settings-row-delete-button",
    icon: "🗑️",
    label: deleteLabel,
    onClick: async (event) => {
      event.stopPropagation();
      await onDelete();
    }
  });

  actions.append(editButton, deleteButton);
  row.append(handle, text, actions);

  return row;
}

function updateSettingsChoiceVisual(checkbox, box, graphic) {
  box.setAttribute("aria-pressed", String(checkbox.checked));
  graphic.textContent = checkbox.checked ? "✓" : "";
}

function createSettingsCheckboxOption({
  value,
  text,
  checked = false
}) {
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
    checkbox
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
    (field.value() ?? []).map((value) => String(value))
  );

  const inputs = [];

  field.options().forEach((optionData) => {
    const { optionLabel, checkbox } = createSettingsCheckboxOption({
      value: optionData.value,
      text: optionData.text,
      checked: selectedValues.has(String(optionData.value))
    });

    list.append(optionLabel);
    inputs.push(checkbox);
  });

  fieldset.append(list);

  return {
    label: fieldset,
    input: inputs
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
      hasSelected: false
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
    input
  };
}

function appendSettingsEditPanel({
  listElement,
  settingsKey,
  contextId = null,
  item,
  fields,
  onSave,
  extraContent = null
}) {
  if (
    editingSettingsKey !== settingsKey ||
    editingSettingsId !== item.id ||
    String(editingSettingsContextId ?? "") !== String(contextId ?? "")
  ) {
    return null;
  }

  const panel = document.createElement("section");
  panel.className = "settings-inline-edit-panel settings-form";

  const form = document.createElement("form");
  const fieldContainer = document.createElement("div");
  fieldContainer.className = "settings-form-fields";

  const inputMap = new Map();

  fields.forEach((field) => {
    const { label, input } = createFormField(field);
    inputMap.set(field.key, {
      input,
      field
    });
    fieldContainer.append(label);
  });

  if (extraContent) {
    const extraElement = extraContent(item, inputMap);

    if (extraElement) {
      fieldContainer.append(extraElement);
    }
  }

  const actions = document.createElement("div");
  actions.className = "settings-inline-edit-actions";

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.textContent = "Cancel";

  const saveButton = document.createElement("button");
  saveButton.type = "submit";
  saveButton.textContent = "Save";

  actions.append(cancelButton, saveButton);

  cancelButton.addEventListener("click", () => {
    editingSettingsKey = null;
    editingSettingsId = null;
    editingSettingsContextId = null;
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
      renderSettingsLists();
    } catch (error) {
      console.error("Could not save settings item:", error);
      alert(error.message || "The item could not be saved.");
    } finally {
      saveButton.disabled = false;
      cancelButton.disabled = false;
    }
  });

  form.append(fieldContainer, actions);
  panel.append(form);
  listElement.append(panel);

  if (pendingEditFormScroll) {
    pendingEditFormScroll = false;
    scrollEditFormToTop(panel);
  }

  return panel;
}

function placeElementAtTop(element, focusElement = null) {
  if (!element) {
    return;
  }

  requestAnimationFrame(() => {
    const header = document.querySelector(".app-header");
    header?.classList.remove("is-hidden");

    element.scrollIntoView({
      block: "start",
      inline: "nearest",
      behavior: "auto"
    });

    requestAnimationFrame(() => {
      const headerHeight = header?.offsetHeight ?? 0;
      const elementTop = element.getBoundingClientRect().top;
      const adjustment = elementTop - headerHeight;

      if (Math.abs(adjustment) > 1) {
        window.scrollBy({
          top: adjustment,
          left: 0,
          behavior: "auto"
        });
      }

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

function setEditingSettings(settingsKey, id) {
  if (
    editingSettingsKey === settingsKey &&
    editingSettingsId === id &&
    editingSettingsContextId === null
  ) {
    editingSettingsKey = null;
    editingSettingsId = null;
    editingSettingsContextId = null;
    pendingEditFormScroll = false;
  } else {
    editingSettingsKey = settingsKey;
    editingSettingsId = id;
    editingSettingsContextId = null;
    pendingEditFormScroll = true;
  }

  renderSettingsLists();
}

function setEditingProductType(id, storeTypeId) {
  if (
    editingSettingsKey === "product-types" &&
    editingSettingsId === id &&
    String(editingSettingsContextId) === String(storeTypeId)
  ) {
    editingSettingsKey = null;
    editingSettingsId = null;
    editingSettingsContextId = null;
    pendingEditFormScroll = false;
  } else {
    editingSettingsKey = "product-types";
    editingSettingsId = id;
    editingSettingsContextId = storeTypeId;
    pendingEditFormScroll = true;
  }

  renderSettingsLists();
}

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
    (candidate) => String(candidate.id) === String(itemId)
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

This will permanently remove it from the app.${detail ? `\n\n${detail}` : ""}`
  );
}

async function deleteSettingsDocument(collectionName, id) {
  await deleteDoc(householdDocument(collectionName, id));
}

async function deactivateRoom(room) {
  const matchingItems = activeItems().filter(
    (item) => item.locationId === room.id
  );

  if (matchingItems.length > 0) {
    showDependencyBlock(room.name, [
      dependencyListLine(
        "Items in this room",
        dependencyNames(matchingItems, (item) => item.name)
      )
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
  const matchingItems = activeItems().filter(
    (item) => item.unitId === unit.id
  );

  const matchingNeededEntries = Array.from(
    currentNeededEntries.values()
  ).filter((entry) => entry.unitId === unit.id);

  if (
    matchingItems.length > 0 ||
    matchingNeededEntries.length > 0
  ) {
    showDependencyBlock(unit.name, [
      dependencyListLine(
        "Items using this unit",
        dependencyNames(matchingItems, (item) => item.name)
      ),
      dependencyListLine(
        "Needed-list entries using this unit",
        dependencyNames(
          matchingNeededEntries,
          (entry) => itemNameForId(entry.itemId ?? entry.id)
        )
      )
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
    (store) => store.storeTypeId === storeType.id
  );

  const matchingProductTypes = currentProductTypes.filter(
    (productType) => productTypeBelongsToStoreType(productType, storeType.id)
  );

  if (
    matchingStores.length > 0 ||
    matchingProductTypes.length > 0
  ) {
    showDependencyBlock(storeType.name, [
      dependencyListLine(
        "Stores using this store type",
        dependencyNames(matchingStores, (store) => store.name)
      ),
      dependencyListLine(
        "Product types using this store type",
        dependencyNames(matchingProductTypes, (productType) => productType.name)
      )
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
    (item) => String(item.storeId ?? "") === String(store.id)
  );

  const matchingSpecificProducts = currentSpecificProducts.filter(
    (product) =>
      product.active !== false &&
      Array.isArray(product.storeIds) &&
      product.storeIds.some(
        (storeId) => String(storeId) === String(store.id)
      )
  );

  if (matchingItems.length > 0 || matchingSpecificProducts.length > 0) {
    showDependencyBlock(store.name, [
      dependencyListLine(
        "Items assigned to this store",
        dependencyNames(matchingItems, (item) => item.name)
      ),
      dependencyListLine(
        "Specific products recorded for this store",
        dependencyNames(
          matchingSpecificProducts,
          (product) => {
            const item = currentItems.find(
              (candidate) => String(candidate.id) === String(product.itemId)
            );

            return item
              ? `${item.name} ${product.name}`
              : product.name;
          }
        )
      )
    ]);
    return;
  }

  if (
    !confirmSettingsDelete(
      store.name,
      "Any custom product type order saved for this store will also be removed."
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
    (item) => item.productTypeId === productType.id
  );

  if (matchingItems.length > 0) {
    showDependencyBlock(productType.name, [
      dependencyListLine(
        "Items using this product type",
        dependencyNames(matchingItems, (item) => item.name)
      )
    ]);
    return;
  }

  if (!confirmSettingsDelete(productType.name)) {
    return;
  }

  const batch = writeBatch(db);

  batch.delete(householdDocument("productTypes", productType.id));

  currentStores.forEach((store) => {
    if (!storeProductTypeOrderContains(store, productType.id)) {
      return;
    }

    batch.update(householdDocument("stores", store.id), {
      [`productTypeOrders.${productType.id}`]: deleteField(),
      updatedAt: serverTimestamp()
    });
  });

  await batch.commit();
}

function storeTypeOptions() {
  return currentStoreTypes.map((storeType) => ({
    value: storeType.id,
    text: storeType.name
  }));
}

function storeOptions() {
  return currentStores.map((store) => ({
    value: store.id,
    text: store.name
  }));
}

function storesForProductType(productTypeId) {
  const productType = currentProductTypes.find(
    (candidate) => String(candidate.id) === String(productTypeId)
  );

  if (!productType) {
    return [];
  }

  const allowedStoreTypeIds = new Set(
    productTypeStoreTypeIds(productType).map((id) => String(id))
  );

  return currentStores
    .filter((store) =>
      allowedStoreTypeIds.has(String(store.storeTypeId))
    )
    .sort(sortBySavedOrderThenName);
}

function itemStoreOptions(productTypeId) {
  return storesForProductType(productTypeId).map((store) => ({
    value: store.id,
    text: store.name
  }));
}

function itemStoreIsAllowed(productTypeId, storeId) {
  if (!storeId) {
    return true;
  }

  return storesForProductType(productTypeId).some(
    (store) => String(store.id) === String(storeId)
  );
}

function populateItemStoreSelect(
  selectElement,
  productTypeId,
  selectedStoreId = ""
) {
  if (!selectElement) {
    return;
  }

  const stores = storesForProductType(productTypeId);
  selectElement.innerHTML = "";

  const emptyOption = document.createElement("option");
  emptyOption.value = "";
  emptyOption.textContent = stores.length > 0
    ? "Any matching store"
    : "No matching stores";
  selectElement.append(emptyOption);

  stores.forEach((store) => {
    const option = document.createElement("option");
    option.value = store.id;
    option.textContent = store.name;
    selectElement.append(option);
  });

  const hasSelectedStore = stores.some(
    (store) => String(store.id) === String(selectedStoreId)
  );

  selectElement.value = hasSelectedStore ? selectedStoreId : "";
  selectElement.disabled = stores.length === 0;
}

function getItemStoreName(item) {
  if (!item?.storeId) {
    return "";
  }

  return currentStores.find(
    (store) => String(store.id) === String(item.storeId)
  )?.name ?? "";
}

function roomOptions() {
  return currentRooms.map((room) => ({
    value: room.id,
    text: room.name
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
        text: item.name
      }));

    if (options.length > 0) {
      groups.push({
        label: productType.name,
        options
      });
    }
  });

  const groupedIds = new Set(
    groups.flatMap((group) => group.options.map((option) => String(option.value)))
  );

  const remainingOptions = activeCatalogueItems()
    .filter((item) => !groupedIds.has(String(item.id)))
    .sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")))
    .map((item) => ({
      value: item.id,
      text: item.name
    }));

  if (remainingOptions.length > 0) {
    groups.push({
      label: "Product type not set",
      options: remainingOptions
    });
  }

  return groups;
}

function getItemName(itemId) {
  const item = currentItems.find(
    (candidate) => String(candidate.id) === String(itemId)
  );

  return item?.name ?? "Item not set";
}

function getStoreName(storeId) {
  const store = currentStores.find(
    (candidate) => String(candidate.id) === String(storeId)
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
        text: productType.name
      }));

    if (options.length > 0) {
      groups.push({
        label: storeType.name,
        options
      });
    }
  });

  const unassignedOptions = currentProductTypes
    .filter((productType) => productTypeStoreTypeIds(productType).length === 0)
    .sort(sortBySavedOrderThenName)
    .map((productType) => ({
      value: productType.id,
      text: productType.name
    }));

  if (unassignedOptions.length > 0) {
    groups.push({
      label: "Store type not set",
      options: unassignedOptions
    });
  }

  return groups;
}

function unitOptions() {
  return currentUnits.map((unit) => ({
    value: unit.id,
    text: `${unit.name} (${unit.symbol})`
  }));
}

function getStoreTypeName(storeTypeId) {
  const storeType = currentStoreTypes.find(
    (candidate) => candidate.id === storeTypeId
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
    (candidateId) => String(candidateId) === String(storeTypeId)
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
    productTypeId
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
    productTypeBelongsToStoreType(productType, storeTypeId)
  );
}

function getOrderedProductTypesForShoppingTarget(storeTypeId, store = null) {
  const productTypes = getProductTypesForStoreType(storeTypeId);

  return productTypes.sort(
    store
      ? sortProductTypesForStore(store, storeTypeId)
      : sortProductTypesForStoreType(storeTypeId)
  );
}

function createStoreProductTypeOrderRow(productType) {
  const row = document.createElement("div");
  row.className = "settings-list-item settings-order-row store-product-type-order-row";
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
  row.append(handle, text);

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
    message.textContent = "Choose and save a store type before setting product type order.";
    wrapper.append(message);
    return wrapper;
  }

  const productTypesForStore = getProductTypesForStoreType(store.storeTypeId)
    .sort(sortProductTypesForStore(store, store.storeTypeId));

  if (productTypesForStore.length === 0) {
    const message = document.createElement("p");
    message.className = "settings-help-text";
    message.textContent = "No product types are associated with this store type yet.";
    wrapper.append(message);
    return wrapper;
  }

  const list = document.createElement("div");
  list.className = "store-product-type-order-list";
  list.dataset.storeId = store.id;

  productTypesForStore.forEach((productType) => {
    list.append(createStoreProductTypeOrderRow(productType));
  });

  wrapper.append(list);

  const resetButton = document.createElement("button");
  resetButton.type = "button";
  resetButton.className = "settings-secondary-button store-product-type-reset-button";
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

  queueMicrotask(() => {
    enableStoreProductTypeOrdering(list, store);
  });

  return wrapper;
}

async function saveStoreProductTypeOrder(groupList, store) {
  const scrollY = window.scrollY;

  const rows = Array.from(
    groupList.querySelectorAll(".settings-order-row")
  );

  const productTypeOrders = {
    ...(store.productTypeOrders ?? {})
  };

  rows.forEach((row, index) => {
    productTypeOrders[row.dataset.documentId] = index;
  });

  await updateDoc(householdDocument("stores", store.id), {
    productTypeOrders,
    updatedAt: serverTimestamp()
  });

  restoreScrollPosition(scrollY);
}

async function resetStoreProductTypeOrder(store) {
  const scrollY = window.scrollY;

  await updateDoc(householdDocument("stores", store.id), {
    productTypeOrders: {},
    updatedAt: serverTimestamp()
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
    delay: 160,
    delayOnTouchOnly: true,
    touchStartThreshold: 4,
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
    }
  });

  settingsSortables.set(sortableKey, sortable);
}

function getProductTypeStoreTypeIdsFromForm() {
  return Array.from(
    productTypeStoreTypesContainer.querySelectorAll("input[type='checkbox']:checked")
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

  const selectedValues = new Set(
    selectedStoreTypeIds.map((id) => String(id))
  );

  if (currentStoreTypes.length === 0) {
    container.innerHTML = "<p>No store types are available.</p>";
    return;
  }

  currentStoreTypes.forEach((storeType) => {
    const { optionLabel } = createSettingsCheckboxOption({
      value: storeType.id,
      text: storeType.name,
      checked: selectedValues.has(String(storeType.id))
    });

    container.append(optionLabel);
  });
}

async function saveSettingsOrder({
  listElement,
  collectionName
}) {
  const rows = Array.from(
    listElement.querySelectorAll(".settings-order-row")
  );

  const batch = writeBatch(db);

  rows.forEach((row, index) => {
    const documentRef = householdDocument(
      collectionName,
      row.dataset.documentId
    );

    batch.update(documentRef, {
      sortOrder: index,
      updatedAt: serverTimestamp()
    });
  });

  await batch.commit();
}

async function saveProductTypeGroupOrder(groupList, storeTypeId) {
  const scrollY = window.scrollY;

  const rows = Array.from(
    groupList.querySelectorAll(".settings-order-row")
  );

  const batch = writeBatch(db);
  const orderField = `storeTypeOrders.${storeTypeId}`;

  rows.forEach((row, index) => {
    batch.update(householdDocument("productTypes", row.dataset.documentId), {
      [orderField]: index,
      updatedAt: serverTimestamp()
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
      behavior: "auto"
    });
  });
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
    delay: 160,
    delayOnTouchOnly: true,
    touchStartThreshold: 4,
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
    }
  });

  settingsSortables.set(sortableKey, sortable);
}

function enableSettingsOrdering({
  listElement,
  collectionName
}) {
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
    delay: 160,
    delayOnTouchOnly: true,
    touchStartThreshold: 4,
    ghostClass: "settings-sort-ghost",
    chosenClass: "settings-sort-chosen",
    onEnd: async (event) => {
      if (event.oldIndex === event.newIndex) {
        return;
      }

      try {
        await saveSettingsOrder({
          listElement,
          collectionName
        });
      } catch (error) {
        console.error("Could not save order:", error);
        alert("The new order could not be saved.");
      }
    }
  });

  settingsSortables.set(sortableKey, sortable);
}

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
  extraContent = null
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
      }
    });

    listElement.append(row);

    appendSettingsEditPanel({
      listElement,
      settingsKey,
      item,
      fields,
      onSave,
      extraContent
    });
  });

  enableSettingsOrdering({
    listElement,
    collectionName
  });
}

function renderSettingsLists() {
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
        value: () => rooms.find((room) => room.id === editingSettingsId)?.name ?? ""
      }
    ],
    onSave: async (values, room) => {
      if (!values.name) {
        throw new Error("Please enter a room name.");
      }

      await updateDoc(householdDocument("locations", room.id), {
        name: values.name,
        updatedAt: serverTimestamp()
      });
    },
    onDelete: deactivateRoom
  });

  needingRoomsList.innerHTML = "";

  const regularButton = document.createElement("button");
  regularButton.type = "button";
  regularButton.className = "room-button shopping-location-option regular-room-button";
  regularButton.textContent = "Regular stuff";
  regularButton.addEventListener("click", () => {
    recordAppNavigation();
    openRegularRoom();
  });
  needingRoomsList.append(regularButton);

  if (rooms.length === 0) {
    return;
  }

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
        value: () => units.find((unit) => unit.id === editingSettingsId)?.symbol ?? ""
      }
    ],
    onSave: async (values, unit) => {
      if (!values.symbol) {
        throw new Error("Please enter a unit symbol.");
      }

      await updateDoc(householdDocument("units", unit.id), {
        name: values.symbol,
        symbol: values.symbol,
        displayMode: values.symbol === "×" ? "multiplier" : "suffix",
        updatedAt: serverTimestamp()
      });
    },
    onDelete: deactivateUnit
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
        value: () => storeTypes.find((storeType) => storeType.id === editingSettingsId)?.name ?? ""
      }
    ],
    onSave: async (values, storeType) => {
      if (!values.name) {
        throw new Error("Please enter a store type name.");
      }

      await updateDoc(householdDocument("storeTypes", storeType.id), {
        name: values.name,
        updatedAt: serverTimestamp()
      });
    },
    onDelete: deactivateStoreType
  });

  populateStoreTypeDropdowns();
  renderStores(currentStores);
  renderProductTypes(currentProductTypes);
  renderShoppingLocations();
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
        value: () => stores.find((store) => store.id === editingSettingsId)?.name ?? ""
      },
      {
        key: "storeTypeId",
        label: "Store type",
        type: "select",
        emptyText: "Choose a store type",
        options: storeTypeOptions,
        value: () => stores.find((store) => store.id === editingSettingsId)?.storeTypeId ?? ""
      }
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
        updatedAt: serverTimestamp()
      });
    },
    onDelete: deactivateStore,
    extraContent: (store) => createStoreProductTypeOrderPanel(store)
  });

  renderShoppingLocations();
  populateItemStoreSelect(
    itemStoreSelect,
    itemProductTypeSelect?.value,
    itemStoreSelect?.value
  );
  populateItemStoreSelect(
    settingsItemStoreSelect,
    settingsItemProductTypeSelect?.value,
    settingsItemStoreSelect?.value
  );
}

function productTypeEditFields(productTypes) {
  return [
    {
      key: "name",
      label: "Product type name",
      maxLength: 50,
      value: () => productTypes.find((productType) => productType.id === editingSettingsId)?.name ?? ""
    },
    {
      key: "storeTypeIds",
      label: "Store types",
      type: "checkboxes",
      options: storeTypeOptions,
      value: () => {
        const productType = productTypes.find(
          (candidate) => candidate.id === editingSettingsId
        );

        return productType ? productTypeStoreTypeIds(productType) : [];
      }
    }
  ];
}

async function cleanStoreProductTypeOrdersForProductType(
  batch,
  productTypeId,
  validStoreTypeIds
) {
  const validStoreTypeIdSet = new Set(
    validStoreTypeIds.map((storeTypeId) => String(storeTypeId))
  );

  currentStores.forEach((store) => {
    if (!storeProductTypeOrderContains(store, productTypeId)) {
      return;
    }

    if (validStoreTypeIdSet.has(String(store.storeTypeId))) {
      return;
    }

    batch.update(householdDocument("stores", store.id), {
      [`productTypeOrders.${productTypeId}`]: deleteField(),
      updatedAt: serverTimestamp()
    });
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
      storeTypeIds
    ),
    updatedAt: serverTimestamp()
  });

  await cleanStoreProductTypeOrdersForProductType(
    batch,
    productType.id,
    storeTypeIds
  );

  await batch.commit();
}

function appendProductTypeGroup({
  storeTypeId,
  headingText,
  productTypes
}) {
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
      }
    });

    groupList.append(row);

    appendSettingsEditPanel({
      listElement: groupList,
      settingsKey: "product-types",
      contextId: storeTypeId,
      item: productType,
      fields: productTypeEditFields(currentProductTypes),
      onSave: saveProductType
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
        productTypeBelongsToStoreType(productType, storeType.id)
      )
      .sort(sortProductTypesForStoreType(storeType.id));

    if (productTypesForStoreType.length === 0) {
      return;
    }

    appendProductTypeGroup({
      storeTypeId: storeType.id,
      headingText: storeType.name,
      productTypes: productTypesForStoreType
    });
  });

  const unassignedProductTypes = productTypes
    .filter((productType) => productTypeStoreTypeIds(productType).length === 0)
    .sort(sortBySavedOrderThenName);

  if (unassignedProductTypes.length > 0) {
    appendProductTypeGroup({
      storeTypeId: "unassigned",
      headingText: "Store type not set",
      productTypes: unassignedProductTypes
    });
  }

  populateProductTypeDropdown();
  renderRoomItems();
  renderSettingsItems();
  renderGettingItems();
}

function getRoomName(roomId) {
  const room = currentRooms.find(
    (candidate) => String(candidate.id) === String(roomId)
  );

  return room?.name ?? "Room not set";
}

function getUnitDisplay(unitId) {
  const unit = currentUnits.find(
    (candidate) => String(candidate.id) === String(unitId)
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
    getItemStoreName(item)
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
    storeName
  ]
    .filter(Boolean)
    .some((value) =>
      String(value).toLowerCase().includes(searchText)
    );
}

function showBriefToast(message) {
  document
    .querySelectorAll(".brief-toast")
    .forEach((toast) => toast.remove());

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
      updatedAt: serverTimestamp()
    });

    showBriefToast(
      nextValue
        ? "Added to regular list"
        : "Removed from regular list"
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
      : `Add ${item.name} to regular list`
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
      `${item.name} is currently on the needed list. Remove all generic and specific entries for it before removing it from Items.`
    );
    return;
  }

  const linkedSpecificProducts = currentSpecificProducts.filter(
    (product) => String(product.itemId) === String(item.id)
  );

  if (linkedSpecificProducts.length > 0) {
    showDependencyBlock(item.name, [
      dependencyListLine(
        "Specific products linked to this item",
        dependencyNames(
          linkedSpecificProducts,
          (product) => product.name
        )
      )
    ]);
    return;
  }

  if (
    !window.confirm(
      `Remove ${item.name}?\n\nThis will remove it from normal item lists.`
    )
  ) {
    return;
  }

  await updateDoc(householdDocument("items", item.id), {
    active: false,
    updatedAt: serverTimestamp()
  });

  if (
    editingSettingsKey === "items" &&
    editingSettingsId === item.id
  ) {
    editingSettingsKey = null;
    editingSettingsId = null;
    editingSettingsContextId = null;
  }
}

function createSettingsItemRow(item) {
  const row = document.createElement("div");
  row.className = "settings-list-item settings-item-edit-row";

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
    }
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
    }
  });

  actions.append(regularButton, editButton, deleteButton);
  row.append(text, actions);

  return row;
}

function itemEditFields(items) {
  return [
    {
      key: "name",
      label: "Item name",
      maxLength: 80,
      value: () => items.find((item) => item.id === editingSettingsId)?.name ?? ""
    },
    {
      key: "locationId",
      label: "Room",
      type: "select",
      emptyText: "Choose a room",
      options: roomOptions,
      value: () => items.find((item) => item.id === editingSettingsId)?.locationId ?? ""
    },
    {
      key: "productTypeId",
      label: "Product type",
      type: "select",
      emptyText: "Choose a product type",
      options: productTypeOptions,
      value: () => items.find((item) => item.id === editingSettingsId)?.productTypeId ?? ""
    },
    {
      key: "storeId",
      label: "Store (optional)",
      type: "select",
      required: false,
      emptyText: "Any matching store",
      options: () => {
        const item = items.find(
          (candidate) => candidate.id === editingSettingsId
        );

        return itemStoreOptions(item?.productTypeId ?? "");
      },
      value: () => items.find((item) => item.id === editingSettingsId)?.storeId ?? ""
    },
    {
      key: "specificAttributes",
      label: "Specific Attributes (optional)",
      required: false,
      maxLength: 100,
      placeholder: "e.g. 2 L, gluten-free, fragrance-free",
      value: () =>
        items.find(
          (item) => item.id === editingSettingsId
        )?.specificAttributes ?? ""
    },
    {
      key: "defaultAmount",
      label: "Amount",
      type: "number",
      min: 0,
      step: "any",
      value: () => items.find((item) => item.id === editingSettingsId)?.defaultAmount ?? 1
    },
    {
      key: "unitId",
      label: "Unit",
      type: "select",
      emptyText: null,
      options: unitOptions,
      value: () => {
        const item = items.find((candidate) => candidate.id === editingSettingsId);
        return item?.unitId ?? currentUnits[0]?.id ?? "";
      }
    },
    {
      key: "increment",
      label: "Step",
      type: "number",
      min: 0.01,
      step: "any",
      value: () => items.find((item) => item.id === editingSettingsId)?.increment ?? 1
    }
  ];
}

async function saveSettingsItem(values, item) {
  const selectedProductType = currentProductTypes.find(
    (productType) => String(productType.id) === String(values.productTypeId)
  );

  const inheritedStoreTypeIds = selectedProductType
    ? productTypeStoreTypeIds(selectedProductType)
    : [];

  if (
    !values.name ||
    !values.locationId ||
    !values.productTypeId ||
    !values.unitId ||
    !Number.isFinite(values.defaultAmount) ||
    !Number.isFinite(values.increment) ||
    values.increment <= 0
  ) {
    throw new Error("Please complete all required fields.");
  }

  if (inheritedStoreTypeIds.length === 0) {
    throw new Error("Please choose a product type that has at least one store type set.");
  }

  if (!itemStoreIsAllowed(values.productTypeId, values.storeId)) {
    throw new Error("Please choose a store that matches the selected product type.");
  }

  await updateDoc(householdDocument("items", item.id), {
    name: values.name,
    locationId: values.locationId,
    productTypeId: values.productTypeId,
    storeId: values.storeId || null,
    specificAttributes: values.specificAttributes ?? "",
    defaultAmount: values.defaultAmount,
    unitId: values.unitId,
    increment: values.increment,
    updatedAt: serverTimestamp()
  });
}

function appendSettingsItemEditPanel(item, listElement) {
  appendSettingsEditPanel({
    listElement,
    settingsKey: "items",
    item,
    fields: itemEditFields(currentItems),
    onSave: saveSettingsItem,
    extraContent: (_item, inputMap) => {
      const productTypeSelect = inputMap.get("productTypeId")?.input;
      const storeSelect = inputMap.get("storeId")?.input;

      populateItemStoreSelect(
        storeSelect,
        productTypeSelect?.value ?? "",
        storeSelect?.value ?? ""
      );

      productTypeSelect?.addEventListener("change", () => {
        populateItemStoreSelect(
          storeSelect,
          productTypeSelect.value,
          storeSelect?.value ?? ""
        );
      });

      return null;
    }
  });
}

function recordedStoreNames(storeIds = []) {
  if (!Array.isArray(storeIds) || storeIds.length === 0) {
    return "";
  }

  return storeIds
    .map((storeId) =>
      currentStores.find(
        (store) => String(store.id) === String(storeId)
      )?.name ?? ""
    )
    .map((name) => String(name).trim())
    .filter(Boolean)
    .join(", ");
}

function specificProductSublabel(product, { includeItem = true } = {}) {
  const parts = [
    includeItem ? getItemName(product.itemId) : "",
    product.specificAttributes ?? product.size,
    recordedStoreNames(product.storeIds)
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
    recordedStoreNames(product.storeIds)
  ]
    .map((value) => String(value ?? "").toLowerCase())
    .some((value) => value.includes(searchText));
}

function createSettingsSpecificProductRow(
  product,
  { nested = false } = {}
) {
  const row = document.createElement("div");
  row.className =
    "settings-list-item settings-specific-product-row";

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
    includeItem: !nested
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
    className:
      "settings-row-icon-button settings-row-edit-button",
    icon: "✏️",
    label: `Edit ${product.name}`,
    onClick: () => {
      setEditingSettings("specific-products", product.id);
    }
  });

  const deleteButton = createIconButton({
    className:
      "settings-row-icon-button settings-row-delete-button",
    icon: "🗑️",
    label: `Delete ${product.name}`,
    onClick: async () => {
      if (specificNeededEntryForProduct(product.id)) {
        alert(
          `${product.name} is currently on the needed list. Remove it from the needed list before deleting it.`
        );
        return;
      }

      if (!confirmSettingsDelete(product.name)) {
        return;
      }

      await deleteSettingsDocument(
        "specificProducts",
        product.id
      );
    }
  });

  actions.append(editButton, deleteButton);
  row.append(text, actions);

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
        products.find(
          (product) => product.id === editingSettingsId
        )?.itemId ?? ""
    },
    {
      key: "name",
      label: "Product name",
      maxLength: 100,
      value: () =>
        products.find(
          (product) => product.id === editingSettingsId
        )?.name ?? ""
    },
    {
      key: "specificAttributes",
      label: "Specific Attributes (optional)",
      required: false,
      maxLength: 100,
      placeholder: "e.g. 2 L, gluten-free, fragrance-free",
      value: () => {
        const product = products.find(
          (candidate) => candidate.id === editingSettingsId
        );

        return product?.specificAttributes ?? product?.size ?? "";
      }
    },
    {
      key: "storeIds",
      label: "Stores",
      type: "checkboxes",
      options: storeOptions,
      required: false,
      value: () =>
        products.find(
          (product) => product.id === editingSettingsId
        )?.storeIds ?? []
    }
  ];
}

async function saveSettingsSpecificProduct(values, product) {
  if (!values.itemId || !values.name) {
    throw new Error(
      "Please choose an item and enter a product name."
    );
  }

  await updateDoc(
    householdDocument("specificProducts", product.id),
    {
      itemId: values.itemId,
      name: values.name,
      specificAttributes: values.specificAttributes ?? "",
      storeIds: values.storeIds ?? [],
      updatedAt: serverTimestamp()
    }
  );
}

function appendSettingsSpecificProductEditPanel(
  product,
  listElement
) {
  const panel = appendSettingsEditPanel({
    listElement,
    settingsKey: "specific-products",
    item: product,
    fields: specificProductEditFields(
      currentSpecificProducts
    ),
    onSave: saveSettingsSpecificProduct
  });

  if (panel) {
    panel.classList.add(
      "settings-item-specific-product-edit-panel"
    );
  }
}

function activeSpecificProductsForSettingsItem(itemId) {
  return currentSpecificProducts
    .filter(
      (product) =>
        product.active !== false &&
        String(product.itemId) === String(itemId)
    )
    .sort((a, b) =>
      String(a.name ?? "").localeCompare(String(b.name ?? ""))
    );
}

function settingsItemRecord(item, searchText) {
  const products = activeSpecificProductsForSettingsItem(item.id);

  if (!searchText) {
    return {
      item,
      products
    };
  }

  const itemMatches = itemMatchesSettingsSearch(item, searchText);
  const matchingProducts = products.filter((product) =>
    specificProductMatchesSearch(product, searchText)
  );

  if (!itemMatches && matchingProducts.length === 0) {
    return null;
  }

  return {
    item,
    products: itemMatches ? products : matchingProducts
  };
}

function appendSettingsSpecificProductsUnderItem({
  itemRecord,
  listElement
}) {
  if (itemRecord.products.length === 0) {
    return;
  }

  itemRecord.products.forEach((product) => {
    listElement.append(
      createSettingsSpecificProductRow(product, {
        nested: true
      })
    );

    appendSettingsSpecificProductEditPanel(
      product,
      listElement
    );
  });
}

function appendSettingsItemRecord(itemRecord, listElement) {
  listElement.append(createSettingsItemRow(itemRecord.item));
  appendSettingsItemEditPanel(itemRecord.item, listElement);
  appendSettingsSpecificProductsUnderItem({
    itemRecord,
    listElement
  });
}

function appendSettingsItemsForProductType({
  container,
  productType,
  itemRecords,
  renderedItemIds
}) {
  const productTypeItems = itemRecords
    .filter(
      ({ item }) =>
        String(item.productTypeId) === String(productType.id)
    )
    .sort((a, b) =>
      String(a.item.name ?? "").localeCompare(
        String(b.item.name ?? "")
      )
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

  const searchText = (settingsItemsSearch?.value ?? "")
    .trim()
    .toLowerCase();

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
      renderedItemIds
    });
  });

  const ungroupedItems = itemRecords
    .filter(({ item }) => !renderedItemIds.has(item.id))
    .sort((a, b) =>
      String(a.item.name ?? "").localeCompare(
        String(b.item.name ?? "")
      )
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
function populateSettingsItemRoomSelect(selectedRoomId = settingsItemRoomSelect?.value ?? "") {
  if (!settingsItemRoomSelect) {
    return;
  }

  settingsItemRoomSelect.innerHTML = '<option value="">Choose a room</option>';

  currentRooms.forEach((room) => {
    const option = document.createElement("option");
    option.value = room.id;
    option.textContent = room.name;
    settingsItemRoomSelect.append(option);
  });

  if (currentRooms.some((room) => String(room.id) === String(selectedRoomId))) {
    settingsItemRoomSelect.value = selectedRoomId;
  }
}

function populateSettingsItemUnitSelect(selectedUnitId = settingsItemUnitSelect?.value ?? "") {
  if (!settingsItemUnitSelect) {
    return;
  }

  settingsItemUnitSelect.innerHTML = "";

  currentUnits.forEach((unit) => {
    const option = document.createElement("option");
    option.value = unit.id;
    option.textContent = unit.symbol;
    option.dataset.increment = unit.defaultIncrement ?? 1;
    settingsItemUnitSelect.append(option);
  });

  if (currentUnits.some((unit) => String(unit.id) === String(selectedUnitId))) {
    settingsItemUnitSelect.value = selectedUnitId;
  } else if (currentUnits.length > 0) {
    settingsItemUnitSelect.value = currentUnits[0].id;
  }

  updateSettingsItemIncrementFromUnit();
}

function updateSettingsItemIncrementFromUnit() {
  if (!settingsItemUnitSelect || !settingsItemIncrementInput) {
    return;
  }

  const selectedOption =
    settingsItemUnitSelect.options[settingsItemUnitSelect.selectedIndex];

  const suggestedIncrement = Number(selectedOption?.dataset.increment);

  if (Number.isFinite(suggestedIncrement)) {
    settingsItemIncrementInput.value = suggestedIncrement;
  }
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
    previousProductTypeId
  );
  populateSettingsItemUnitSelect(previousUnitId);
  populateItemStoreSelect(
    settingsItemStoreSelect,
    settingsItemProductTypeSelect?.value,
    previousStoreId
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
}

function createStoreCheckboxList(
  container,
  selectedStoreIds = [],
  {
    allowedStoreTypeIds = null,
    emptyMessage = "No stores are available."
  } = {}
) {
  if (!container) {
    return;
  }

  container.innerHTML = "";
  container.className = "settings-checkbox-list";

  const selectedValues = new Set(
    selectedStoreIds.map((id) => String(id))
  );

  const allowedStoreTypeIdSet = Array.isArray(
    allowedStoreTypeIds
  )
    ? new Set(
        allowedStoreTypeIds.map((id) => String(id))
      )
    : null;

  const availableStores = currentStores.filter(
    (store) =>
      !allowedStoreTypeIdSet ||
      allowedStoreTypeIdSet.has(
        String(store.storeTypeId)
      )
  );

  if (availableStores.length === 0) {
    container.innerHTML = `<p>${emptyMessage}</p>`;
    return;
  }

  availableStores.forEach((store) => {
    const { optionLabel } = createSettingsCheckboxOption({
      value: store.id,
      text: store.name,
      checked: selectedValues.has(String(store.id))
    });

    container.append(optionLabel);
  });
}

function getCheckedValues(container) {
  if (!container) {
    return [];
  }

  return Array.from(
    container.querySelectorAll("input[type='checkbox']:checked")
  ).map((checkbox) => checkbox.value);
}


function prepareQuickSpecificProductForm(item) {
  quickSpecificProductItemId = item.id;
  specificProductPanelTitle.textContent =
    `Add specific product to ${item.name}`;
  addSpecificProductForm.reset();

  const productType = currentProductTypes.find(
    (candidate) => candidate.id === item.productTypeId
  );

  const allowedStoreTypeIds = productType
    ? productTypeStoreTypeIds(productType)
    : [];

  createStoreCheckboxList(
    specificProductStoresContainer,
    [],
    {
      allowedStoreTypeIds,
      emptyMessage:
        "No stores are available for this item's product type."
    }
  );
}

function openSpecificProductQuickAdd(item) {
  if (!specificProductPanel || !addSpecificProductForm) {
    return;
  }

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

  if (specificProductPanel) {
    specificProductPanel.hidden = true;
  }
}


function appendProductTypeOptionsForStoreType({
  selectElement,
  storeType,
  selectedProductTypeId,
  selectedState
}) {
  const productTypesForStoreType = currentProductTypes
    .filter((productType) =>
      productTypeBelongsToStoreType(productType, storeType.id)
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
    hasSelected: false
  };

  currentStoreTypes.forEach((storeType) => {
    appendProductTypeOptionsForStoreType({
      selectElement,
      storeType,
      selectedProductTypeId,
      selectedState
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
  populateProductTypeSelect(itemProductTypeSelect, itemProductTypeSelect.value);

  if (settingsItemProductTypeSelect) {
    populateProductTypeSelect(
      settingsItemProductTypeSelect,
      settingsItemProductTypeSelect.value
    );
  }

  populateItemStoreSelect(
    itemStoreSelect,
    itemProductTypeSelect?.value,
    itemStoreSelect?.value
  );
  populateItemStoreSelect(
    settingsItemStoreSelect,
    settingsItemProductTypeSelect?.value,
    settingsItemStoreSelect?.value
  );
}

function selectedItemUnitIncrement() {
  const selectedOption = itemUnitSelect.options[itemUnitSelect.selectedIndex];
  const suggestedIncrement = Number(selectedOption?.dataset.increment);

  return Number.isFinite(suggestedIncrement)
    ? suggestedIncrement
    : 1;
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
  itemUnitSelect.innerHTML = "";

  currentUnits.forEach((unit) => {
    const option = document.createElement("option");
    option.value = unit.id;
    option.textContent = unit.symbol;
    option.dataset.increment = unit.defaultIncrement ?? 1;
    itemUnitSelect.append(option);
  });

  const hasSelectedUnit = currentUnits.some(
    (unit) => String(unit.id) === String(selectedUnitId)
  );

  if (hasSelectedUnit) {
    itemUnitSelect.value = selectedUnitId;
  } else if (currentUnits.length > 0) {
    applyDefaultItemUnit();
  }

  populateSettingsItemUnitSelect();
}

function resetNewItemForm() {
  addItemForm.reset();
  itemDefaultAmountInput.value = 1;
  applyDefaultItemUnit();
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


function specificProductsForItem(itemId) {
  return currentSpecificProducts
    .filter((product) =>
      product.active !== false &&
      String(product.itemId) === String(itemId)
    )
    .sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")));
}

function specificProductDetailText(product) {
  return [
    product.specificAttributes ?? product.size,
    recordedStoreNames(product.storeIds)
  ]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(" · ");
}

function specificProductForNeededEntry(neededEntry) {
  if (!neededEntry?.specificProductId) {
    return null;
  }

  return currentSpecificProducts.find(
    (product) => String(product.id) === String(neededEntry.specificProductId)
  ) ?? null;
}


function allNeededEntries() {
  return Array.from(currentNeededEntries.values());
}

function genericNeededEntryForItem(itemId) {
  return allNeededEntries().find(
    (entry) =>
      String(entry.itemId ?? entry.id) === String(itemId) &&
      !entry.specificProductId
  ) ?? null;
}

function specificNeededEntryForProduct(productId) {
  return allNeededEntries().find(
    (entry) =>
      entry.specificProductId &&
      String(entry.specificProductId) === String(productId)
  ) ?? null;
}

function neededEntriesForItem(itemId) {
  return allNeededEntries().filter(
    (entry) => String(entry.itemId ?? entry.id) === String(itemId)
  );
}

function itemHasAnyNeededEntry(itemId) {
  return neededEntriesForItem(itemId).length > 0;
}

function specificNeededEntryDocumentId(productId) {
  return `specific-${productId}`;
}

function itemForNeededEntry(entry) {
  return currentItems.find(
    (item) => String(item.id) === String(entry.itemId ?? entry.id)
  ) ?? null;
}

function neededRecordForEntry(entry) {
  const item = itemForNeededEntry(entry);

  if (!item || item.active === false) {
    return null;
  }

  return {
    item,
    entry,
    specificProduct: specificProductForNeededEntry(entry)
  };
}

function currentNeededRecords() {
  return allNeededEntries()
    .map(neededRecordForEntry)
    .filter(Boolean);
}

function neededRecordMatchesSearch(record, searchText) {
  if (!searchText) {
    return true;
  }

  const productType = currentProductTypes.find(
    (candidate) =>
      String(candidate.id) === String(record.item.productTypeId)
  );

  return [
    record.item.name,
    record.item.specificAttributes,
    productType?.name,
    record.specificProduct?.name,
    specificProductDetailText(record.specificProduct ?? {})
  ]
    .map((value) => String(value ?? '').toLowerCase())
    .some((value) => value.includes(searchText));
}

function compareNeededRecords(a, b) {
  const itemNameDifference = String(a.item.name ?? '')
    .localeCompare(String(b.item.name ?? ''));

  if (itemNameDifference !== 0) {
    return itemNameDifference;
  }

  if (!a.specificProduct && b.specificProduct) {
    return -1;
  }

  if (a.specificProduct && !b.specificProduct) {
    return 1;
  }

  return String(a.specificProduct?.name ?? '')
    .localeCompare(String(b.specificProduct?.name ?? ''));
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

function neededRecordIsAvailableAtStore(record, storeId) {
  if (!storeId) {
    return true;
  }

  const specificStoreIds = Array.isArray(record.specificProduct?.storeIds)
    ? record.specificProduct.storeIds
    : [];

  if (specificStoreIds.length > 0) {
    return specificStoreIds.some(
      (candidateId) => String(candidateId) === String(storeId)
    );
  }

  return (
    !record.item.storeId ||
    String(record.item.storeId) === String(storeId)
  );
}

async function migrateLegacySpecificEntryBeforeGenericAdd(item) {
  const legacyEntry = currentNeededEntries.get(item.id);

  if (!legacyEntry?.specificProductId) {
    return;
  }

  const { id, ...entryData } = legacyEntry;
  const replacementId = specificNeededEntryDocumentId(
    legacyEntry.specificProductId
  );

  const batch = writeBatch(db);

  batch.set(
    householdDocument('neededEntries', replacementId),
    {
      ...entryData,
      itemId: item.id,
      adjustedAt: serverTimestamp()
    },
    { merge: true }
  );

  batch.delete(householdDocument('neededEntries', item.id));
  await batch.commit();
}

function createItemNameDisplay(
  item,
  specificProduct = null,
  { includeParentName = false } = {}
) {
  const wrapper = document.createElement("span");
  wrapper.className = "item-name-display";

  if (specificProduct) {
    wrapper.classList.add("is-specific-product");
  }

  const name = document.createElement("span");
  name.className = "item-name";
  name.textContent = specificProduct
    ? includeParentName
      ? `${item.name} ${specificProduct.name}`
      : specificProduct.name
    : item.name;
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

  return wrapper;
}

function renderRoomItems() {
  roomItemsList.innerHTML = "";

  if (!selectedRoomId) {
    return;
  }

  const roomSearchText = roomItemsSearch?.value.trim().toLowerCase() ?? "";

  const allRoomItems = currentItems.filter((item) => {
    if (item.active === false) {
      return false;
    }

    if (isRegularRoomSelected()) {
      return itemIsRegular(item);
    }

    return item.locationId === selectedRoomId;
  });

  const roomItems = allRoomItems.filter((item) => {
    if (!roomSearchText) {
      return true;
    }

    const productType = currentProductTypes.find(
      (candidate) =>
        String(candidate.id) === String(item.productTypeId)
    );

    const specificProductText = specificProductsForItem(item.id)
      .flatMap((product) => [
        product.name,
        specificProductDetailText(product)
      ])
      .join(" ");

    return `${item.name} ${item.specificAttributes ?? ""} ${productType?.name ?? ""} ${specificProductText}`
      .toLowerCase()
      .includes(roomSearchText);
  });

  if (allRoomItems.length === 0) {
    roomItemsList.innerHTML =
      "<p>No items have been created for this room yet.</p>";
    return;
  }

  if (roomItems.length === 0) {
    roomItemsList.innerHTML = "<p>No matching room items.</p>";
    return;
  }

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

  function createQuantityControls(item, neededEntry, labelName) {
    const controls = document.createElement("div");
    controls.className = "room-item-controls";

    const amountDisplay = document.createElement("strong");
    amountDisplay.className = "room-current-quantity";
    amountDisplay.textContent = formatAmount(
      neededEntry.amount,
      neededEntry.unitId
    );

    const increaseButton = createIconButton({
      className: "room-icon-button increase-needed-button",
      icon: "+",
      label: `Increase ${labelName}`,
      onClick: async () => {
        disableButtons(controlButtons);
        await changeNeededAmount(
          item,
          neededEntry,
          item.increment ?? 1
        );
      }
    });

    const decreaseButton = createIconButton({
      className: "room-icon-button decrease-needed-button",
      icon: "−",
      label: `Decrease ${labelName}`,
      onClick: async () => {
        disableButtons(controlButtons);
        await changeNeededAmount(
          item,
          neededEntry,
          -(item.increment ?? 1)
        );
      }
    });

    const controlButtons = [
      increaseButton,
      decreaseButton
    ];

    return {
      amountDisplay,
      controls,
      buttons: [increaseButton, decreaseButton]
    };
  }

  function appendSpecificProductRows(item) {
    specificProductsForItem(item.id).forEach((product) => {
      const neededEntry = specificNeededEntryForProduct(product.id);
      const isNeeded = Boolean(neededEntry);

      const row = document.createElement("div");
      row.className =
        "item-row room-item-row specific-product-offer-row";
      row.classList.add(isNeeded ? "is-needed" : "is-available");

      const details = document.createElement("div");
      details.className = "item-row-details";
      details.append(createItemNameDisplay(item, product));

      const controls = document.createElement("div");
      controls.className = "room-item-controls";

      if (!isNeeded) {
        const addButton = createIconButton({
          className:
            "room-icon-button room-add-button add-needed-button",
          icon: "Add",
          label: `Add ${item.name} ${product.name} to needed list`,
          onClick: async () => {
            await addSpecificProductToNeededList(item, product);
          }
        });

        controls.append(addButton);
      } else {
        const quantity = createQuantityControls(
          item,
          neededEntry,
          `${item.name} ${product.name}`
        );

        details.append(quantity.amountDisplay);
        controls.append(...quantity.buttons);
      }

      row.append(details, controls);
      roomItemsList.append(row);
    });
  }

  function appendRoomItemRow(item) {
    const neededEntry = genericNeededEntryForItem(item.id);
    const isNeeded = Boolean(neededEntry);

    const row = document.createElement("div");
    row.className = "item-row room-item-row";
    row.classList.add(isNeeded ? "is-needed" : "is-available");

    addLongPressHandler(
      row,
      () => {
        openSpecificProductQuickAdd(item);
      },
      {
        duration: 320,
        ignoreSelector: "button, input, select, textarea"
      }
    );

    const details = document.createElement("div");
    details.className = "item-row-details";
    details.append(createItemNameDisplay(item));

    const controls = document.createElement("div");
    controls.className = "room-item-controls";

    if (!isNeeded) {
      const addButton = createIconButton({
        className:
          "room-icon-button room-add-button add-needed-button",
        icon: "Add",
        label: `Add ${item.name} to needed list`,
        onClick: async () => {
          await addItemToNeededList(item);
        }
      });

      controls.append(addButton);
    } else {
      const quantity = createQuantityControls(
        item,
        neededEntry,
        item.name
      );

      details.append(quantity.amountDisplay);
      controls.append(...quantity.buttons);
    }

    row.append(details, controls);
    roomItemsList.append(row);
    appendSpecificProductRows(item);
    renderedItemIds.add(item.id);
  }

  function appendProductTypeBlock(productType) {
    roomItems
      .filter(
        (item) =>
          String(item.productTypeId) === String(productType.id)
      )
      .sort(sortItemsByNeedThenName)
      .forEach(appendRoomItemRow);
  }

  orderedProductTypesForDefaultRoomView().forEach(
    appendProductTypeBlock
  );

  roomItems
    .filter((item) => !renderedItemIds.has(item.id))
    .sort(sortItemsByNeedThenName)
    .forEach(appendRoomItemRow);
}

function disableButtons(buttons) {
  buttons.forEach((button) => {
    button.disabled = true;
  });
}

function appendRoomItemEditPanel(item) {
  if (editingItemId !== item.id) {
    return;
  }

  const panel = document.createElement("section");
  panel.className = "room-item-edit-panel settings-form";

  const form = document.createElement("form");
  const fields = document.createElement("div");
  fields.className = "settings-form-fields";

  const nameLabel = document.createElement("label");
  nameLabel.textContent = "Item name";

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.required = true;
  nameInput.maxLength = 80;
  nameInput.value = item.name ?? "";
  nameLabel.append(nameInput);

  const productTypeLabel = document.createElement("label");
  productTypeLabel.textContent = "Product type";

  const productTypeSelect = document.createElement("select");
  productTypeSelect.required = true;
  populateProductTypeSelect(productTypeSelect, item.productTypeId);

  productTypeLabel.append(productTypeSelect);

  const amountRow = document.createElement("div");
  amountRow.className = "amount-unit-step-row";

  const amountLabel = document.createElement("label");
  amountLabel.textContent = "Amount";

  const amountInput = document.createElement("input");
  amountInput.type = "number";
  amountInput.required = true;
  amountInput.min = "0";
  amountInput.step = "any";
  amountInput.value = item.defaultAmount ?? 1;
  amountLabel.append(amountInput);

  const unitLabel = document.createElement("label");
  unitLabel.textContent = "Unit";

  const unitSelect = document.createElement("select");
  unitSelect.required = true;

  let unitSelected = false;

  currentUnits.forEach((unit) => {
    const option = document.createElement("option");
    option.value = unit.id;
    option.textContent = unit.symbol;

    if (unit.id === item.unitId) {
      option.selected = true;
      unitSelected = true;
    }

    unitSelect.append(option);
  });

  if (!unitSelected && currentUnits.length > 0) {
    unitSelect.value = currentUnits[0].id;
  }

  unitLabel.append(unitSelect);

  const incrementLabel = document.createElement("label");
  incrementLabel.textContent = "Step";

  const incrementInput = document.createElement("input");
  incrementInput.type = "number";
  incrementInput.required = true;
  incrementInput.min = "0.01";
  incrementInput.step = "any";
  incrementInput.value = item.increment ?? 1;
  incrementLabel.append(incrementInput);

  amountRow.append(amountLabel, unitLabel, incrementLabel);
  fields.append(nameLabel, productTypeLabel, amountRow);

  const actions = document.createElement("div");
  actions.className = "split-actions";

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.textContent = "Cancel";

  const saveButton = document.createElement("button");
  saveButton.type = "submit";
  saveButton.textContent = "Save";

  actions.append(cancelButton, saveButton);

  cancelButton.addEventListener("click", () => {
    editingItemId = null;
    renderRoomItems();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const nextName = nameInput.value.trim();
    const nextProductTypeId = productTypeSelect.value;
    const nextDefaultAmount = Number(amountInput.value);
    const nextUnitId = unitSelect.value;
    const nextIncrement = Number(incrementInput.value);

    const selectedProductType = currentProductTypes.find(
      (productType) => productType.id === nextProductTypeId
    );

    const inheritedStoreTypeIds = selectedProductType
      ? productTypeStoreTypeIds(selectedProductType)
      : [];

    if (
      !nextName ||
      !nextProductTypeId ||
      !nextUnitId ||
      !Number.isFinite(nextDefaultAmount) ||
      !Number.isFinite(nextIncrement) ||
      nextIncrement <= 0
    ) {
      alert("Please complete all required fields.");
      return;
    }

    if (inheritedStoreTypeIds.length === 0) {
      alert("Please choose a product type that has at least one store type set.");
      return;
    }

    saveButton.disabled = true;
    cancelButton.disabled = true;

    try {
      await updateDoc(householdDocument("items", item.id), {
        name: nextName,
        productTypeId: nextProductTypeId,
        defaultAmount: nextDefaultAmount,
        unitId: nextUnitId,
        increment: nextIncrement,
        updatedAt: serverTimestamp()
      });

      editingItemId = null;
      renderRoomItems();
    } catch (error) {
      console.error("Could not update item:", error);
      alert("The item could not be saved.");
    } finally {
      saveButton.disabled = false;
      cancelButton.disabled = false;
    }
  });

  form.append(fields, actions);
  panel.append(form);
  roomItemsList.append(panel);
  scrollEditFormToTop(panel);
  nameInput.focus();
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
    (productType) => String(productType.id) === String(item.productTypeId)
  );
}

function appendFullNeededItemRow(record) {
  const { item, entry, specificProduct } = record;

  const row = document.createElement("div");
  row.className = "item-row full-needed-item-row is-needed";

  if (specificProduct) {
    row.classList.add("specific-product-needed-row");
  }

  addLongPressHandler(
    row,
    () => {
      openSpecificProductQuickAdd(item);
    },
    {
      duration: 320,
      ignoreSelector: "button, input, select, textarea"
    }
  );

  const details = document.createElement("div");
  details.className = "item-row-details";
  details.append(
    createItemNameDisplay(item, specificProduct, {
      includeParentName: Boolean(specificProduct)
    })
  );

  const amountDisplay = document.createElement("strong");
  amountDisplay.className = "room-current-quantity";
  amountDisplay.textContent = formatAmount(
    entry.amount,
    entry.unitId
  );
  details.append(amountDisplay);

  const controls = document.createElement("div");
  controls.className = "room-item-controls full-needed-controls";

  const increaseButton = createIconButton({
    className: "room-icon-button increase-needed-button",
    icon: "+",
    label: `Increase ${item.name}`,
    onClick: async () => {
      disableButtons(buttons);
      await changeNeededAmount(
        item,
        entry,
        item.increment ?? 1
      );
    }
  });

  const decreaseButton = createIconButton({
    className: "room-icon-button decrease-needed-button",
    icon: "−",
    label: `Decrease ${item.name}`,
    onClick: async () => {
      disableButtons(buttons);
      await changeNeededAmount(
        item,
        entry,
        -(item.increment ?? 1)
      );
    }
  });

  const buttons = [
    increaseButton,
    decreaseButton
  ];

  controls.append(increaseButton, decreaseButton);
  row.append(details, controls);
  fullNeededItems.append(row);
}

function appendFullNeededProductGroup(productType, records) {
  const groupedRecords = records
    .filter(
      (record) =>
        String(record.item.productTypeId) === String(productType.id)
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

  const searchText = neededListSearch.value
    .trim()
    .toLowerCase();

  const neededRecords = currentNeededRecords()
    .filter((record) => neededRecordMatchesSearch(record, searchText));

  if (neededRecords.length === 0) {
    fullNeededItems.innerHTML =
      "<p>No matching needed items.</p>";
    return;
  }

  let renderedAny = false;

  currentStoreTypes.forEach((storeType) => {
    const storeTypeRecords = neededRecords.filter((record) => {
      const productType = productTypeForItem(record.item);

      return (
        productType &&
        productTypeBelongsToStoreType(productType, storeType.id)
      );
    });

    if (storeTypeRecords.length === 0) {
      return;
    }

    appendFullNeededStoreHeading(storeType.name);

    currentProductTypes
      .filter((productType) =>
        productTypeBelongsToStoreType(productType, storeType.id)
      )
      .sort(sortProductTypesForStoreType(storeType.id))
      .forEach((productType) => {
        if (
          appendFullNeededProductGroup(
            productType,
            storeTypeRecords
          )
        ) {
          renderedAny = true;
        }
      });
  });

  const unassignedRecords = neededRecords
    .filter((record) => {
      const productType = productTypeForItem(record.item);

      return (
        !productType ||
        productTypeStoreTypeIds(productType).length === 0
      );
    })
    .sort(compareNeededRecords);

  if (unassignedRecords.length > 0) {
    appendFullNeededStoreHeading("Store type not set");
    unassignedRecords.forEach(appendFullNeededItemRow);
    renderedAny = true;
  }

  if (!renderedAny) {
    fullNeededItems.innerHTML =
      "<p>No matching needed items.</p>";
  }
}

function renderShoppingLocations() {
  shoppingLocationOptions.innerHTML = "";

  const validStoreTypes = currentStoreTypes.filter(
    (storeType) =>
      typeof storeType.name === "string" &&
      storeType.name.trim() !== ""
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

    addLongPressHandler(storeTypeButton, () => {
      recordAppNavigation();
      selectedShoppingTarget = {
        kind: "storeType",
        id: storeType.id,
        name: storeType.name.trim()
      };

      setContextButtonLabel(
        shoppingAtButton,
        `Shopping at a ${storeType.name.trim()}`
      );
      shoppingAtPanel.hidden = true;
      shoppingAtButton.setAttribute("aria-expanded", "false");
      renderGettingItems();
    });

    group.append(storeTypeButton);

    const storesForType = currentStores
      .filter(
        (store) =>
          store.storeTypeId === storeType.id &&
          typeof store.name === "string" &&
          store.name.trim() !== ""
      )
      .sort(sortBySavedOrderThenName);

    storesForType.forEach((store) => {
      const storeButton = document.createElement("button");
      storeButton.type = "button";
      storeButton.className = "shopping-location-option";
      storeButton.textContent = store.name.trim();

      addLongPressHandler(storeButton, () => {
        recordAppNavigation();
        selectedShoppingTarget = {
          kind: "store",
          id: store.id,
          storeTypeId: store.storeTypeId,
          name: store.name.trim()
        };

        setContextButtonLabel(
          shoppingAtButton,
          `Shopping at ${store.name.trim()}`
        );
        shoppingAtPanel.hidden = true;
        shoppingAtButton.setAttribute("aria-expanded", "false");
        renderGettingItems();
      });

      group.append(storeButton);
    });

    shoppingLocationOptions.append(group);
  });
}

function renderGettingItems() {
  gettingItemsList.innerHTML = "";
  finishShopButton.hidden = true;

  if (!selectedShoppingTarget) {
    updateBottomContextAction();
    return;
  }

  const selectedStore =
    selectedShoppingTarget.kind === "store"
      ? currentStores.find(
          (store) => store.id === selectedShoppingTarget.id
        )
      : null;

  const selectedStoreTypeId =
    selectedShoppingTarget.kind === "store"
      ? selectedShoppingTarget.storeTypeId
      : selectedShoppingTarget.id;

  if (!selectedStoreTypeId) {
    gettingItemsList.innerHTML =
      "<p>Choose where you are shopping.</p>";
    updateBottomContextAction();
    return;
  }

  const matchingRecords = currentNeededRecords().filter((record) => {
    if (!itemBelongsToStoreType(record.item, selectedStoreTypeId)) {
      return false;
    }

    if (
      selectedStore &&
      !neededRecordIsAvailableAtStore(
        record,
        selectedStore.id
      )
    ) {
      return false;
    }

    return true;
  });

  if (matchingRecords.length === 0) {
    gettingItemsList.innerHTML =
      "<p>No needed items for this shop.</p>";
    updateBottomContextAction();
    return;
  }

  const collectedRecords = matchingRecords.filter(
    (record) => record.entry.status === "collected"
  );

  finishShopButton.hidden = collectedRecords.length === 0;
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
        includeParentName: true
      })
    );

    const amount = document.createElement("span");
    amount.className = "item-amount";
    amount.textContent = formatAmount(
      entry.amount,
      entry.unitId
    );
    details.append(amount);

    const collectButton = document.createElement("button");
    collectButton.type = "button";
    collectButton.className = "collect-checkbox-button";
    collectButton.setAttribute("aria-pressed", String(isCollected));
    collectButton.setAttribute(
      "aria-label",
      isCollected
        ? `Mark ${item.name} as not collected`
        : `Mark ${item.name} as collected`
    );

    const checkboxGraphic = document.createElement("span");
    checkboxGraphic.className = "collect-checkbox-graphic";
    checkboxGraphic.textContent = isCollected ? "✓" : "";
    collectButton.append(checkboxGraphic);

    addLongPressHandler(collectButton, async () => {
      collectButton.disabled = true;
      await setNeededItemCollected(
        item,
        entry,
        !isCollected
      );
    });

    row.append(details, collectButton);
    gettingItemsList.append(row);
    renderedEntryIds.add(entry.id);
  }

  const orderedProductTypes = getOrderedProductTypesForShoppingTarget(
    selectedStoreTypeId,
    selectedStore
  );

  orderedProductTypes.forEach((productType) => {
    matchingRecords
      .filter(
        (record) =>
          String(record.item.productTypeId) === String(productType.id)
      )
      .sort(compareNeededRecords)
      .forEach(appendGettingRecord);
  });

  matchingRecords
    .filter((record) => !renderedEntryIds.has(record.entry.id))
    .sort(compareNeededRecords)
    .forEach(appendGettingRecord);
}

function startItemsListener() {
  if (itemsListenerStarted) {
    return;
  }

  itemsListenerStarted = true;

  onSnapshot(
    householdCollection("items"),
    (snapshot) => {
      currentItems = snapshot.docs.map((documentSnapshot) => ({
        id: documentSnapshot.id,
        ...documentSnapshot.data()
      }));

      renderRoomItems();
      renderFullNeededList();
      renderSettingsItems();
      renderSettingsSpecificProducts();
      renderGettingItems();
    },
    (error) => {
      console.error("Could not load items:", error);
    }
  );
}

function startSpecificProductsListener() {
  if (specificProductsListenerStarted) {
    return;
  }

  specificProductsListenerStarted = true;

  onSnapshot(
    householdCollection("specificProducts"),
    (snapshot) => {
      currentSpecificProducts = snapshot.docs
        .map((documentSnapshot) => ({
          id: documentSnapshot.id,
          ...documentSnapshot.data()
        }))
        .filter((product) => product.active !== false)
        .sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")));

      renderSettingsSpecificProducts();
    },
    (error) => {
      console.error("Could not load specific products:", error);
    }
  );
}

function startStoresListener() {
  if (storesListenerStarted) {
    return;
  }

  storesListenerStarted = true;

  onSnapshot(
    householdCollection("stores"),
    (snapshot) => {
      currentStores = snapshot.docs
        .map((documentSnapshot) => ({
          id: documentSnapshot.id,
          ...documentSnapshot.data()
        }))
        .filter((store) => store.active !== false)
        .sort(sortBySavedOrderThenName);

      renderStores(currentStores);
      renderSettingsSpecificProducts();
    },
    (error) => {
      console.error("Could not load stores:", error);
    }
  );
}

function startStoreTypesListener() {
  if (storeTypesListenerStarted) {
    return;
  }

  storeTypesListenerStarted = true;

  onSnapshot(
    householdCollection("storeTypes"),
    (snapshot) => {
      currentStoreTypes = snapshot.docs
        .map((documentSnapshot) => ({
          id: documentSnapshot.id,
          ...documentSnapshot.data()
        }))
        .filter((storeType) => storeType.active !== false)
        .sort(sortBySavedOrderThenName);

      renderStoreTypes(currentStoreTypes);
    },
    (error) => {
      console.error("Could not load store types:", error);
    }
  );
}

function startProductTypesListener() {
  if (productTypesListenerStarted) {
    return;
  }

  productTypesListenerStarted = true;

  onSnapshot(
    householdCollection("productTypes"),
    (snapshot) => {
      currentProductTypes = snapshot.docs
        .map((documentSnapshot) => ({
          id: documentSnapshot.id,
          ...documentSnapshot.data()
        }))
        .filter((productType) => productType.active !== false)
        .sort(sortBySavedOrderThenName);

      renderProductTypes(currentProductTypes);
      renderSettingsSpecificProducts();
    },
    (error) => {
      console.error("Could not load product types:", error);
    }
  );
}

function startRoomsListener() {
  if (roomsListenerStarted) {
    return;
  }

  roomsListenerStarted = true;

  onSnapshot(
    householdCollection("locations"),
    (snapshot) => {
      currentRooms = snapshot.docs
        .map((documentSnapshot) => ({
          id: documentSnapshot.id,
          ...documentSnapshot.data()
        }))
        .filter(
          (room) =>
            room.level === "room" &&
            room.active !== false
        )
        .sort(sortBySavedOrderThenName);

      renderRooms(currentRooms);
      renderSettingsSpecificProducts();
    },
    (error) => {
      console.error("Could not load rooms:", error);
    }
  );
}

function startUnitsListener() {
  if (unitsListenerStarted) {
    return;
  }

  unitsListenerStarted = true;

  onSnapshot(
    householdCollection("units"),
    (snapshot) => {
      currentUnits = snapshot.docs
        .map((documentSnapshot) => ({
          id: documentSnapshot.id,
          ...documentSnapshot.data()
        }))
        .filter((unit) => unit.active !== false)
        .sort(sortBySavedOrderThenName);

      renderUnits(currentUnits);
      renderRoomItems();
      renderFullNeededList();
      renderSettingsItems();
      renderGettingItems();
    },
    (error) => {
      console.error("Could not load units:", error);
    }
  );
}

function startNeededEntriesListener() {
  if (neededEntriesListenerStarted) {
    return;
  }

  neededEntriesListenerStarted = true;

  onSnapshot(
    householdCollection("neededEntries"),
    (snapshot) => {
      currentNeededEntries = new Map(
        snapshot.docs.map((documentSnapshot) => [
          documentSnapshot.id,
          {
            id: documentSnapshot.id,
            ...documentSnapshot.data()
          }
        ])
      );

      renderRoomItems();
      renderFullNeededList();
      renderGettingItems();
    },
    (error) => {
      console.error("Could not load needed items:", error);
    }
  );
}

function formatAmount(amount, unitId) {
  const unit = currentUnits.find(
    (candidate) => candidate.id === unitId
  );

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

function closeSpecificProductChoicePanel() {
  document
    .querySelectorAll(".specific-product-choice-panel")
    .forEach((panel) => panel.remove());
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
      behavior: "smooth"
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

    const neededEntryRef = householdDocument(
      "neededEntries",
      item.id
    );

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
      collectedAt: null
    });

    await setDoc(
      itemRef,
      {
        addCount: increment(1),
        lastAddedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );
  } catch (error) {
    console.error("Could not add item to needed list:", error);
    alert("The item could not be added to the needed list.");
  }
}



async function addSpecificProductToNeededList(item, specificProduct) {
  if (specificNeededEntryForProduct(specificProduct.id)) {
    alert(
      `${item.name} ${specificProduct.name} is already on the needed list.`
    );
    return;
  }

  try {
    const neededEntryRef = householdDocument(
      "neededEntries",
      specificNeededEntryDocumentId(specificProduct.id)
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
      collectedAt: null
    });

    await setDoc(
      itemRef,
      {
        addCount: increment(1),
        lastAddedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );
  } catch (error) {
    console.error(
      "Could not add specific product to needed list:",
      error
    );
    alert("The specific product could not be added to the needed list.");
  }
}

async function changeNeededAmount(item, neededEntry, change) {
  const neededEntryRef = householdDocument(
    "neededEntries",
    neededEntry.id
  );

  const itemRef = householdDocument("items", item.id);

  try {
    await runTransaction(db, async (transaction) => {
      const neededSnapshot = await transaction.get(neededEntryRef);

      if (!neededSnapshot.exists()) {
        return;
      }

      const currentAmount = Number(
        neededSnapshot.data().amount
      );

      const nextAmount = currentAmount + change;

      if (nextAmount <= 0) {
        transaction.delete(neededEntryRef);
      } else {
        transaction.update(neededEntryRef, {
          amount: nextAmount,
          adjustedAt: serverTimestamp()
        });
      }

      transaction.set(
        itemRef,
        {
          lastAdjustedAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );
    });
  } catch (error) {
    console.error("Could not change quantity:", error);
    alert("The quantity could not be changed.");
  }
}

async function removeNeededItem(neededEntry) {
  const neededEntryRef = householdDocument(
    "neededEntries",
    neededEntry.id
  );

  try {
    await deleteDoc(neededEntryRef);
  } catch (error) {
    console.error("Could not remove needed item:", error);
    alert("The item could not be removed.");
  }
}

async function setNeededItemCollected(
  item,
  neededEntry,
  isCollected
) {
  const neededEntryRef = householdDocument(
    "neededEntries",
    neededEntry.id
  );

  try {
    await updateDoc(neededEntryRef, {
      status: isCollected ? "collected" : "needed",
      collectedAt: isCollected
        ? serverTimestamp()
        : null,
      statusChangedAt: serverTimestamp()
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
      ? currentStores.find(
          (store) => store.id === selectedShoppingTarget.id
        )
      : null;

  const selectedStoreTypeId =
    selectedShoppingTarget.kind === "store"
      ? selectedShoppingTarget.storeTypeId
      : selectedShoppingTarget.id;

  const collectedRecords = currentNeededRecords().filter((record) => {
    if (record.entry.status !== "collected") {
      return false;
    }

    if (!itemBelongsToStoreType(record.item, selectedStoreTypeId)) {
      return false;
    }

    return neededRecordIsAvailableAtStore(
      record,
      selectedStore?.id
    );
  });

  if (collectedRecords.length === 0) {
    return;
  }

  finishShopButton.disabled = true;

  try {
    const batch = writeBatch(db);

    collectedRecords.forEach((record) => {
      batch.delete(
        householdDocument(
          "neededEntries",
          record.entry.id
        )
      );
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

function wireNavigation() {
  const needingTabButton = document.querySelector(
    ".main-tabs button[data-view='needing']"
  );

  const gettingTabButton = document.querySelector(
    ".main-tabs button[data-view='getting']"
  );

  const settingsShortcutButton = document.querySelector(
    ".settings-shortcut[data-view='settings']"
  );

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
        openFullNeededList();
        return;
      }

      if (!views.settings.hidden && !bottomContextAction.disabled) {
        recordAppNavigation();
        toggleCurrentSettingsAddForm();
        return;
      }

    });

    addLongPressHandler(bottomContextAction, async () => {
      if (views.getting.hidden || bottomContextAction.disabled) {
        return;
      }

      const confirmed = confirm(
        "Finish shop and remove collected items from the needed list?"
      );

      if (confirmed) {
        await finishCurrentShop();
      }
    }, { duration: 450 });
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

    closeSpecificProductQuickAdd();
    populateProductTypeSelect(itemProductTypeSelect, itemProductTypeSelect.value);
    populateItemStoreSelect(
      itemStoreSelect,
      itemProductTypeSelect.value,
      itemStoreSelect?.value ?? ""
    );

    if (!itemUnitSelect.value) {
      applyDefaultItemUnit();
    }

    newItemPanel.hidden = false;
    newItemButton.hidden = true;

    placeElementAtTop(newItemPanel, itemNameInput);
  });

  cancelNewItemButton.addEventListener("click", () => {
    newItemPanel.hidden = true;
    newItemButton.hidden = false;
  });

  if (cancelSpecificProductButton) {
    cancelSpecificProductButton.addEventListener("click", () => {
      closeSpecificProductQuickAdd();
    });
  }

  addLongPressHandler(shoppingAtButton, () => {
    recordAppNavigation();
    const willOpen = shoppingAtPanel.hidden;
    shoppingAtPanel.hidden = !willOpen;
    shoppingAtButton.setAttribute("aria-expanded", String(willOpen));
  });

  addLongPressHandler(finishShopButton, async () => {
    const confirmed = confirm(
      "Finish shop and remove collected items from the needed list?"
    );

    if (confirmed) {
      await finishCurrentShop();
    }
  }, { duration: 450 });

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

function wireForms() {
  addRoomForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const roomName = roomNameInput.value.trim();

    if (!roomName) {
      return;
    }

    const submitButton = addRoomForm.querySelector("button[type='submit']");
    submitButton.disabled = true;

    try {
      await addDoc(householdCollection("locations"), {
        name: roomName,
        parentId: null,
        level: "room",
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      addRoomForm.reset();
      addRoomForm.hidden = true;
    } catch (error) {
      console.error("Could not add room:", error);
      alert("The room could not be added.");
    } finally {
      submitButton.disabled = false;
    }
  });

  itemProductTypeSelect.addEventListener("change", () => {
    populateItemStoreSelect(
      itemStoreSelect,
      itemProductTypeSelect.value,
      itemStoreSelect?.value ?? ""
    );
  });

  itemUnitSelect.addEventListener("change", () => {
    itemIncrementInput.value = selectedItemUnitIncrement();
  });

  addUnitForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const unitSymbol = unitSymbolInput.value.trim();

    if (!unitSymbol) {
      return;
    }

    const submitButton = addUnitForm.querySelector("button[type='submit']");
    submitButton.disabled = true;

    try {
      await addDoc(householdCollection("units"), {
        name: unitSymbol,
        symbol: unitSymbol,
        displayMode: unitSymbol === "×" ? "multiplier" : "suffix",
        defaultIncrement: 1,
        decimalPlaces: 0,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      addUnitForm.reset();
      addUnitForm.hidden = true;
    } catch (error) {
      console.error("Could not add unit:", error);
      alert("The unit could not be added.");
    } finally {
      submitButton.disabled = false;
    }
  });

  addStoreTypeForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const storeTypeName = storeTypeNameInput.value.trim();

    if (!storeTypeName) {
      return;
    }

    const submitButton = addStoreTypeForm.querySelector("button[type='submit']");
    submitButton.disabled = true;

    try {
      await addDoc(householdCollection("storeTypes"), {
        name: storeTypeName,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      addStoreTypeForm.reset();
      addStoreTypeForm.hidden = true;
    } catch (error) {
      console.error("Could not add store type:", error);
      alert("The store type could not be added.");
    } finally {
      submitButton.disabled = false;
    }
  });

  addStoreForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const storeName = storeNameInput.value.trim();
    const storeTypeId = storeTypeSelect.value;

    if (!storeName || !storeTypeId) {
      return;
    }

    const submitButton = addStoreForm.querySelector("button[type='submit']");
    submitButton.disabled = true;

    try {
      await addDoc(householdCollection("stores"), {
        name: storeName,
        storeTypeId,
        productTypeOrders: {},
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      addStoreForm.reset();
      addStoreForm.hidden = true;
    } catch (error) {
      console.error("Could not add store:", error);
      alert("The store could not be added.");
    } finally {
      submitButton.disabled = false;
    }
  });

  addProductTypeForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const productTypeName = productTypeNameInput.value.trim();
    const storeTypeIds = getProductTypeStoreTypeIdsFromForm();

    if (!productTypeName || storeTypeIds.length === 0) {
      alert("Please enter a product type name and choose at least one store type.");
      return;
    }

    const submitButton = addProductTypeForm.querySelector("button[type='submit']");
    submitButton.disabled = true;

    try {
      await addDoc(householdCollection("productTypes"), {
        name: productTypeName,
        storeTypeIds,
        storeTypeOrders: {},
        parentId: null,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      productTypeNameInput.value = "";
      createStoreTypeCheckboxList(
        productTypeStoreTypesContainer,
        storeTypeIds
      );
      productTypeNameInput.focus();
    } catch (error) {
      console.error("Could not add product type:", error);
      alert("The product type could not be added.");
    } finally {
      submitButton.disabled = false;
    }
  });

  if (settingsItemProductTypeSelect) {
    settingsItemProductTypeSelect.addEventListener("change", () => {
      populateItemStoreSelect(
        settingsItemStoreSelect,
        settingsItemProductTypeSelect.value,
        settingsItemStoreSelect?.value ?? ""
      );
    });
  }

  if (settingsItemUnitSelect) {
    settingsItemUnitSelect.addEventListener("change", () => {
      updateSettingsItemIncrementFromUnit();
    });
  }

  if (addSettingsItemForm) {
    addSettingsItemForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const itemName = settingsItemNameInput.value.trim();
      const locationId = settingsItemRoomSelect.value;
      const productTypeId = settingsItemProductTypeSelect.value;
      const storeId = settingsItemStoreSelect?.value ?? "";
      const specificAttributes = settingsItemSpecificAttributesInput?.value.trim() ?? "";
      const unitId = settingsItemUnitSelect.value;
      const defaultAmount = Number(settingsItemDefaultAmountInput.value);
      const increment = Number(settingsItemIncrementInput.value);

      const selectedProductType = currentProductTypes.find(
        (productType) => productType.id === productTypeId
      );

      const inheritedStoreTypeIds = selectedProductType
        ? productTypeStoreTypeIds(selectedProductType)
        : [];

      if (
        !itemName ||
        !locationId ||
        !productTypeId ||
        !unitId ||
        !Number.isFinite(defaultAmount) ||
        !Number.isFinite(increment)
      ) {
        alert("Please complete all required fields.");
        return;
      }

      if (inheritedStoreTypeIds.length === 0) {
        alert("Please choose a product type that has at least one store type set.");
        return;
      }

      if (!itemStoreIsAllowed(productTypeId, storeId)) {
        alert("Please choose a store that matches the selected product type.");
        return;
      }

      const submitButton = addSettingsItemForm.querySelector("button[type='submit']");
      submitButton.disabled = true;

      try {
        await addDoc(householdCollection("items"), {
          name: itemName,
          active: true,
          locationId,
          productTypeId,
          storeId: storeId || null,
          specificAttributes,
          defaultAmount,
          unitId,
          increment,
          addCount: 0,
          lastAddedAt: null,
          lastAdjustedAt: null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        resetSettingsItemAddForm();
        addSettingsItemForm.hidden = true;
      } catch (error) {
        console.error("Could not add item:", error);
        alert("The item could not be saved.");
      } finally {
        submitButton.disabled = false;
      }
    });
  }


  if (addSpecificProductForm) {
    addSpecificProductForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const productName = specificProductNameInput.value.trim();
      const specificAttributes = specificProductAttributesInput.value.trim();
      const storeIds = getCheckedValues(specificProductStoresContainer);

      if (!quickSpecificProductItemId || !productName) {
        alert("Please enter a product name.");
        return;
      }

      const submitButton = addSpecificProductForm.querySelector("button[type='submit']");
      submitButton.disabled = true;

      try {
        await addDoc(householdCollection("specificProducts"), {
          itemId: quickSpecificProductItemId,
          name: productName,
          specificAttributes,
          storeIds,
          active: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        closeSpecificProductQuickAdd();
      } catch (error) {
        console.error("Could not add specific product:", error);
        alert("The specific product could not be saved.");
      } finally {
        submitButton.disabled = false;
      }
    });
  }

  addItemForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const itemName = itemNameInput.value.trim();
    const productTypeId = itemProductTypeSelect.value;
    const storeId = itemStoreSelect?.value ?? "";
    const specificAttributes = itemSpecificAttributesInput?.value.trim() ?? "";
    const unitId = itemUnitSelect.value;
    const defaultAmount = Number(itemDefaultAmountInput.value);
    const increment = Number(itemIncrementInput.value);

    const selectedProductType = currentProductTypes.find(
      (productType) => productType.id === productTypeId
    );

    const inheritedStoreTypeIds = selectedProductType
      ? productTypeStoreTypeIds(selectedProductType)
      : [];

    if (
      !selectedRoomId ||
      !itemName ||
      !productTypeId ||
      !unitId ||
      !Number.isFinite(defaultAmount) ||
      !Number.isFinite(increment)
    ) {
      alert("Please complete all required fields.");
      return;
    }

    if (inheritedStoreTypeIds.length === 0) {
      alert("Please choose a product type that has at least one store type set.");
      return;
    }

    if (!itemStoreIsAllowed(productTypeId, storeId)) {
      alert("Please choose a store that matches the selected product type.");
      return;
    }

    const submitButton = addItemForm.querySelector("button[type='submit']");
    submitButton.disabled = true;

    try {
      await addDoc(householdCollection("items"), {
        name: itemName,
        active: true,
        locationId: selectedRoomId,
        productTypeId,
        storeId: storeId || null,
        specificAttributes,
        defaultAmount,
        unitId,
        increment,
        addCount: 0,
        lastAddedAt: null,
        lastAdjustedAt: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      itemNameInput.value = "";
      newItemPanel.hidden = true;
      newItemButton.hidden = false;
    } catch (error) {
      console.error("Could not add item:", error);
      alert("The item could not be saved.");
    } finally {
      submitButton.disabled = false;
    }
  });
}

function startListeners() {
  startRoomsListener();
  startUnitsListener();
  startStoreTypesListener();
  startStoresListener();
  startProductTypesListener();
  startItemsListener();
  startSpecificProductsListener();
  startNeededEntriesListener();
}

wireNavigation();
wireForms();
setupBrowserBackButton();
setupAutoHidingHeader();

onAuthStateChanged(auth, (user) => {
  if (!user) {
    connectionStatus.textContent = "Connecting…";
    return;
  }

  connectionStatus.textContent = "Online";
  startListeners();
});

showView("needing");
