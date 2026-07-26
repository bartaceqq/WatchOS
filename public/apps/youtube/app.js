const form = document.querySelector("#video-form");
const input = document.querySelector("#video-input");
const intro = document.querySelector("#intro");
const playerShell = document.querySelector("#player-shell");
const toast = document.querySelector("#toast");
let player;
let pendingVideoId;
let socket;
let toastTimer;

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
  if (name === "home") location.assign("/tv/");
  if (name === "back") history.back();
  if (name === "playPause" && player) {
    player.getPlayerState() === YT.PlayerState.PLAYING ? player.pauseVideo() : player.playVideo();
  }
  if (name === "left" && player) player.seekTo(Math.max(0, player.getCurrentTime() - 10), true);
  if (name === "right" && player) player.seekTo(player.getCurrentTime() + 10, true);
  if (name === "volumeUp" && player) player.setVolume(Math.min(100, player.getVolume() + 8));
  if (name === "volumeDown" && player) player.setVolume(Math.max(0, player.getVolume() - 8));
  if (name === "mute" && player) player.isMuted() ? player.unMute() : player.mute();
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
  play(input.value);
});
document.querySelector("#focus-input").addEventListener("click", () => input.focus());
document.addEventListener("keydown", (event) => {
  const mapped = {
    Escape: "back",
    ArrowLeft: "left",
    ArrowRight: "right",
    " ": "playPause"
  }[event.key];
  if (mapped && document.activeElement !== input) {
    event.preventDefault();
    command(mapped);
  }
});
connect();
