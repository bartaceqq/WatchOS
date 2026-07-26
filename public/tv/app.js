const elements = {
  clock: document.querySelector("#clock"),
  date: document.querySelector("#date"),
  overlayClock: document.querySelector("#overlay-clock"),
  viewLabel: document.querySelector("#view-label"),
  homeView: document.querySelector("#home-view"),
  appsView: document.querySelector("#apps-view"),
  hero: document.querySelector("#hero"),
  heroCategory: document.querySelector("#hero-category"),
  heroTitle: document.querySelector("#hero-title"),
  heroDescription: document.querySelector("#hero-description"),
  heroSymbol: document.querySelector("#hero-symbol"),
  openSelected: document.querySelector("#open-selected"),
  homeGrid: document.querySelector("#home-grid"),
  appGrid: document.querySelector("#app-grid"),
  appCount: document.querySelector("#app-count"),
  systemDock: document.querySelector("#system-dock"),
  overlayTitle: document.querySelector("#overlay-title"),
  dockItems: [...document.querySelectorAll("[data-dock-action]")],
  resumeDockItem: document.querySelector("[data-dock-action=resume]"),
  volumeOsd: document.querySelector("#volume-osd"),
  volumeIcon: document.querySelector("#volume-icon"),
  volumeLabel: document.querySelector("#volume-label"),
  volumeLevel: document.querySelector("#volume-level"),
  toast: document.querySelector("#toast")
};

let state = { apps: [], favorites: [], runtime: { active: false, appId: null } };
let activeView = new URLSearchParams(location.search).get("view") === "apps" ? "apps" : "home";
let selectedAppId = null;
let dockIndex = 0;
let dockIsRuntimeOverlay = false;
let socket;
let reconnectTimer;
let toastTimer;
let volumeTimer;
let volumeLevel = 50;
let muted = false;

