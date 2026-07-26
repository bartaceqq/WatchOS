const elements = {
  clock: document.querySelector("#clock"),
  date: document.querySelector("#date"),
  hero: document.querySelector("#hero"),
  heroCategory: document.querySelector("#hero-category"),
  heroTitle: document.querySelector("#hero-title"),
  heroDescription: document.querySelector("#hero-description"),
  heroSymbol: document.querySelector("#hero-symbol"),
  openSelected: document.querySelector("#open-selected"),
  appGrid: document.querySelector("#app-grid"),
  appCount: document.querySelector("#app-count"),
  systemDock: document.querySelector("#system-dock"),
  dockItems: [...document.querySelectorAll("[data-dock-action]")],
  volumeOsd: document.querySelector("#volume-osd"),
  volumeIcon: document.querySelector("#volume-icon"),
  volumeLabel: document.querySelector("#volume-label"),
  volumeLevel: document.querySelector("#volume-level"),
  toast: document.querySelector("#toast")
};

let state = { apps: [], favorites: [] };
let selectedIndex = 0;
let socket;
let reconnectTimer;
let toastTimer;
let volumeTimer;
let volumeLevel = 50;
let muted = false;
let dockIndex = 0;

function updateClock() {
  const now = new Date();
  elements.clock.textContent = new Intl.DateTimeFormat([], {
    hour: "2-digit",
    minute: "2-digit"
  }).format(now);
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

function render(nextState) {
  state = nextState;
  selectedIndex = Math.min(selectedIndex, Math.max(0, state.apps.length - 1));
  elements.appCount.textContent = `${state.apps.length} ${state.apps.length === 1 ? "app" : "apps"}`;
  elements.appGrid.replaceChildren();

  state.apps.forEach((application, index) => {
    const card = document.createElement("button");
    card.className = "app-card";
    card.type = "button";
    card.role = "option";
    card.dataset.index = String(index);
    card.style.setProperty("--app-accent", application.accent ?? "#5865f2");
    card.innerHTML = `
      <span class="app-icon" aria-hidden="true">${escapeHtml(application.icon)}</span>
      <span class="app-name">${escapeHtml(application.name)}</span>
      <span class="app-type">${escapeHtml(appTypeLabel(application))}</span>
    `;
    card.addEventListener("click", () => {
      select(index);
      launchSelected();
    });
    card.addEventListener("focus", () => select(index, false));
    elements.appGrid.append(card);
  });

  select(selectedIndex, false);
}

function select(index, focus = true) {
  if (!state.apps.length) return;
  selectedIndex = (index + state.apps.length) % state.apps.length;
  const selected = state.apps[selectedIndex];

  for (const card of elements.appGrid.children) {
    const active = Number(card.dataset.index) === selectedIndex;
    card.classList.toggle("selected", active);
    card.setAttribute("aria-selected", String(active));
    if (active && focus) card.focus({ preventScroll: true });
  }

  elements.hero.style.setProperty("--hero-accent", selected.accent ?? "#7c5cff");
  elements.heroCategory.textContent = selected.category?.toUpperCase() ?? "APPLICATION";
  elements.heroTitle.textContent = selected.name;
  elements.heroDescription.textContent = selected.description || "Open application";
  elements.heroSymbol.textContent = selected.icon;
}

function move(direction) {
  if (!elements.systemDock.hidden) {
    if (direction === "left") selectDock(dockIndex - 1);
    if (direction === "right") selectDock(dockIndex + 1);
    if (direction === "up") closeDock();
    return;
  }
  const columns = getComputedStyle(elements.appGrid).gridTemplateColumns.split(" ").length;
  if (direction === "left") select(selectedIndex - 1);
  if (direction === "right") select(selectedIndex + 1);
  if (direction === "up") select(selectedIndex - columns);
  if (direction === "down") showDock();
}

async function launchSelected() {
  const application = state.apps[selectedIndex];
  if (!application) return;
  await launch(application);
}

async function launch(application) {
  const launch = application.launch;
  showToast(`Opening ${application.name}…`);

  if (launch.type === "tvapp") {
    window.location.assign(launch.target);
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
  if (result.mode === "simulated") {
    showToast(result.message);
  }
}

function selectDock(index) {
  dockIndex = (index + elements.dockItems.length) % elements.dockItems.length;
  elements.dockItems.forEach((item, itemIndex) => {
    item.classList.toggle("selected", itemIndex === dockIndex);
  });
  elements.dockItems[dockIndex]?.focus({ preventScroll: true });
}

function showDock(action = "home") {
  elements.systemDock.hidden = false;
  const preferred = elements.dockItems.findIndex((item) => item.dataset.dockAction === action);
  selectDock(preferred >= 0 ? preferred : 0);
}

function closeDock() {
  elements.systemDock.hidden = true;
  elements.dockItems.forEach((item) => item.classList.remove("selected"));
  select(selectedIndex);
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
  const action = elements.dockItems[dockIndex]?.dataset.dockAction;
  if (action === "home" || action === "apps") {
    closeDock();
    document.querySelector(".apps-section")?.scrollIntoView({ block: "nearest" });
    return;
  }
  if (action === "settings") {
    window.location.assign("/admin/");
    return;
  }
  if (action === "browser") {
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
    const index = state.apps.findIndex((item) => item.id === message.appId);
    if (index >= 0) {
      select(index);
      launchSelected();
    }
    return;
  }

  const keyMap = {
    up: "up",
    down: "down",
    left: "left",
    right: "right"
  };
  if (keyMap[message.command]) move(keyMap[message.command]);
  if (message.command === "ok") {
    if (elements.systemDock.hidden) launchSelected();
    else activateDockItem();
  }
  if (message.command === "home") showDock("home");
  if (message.command === "back") history.back();
  if (message.command === "exit") window.location.assign("/tv/");
  if (message.command === "menu") showDock("settings");
  if (["volumeDown", "volumeUp", "mute"].includes(message.command)) showVolume(message.command);
  if (message.command === "search") showToast("Search will be available in the next launcher build.");
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
  if (command === "back" && !elements.systemDock.hidden) {
    closeDock();
    return;
  }
  handleCommand({ command });
});

elements.openSelected.addEventListener("click", launchSelected);
elements.dockItems.forEach((item, index) => {
  item.addEventListener("focus", () => selectDock(index));
  item.addEventListener("click", () => {
    dockIndex = index;
    activateDockItem();
  });
});
updateClock();
setInterval(updateClock, 15_000);
fetch("/api/state").then((response) => response.json()).then((nextState) => {
  render(nextState);
  if (new URLSearchParams(location.search).get("dock") === "1") showDock();
});
connect();
