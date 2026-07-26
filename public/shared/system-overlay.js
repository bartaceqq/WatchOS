export function createSystemOverlay() {
  const shell = document.createElement("section");
  shell.className = "shared-system-overlay";
  shell.hidden = true;
  shell.innerHTML = `
    <div class="shared-overlay-status">
      <div><span>WATCHOS</span><strong>App paused underneath</strong></div>
      <time>--:--</time>
    </div>
    <div class="shared-overlay-dock">
      <button data-action="resume"><span>&#9654;</span><small>Resume</small></button>
      <button data-action="home"><span>&#8962;</span><small>Home</small></button>
      <button data-action="apps"><span>&#9638;</span><small>Apps</small></button>
      <button data-action="browser"><span>&#9673;</span><small>Browser</small></button>
      <button data-action="settings"><span>&#9881;</span><small>Settings</small></button>
      <i></i>
      <button data-action="volumeDown"><span>&minus;</span><small>Volume</small></button>
      <button data-action="mute"><span>&#128263;</span><small>Mute</small></button>
      <button data-action="volumeUp"><span>+</span><small>Volume</small></button>
    </div>
    <p class="shared-overlay-hint"><kbd>Esc</kbd> returns to the open app</p>
  `;
  document.body.append(shell);

  const time = shell.querySelector("time");
  const buttons = [...shell.querySelectorAll("[data-action]")];
  let selectedIndex = 0;
  let previousFocus = null;

  function updateClock() {
    time.textContent = new Intl.DateTimeFormat([], {
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date());
  }

  function select(index) {
    selectedIndex = (index + buttons.length) % buttons.length;
    buttons.forEach((button, itemIndex) => button.classList.toggle("selected", itemIndex === selectedIndex));
    buttons[selectedIndex].focus({ preventScroll: true });
  }

  function open(action = "resume") {
    previousFocus = document.activeElement;
    shell.hidden = false;
    updateClock();
    const index = buttons.findIndex((button) => button.dataset.action === action);
    select(index >= 0 ? index : 0);
  }

  function close() {
    shell.hidden = true;
    buttons.forEach((button) => button.classList.remove("selected"));
    previousFocus?.focus?.({ preventScroll: true });
  }

  async function activate() {
    const action = buttons[selectedIndex]?.dataset.action;
    if (action === "resume") return close();
    if (action === "home") return location.assign("/tv/?view=home");
    if (action === "apps") return location.assign("/tv/?view=apps");
    if (action === "settings") return location.assign("/admin/");
    if (action === "browser") {
      const response = await fetch("/api/runtime/apps/browser/launch", { method: "POST" });
      if (!response.ok) close();
      return;
    }
    if (["volumeDown", "volumeUp", "mute"].includes(action)) {
      await fetch(`/api/runtime/command/${action}`, { method: "POST" });
    }
  }

  function handle(command) {
    if (command === "home") {
      if (shell.hidden) open();
      else close();
      return true;
    }
    if (shell.hidden) return false;
    if (command === "back") {
      close();
      return true;
    }
    if (command === "left") select(selectedIndex - 1);
    if (command === "right") select(selectedIndex + 1);
    if (command === "up") select(selectedIndex - 1);
    if (command === "down") select(selectedIndex + 1);
    if (command === "ok") activate();
    if (["volumeDown", "volumeUp", "mute"].includes(command)) return true;
    return ["left", "right", "up", "down", "ok"].includes(command);
  }

  buttons.forEach((button, index) => {
    button.addEventListener("focus", () => select(index));
    button.addEventListener("click", () => {
      selectedIndex = index;
      activate();
    });
  });
  updateClock();
  setInterval(updateClock, 15_000);

  return {
    open,
    close,
    handle,
    isOpen: () => !shell.hidden
  };
}
