import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import express from "express";
import { WebSocketServer, WebSocket } from "ws";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const publicDir = path.join(root, "public");
const catalogPath = path.join(root, "catalog", "builtin.json");
const dataDir = path.join(root, "data");
const statePath = path.join(dataDir, "state.json");
const port = Number.parseInt(process.env.LANTV_PORT ?? "8787", 10);
const bindAddress = process.env.LANTV_BIND ?? "0.0.0.0";
const remoteCommands = new Set([
  "up", "down", "left", "right", "ok", "back", "home",
  "playPause", "previous", "next", "volumeUp", "volumeDown",
  "mute", "search", "menu"
]);
let activeRuntimePid = null;

const app = express();
const server = http.createServer(app);
const sockets = new Set();

app.disable("x-powered-by");
app.use(express.json({ limit: "256kb" }));
app.use((request, response, next) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Permissions-Policy", "camera=(), geolocation=(), microphone=()");
  next();
});
app.use(express.static(publicDir, {
  extensions: ["html"],
  maxAge: process.env.NODE_ENV === "production" ? "10m" : 0
}));

const builtinCatalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));
let state = await loadState();

function defaultState() {
  return {
    schemaVersion: 1,
    device: {
      name: "Living Room TV",
      theme: "midnight",
      serverUrl: "",
      jellyfinUrl: "http://jellyfin.local:8096"
    },
    pairing: {
      code: String(crypto.randomInt(100000, 1000000)),
      tokens: []
    },
    apps: builtinCatalog.apps,
    favorites: ["youtube", "netflix", "jellyfin", "browser"],
    updatedAt: new Date().toISOString()
  };
}

async function loadState() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    const loaded = JSON.parse(await fs.readFile(statePath, "utf8"));
    const builtinsById = new Map(builtinCatalog.apps.map((item) => [item.id, item]));
    const mergedApps = loaded.apps.map((item) => {
      const builtin = builtinsById.get(item.id);
      return builtin && builtin.removable === false
        ? { ...builtin, ...item, launch: { ...builtin.launch, ...item.launch } }
        : item;
    });
    for (const builtin of builtinCatalog.apps) {
      if (builtin.removable === false && !mergedApps.some((item) => item.id === builtin.id)) {
        mergedApps.push(builtin);
      }
    }
    return { ...defaultState(), ...loaded, apps: mergedApps };
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn("State was invalid; starting from defaults:", error.message);
    }
    const initial = defaultState();
    await saveState(initial);
    return initial;
  }
}

async function saveState(nextState = state) {
  nextState.updatedAt = new Date().toISOString();
  const temporary = `${statePath}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(nextState, null, 2)}\n`, "utf8");
  await fs.rename(temporary, statePath);
}

function publicState() {
  return {
    schemaVersion: state.schemaVersion,
    device: state.device,
    apps: state.apps,
    favorites: state.favorites,
    pairingRequired: true,
    pairingCode: state.pairing.code,
    updatedAt: state.updatedAt
  };
}

function validManifest(manifest) {
  if (!manifest || typeof manifest !== "object") return "Manifest must be an object.";
  if (!/^[a-z0-9][a-z0-9._-]{1,63}$/.test(manifest.id ?? "")) return "Invalid app id.";
  if (typeof manifest.name !== "string" || !manifest.name.trim()) return "App name is required.";
  if (!manifest.launch || typeof manifest.launch !== "object") return "Launch configuration is required.";
  if (!["tvapp", "web", "native", "flatpak", "appimage", "system"].includes(manifest.launch.type)) {
    return "Unsupported application type.";
  }
  if (manifest.launch.type === "web" || manifest.launch.type === "tvapp") {
    if (typeof manifest.launch.target !== "string" || !manifest.launch.target.trim()) {
      return "This application type requires a target.";
    }
  }
  return null;
}

function bearerToken(request) {
  const header = request.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}

function authorized(request) {
  const token = bearerToken(request);
  return token && state.pairing.tokens.some((item) => item.token === token);
}

function requireAuthorization(request, response, next) {
  if (!authorized(request)) {
    response.status(401).json({ error: "Pairing required." });
    return;
  }
  next();
}

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    service: "WatchOS",
    version: "0.1.0",
    hostname: os.hostname(),
    platform: process.platform,
    uptime: Math.floor(process.uptime())
  });
});

app.get("/api/state", (_request, response) => {
  response.json(publicState());
});

