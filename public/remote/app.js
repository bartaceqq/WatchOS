const tokenKey = "watchos.remote.token";
const elements = {
  deviceName: document.querySelector("#device-name"),
  status: document.querySelector("#status"),
  pairCard: document.querySelector("#pair-card"),
  pairForm: document.querySelector("#pair-form"),
  pairCode: document.querySelector("#pair-code"),
  pairError: document.querySelector("#pair-error"),
  controls: document.querySelector("#controls"),
  appList: document.querySelector("#app-list"),
  keyboardForm: document.querySelector("#keyboard-form"),
  keyboardInput: document.querySelector("#keyboard-input")
};

let token = localStorage.getItem(tokenKey) ?? "";
let state;
let socket;
let reconnectTimer;

function setConnected(connected) {
  elements.status.classList.toggle("online", connected);
  elements.status.querySelector("span").textContent = connected ? "Connected" : "Offline";
}

function showControls(show) {
  elements.pairCard.hidden = show;
  elements.controls.hidden = !show;
}

async function pair(event) {
  event.preventDefault();
  elements.pairError.textContent = "";
  const code = elements.pairCode.value.replace(/\D/g, "");
  if (code.length !== 6) {
    elements.pairError.textContent = "Enter all six digits.";
    return;
  }

  const response = await fetch("/api/pair", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      name: navigator.userAgent.includes("iPhone") ? "iPhone remote" : "Phone remote"
    })
  });
  const result = await response.json();
  if (!response.ok) {
    elements.pairError.textContent = result.error ?? "Pairing failed.";
    return;
  }

  token = result.token;
  localStorage.setItem(tokenKey, token);
  elements.deviceName.textContent = result.device.name;
  showControls(true);
  connect();
}

function connect() {
  if (!token) {
    showControls(false);
    return;
  }
  clearTimeout(reconnectTimer);
  socket?.close();
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  socket = new WebSocket(`${protocol}//${location.host}/ws?role=remote&token=${encodeURIComponent(token)}`);
  socket.addEventListener("open", () => setConnected(true));
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (!message.authorized && message.type === "hello") {
      token = "";
      localStorage.removeItem(tokenKey);
      showControls(false);
      setConnected(false);
      return;
    }
    if (message.state) renderState(message.state);
  });
  socket.addEventListener("close", () => {
    setConnected(false);
    if (token) reconnectTimer = setTimeout(connect, 1500);
  });
}

function send(message) {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
    if (navigator.vibrate) navigator.vibrate(12);
  }
}

function renderState(nextState) {
  state = nextState;
  elements.deviceName.textContent = state.device?.name ?? "WatchOS";
  elements.appList.replaceChildren();
  const favorites = state.favorites?.length
    ? state.favorites.map((id) => state.apps.find((app) => app.id === id)).filter(Boolean)
    : state.apps.slice(0, 8);

  for (const application of favorites) {
    const button = document.createElement("button");
    button.className = "remote-app";
    button.style.setProperty("--app-accent", application.accent ?? "#5865f2");
    button.innerHTML = `
      <span class="icon">${escapeHtml(application.icon)}</span>
      <span class="name">${escapeHtml(application.name)}</span>
    `;
    button.addEventListener("click", () => send({
      type: "command",
      command: "launch",
      appId: application.id
    }));
    elements.appList.append(button);
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

elements.pairForm.addEventListener("submit", pair);
elements.pairCode.addEventListener("input", () => {
  elements.pairCode.value = elements.pairCode.value.replace(/\D/g, "").slice(0, 6);
});

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-command]");
  if (button) send({ type: "command", command: button.dataset.command });
});

elements.keyboardForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = elements.keyboardInput.value;
  if (!text) return;
  send({ type: "text", text });
  elements.keyboardInput.value = "";
});

fetch("/api/state")
  .then((response) => response.json())
  .then((nextState) => {
    renderState(nextState);
    showControls(Boolean(token));
    if (token) connect();
  });
