import { createTvKeyboard } from "/shared/tv-keyboard.js";

const tokenKey = "watchos.remote.token";
const localControl = ["127.0.0.1", "localhost", "::1", "[::1]"].includes(location.hostname);
let token = localStorage.getItem(tokenKey) ?? "";
let state;
let toastTimer;
let editingControl = null;
let socket;
let reconnectTimer;

const elements = {
  authBanner: document.querySelector("#auth-banner"),
  authForm: document.querySelector("#auth-form"),
  authCode: document.querySelector("#auth-code"),
  appTable: document.querySelector("#app-table"),
  appForm: document.querySelector("#app-form"),
  appFormMessage: document.querySelector("#app-form-message"),
  showAddApp: document.querySelector("#show-add-app"),
  showCatalog: document.querySelector("#show-catalog"),
  catalogPanel: document.querySelector("#catalog-panel"),
  closeCatalog: document.querySelector("#close-catalog"),
  catalogForm: document.querySelector("#catalog-form"),
  catalogUrl: document.querySelector("#catalog-url"),
  catalogMessage: document.querySelector("#catalog-message"),
  catalogGrid: document.querySelector("#catalog-grid"),
  closeAppForm: document.querySelector("#close-app-form"),
  cancelAppForm: document.querySelector("#cancel-app-form"),
  deviceForm: document.querySelector("#device-form"),
  deviceMessage: document.querySelector("#device-message"),
  remoteAddress: document.querySelector("#remote-address"),
  tvAddress: document.querySelector("#tv-address"),
  healthStatus: document.querySelector("#health-status"),
  settingsPairingCode: document.querySelector("#settings-pairing-code"),
  settingsRemoteAddress: document.querySelector("#settings-remote-address"),
  toast: document.querySelector("#toast")
};
const tvKeyboard = createTvKeyboard({
  onDone: () => stopEditing(false)
});

function headers() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`
  };
}

function setAuthorized(value) {
  elements.authBanner.hidden = value;
  elements.showAddApp.disabled = !value;
}

async function pair(event) {
  event.preventDefault();
  const response = await fetch("/api/pair", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: elements.authCode.value, name: "Settings browser" })
  });
  const result = await response.json();
  if (!response.ok) {
    showToast(result.error ?? "Pairing failed");
    return;
  }
  token = result.token;
  localStorage.setItem(tokenKey, token);
  setAuthorized(true);
  showToast("Settings unlocked");
}

function render(nextState) {
  state = nextState;
  elements.appTable.replaceChildren();
  for (const application of state.apps) {
    const row = document.createElement("div");
    row.className = "app-row";
    row.innerHTML = `
      <span class="app-row-icon" style="--app-accent:${escapeHtml(application.accent)}">${escapeHtml(application.icon)}</span>
      <span><strong>${escapeHtml(application.name)}</strong><small>${escapeHtml(application.description)}</small></span>
      <span class="type-pill">${escapeHtml(application.launch.type)}</span>
      <button class="delete-button" data-delete="${escapeHtml(application.id)}" ${application.removable === false ? "disabled" : ""}>Remove</button>
    `;
    elements.appTable.append(row);
  }

  for (const field of ["name", "theme", "jellyfinUrl", "serverUrl"]) {
    if (elements.deviceForm.elements[field]) {
      elements.deviceForm.elements[field].value = state.device?.[field] ?? "";
    }
  }

  elements.remoteAddress.textContent = `${location.origin}/remote/`;
  elements.tvAddress.textContent = `${location.origin}/tv/`;
  elements.settingsPairingCode.textContent = state.pairingCode ?? "------";
  elements.settingsRemoteAddress.textContent = state.remoteUrl ?? `${location.origin}/remote/`;
}

function manifestFromForm(form) {
  const data = new FormData(form);
  const type = String(data.get("type"));
  const target = String(data.get("target")).trim();
  const launch = { type, fullscreen: true };

  if (type === "native") {
    launch.linux = { executable: target, arguments: [] };
  } else if (type === "flatpak") {
    launch.target = target;
    launch.flatpakId = target;
  } else if (type === "appimage") {
    launch.target = target;
  } else {
    launch.target = target;
  }

  return {
    id: String(data.get("id")).trim(),
    name: String(data.get("name")).trim(),
    version: "1.0.0",
    description: String(data.get("description")).trim(),
    category: String(data.get("category")).trim() || "Other",
    icon: String(data.get("icon")).trim() || "◆",
    accent: String(data.get("accent")),
    launch,
    permissions: type === "native" ? ["system"] : ["network"],
    removable: true
  };
}

async function addApplication(event) {
  event.preventDefault();
  elements.appFormMessage.textContent = "";
  const response = await fetch("/api/apps", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(manifestFromForm(elements.appForm))
  });
  const result = await response.json();
  if (!response.ok) {
    elements.appFormMessage.textContent = result.error ?? "Could not install application.";
    return;
  }
  elements.appForm.reset();
  elements.appForm.hidden = true;
  await refresh();
  showToast(`${result.name} installed`);
}

async function removeApplication(id) {
  const application = state.apps.find((item) => item.id === id);
  if (!application || !window.confirm(`Remove ${application.name}?`)) return;
  const response = await fetch(`/api/apps/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: headers()
  });
  if (!response.ok) {
    const result = await response.json();
    showToast(result.error ?? "Could not remove application.");
    return;
  }
  await refresh();
  showToast(`${application.name} removed`);
}