app.post("/api/pair", async (request, response) => {
  const code = String(request.body?.code ?? "");
  const name = String(request.body?.name ?? "Phone remote").slice(0, 80);
  if (code !== state.pairing.code) {
    response.status(403).json({ error: "Incorrect pairing code." });
    return;
  }

  const token = crypto.randomBytes(24).toString("base64url");
  state.pairing.tokens.push({
    token,
    name,
    createdAt: new Date().toISOString()
  });
  state.pairing.code = String(crypto.randomInt(100000, 1000000));
  await saveState();
  response.json({ token, device: state.device, nextPairingCode: state.pairing.code });
});

app.get("/api/apps", (_request, response) => {
  response.json({ apps: state.apps, favorites: state.favorites });
});

app.post("/api/apps", requireAuthorization, async (request, response) => {
  const manifest = request.body;
  const validationError = validManifest(manifest);
  if (validationError) {
    response.status(400).json({ error: validationError });
    return;
  }
  if (state.apps.some((item) => item.id === manifest.id)) {
    response.status(409).json({ error: "An application with this id already exists." });
    return;
  }

  const appManifest = {
    version: "1.0.0",
    description: "",
    category: "Other",
    accent: "#5865f2",
    icon: "◆",
    permissions: [],
    removable: true,
    ...manifest
  };
  state.apps.push(appManifest);
  await saveState();
  broadcast({ type: "state", state: publicState() });
  response.status(201).json(appManifest);
});

app.patch("/api/apps/:id", requireAuthorization, async (request, response) => {
  const index = state.apps.findIndex((item) => item.id === request.params.id);
  if (index === -1) {
    response.status(404).json({ error: "Application not found." });
    return;
  }

  const current = state.apps[index];
  const updated = {
    ...current,
    ...request.body,
    id: current.id,
    launch: { ...current.launch, ...(request.body.launch ?? {}) }
  };
  const validationError = validManifest(updated);
  if (validationError) {
    response.status(400).json({ error: validationError });
    return;
  }

  state.apps[index] = updated;
  await saveState();
  broadcast({ type: "state", state: publicState() });
  response.json(updated);
});

app.delete("/api/apps/:id", requireAuthorization, async (request, response) => {
  const application = state.apps.find((item) => item.id === request.params.id);
  if (!application) {
    response.status(404).json({ error: "Application not found." });
    return;
  }
  if (application.removable === false) {
    response.status(409).json({ error: "This system application cannot be removed." });
    return;
  }

  state.apps = state.apps.filter((item) => item.id !== request.params.id);
  state.favorites = state.favorites.filter((id) => id !== request.params.id);
  await saveState();
  broadcast({ type: "state", state: publicState() });
  response.status(204).end();
});

app.post("/api/catalog/preview", requireAuthorization, async (request, response) => {
  try {
    const catalog = await fetchCatalog(request.body?.url);
    response.json({
      name: catalog.name ?? "LAN application catalog",
      version: catalog.version ?? "1",
      apps: catalog.apps
    });
  } catch (error) {
    response.status(400).json({ error: error.message });
  }
});

app.post("/api/catalog/install", requireAuthorization, async (request, response) => {
  try {
    const catalog = await fetchCatalog(request.body?.url);
    const manifest = catalog.apps.find((item) => item.id === request.body?.appId);
    if (!manifest) {
      response.status(404).json({ error: "Application is not present in this catalog." });
      return;
    }
    const validationError = validManifest(manifest);
    if (validationError) {
      response.status(400).json({ error: validationError });
      return;
    }

    const existingIndex = state.apps.findIndex((item) => item.id === manifest.id);
    const installed = {
      permissions: [],
      removable: true,
      ...manifest,
      source: {
        type: "lan-catalog",
        catalogUrl: normalizedCatalogUrl(request.body?.url),
        installedAt: new Date().toISOString()
      }
    };
    if (existingIndex >= 0) {
      if (state.apps[existingIndex].removable === false) {
        response.status(409).json({ error: "A protected system application uses this ID." });
        return;
      }
      state.apps[existingIndex] = installed;
    } else {
      state.apps.push(installed);
    }
    await saveState();
    broadcast({ type: "state", state: publicState() });
    response.json(installed);
  } catch (error) {
    response.status(400).json({ error: error.message });
  }
});

app.post("/api/apps/:id/launch", requireAuthorization, async (request, response) => {
  const application = state.apps.find((item) => item.id === request.params.id);
  if (!application) {
    response.status(404).json({ error: "Application not found." });
    return;
  }

  const command = { type: "command", command: "launch", appId: application.id };
  broadcast(command, "tv");
  response.json({ ok: true, application: application.id });
});

