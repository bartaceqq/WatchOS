const elements = {
  intro: document.querySelector("#intro"),
  openFile: document.querySelector("#open-file"),
  fileInput: document.querySelector("#file-input"),
  playerShell: document.querySelector("#player-shell"),
  player: document.querySelector("#player"),
  fileName: document.querySelector("#file-name"),
  closePlayer: document.querySelector("#close-player"),
  toast: document.querySelector("#toast")
};

let socket;
let reconnectTimer;
let toastTimer;
let mediaUrl;

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  toastTimer = setTimeout(() => elements.toast.classList.remove("visible"), 2400);
}

function closePlayer() {
  elements.player.pause();
  elements.player.removeAttribute("src");
  elements.player.load();
  if (mediaUrl) URL.revokeObjectURL(mediaUrl);
  mediaUrl = null;
  elements.playerShell.hidden = true;
  elements.intro.hidden = false;
  elements.openFile.focus();
}

function visibleControls() {
  return [...document.querySelectorAll("a[href], button:not([disabled]), video[controls]")]
    .filter((control) => {
      const bounds = control.getBoundingClientRect();
      const style = getComputedStyle(control);
      return style.display !== "none"
        && style.visibility !== "hidden"
        && bounds.width > 0
        && bounds.height > 0;
    });
}

function moveFocus(direction) {
  const controls = visibleControls();
  if (!controls.length) return;
  const current = controls.includes(document.activeElement) ? document.activeElement : controls[0];
  const currentIndex = Math.max(0, controls.indexOf(current));
  const delta = direction === "left" || direction === "up" ? -1 : 1;
  controls[(currentIndex + delta + controls.length) % controls.length].focus();
}

function command(name) {
  if (name === "home" || name === "back" || name === "exit") {
    location.assign("/tv/");
    return;
  }
  if (name === "menu") {
    location.assign("/admin/");
    return;
  }
  if (["up", "down", "left", "right"].includes(name)) {
    moveFocus(name);
    return;
  }
  if (name === "ok") {
    if (document.activeElement === elements.player) {
      elements.player.paused ? elements.player.play() : elements.player.pause();
    } else {
      document.activeElement.click?.();
    }
  }
  if (name === "playPause" && elements.player.src) {
    elements.player.paused ? elements.player.play() : elements.player.pause();
  }
}

function connect() {
  clearTimeout(reconnectTimer);
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  socket = new WebSocket(`${protocol}//${location.host}/ws?role=tv`);
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (message.type === "command") command(message.command);
  });
  socket.addEventListener("close", () => {
    reconnectTimer = setTimeout(connect, 1500);
  });
}

elements.openFile.addEventListener("click", () => elements.fileInput.click());
elements.closePlayer.addEventListener("click", closePlayer);
elements.fileInput.addEventListener("change", () => {
  const [file] = elements.fileInput.files;
  if (!file) return;
  if (mediaUrl) URL.revokeObjectURL(mediaUrl);
  mediaUrl = URL.createObjectURL(file);
  elements.fileName.textContent = file.name;
  elements.player.src = mediaUrl;
  elements.intro.hidden = true;
  elements.playerShell.hidden = false;
  elements.player.focus();
  elements.player.play().catch(() => showToast("Press OK to start playback"));
});

document.addEventListener("keydown", (event) => {
  const mapped = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    Enter: "ok",
    " ": "playPause",
    Escape: "back",
    Backspace: "back",
    Home: "home",
    F4: "exit",
    m: "menu",
    M: "menu"
  }[event.key];
  if (!mapped) return;
  event.preventDefault();
  command(mapped);
});

elements.openFile.focus();
connect();
