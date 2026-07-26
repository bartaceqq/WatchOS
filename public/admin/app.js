const tokenKey = "watchos.remote.token";
let token = localStorage.getItem(tokenKey) ?? "";
let state;
let toastTimer;

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
  toast: document.querySelector("#toast")
};

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

function visibleControls() {
  return [...document.querySelectorAll(
    "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])"
  )].filter((control) => {
    const style = getComputedStyle(control);
    const bounds = control.getBoundingClientRect();
    return !control.hidden
      && style.display !== "none"
      && style.visibility !== "hidden"
      && bounds.width > 0
      && bounds.height > 0;
  });
}

function moveFocus(direction) {
  const controls = visibleControls();
  if (!controls.length) return;

  const current = controls.includes(document.activeElement)
    ? document.activeElement
    : controls[0];
  const currentBounds = current.getBoundingClientRect();
  const originX = currentBounds.left + currentBounds.width / 2;
  const originY = currentBounds.top + currentBounds.height / 2;
  const vertical = direction === "ArrowUp" || direction === "ArrowDown";
  const positive = direction === "ArrowDown" || direction === "ArrowRight";

  const candidates = controls
    .filter((control) => control !== current)
    .map((control) => {
      const bounds = control.getBoundingClientRect();
      const x = bounds.left + bounds.width / 2;
      const y = bounds.top + bounds.height / 2;
      const primary = vertical ? y - originY : x - originX;
      const cross = vertical ? x - originX : y - originY;
      return { control, primary, score: Math.abs(primary) + Math.abs(cross) * 2.5 };
    })
    .filter(({ primary }) => positive ? primary > 4 : primary < -4)
    .sort((a, b) => a.score - b.score);

  (candidates[0]?.control ?? current).focus({ preventScroll: true });
  document.activeElement.scrollIntoView({ block: "nearest", inline: "nearest" });
}

function returnToTelevision() {
  location.assign("/tv/");
}

document.addEventListener("keydown", (event) => {
  const editing = event.target.matches("input, textarea, select");

  if (event.key === "Home" || (!editing && (event.key === "Escape"
    || event.key === "Backspace"
    || event.key.toLowerCase() === "m"))) {
    event.preventDefault();
    returnToTelevision();
    return;
  }

  if (!editing && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
    event.preventDefault();
    moveFocus(event.key);
  }
});

document.querySelectorAll("nav button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("nav button").forEach((item) => item.classList.toggle("active", item === button));
    document.querySelectorAll(".page").forEach((page) => page.classList.toggle("active", page.id === button.dataset.section));
  });
});

elements.authForm.addEventListener("submit", pair);
elements.authCode.addEventListener("input", () => {
  elements.authCode.value = elements.authCode.value.replace(/\D/g, "").slice(0, 6);
});
elements.showAddApp.addEventListener("click", () => { elements.appForm.hidden = false; });
elements.showCatalog.addEventListener("click", () => {
  elements.catalogPanel.hidden = false;
  elements.catalogUrl.value ||= state.device?.serverUrl || `http://${location.hostname}:8788/catalog.json`;
});
elements.closeCatalog.addEventListener("click", () => { elements.catalogPanel.hidden = true; });
elements.catalogForm.addEventListener("submit", loadCatalog);
elements.catalogGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-catalog-install]");
  if (button) installFromCatalog(button.dataset.catalogInstall);
});
elements.closeAppForm.addEventListener("click", () => { elements.appForm.hidden = true; });
elements.cancelAppForm.addEventListener("click", () => { elements.appForm.hidden = true; });
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

setAuthorized(Boolean(token));
refresh().then(() => {
  document.querySelector("nav button.active")?.focus();
});