app.post("/api/runtime/apps/:id/launch", async (request, response) => {
  const application = state.apps.find((item) => item.id === request.params.id);
  if (!application) {
    response.status(404).json({ error: "Application not found." });
    return;
  }

  try {
    const result = launchRuntimeApplication(application);
    response.json(result);
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
});

app.put("/api/device", requireAuthorization, async (request, response) => {
  const allowed = ["name", "theme", "serverUrl", "jellyfinUrl"];
  for (const key of allowed) {
    if (typeof request.body?.[key] === "string") {
      state.device[key] = request.body[key].slice(0, 2048);
    }
  }
  await saveState();
  broadcast({ type: "state", state: publicState() });
  response.json(state.device);
});

app.post("/api/command", requireAuthorization, (request, response) => {
  const command = String(request.body?.command ?? "");
  if (!remoteCommands.has(command)) {
    response.status(400).json({ error: "Unsupported command." });
    return;
  }

  handleRemoteCommand(command);
  response.json({ ok: true });
});

app.post("/api/text", requireAuthorization, (request, response) => {
  const text = String(request.body?.text ?? "").slice(0, 500);
  handleRemoteText(text);
  response.json({ ok: true });
});

app.get("/", (_request, response) => {
  response.redirect("/tv/");
});

const webSocketServer = new WebSocketServer({ server, path: "/ws" });

webSocketServer.on("connection", (socket, request) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const role = url.searchParams.get("role") === "remote" ? "remote" : "tv";
  const token = url.searchParams.get("token") ?? "";
  socket.meta = {
    role,
    authorized: role === "tv" || state.pairing.tokens.some((item) => item.token === token)
  };
  sockets.add(socket);

  socket.send(JSON.stringify({
    type: "hello",
    role,
    authorized: socket.meta.authorized,
    state: publicState()
  }));

  socket.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!socket.meta.authorized || socket.meta.role !== "remote") return;

    if (message.type === "command") {
      const command = String(message.command ?? "");
      if (command === "launch" && message.appId) {
        broadcast({ type: "command", command, appId: String(message.appId) }, "tv");
      } else if (remoteCommands.has(command)) {
        handleRemoteCommand(command);
      }
    } else if (message.type === "text") {
      handleRemoteText(String(message.text ?? "").slice(0, 500));
    }
  });

  socket.on("close", () => sockets.delete(socket));
  socket.on("error", () => sockets.delete(socket));
});

function broadcast(message, role = null) {
  const serialized = JSON.stringify(message);
  for (const socket of sockets) {
    if (socket.readyState !== WebSocket.OPEN) continue;
    if (role && socket.meta?.role !== role) continue;
    socket.send(serialized);
  }
}

function runtimeIsActive() {
  if (!activeRuntimePid || process.platform !== "linux") return false;
  try {
    process.kill(activeRuntimePid, 0);
    return true;
  } catch {
    activeRuntimePid = null;
    return false;
  }
}

function runDesktopCommand(executable, argumentsList) {
  const child = spawn(executable, argumentsList, {
    detached: false,
    stdio: "ignore",
    env: {
      ...process.env,
      DISPLAY: process.env.DISPLAY ?? ":0",
      XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR ?? "/tmp/lantv-runtime-1000"
    }
  });
  child.unref();
}

function handleRemoteCommand(command) {
  if (process.platform !== "linux" || !runtimeIsActive()) {
    broadcast({ type: "command", command }, "tv");
    return;
  }

  if (command === "home") {
    try {
      process.kill(-activeRuntimePid, "SIGTERM");
    } catch {
      // The application may already be closing.
    }
    activeRuntimePid = null;
    broadcast({ type: "command", command: "home" }, "tv");
    setTimeout(() => {
      runDesktopCommand("/usr/bin/xdotool", [
        "search", "--onlyvisible", "--class", "chromium",
        "windowactivate", "--sync"
      ]);
    }, 400);
    return;
  }

  if (command === "volumeUp" || command === "volumeDown") {
    runDesktopCommand("/usr/bin/wpctl", [
      "set-volume", "@DEFAULT_AUDIO_SINK@",
      command === "volumeUp" ? "5%+" : "5%-"
    ]);
    return;
  }
  if (command === "mute") {
    runDesktopCommand("/usr/bin/wpctl", ["set-mute", "@DEFAULT_AUDIO_SINK@", "toggle"]);
    return;
  }

  const key = {
    up: "Up",
    down: "Down",
    left: "Left",
    right: "Right",
    ok: "Return",
    back: "alt+Left",
    playPause: "XF86AudioPlay",
    previous: "XF86AudioPrev",
    next: "XF86AudioNext",
    search: "ctrl+l",
    menu: "shift+F10"
  }[command];
  if (key) runDesktopCommand("/usr/bin/xdotool", ["key", "--clearmodifiers", key]);
}