async function saveDevice(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(elements.deviceForm));
  const response = await fetch("/api/device", {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify(data)
  });
  const result = await response.json();
  elements.deviceMessage.textContent = response.ok ? "Saved." : (result.error ?? "Could not save.");
  if (response.ok) {
    await refresh();
    showToast("Device settings saved");
  }
}

async function loadCatalog(event) {
  event.preventDefault();
  elements.catalogMessage.textContent = "Loading…";
  elements.catalogGrid.replaceChildren();
  const response = await fetch("/api/catalog/preview", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ url: elements.catalogUrl.value })
  });
  const result = await response.json();
  if (!response.ok) {
    elements.catalogMessage.textContent = result.error ?? "Could not load catalog.";
    return;
  }
  elements.catalogMessage.textContent = `${result.name} · ${result.apps.length} applications`;
  for (const application of result.apps) {
    const installed = state.apps.some((item) => item.id === application.id);
    const item = document.createElement("article");
    item.className = "catalog-item";
    item.innerHTML = `
      <span class="app-row-icon" style="--app-accent:${escapeHtml(application.accent)}">${escapeHtml(application.icon)}</span>
      <span><strong>${escapeHtml(application.name)}</strong><small>${escapeHtml(application.description)}</small></span>
      <button data-catalog-install="${escapeHtml(application.id)}">${installed ? "Update" : "Install"}</button>
    `;
    elements.catalogGrid.append(item);
  }
}

async function installFromCatalog(appId) {
  const response = await fetch("/api/catalog/install", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ url: elements.catalogUrl.value, appId })
  });
  const result = await response.json();
  if (!response.ok) {
    showToast(result.error ?? "Installation failed.");
    return;
  }
  await refresh();
  showToast(`${result.name} installed`);
}

async function refresh() {
  const response = await fetch("/api/state");
  render(await response.json());
}

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  toastTimer = setTimeout(() => elements.toast.classList.remove("visible"), 2300);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const controlSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])"
].join(",");

function isVisible(control) {
  const style = getComputedStyle(control);
  const bounds = control.getBoundingClientRect();
  return !control.hidden
    && style.display !== "none"
    && style.visibility !== "hidden"
    && bounds.width > 0
    && bounds.height > 0;
}

function visibleControls(root = document) {
  return [...root.querySelectorAll(controlSelector)].filter(isVisible);
}

function focusControl(control) {
  if (!control) return;
  stopEditing();
  control.focus({ preventScroll: true });
  control.scrollIntoView({ block: "nearest", inline: "nearest" });
}

