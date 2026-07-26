const elements = {
  deviceName: document.querySelector("#device-name"),
  connection: document.querySelector("#connection"),
  clock: document.querySelector("#clock"),
  hero: document.querySelector("#hero"),
  heroCategory: document.querySelector("#hero-category"),
  heroTitle: document.querySelector("#hero-title"),
  heroDescription: document.querySelector("#hero-description"),
  heroSymbol: document.querySelector("#hero-symbol"),
  pairingCode: document.querySelector("#pairing-code"),
  openSelected: document.querySelector("#open-selected"),
  appGrid: document.querySelector("#app-grid"),
  appCount: document.querySelector("#app-count"),
  toast: document.querySelector("#toast")
};

let state = { apps: [], favorites: [] };
let selectedIndex = 0;
let socket;
let reconnectTimer;
let toastTimer;

function updateClock() {
  elements.clock.textContent = new Intl.DateTimeFormat([], {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date());
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
  elements.deviceName.textContent = state.device?.name ?? "WatchOS";
  elements.pairingCode.textContent = state.pairingCode ?? "------";
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
  const columns = getComputedStyle(elements.appGrid).gridTemplateColumns.split(" ").length;
  if (direction === "left") select(selectedIndex - 1);
  if (direction === "right") select(selectedIndex + 1);
  if (direction === "up") select(selectedIndex - columns);
  if (direction === "down") select(selectedIndex + columns);
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
  if (message.command === "ok") launchSelected();
  if (message.command === "home") window.location.assign("/tv/");
  if (message.command === "back") history.back();
  if (message.command === "search") showToast("Search will be available in the next launcher build.");
}

function connect() {
  clearTimeout(reconnectTimer);
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  socket = new WebSocket(`${protocol}//${location.host}/ws?role=tv`);

  socket.addEventListener("open", () => {
    elements.connection.classList.add("online");
    elements.connection.querySelector("span").textContent = "LAN connected";
  });

  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (message.state) render(message.state);
    if (message.type === "command") handleCommand(message);
    if (message.type === "text" && message.text) showToast(`Phone typed: ${message.text}`);
  });

  socket.addEventListener("close", () => {
    elements.connection.classList.remove("online");
    elements.connection.querySelector("span").textContent = "Reconnecting";
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
    Home: "home"
  }[event.key];
  if (!command) return;
  event.preventDefault();
  handleCommand({ command });
});

elements.openSelected.addEventListener("click", launchSelected);
updateClock();
setInterval(updateClock, 15_000);
fetch("/api/state").then((response) => response.json()).then(render);
connect();