function handleRemoteText(text) {
  if (process.platform === "linux" && runtimeIsActive()) {
    runDesktopCommand("/usr/bin/xdotool", [
      "type", "--clearmodifiers", "--delay", "12", "--", text
    ]);
  } else {
    broadcast({ type: "text", text }, "tv");
  }
}

function launchRuntimeApplication(application) {
  const launch = application.launch;

  if (launch.type === "tvapp") {
    return { ok: true, mode: "navigate", target: launch.target };
  }

  if (process.platform !== "linux") {
    return {
      ok: true,
      mode: "simulated",
      message: `${application.name} is ready for the Linux runtime.`
    };
  }

  let executable;
  let argumentsList;

  if (launch.type === "web") {
    executable = process.env.LANTV_BROWSER ?? "/usr/bin/opera";
    argumentsList = [
      "--start-fullscreen",
      "--no-first-run",
      "--disable-session-crashed-bubble",
      ...(launch.browserProfile
        ? [`--user-data-dir=/var/lib/lantv/browser-profiles/${safeSegment(launch.browserProfile)}`]
        : []),
      launch.target
    ];
  } else if (launch.type === "native") {
    executable = launch.linux?.executable;
    argumentsList = launch.linux?.arguments ?? [];
    if (!executable?.startsWith("/")) {
      throw new Error("Native executable must use an absolute path.");
    }
  } else if (launch.type === "flatpak") {
    executable = "/usr/bin/flatpak";
    argumentsList = ["run", launch.flatpakId ?? launch.target];
  } else if (launch.type === "appimage") {
    executable = launch.target;
    argumentsList = [];
    if (!executable?.startsWith("/opt/lantv/apps/")) {
      throw new Error("AppImages must be installed under /opt/lantv/apps.");
    }
  } else if (launch.type === "system" && launch.action === "browser") {
    executable = process.env.LANTV_BROWSER ?? "/usr/bin/opera";
    argumentsList = ["--start-fullscreen", "about:blank"];
  } else {
    throw new Error(`Unsupported runtime action: ${launch.type}`);
  }

  const child = spawn(executable, argumentsList, {
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      DISPLAY: process.env.DISPLAY ?? ":0",
      XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR ?? "/run/user/1000"
    }
  });
  child.unref();
  activeRuntimePid = child.pid;
  child.once("exit", () => {
    if (activeRuntimePid === child.pid) activeRuntimePid = null;
  });

  return {
    ok: true,
    mode: "native",
    pid: child.pid,
    application: application.id
  };
}

function safeSegment(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]/g, "_");
}

function normalizedCatalogUrl(value) {
  const input = String(value ?? state.device.serverUrl ?? "").trim();
  if (!input) throw new Error("Enter the LAN catalog address.");
  const url = new URL(input);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Catalog address must use HTTP or HTTPS.");
  }
  if (!url.pathname || url.pathname === "/") {
    url.pathname = "/catalog.json";
  }
  return url.toString();
}

async function fetchCatalog(value) {
  const url = normalizedCatalogUrl(value);
  const response = await fetch(url, {
    signal: AbortSignal.timeout(5000),
    headers: { Accept: "application/json" }
  });
  if (!response.ok) {
    throw new Error(`Catalog returned HTTP ${response.status}.`);
  }
  const text = await response.text();
  if (text.length > 1_000_000) {
    throw new Error("Catalog is larger than 1 MB.");
  }
  const catalog = JSON.parse(text);
  if (!catalog || !Array.isArray(catalog.apps)) {
    throw new Error("Catalog does not contain an applications list.");
  }
  for (const manifest of catalog.apps) {
    const validationError = validManifest(manifest);
    if (validationError) throw new Error(`${manifest?.name ?? "Application"}: ${validationError}`);
  }
  return catalog;
}

server.listen(port, bindAddress, () => {
  const addresses = Object.values(os.networkInterfaces())
    .flat()
    .filter((item) => item && item.family === "IPv4" && !item.internal)
    .map((item) => `http://${item.address}:${port}`);
  console.log(`WatchOS is running on http://localhost:${port}`);
  for (const address of addresses) console.log(`LAN: ${address}`);
  console.log(`TV: http://localhost:${port}/tv/`);
  console.log(`Remote: http://localhost:${port}/remote/`);
  console.log(`Admin: http://localhost:${port}/admin/`);
});

process.on("SIGINT", () => {
  server.close(() => process.exit(0));
});
