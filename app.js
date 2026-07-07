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
  items: "Items",
  rooms: "Rooms",
  units: "Units"
};

function getSettingsAddForm(categoryName) {
  return {
    stores: addStoreForm,
    "store-types": addStoreTypeForm,
    "product-types": addProductTypeForm,
    rooms: addRoomForm,
    units: addUnitForm
  }[categoryName] ?? null;
}

function closeSettingsAddForms({ except = null } = {}) {
  [
    addStoreForm,
    addStoreTypeForm,
    addProductTypeForm,
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
  const form = getSettingsAddForm(selectedSettingsCategory);

  if (!form) {
    return;
  }

  const willOpen = form.hidden;
  closeSettingsAddForms({ except: form });
  form.hidden = !willOpen;
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
const itemUnitSelect = document.querySelector("#item-unit");
const itemIncrementInput = document.querySelector("#item-increment");
const addItemForm = document.querySelector("#add-item-form");
const itemNameInput = document.querySelector("#item-name");
const itemDefaultAmountInput = document.querySelector("#item-default-amount");
const roomItemsList = document.querySelector("#room-items-list");
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

let roomsListenerStarted = false;
let unitsListenerStarted = false;
let storeTypesListenerStarted = false;
let storesListenerStarted = false;
let productTypesListenerStarted = false;
let itemsListenerStarted = false;
let neededEntriesListenerStarted = false;

let currentRooms = [];
let currentUnits = [];
let currentStoreTypes = [];
let currentStores = [];
let currentProductTypes = [];
let currentItems = [];
let currentNeededEntries = new Map();

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

function openSettingsHomeFromShortcut() {
  editingSettingsKey = null;
  editingSettingsId = null;
  editingSettingsContextId = null;
  selectedSettingsCategory = null;
  showView("settings");
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
    bottomContextAction.setAttribute("aria-label", "Open full needed list");
    return;
  }

  if (!views.getting.hidden) {
    bottomContextAction.textContent = "Finish shop";
    bottomContextAction.hidden = false;
    bottomContextAction.setAttribute("aria-label", "Finish shop");

    const hasCollectedVisibleItems = currentItems.some((item) => {
      const neededEntry = currentNeededEntries.get(item.id);

      if (neededEntry?.status !== "collected") {
        return false;
      }

      if (!selectedShoppingTarget) {
        return false;
      }

      const selectedStoreTypeId =
        selectedShoppingTarget.kind === "store"
          ? selectedShoppingTarget.storeTypeId
          : selectedShoppingTarget.id;

      return itemBelongsToStoreType(item, selectedStoreTypeId);
    });

    bottomContextAction.disabled = !hasCollectedVisibleItems;
    return;
  }

  if (!views.settings.hidden) {
    const form = getSettingsAddForm(selectedSettingsCategory);

    bottomContextAction.textContent = form ? "Add" : "";
    bottomContextAction.disabled = !form;
    bottomContextAction.hidden = false;

    if (form) {
      bottomContextAction.setAttribute("aria-label", `Add ${settingsCategoryNames[selectedSettingsCategory]}`);
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
}

function showView(viewName) {
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
  exitIcon.textContent = "⇥";
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

  const selectedRoom = currentRooms.find(
    (room) => room.id === selectedRoomId
  );

  if (!selectedRoom) {
    return;
  }

  setRoomSelectorLabel(selectedRoom.name);
  roomViewTitle.textContent = selectedRoom.name;
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

function addLongPressHandler(element, handler, { duration = 700 } = {}) {
  let pressTimer = null;

  function clearPress() {
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }

    element.classList.remove("is-long-pressing");
  }

  element.addEventListener("pointerdown", (event) => {
    if (element.disabled) {
      return;
    }

    clearPress();
    element.classList.add("is-long-pressing");

    pressTimer = setTimeout(async () => {
      pressTimer = null;
      element.classList.remove("is-long-pressing");
      await handler(event);
    }, duration);
  });

  ["pointerup", "pointerleave", "pointercancel"].forEach((eventName) => {
    element.addEventListener(eventName, clearPress);
  });

  element.addEventListener("contextmenu", (event) => {
    event.preventDefault();
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
    return;
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
  } else {
    editingSettingsKey = settingsKey;
    editingSettingsId = id;
    editingSettingsContextId = null;
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
  } else {
    editingSettingsKey = "product-types";
    editingSettingsId = id;
    editingSettingsContextId = storeTypeId;
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

  if (rooms.length === 0) {
    needingRoomsList.innerHTML = "<p>No rooms have been created yet.</p>";
    return;
  }

  rooms.forEach((room) => {
    const roomButton = document.createElement("button");
    roomButton.type = "button";
    roomButton.className = "room-button shopping-location-option";
    roomButton.textContent = `${room.name} stuff`;
    roomButton.addEventListener("click", () => {
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
    getRoomName(item.locationId),
    getUnitDisplay(item.unitId)
  ];

  return parts.join(" · ");
}

function itemMatchesSettingsSearch(item, searchText) {
  if (!searchText) {
    return true;
  }

  const productType = productTypeForItem(item);
  const roomName = getRoomName(item.locationId);
  const unitName = getUnitDisplay(item.unitId);

  return [
    item.name,
    productType?.name,
    roomName,
    unitName
  ]
    .filter(Boolean)
    .some((value) =>
      String(value).toLowerCase().includes(searchText)
    );
}

async function deactivateSettingsItem(item) {
  if (currentNeededEntries.has(item.id)) {
    alert(
      `${item.name} is currently on the needed list. Remove it from the needed list before removing it from Items.`
    );
    return;
  }

  if (
    !window.confirm(
      `Remove ${item.name}?

This will remove it from normal item lists.`
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

  actions.append(editButton, deleteButton);
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
      key: "productTypeId",
      label: "Product type",
      type: "select",
      emptyText: "Choose a product type",
      options: productTypeOptions,
      value: () => items.find((item) => item.id === editingSettingsId)?.productTypeId ?? ""
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

  await updateDoc(householdDocument("items", item.id), {
    name: values.name,
    productTypeId: values.productTypeId,
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
    onSave: saveSettingsItem
  });
}

function appendSettingsItemsForProductType({
  container,
  productType,
  items,
  renderedItemIds
}) {
  const productTypeItems = items
    .filter((item) => String(item.productTypeId) === String(productType.id))
    .sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")));

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

  productTypeItems.forEach((item) => {
    groupList.append(createSettingsItemRow(item));
    appendSettingsItemEditPanel(item, groupList);
    renderedItemIds.add(item.id);
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

  const activeItems = currentItems
    .filter((item) => item.active !== false)
    .filter((item) => itemMatchesSettingsSearch(item, searchText));

  settingsItemsList.innerHTML = "";

  if (activeItems.length === 0) {
    settingsItemsList.innerHTML = searchText
      ? "<p>No matching items.</p>"
      : "<p>No items have been created yet.</p>";
    return;
  }

  const renderedItemIds = new Set();

  orderedProductTypesForDefaultRoomView().forEach((productType) => {
    appendSettingsItemsForProductType({
      container: settingsItemsList,
      productType,
      items: activeItems,
      renderedItemIds
    });
  });

  const ungroupedItems = activeItems
    .filter((item) => !renderedItemIds.has(item.id))
    .sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")));

  if (ungroupedItems.length > 0) {
    const group = document.createElement("section");
    group.className = "settings-group settings-items-group";

    const heading = document.createElement("div");
    heading.className = "settings-group-heading";
    heading.textContent = "Product type not set";
    group.append(heading);

    const groupList = document.createElement("div");
    groupList.className = "settings-group-list";

    ungroupedItems.forEach((item) => {
      groupList.append(createSettingsItemRow(item));
      appendSettingsItemEditPanel(item, groupList);
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

function renderRoomItems() {
  roomItemsList.innerHTML = "";

  if (!selectedRoomId) {
    return;
  }

  const roomItems = currentItems.filter(
    (item) =>
      item.locationId === selectedRoomId &&
      item.active !== false
  );

  if (roomItems.length === 0) {
    roomItemsList.innerHTML = "<p>No items have been created for this room yet.</p>";
    return;
  }

  const renderedItemIds = new Set();

  function sortItemsByName(a, b) {
    return String(a.name ?? "").localeCompare(String(b.name ?? ""));
  }

  function appendRoomItemRow(item) {
    const neededEntry = currentNeededEntries.get(item.id);
    const isNeeded = Boolean(neededEntry);

    const row = document.createElement("div");
    row.className = "item-row room-item-row";

    if (isNeeded) {
      row.classList.add("is-needed");
    } else {
      row.classList.add("is-available");
    }

    const details = document.createElement("div");
    details.className = "item-row-details";

    const name = document.createElement("span");
    name.className = "item-name";
    name.textContent = item.name;
    details.append(name);

    const controls = document.createElement("div");
    controls.className = "room-item-controls";

    if (!isNeeded) {
      const addButton = createIconButton({
        className: "room-icon-button room-add-button add-needed-button",
        icon: "Add",
        label: `Add ${item.name} to needed list`,
        onClick: () => {
          addItemToNeededList(item);
        }
      });

      controls.append(addButton);
      row.append(details, controls);
      roomItemsList.append(row);
      renderedItemIds.add(item.id);
      return;
    }

    const amountDisplay = document.createElement("strong");
    amountDisplay.className = "room-current-quantity";
    amountDisplay.textContent = formatAmount(
      neededEntry.amount,
      neededEntry.unitId
    );

    const increaseButton = createIconButton({
      className: "room-icon-button increase-needed-button",
      icon: "+",
      label: `Increase ${item.name}`,
      onClick: async () => {
        disableButtons(controlButtons);
        await changeNeededAmount(item, item.increment ?? 1);
      }
    });

    const decreaseButton = createIconButton({
      className: "room-icon-button decrease-needed-button",
      icon: "−",
      label: `Decrease ${item.name}`,
      onClick: async () => {
        disableButtons(controlButtons);
        await changeNeededAmount(item, -(item.increment ?? 1));
      }
    });

    const controlButtons = [
      increaseButton,
      decreaseButton
    ];

    details.append(amountDisplay);

    controls.append(
      increaseButton,
      decreaseButton
    );

    row.append(details, controls);
    roomItemsList.append(row);
    renderedItemIds.add(item.id);
  }

  function appendProductTypeBlock(productType) {
    const productTypeItems = roomItems
      .filter((item) => String(item.productTypeId) === String(productType.id));

    const neededItems = productTypeItems
      .filter((item) => currentNeededEntries.has(item.id))
      .sort(sortItemsByName);

    const availableItems = productTypeItems
      .filter((item) => !currentNeededEntries.has(item.id))
      .sort(sortItemsByName);

    neededItems.forEach(appendRoomItemRow);
    availableItems.forEach(appendRoomItemRow);
  }

  orderedProductTypesForDefaultRoomView().forEach(appendProductTypeBlock);

  const remainingItems = roomItems
    .filter((item) => !renderedItemIds.has(item.id));

  const remainingNeededItems = remainingItems
    .filter((item) => currentNeededEntries.has(item.id))
    .sort(sortItemsByName);

  const remainingAvailableItems = remainingItems
    .filter((item) => !currentNeededEntries.has(item.id))
    .sort(sortItemsByName);

  remainingNeededItems.forEach(appendRoomItemRow);
  remainingAvailableItems.forEach(appendRoomItemRow);
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

function appendFullNeededItemRow(item) {
  const neededEntry = currentNeededEntries.get(item.id);

  if (!neededEntry) {
    return;
  }

  const row = document.createElement("div");
  row.className = "item-row full-needed-item-row is-needed";

  const details = document.createElement("div");
  details.className = "item-row-details";

  const name = document.createElement("span");
  name.className = "item-name";
  name.textContent = item.name;
  details.append(name);

  const controls = document.createElement("div");
  controls.className = "room-item-controls full-needed-controls";

  const amountDisplay = document.createElement("strong");
  amountDisplay.className = "room-current-quantity";
  amountDisplay.textContent = formatAmount(
    neededEntry.amount,
    neededEntry.unitId
  );

  const increaseButton = createIconButton({
    className: "room-icon-button increase-needed-button",
    icon: "+",
    label: `Increase ${item.name}`,
    onClick: async () => {
      disableButtons(buttons);
      await changeNeededAmount(item, item.increment ?? 1);
    }
  });

  const decreaseButton = createIconButton({
    className: "room-icon-button decrease-needed-button",
    icon: "−",
    label: `Decrease ${item.name}`,
    onClick: async () => {
      disableButtons(buttons);
      await changeNeededAmount(item, -(item.increment ?? 1));
    }
  });

  const buttons = [
    increaseButton,
    decreaseButton
  ];

  details.append(amountDisplay);

  controls.append(
    increaseButton,
    decreaseButton
  );

  row.append(details, controls);
  fullNeededItems.append(row);
}

function appendFullNeededProductGroup(productType, items) {
  const groupedItems = items
    .filter((item) => String(item.productTypeId) === String(productType.id))
    .sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")));

  if (groupedItems.length === 0) {
    return false;
  }

  groupedItems.forEach(appendFullNeededItemRow);
  return true;
}

function renderFullNeededList() {
  fullNeededItems.innerHTML = "";

  const searchText = neededListSearch.value.trim().toLowerCase();

  const neededItems = currentItems
    .filter((item) => currentNeededEntries.has(item.id))
    .filter((item) => String(item.name ?? "").toLowerCase().includes(searchText));

  if (neededItems.length === 0) {
    fullNeededItems.innerHTML = "<p>No matching needed items.</p>";
    return;
  }

  let renderedAny = false;

  currentStoreTypes.forEach((storeType) => {
    const storeTypeItems = neededItems.filter((item) => {
      const productType = productTypeForItem(item);

      return productType &&
        productTypeBelongsToStoreType(productType, storeType.id);
    });

    if (storeTypeItems.length === 0) {
      return;
    }

    appendFullNeededStoreHeading(storeType.name);

    const productTypesForStoreType = currentProductTypes
      .filter((productType) => productTypeBelongsToStoreType(productType, storeType.id))
      .sort(sortProductTypesForStoreType(storeType.id));

    productTypesForStoreType.forEach((productType) => {
      if (appendFullNeededProductGroup(productType, storeTypeItems)) {
        renderedAny = true;
      }
    });
  });

  const unassignedItems = neededItems
    .filter((item) => {
      const productType = productTypeForItem(item);

      return !productType || productTypeStoreTypeIds(productType).length === 0;
    })
    .sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")));

  if (unassignedItems.length > 0) {
    appendFullNeededStoreHeading("Store type not set");
    unassignedItems.forEach(appendFullNeededItemRow);
    renderedAny = true;
  }

  if (!renderedAny) {
    fullNeededItems.innerHTML = "<p>No matching needed items.</p>";
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

    storeTypeButton.addEventListener("click", () => {
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

      storeButton.addEventListener("click", () => {
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

  const matchingNeededItems = currentItems.filter((item) => {
    const neededEntry = currentNeededEntries.get(item.id);

    if (!neededEntry) {
      return false;
    }

    return itemBelongsToStoreType(item, selectedStoreTypeId);
  });

  if (matchingNeededItems.length === 0) {
    gettingItemsList.innerHTML = "<p>No needed items for this shop.</p>";
    updateBottomContextAction();
    return;
  }

  const collectedItems = matchingNeededItems.filter((item) => {
    const neededEntry = currentNeededEntries.get(item.id);
    return neededEntry?.status === "collected";
  });

  finishShopButton.hidden = collectedItems.length === 0;
  updateBottomContextAction();

  const renderedItemIds = new Set();

  function appendGettingProductHeading(label) {
    const heading = document.createElement("div");
    heading.className = "getting-product-heading";
    heading.textContent = label;
    gettingItemsList.append(heading);
  }

  function appendGettingItemRow(item) {
    const neededEntry = currentNeededEntries.get(item.id);
    const isCollected = neededEntry.status === "collected";

    const row = document.createElement("div");
    row.className = "item-row getting-item-row";

    if (isCollected) {
      row.classList.add("is-collected");
    }

    const details = document.createElement("div");
    details.className = "item-row-details";

    const name = document.createElement("span");
    name.className = "item-name";
    name.textContent = item.name;

    const amount = document.createElement("span");
    amount.className = "item-amount";
    amount.textContent = formatAmount(
      neededEntry.amount,
      neededEntry.unitId
    );

    details.append(name, amount);

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
      await setNeededItemCollected(item, !isCollected);
    });

    row.append(details, collectButton);
    gettingItemsList.append(row);
    renderedItemIds.add(item.id);
  }

  const orderedProductTypes = getOrderedProductTypesForShoppingTarget(
    selectedStoreTypeId,
    selectedStore
  );

  orderedProductTypes.forEach((productType) => {
    const productTypeItems = matchingNeededItems
      .filter((item) => String(item.productTypeId) === String(productType.id))
      .sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")));

    if (productTypeItems.length === 0) {
      return;
    }

    productTypeItems.forEach(appendGettingItemRow);
  });

  const remainingItems = matchingNeededItems
    .filter((item) => !renderedItemIds.has(item.id))
    .sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")));

  if (remainingItems.length > 0) {
    remainingItems.forEach(appendGettingItemRow);
  }
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
      renderGettingItems();
    },
    (error) => {
      console.error("Could not load items:", error);
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

async function addItemToNeededList(item) {
  if (currentNeededEntries.has(item.id)) {
    alert(`${item.name} is already on the needed list.`);
    return;
  }

  try {
    const neededEntryRef = householdDocument("neededEntries", item.id);
    const itemRef = householdDocument("items", item.id);

    await setDoc(neededEntryRef, {
      itemId: item.id,
      amount: item.defaultAmount,
      unitId: item.unitId,
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

async function changeNeededAmount(item, change) {
  const neededEntryRef = householdDocument("neededEntries", item.id);
  const itemRef = householdDocument("items", item.id);

  try {
    await runTransaction(db, async (transaction) => {
      const neededSnapshot = await transaction.get(neededEntryRef);

      if (!neededSnapshot.exists()) {
        return;
      }

      const currentAmount = Number(neededSnapshot.data().amount);
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

async function removeNeededItem(item) {
  const neededEntryRef = householdDocument("neededEntries", item.id);

  try {
    await deleteDoc(neededEntryRef);
  } catch (error) {
    console.error("Could not remove needed item:", error);
    alert("The item could not be removed.");
  }
}

async function setNeededItemCollected(item, isCollected) {
  const neededEntryRef = householdDocument("neededEntries", item.id);

  try {
    await updateDoc(neededEntryRef, {
      status: isCollected ? "collected" : "needed",
      collectedAt: isCollected ? serverTimestamp() : null,
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

  const selectedStoreTypeId =
    selectedShoppingTarget.kind === "store"
      ? selectedShoppingTarget.storeTypeId
      : selectedShoppingTarget.id;

  const collectedItems = currentItems.filter((item) => {
    const neededEntry = currentNeededEntries.get(item.id);

    if (neededEntry?.status !== "collected") {
      return false;
    }

    return itemBelongsToStoreType(item, selectedStoreTypeId);
  });

  if (collectedItems.length === 0) {
    return;
  }

  finishShopButton.disabled = true;

  try {
    const batch = writeBatch(db);

    collectedItems.forEach((item) => {
      batch.delete(householdDocument("neededEntries", item.id));
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
    resetNeedingToRoomList();
    showView("needing");
  });

  gettingTabButton.addEventListener("click", () => {
    resetGettingToShoppingList();
    showView("getting");
  });

  settingsShortcutButton.addEventListener("click", () => {
    openSettingsHomeFromShortcut();
  });

  if (bottomContextAction) {
    bottomContextAction.addEventListener("click", () => {
      if (!views.needing.hidden) {
        openFullNeededList();
        return;
      }

      if (!views.settings.hidden && !bottomContextAction.disabled) {
        toggleCurrentSettingsAddForm();
        return;
      }

      if (!views.getting.hidden && !bottomContextAction.disabled) {
        alert("Press and hold Finish shop to remove collected items.");
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
    }, { duration: 900 });
  }

  settingsCategoryOptions.forEach((button) => {
    button.addEventListener("click", () => {
      openSettingsCategory(button.dataset.settingsCategory);
    });
  });

  if (settingsItemsSearch) {
    settingsItemsSearch.addEventListener("input", () => {
      renderSettingsItems();
    });
  }

  settingsCategoryButton.addEventListener("click", () => {
    editingSettingsKey = null;
    editingSettingsId = null;
    editingSettingsContextId = null;
    showSettingsHome();
  });

  roomSelectorButton.addEventListener("click", () => {
    showNeedingHome();
  });

  backToRoomsButton.addEventListener("click", () => {
    showNeedingHome();
  });

  newItemButton.addEventListener("click", () => {
    newItemPanel.hidden = false;
    newItemButton.hidden = true;
  });

  cancelNewItemButton.addEventListener("click", () => {
    resetNewItemForm();
    newItemPanel.hidden = true;
    newItemButton.hidden = false;
  });

  shoppingAtButton.addEventListener("click", () => {
    const willOpen = shoppingAtPanel.hidden;
    shoppingAtPanel.hidden = !willOpen;
    shoppingAtButton.setAttribute("aria-expanded", String(willOpen));
  });

  finishShopButton.addEventListener("click", async () => {
    const confirmed = confirm(
      "Finish shop and remove collected items from the needed list?"
    );

    if (confirmed) {
      await finishCurrentShop();
    }
  });

  viewNeededListButton.addEventListener("click", () => {
    openFullNeededList();
  });

  neededListSearch.addEventListener("input", () => {
    renderFullNeededList();
  });

  if (editItemsFromNeededListButton) {
    editItemsFromNeededListButton.addEventListener("click", () => {
      openSettingsItemsFromShortcut();
    });
  }

  backFromNeededListButton.addEventListener("click", () => {
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

  addItemForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const itemName = itemNameInput.value.trim();
    const productTypeId = itemProductTypeSelect.value;
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

    const submitButton = addItemForm.querySelector("button[type='submit']");
    submitButton.disabled = true;

    try {
      await addDoc(householdCollection("items"), {
        name: itemName,
        active: true,
        locationId: selectedRoomId,
        productTypeId,
        defaultAmount,
        unitId,
        increment,
        addCount: 0,
        lastAddedAt: null,
        lastAdjustedAt: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      resetNewItemForm();
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
  startNeededEntriesListener();
}

wireNavigation();
wireForms();

onAuthStateChanged(auth, (user) => {
  if (!user) {
    connectionStatus.textContent = "Connecting…";
    return;
  }

  connectionStatus.textContent = "Online";
  startListeners();
});

showView("needing");
