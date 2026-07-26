import { createTvKeyboard } from "/shared/tv-keyboard.js";
import { createSystemOverlay } from "/shared/system-overlay.js";

const form = document.querySelector("#video-form");
const input = document.querySelector("#video-input");
const intro = document.querySelector("#intro");
const playerShell = document.querySelector("#player-shell");
const toast = document.querySelector("#toast");
let player;
let pendingVideoId;
let socket;
let toastTimer;
let editingInput = false;
const tvKeyboard = createTvKeyboard({
  onDone: () => {
    editingInput = false;
    input.classList.remove("tv-editing");
  }
});
const systemOverlay = createSystemOverlay();

function parseVideoId(value) {
  const text = value.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(text)) return text;
  try {
    const url = new URL(text);
    if (url.hostname === "youtu.be") return url.pathname.slice(1).split("/")[0];
    if (url.hostname.endsWith("youtube.com")) {
      if (url.pathname === "/watch") return url.searchParams.get("v");
      if (url.pathname.startsWith("/shorts/")) return url.pathname.split("/")[2];
      if (url.pathname.startsWith("/embed/")) return url.pathname.split("/")[2];
    }
  } catch {
    return null;
  }
  return null;
}

function play(value) {
  const videoId = parseVideoId(value);
  if (!videoId) {
    showToast("Enter a valid YouTube video link or 11-character ID.");
    return;
  }
  pendingVideoId = videoId;
  intro.hidden = true;
  playerShell.hidden = false;
  if (player?.loadVideoById) {
    player.loadVideoById(videoId);
  } else if (window.YT?.Player) {
    createPlayer(videoId);
  }
}

function createPlayer(videoId) {
  player = new YT.Player("player", {
    videoId,
    width: "100%",
    height: "100%",
    playerVars: {
      autoplay: 1,
      controls: 1,
      rel: 0,
      playsinline: 1,
      origin: location.origin
    },
    events: {
      onError: ({ data }) => showToast(`YouTube player error ${data}`)
    }
  });
}

window.onYouTubeIframeAPIReady = () => {
  if (pendingVideoId) createPlayer(pendingVideoId);
};

function command(name) {
  if (systemOverlay.handle(name)) return;
  if (name === "menu") {
    location.assign("/admin/");
    return;
  }
  if (tvKeyboard.isOpen() && tvKeyboard.handle(name)) return;
  if (name === "back" || name === "exit") {
    location.assign("/tv/");
    return;
  }
  if (name === "playPause" && player) {
    player.getPlayerState() === YT.PlayerState.PLAYING ? player.pauseVideo() : player.playVideo();
  }
  if (name === "left" && player) player.seekTo(Math.max(0, player.getCurrentTime() - 10), true);
  if (name === "right" && player) player.seekTo(player.getCurrentTime() + 10, true);
  if (name === "volumeUp" && player) player.setVolume(Math.min(100, player.getVolume() + 8));
  if (name === "volumeDown" && player) player.setVolume(Math.max(0, player.getVolume() - 8));
  if (name === "mute" && player) player.isMuted() ? player.unMute() : player.mute();
  if (!player && ["up", "down", "left", "right"].includes(name)) {
    moveFocus(`Arrow${name[0].toUpperCase()}${name.slice(1)}`);
  }
}

function connect() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  socket = new WebSocket(`${protocol}//${location.host}/ws?role=tv`);
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (message.type === "command") command(message.command);
    if (message.type === "text") {
      input.value = message.text;
      input.focus();
    }
  });
  socket.addEventListener("close", () => setTimeout(connect, 1500));
}

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("visible");
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 2600);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  editingInput = false;
  tvKeyboard.close();
  input.classList.remove("tv-editing");
  play(input.value);
});
document.querySelector("#focus-input").addEventListener("click", () => {
  input.focus();
  editingInput = true;
  input.classList.add("tv-editing");
  tvKeyboard.open(input);
  showToast("Type a link · press OK when finished");
});

function visibleControls() {
  return [...document.querySelectorAll("a[href], button:not([disabled]), input:not([disabled])")]
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
  const bounds = current.getBoundingClientRect();
  const originX = bounds.left + bounds.width / 2;
  const originY = bounds.top + bounds.height / 2;
  const vertical = direction === "ArrowUp" || direction === "ArrowDown";
  const positive = direction === "ArrowDown" || direction === "ArrowRight";
  const candidate = controls
    .filter((control) => control !== current)
    .map((control) => {
      const next = control.getBoundingClientRect();
      const x = next.left + next.width / 2;
      const y = next.top + next.height / 2;
      const primary = vertical ? y - originY : x - originX;
      const cross = vertical ? x - originX : y - originY;
      return { control, primary, score: Math.abs(primary) + Math.abs(cross) * 2.5 };
    })
    .filter(({ primary }) => positive ? primary > 4 : primary < -4)
    .sort((a, b) => a.score - b.score)[0]?.control;
  const currentIndex = Math.max(0, controls.indexOf(current));
  const fallback = controls[
    (currentIndex + (positive ? 1 : -1) + controls.length) % controls.length
  ];
  (candidate ?? fallback).focus({ preventScroll: true });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Home" || event.key === "Meta") {
    event.preventDefault();
    command("home");
    return;
  }
  if (event.key === "F4") {
    event.preventDefault();
    command("exit");
    return;
  }
  if (event.key.toLowerCase() === "m") {
    event.preventDefault();
    command("menu");
    return;
  }
  if (editingInput) {
    const keyboardCommand = {
      ArrowUp: "up",
      ArrowDown: "down",
      ArrowLeft: "left",
      ArrowRight: "right",
      Enter: "ok",
      Escape: "back",
      Backspace: "back"
    }[event.key];
    if (keyboardCommand) {
      event.preventDefault();
      tvKeyboard.handle(keyboardCommand);
    }
    return;
  }
  if (event.key === "Escape" || event.key === "Backspace") {
    event.preventDefault();
    command("back");
    return;
  }
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
    event.preventDefault();
    if (!player) moveFocus(event.key);
    else command(event.key === "ArrowLeft" ? "left" : event.key === "ArrowRight" ? "right" : "");
    return;
  }
  if ((event.key === "Enter" || event.key === " ") && document.activeElement === input) {
    event.preventDefault();
    editingInput = true;
    input.classList.add("tv-editing");
    tvKeyboard.open(input);
    showToast("Type a link · press OK when finished");
  }
});
document.querySelector("#focus-input").focus();
connect();