function updateClock() {
  const now = new Date();
  const time = new Intl.DateTimeFormat([], { hour: "2-digit", minute: "2-digit" }).format(now);
  elements.clock.textContent = time;
  elements.overlayClock.textContent = time;
  elements.date.textContent = new Intl.DateTimeFormat([], {
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(now).toUpperCase();
}

function appTypeLabel(application) {
  return {
    tvapp: "TV app",
    web: "Web service",
    native: "Native",
    flatpak: "Flatpak",
    appimage: "AppImage",
    system: "System"
  }[application.launch.type] ?? application.launch.type;
}

function favoriteApps() {
  const favorites = state.favorites
    .map((id) => state.apps.find((application) => application.id === id))
    .filter(Boolean);
  return favorites.length ? favorites.slice(0, 5) : state.apps.slice(0, 5);
}

function appsForView(view = activeView) {
  return view === "home" ? favoriteApps() : state.apps;
}

function selectedApplication() {
  return state.apps.find((application) => application.id === selectedAppId)
    ?? appsForView()[0]
    ?? null;
}

function createCard(application) {
  const card = document.createElement("button");
  card.className = "app-card";
  card.type = "button";
  card.role = "option";
  card.dataset.appId = application.id;
  card.style.setProperty("--app-accent", application.accent ?? "#5865f2");
  card.innerHTML = `
    <span class="app-icon" aria-hidden="true">${escapeHtml(application.icon)}</span>
    <span class="app-name">${escapeHtml(application.name)}</span>
    <span class="app-type">${escapeHtml(appTypeLabel(application))}</span>
  `;
  card.addEventListener("focus", () => selectApp(application.id, false));
  card.addEventListener("click", () => {
    selectApp(application.id, false);
    launchSelected();
  });
  return card;
}

function render(nextState) {
  state = nextState;
  const available = appsForView();
  if (!available.some((application) => application.id === selectedAppId)) {
    selectedAppId = available[0]?.id ?? state.apps[0]?.id ?? null;
  }

  elements.homeGrid.replaceChildren(...favoriteApps().map(createCard));
  elements.appGrid.replaceChildren(...state.apps.map(createCard));
  elements.appCount.textContent = String(state.apps.length);
  elements.resumeDockItem.hidden = !state.runtime?.active;
  renderView();
  selectApp(selectedAppId, false);
}

function activeGrid() {
  return activeView === "home" ? elements.homeGrid : elements.appGrid;
}

function renderView() {
  elements.homeView.hidden = activeView !== "home";
  elements.appsView.hidden = activeView !== "apps";
  elements.viewLabel.textContent = activeView.toUpperCase();
}

function setView(view, focus = true) {
  activeView = view === "apps" ? "apps" : "home";
  const available = appsForView();
  if (!available.some((application) => application.id === selectedAppId)) {
    selectedAppId = available[0]?.id ?? null;
  }
  renderView();
  selectApp(selectedAppId, focus);
}

function selectApp(appId, focus = true) {
  const application = state.apps.find((item) => item.id === appId);
  if (!application) return;
  selectedAppId = application.id;

  for (const grid of [elements.homeGrid, elements.appGrid]) {
    for (const card of grid.children) {
      const active = card.dataset.appId === selectedAppId;
      card.classList.toggle("selected", active);
      card.setAttribute("aria-selected", String(active));
    }
  }

  const card = [...activeGrid().children].find((item) => item.dataset.appId === selectedAppId);
  if (focus) card?.focus({ preventScroll: true });

  elements.hero.style.setProperty("--hero-accent", application.accent ?? "#7c5cff");
  elements.heroCategory.textContent = application.category?.toUpperCase() ?? "FEATURED";
  elements.heroTitle.textContent = application.name;
  elements.heroDescription.textContent = application.description || "Open application";
  elements.heroSymbol.textContent = application.icon;
}

function move(direction) {
  if (!elements.systemDock.hidden) {
    if (direction === "left") selectDock(dockIndex - 1);
    if (direction === "right") selectDock(dockIndex + 1);
    if (direction === "up") dismissDock();
    return;
  }

  const available = appsForView();
  if (!available.length) return;
  const current = Math.max(0, available.findIndex((application) => application.id === selectedAppId));
  const columns = activeView === "home"
    ? available.length
    : Math.max(1, getComputedStyle(elements.appGrid).gridTemplateColumns.split(" ").length);
  let next = current;
  if (direction === "left") next = Math.max(0, current - 1);
  if (direction === "right") next = Math.min(available.length - 1, current + 1);
  if (direction === "up") next = Math.max(0, current - columns);
  if (direction === "down") {
    const candidate = current + columns;
    if (activeView === "home" || candidate >= available.length) {
      showDock(activeView, false);
      return;
    }
    next = candidate;
  }
  selectApp(available[next].id);
}

async function launchSelected() {
  const application = selectedApplication();
  if (application) await launch(application);
}

async function launch(application) {
  showToast(`Opening ${application.name}…`);
  if (application.launch.type === "tvapp") {
    location.assign(application.launch.target);
    return;
  }

  const response = await fetch(`/api/runtime/apps/${encodeURIComponent(application.id)}/launch`, {
    method: "POST"
  });
  const result = await response.json();
  if (!response.ok) {
    showToast(result.error ?? `Could not open ${application.name}.`);
    return;
  }
  if (result.mode === "simulated") showToast(result.message);
}

function visibleDockItems() {
  return elements.dockItems.filter((item) => !item.hidden);
}

function selectDock(index) {
  const items = visibleDockItems();
  if (!items.length) return;
  dockIndex = (index + items.length) % items.length;
  elements.dockItems.forEach((item) => item.classList.remove("selected"));
  items[dockIndex].classList.add("selected");
  items[dockIndex].focus({ preventScroll: true });
}

function showDock(action = "home", runtimeOverlay = false) {
  dockIsRuntimeOverlay = Boolean(runtimeOverlay && state.runtime?.active);
  elements.systemDock.hidden = false;
  elements.resumeDockItem.hidden = !state.runtime?.active;
  elements.overlayTitle.textContent = dockIsRuntimeOverlay ? "App paused underneath" : "Quick controls";
  const items = visibleDockItems();
  const preferred = items.findIndex((item) => item.dataset.dockAction === (dockIsRuntimeOverlay ? "resume" : action));
  selectDock(preferred >= 0 ? preferred : 0);
}

function closeDock() {
  elements.systemDock.hidden = true;
  elements.dockItems.forEach((item) => item.classList.remove("selected"));
  selectApp(selectedAppId);
}

async function dismissDock() {
  const shouldResume = dockIsRuntimeOverlay && state.runtime?.active;
  dockIsRuntimeOverlay = false;
  closeDock();
  if (shouldResume) await sendSystemCommand("resume");
}

async function sendSystemCommand(command) {
  await fetch(`/api/runtime/command/${command}`, { method: "POST" });
}

function showVolume(command) {
  clearTimeout(volumeTimer);
  if (command === "volumeUp") {
    muted = false;
    volumeLevel = Math.min(100, volumeLevel + 5);
  }
  if (command === "volumeDown") {
    muted = false;
    volumeLevel = Math.max(0, volumeLevel - 5);
  }
  if (command === "mute") muted = !muted;
  elements.volumeIcon.innerHTML = muted ? "&#128263;" : "&#128266;";
  elements.volumeLabel.textContent = muted ? "Muted" : `Volume ${volumeLevel}`;
  elements.volumeLevel.style.width = `${muted ? 0 : volumeLevel}%`;
  elements.volumeOsd.hidden = false;
  volumeTimer = setTimeout(() => { elements.volumeOsd.hidden = true; }, 1800);
}

async function activateDockItem() {
  const action = visibleDockItems()[dockIndex]?.dataset.dockAction;
  if (!action) return;
  if (action === "resume") {
    dockIsRuntimeOverlay = false;
    closeDock();
    await sendSystemCommand("resume");
    return;
  }
  if (action === "home" || action === "apps") {
    dockIsRuntimeOverlay = false;
    closeDock();
    setView(action);
    return;
  }
  if (action === "settings") {
    dockIsRuntimeOverlay = false;
    location.assign("/admin/");
    return;
  }
  if (action === "browser") {
    dockIsRuntimeOverlay = false;
    const browserApp = state.apps.find((application) => application.id === "browser");
    if (browserApp) await launch(browserApp);
    return;
  }
  if (["volumeDown", "volumeUp", "mute"].includes(action)) {
    await sendSystemCommand(action);
  }
}

function handleCommand(message) {
  if (message.command === "launch" && message.appId) {
    const application = state.apps.find((item) => item.id === message.appId);
    if (application) {
      selectApp(application.id);
      launchSelected();
    }
    return;
  }

  if (["up", "down", "left", "right"].includes(message.command)) move(message.command);
  if (message.command === "ok") {
    if (elements.systemDock.hidden) launchSelected();
    else activateDockItem();
  }
  if (message.command === "home") showDock(activeView, message.overlay);
  if (message.command === "back") {
    if (!elements.systemDock.hidden) dismissDock();
    else if (activeView === "apps") setView("home");
  }
  if (message.command === "exit") {
    dockIsRuntimeOverlay = false;
    closeDock();
    setView("home");
  }
  if (message.command === "menu") showDock("settings", false);
  if (["volumeDown", "volumeUp", "mute"].includes(message.command)) showVolume(message.command);
  if (message.command === "search") showToast("Open Browser to search the web.");
}

function connect() {
  clearTimeout(reconnectTimer);
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  socket = new WebSocket(`${protocol}//${location.host}/ws?role=tv`);
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (message.state) render(message.state);
    if (message.type === "command") handleCommand(message);
    if (message.type === "text" && message.text) showToast(`Phone typed: ${message.text}`);
  });
  socket.addEventListener("close", () => {
    reconnectTimer = setTimeout(connect, 1500);
  });
}

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  toastTimer = setTimeout(() => elements.toast.classList.remove("visible"), 2600);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
    Meta: "home",
    F4: "exit",
    m: "menu",
    M: "menu",
    "/": "search"
  }[event.key];
  if (!command) return;
  event.preventDefault();
  handleCommand({ command, overlay: command === "home" && state.runtime?.active });
});

elements.openSelected.addEventListener("click", launchSelected);
elements.dockItems.forEach((item) => {
  item.addEventListener("focus", () => {
    const index = visibleDockItems().indexOf(item);
    if (index >= 0) selectDock(index);
  });
  item.addEventListener("click", () => {
    const index = visibleDockItems().indexOf(item);
    if (index >= 0) dockIndex = index;
    activateDockItem();
  });
});

updateClock();
setInterval(updateClock, 15_000);
fetch("/api/state").then((response) => response.json()).then((nextState) => {
  render(nextState);
  const params = new URLSearchParams(location.search);
  if (params.get("dock") === "1") showDock(activeView, false);
});
connect();