function activeSectionButton() {
  return document.querySelector("nav button.active");
}

function activateSection(button) {
  if (!button) return;
  document.querySelectorAll("nav button").forEach((item) => {
    item.classList.toggle("active", item === button);
  });
  document.querySelectorAll(".page").forEach((page) => {
    page.classList.toggle("active", page.id === button.dataset.section);
  });
}

function moveSidebar(direction) {
  const buttons = [...document.querySelectorAll("nav button")];
  const currentIndex = Math.max(0, buttons.indexOf(document.activeElement));
  const delta = direction === "ArrowUp" ? -1 : 1;
  focusControl(buttons[(currentIndex + delta + buttons.length) % buttons.length]);
}

function contentControls() {
  return visibleControls(document.querySelector(".content"));
}

function spatialCandidate(current, controls, direction) {
  const currentBounds = current.getBoundingClientRect();
  const originX = currentBounds.left + currentBounds.width / 2;
  const originY = currentBounds.top + currentBounds.height / 2;
  const vertical = direction === "ArrowUp" || direction === "ArrowDown";
  const positive = direction === "ArrowDown" || direction === "ArrowRight";

  return controls
    .filter((control) => control !== current)
    .map((control) => {
      const bounds = control.getBoundingClientRect();
      const x = bounds.left + bounds.width / 2;
      const y = bounds.top + bounds.height / 2;
      const primary = vertical ? y - originY : x - originX;
      const cross = vertical ? x - originX : y - originY;
      return {
        control,
        primary,
        score: Math.abs(primary) + Math.abs(cross) * (vertical ? 2.2 : 3.2)
      };
    })
    .filter(({ primary }) => positive ? primary > 4 : primary < -4)
    .sort((a, b) => a.score - b.score)[0]?.control;
}

function moveContent(direction) {
  const controls = contentControls();
  if (!controls.length) {
    focusControl(activeSectionButton());
    return;
  }

  const current = controls.includes(document.activeElement) ? document.activeElement : controls[0];
  const candidate = spatialCandidate(current, controls, direction);
  if (candidate) {
    focusControl(candidate);
    return;
  }

  if (direction === "ArrowLeft") {
    focusControl(activeSectionButton());
    return;
  }

  const currentIndex = Math.max(0, controls.indexOf(current));
  const delta = direction === "ArrowUp" || direction === "ArrowLeft" ? -1 : 1;
  focusControl(controls[(currentIndex + delta + controls.length) % controls.length]);
}

function moveFocus(direction) {
  if (document.activeElement.closest("nav")) {
    if (direction === "ArrowUp" || direction === "ArrowDown") {
      moveSidebar(direction);
    } else if (direction === "ArrowRight") {
      focusControl(contentControls()[0]);
    }
    return;
  }
  moveContent(direction);
}

function startEditing(control) {
  editingControl = control;
  control.classList.add("tv-editing");
  showToast("Editing control · press OK or Back when finished");
  if (control.matches("input:not([type=color]), textarea")) tvKeyboard.open(control);
}

function stopEditing(closeKeyboard = true) {
  if (!editingControl) return;
  if (closeKeyboard) tvKeyboard.close();
  editingControl.classList.remove("tv-editing");
  editingControl = null;
}

function returnToTelevision() {
  stopEditing();
  location.assign("/tv/?dock=1");
}

function closePanelOrReturn() {
  if (!elements.appForm.hidden) {
    elements.appForm.hidden = true;
    focusControl(elements.showAddApp);
  } else if (!elements.catalogPanel.hidden) {
    elements.catalogPanel.hidden = true;
    focusControl(elements.showCatalog);
  } else {
    returnToTelevision();
  }
}

