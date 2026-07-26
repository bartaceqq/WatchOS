import assert from "node:assert/strict";
import { WebSocket } from "ws";

const baseUrl = process.env.LANTV_URL ?? "http://localhost:8787";

const health = await jsonRequest("/api/health");
assert.equal(health.ok, true);

const initialState = await jsonRequest("/api/state");
assert.ok(initialState.apps.length >= 6);
assert.match(initialState.pairingCode, /^\d{6}$/);

const pairing = await jsonRequest("/api/pair", {
  method: "POST",
  body: {
    code: initialState.pairingCode,
    name: "Automated smoke test"
  }
});
assert.ok(pairing.token);

const television = await openSocket("tv");
const remote = await openSocket("remote", pairing.token);

const commandReceived = new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error("TV did not receive remote command.")), 3000);
  television.on("message", (raw) => {
    const message = JSON.parse(raw.toString());
    if (message.type === "command" && message.command === "right") {
      clearTimeout(timeout);
      resolve(message);
    }
  });
});

remote.send(JSON.stringify({ type: "command", command: "right" }));
await commandReceived;

const testApp = {
  id: "smoke-test-app",
  name: "Smoke Test",
  version: "1.0.0",
  description: "Temporary application used by the automated test.",
  category: "Test",
  icon: "✓",
  accent: "#45c486",
  launch: {
    type: "web",
    target: "https://example.com",
    fullscreen: true
  },
  permissions: ["network"],
  removable: true
};

const installed = await jsonRequest("/api/apps", {
  method: "POST",
  token: pairing.token,
  body: testApp
});
assert.equal(installed.id, testApp.id);

const afterInstall = await jsonRequest("/api/apps");
assert.ok(afterInstall.apps.some((application) => application.id === testApp.id));

await jsonRequest(`/api/apps/${testApp.id}`, {
  method: "DELETE",
  token: pairing.token,
  expectEmpty: true
});

const finalApps = await jsonRequest("/api/apps");
assert.ok(!finalApps.apps.some((application) => application.id === testApp.id));

television.close();
remote.close();

console.log(JSON.stringify({
  ok: true,
  health: health.service,
  apps: finalApps.apps.length,
  realtimeCommand: "received",
  installAndRemove: "passed"
}, null, 2));

async function jsonRequest(route, options = {}) {
  const headers = {};
  if (options.body) headers["Content-Type"] = "application/json";
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  const response = await fetch(`${baseUrl}${route}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (!response.ok) {
    throw new Error(`${options.method ?? "GET"} ${route} returned ${response.status}: ${await response.text()}`);
  }
  if (options.expectEmpty) return null;
  return response.json();
}

function openSocket(role, token = "") {
  return new Promise((resolve, reject) => {
    const url = new URL(baseUrl);
    const socket = new WebSocket(
      `${url.protocol === "https:" ? "wss:" : "ws:"}//${url.host}/ws?role=${role}&token=${encodeURIComponent(token)}`
    );
    const timeout = setTimeout(() => reject(new Error(`Could not connect ${role} socket.`)), 3000);
    socket.once("open", () => {
      clearTimeout(timeout);
      resolve(socket);
    });
    socket.once("error", reject);
  });
}