function cycleSelect(select, delta) {
  const optionCount = select.options.length;
  if (!optionCount) return;
  select.selectedIndex = (select.selectedIndex + delta + optionCount) % optionCount;
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

function executeTvCommand(command) {
  if (command === "home" || command === "exit" || command === "menu") {
    returnToTelevision();
    return;
  }
  if (tvKeyboard.isOpen() && tvKeyboard.handle(command)) return;
  if (editingControl) {
    if (editingControl.matches("select") && ["up", "down", "left", "right"].includes(command)) {
      cycleSelect(editingControl, command === "up" || command === "left" ? -1 : 1);
    } else if (command === "back" || command === "ok") {
      stopEditing();
    }
    return;
  }
  if (command === "back") {
    closePanelOrReturn();
    return;
  }
  const direction = {
    up: "ArrowUp",
    down: "ArrowDown",
    left: "ArrowLeft",
    right: "ArrowRight"
  }[command];
  if (direction) {
    moveFocus(direction);
    return;
  }
  if (command === "ok") {
    const control = document.activeElement;
    if (control.matches("input, textarea, select")) startEditing(control);
    else if (control.matches("button, a[href]")) control.click();
  }
}

document.addEventListener("keydown", (event) => {
  const command = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    Enter: "ok",
    " ": "ok",
    Escape: "back",
    Backspace: "back",
    Home: "home",
    F4: "exit",
    m: "menu",
    M: "menu"
  }[event.key];
  if (!command) return;
  if (editingControl && !editingControl.matches("select") && !tvKeyboard.isOpen()
    && ["up", "down", "left", "right"].includes(command)) return;
  if (editingControl?.matches("input, textarea") && !tvKeyboard.isOpen()
    && event.key === "Backspace") return;
  event.preventDefault();
  executeTvCommand(command);
});

function connectTvRemote() {
  clearTimeout(reconnectTimer);
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  socket = new WebSocket(`${protocol}//${location.host}/ws?role=tv`);
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (message.type === "command") executeTvCommand(message.command);
    if (message.type === "text" && document.activeElement.matches("input, textarea")) {
      document.activeElement.value += message.text;
      document.activeElement.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  socket.addEventListener("close", () => {
    reconnectTimer = setTimeout(connectTvRemote, 1500);
  });
}

document.querySelectorAll("nav button").forEach((button) => {
  button.addEventListener("focus", () => activateSection(button));
  button.addEventListener("click", () => activateSection(button));
});

elements.authForm.addEventListener("submit", pair);
elements.authCode.addEventListener("input", () => {
  elements.authCode.value = elements.authCode.value.replace(/\D/g, "").slice(0, 6);
});
elements.showAddApp.addEventListener("click", () => {
  elements.appForm.hidden = false;
  focusControl(elements.closeAppForm);
});
elements.showCatalog.addEventListener("click", () => {
  elements.catalogPanel.hidden = false;
  elements.catalogUrl.value ||= state.device?.serverUrl || `http://${location.hostname}:8788/catalog.json`;
  focusControl(elements.closeCatalog);
});
elements.closeCatalog.addEventListener("click", () => {
  elements.catalogPanel.hidden = true;
  focusControl(elements.showCatalog);
});
elements.catalogForm.addEventListener("submit", loadCatalog);
elements.catalogGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-catalog-install]");
  if (button) installFromCatalog(button.dataset.catalogInstall);
});
elements.closeAppForm.addEventListener("click", () => {
  elements.appForm.hidden = true;
  focusControl(elements.showAddApp);
});
elements.cancelAppForm.addEventListener("click", () => {
  elements.appForm.hidden = true;
  focusControl(elements.showAddApp);
});
elements.appForm.addEventListener("submit", addApplication);
elements.deviceForm.addEventListener("submit", saveDevice);
elements.appTable.addEventListener("click", (event) => {
  const button = event.target.closest("[data-delete]");
  if (button) removeApplication(button.dataset.delete);
});

fetch("/api/health")
  .then((response) => response.json())
  .then((health) => { elements.healthStatus.textContent = `Healthy · ${health.platform} · ${health.uptime}s uptime`; })
  .catch(() => { elements.healthStatus.textContent = "Unavailable"; });

setAuthorized(localControl || Boolean(token));
refresh().then(() => {
  document.querySelector("nav button.active")?.focus();
});
connectTvRemote();
