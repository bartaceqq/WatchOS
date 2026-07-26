(() => {
  if (window.top !== window || document.querySelector("#watchos-browser-host")) return;

  const keyboardRows = [
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
    ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
    ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
    ["SHIFT", "Z", "X", "C", "V", "B", "N", "M", "BACKSPACE"],
    ["CLEAR", "@", "SPACE", ".", "/", "DONE"]
  ];
  const keyLabels = {
    SHIFT: "Shift",
    BACKSPACE: "Backspace",
    CLEAR: "Clear",
    SPACE: "Space",
    DONE: "Done"
  };

  const pageStyle = document.createElement("style");
  pageStyle.id = "watchos-browser-page-space";
  pageStyle.textContent = `
    html{scroll-padding-top:118px!important}
    body{padding-top:118px!important;box-sizing:border-box!important;min-height:100vh!important}
  `;
  document.documentElement.append(pageStyle);

  const host = document.createElement("div");
  host.id = "watchos-browser-host";
  host.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none;font-family:Inter,'Segoe UI',sans-serif";
  document.documentElement.append(host);
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      *{box-sizing:border-box}
      [hidden]{display:none!important}
      .chrome{position:fixed;inset:0 0 auto;height:118px;pointer-events:auto;color:#eef1f7;background:#10141d;box-shadow:0 5px 22px #0008;border-bottom:1px solid #ffffff18}
      .tabs-row{height:52px;display:flex;align-items:flex-end;gap:7px;padding:7px 10px 0;background:#090c12}
      .brand{height:38px;display:flex;align-items:center;gap:9px;padding:0 13px 7px 6px;color:#cdd3df;font-size:12px;font-weight:800;white-space:nowrap}
      .brand i{width:27px;height:27px;display:grid;place-items:center;border-radius:9px;background:linear-gradient(145deg,#8d76ff,#6147db);color:white;font-style:normal;font-size:13px}
      .tabs{min-width:0;flex:1;display:flex;align-items:flex-end;gap:5px;overflow:hidden}
      .tab{min-width:150px;max-width:245px;height:39px;flex:1;display:flex;align-items:center;gap:9px;padding:0 10px;border:1px solid transparent;border-radius:11px 11px 0 0;background:#191e29;color:#aeb7c7}
      .tab.active{height:42px;background:#262d3a;color:white;border-color:#ffffff16;border-bottom-color:#262d3a}
      .tab-icon{width:20px;height:20px;display:grid;place-items:center;flex:0 0 auto;border-radius:6px;background:#3a4353;color:#dfe4ec;font-size:10px;font-weight:900}
      .tab-title{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:700;text-align:left}
      .tab-close{width:22px;height:22px;display:grid;place-items:center;border-radius:6px;color:#939eaf;font-size:16px}
      .tab-close:hover{background:#ffffff12;color:white}
      button,input{font:inherit}
      button{border:0;cursor:default}
      .new-tab{width:34px;height:34px;margin:0 6px 5px 1px;border-radius:10px;background:#1a202b;color:#cbd1dc;font-size:21px}
      .toolbar{height:66px;padding:10px 13px;display:flex;align-items:center;gap:8px;background:#161b25}
      .nav{width:42px;height:42px;display:grid;place-items:center;border:1px solid transparent;border-radius:12px;background:#202631;color:#c8cfda;font-size:18px;font-weight:700}
      .nav:hover{background:#2a3240;color:white}
      .address-shell{height:44px;min-width:0;flex:1;display:flex;align-items:center;gap:9px;padding:0 8px 0 15px;border:1px solid #ffffff17;border-radius:14px;background:#0d1118}
      .security{color:#55d7aa;font-size:11px}
      .address{min-width:0;flex:1;border:0;outline:0;background:transparent;color:#eef1f6;font-size:14px}
      .go{height:32px;padding:0 14px;border-radius:9px;background:#7460ed;color:white;font-size:11px;font-weight:800}
      .pointer{position:fixed;left:50%;top:42%;width:27px;height:27px;border:4px solid white;border-radius:50%;background:#745cff;box-shadow:0 5px 20px #000b;transform:translate(-50%,-50%);pointer-events:none;transition:left .055s linear,top .055s linear}
      .pointer.clicking{transform:translate(-50%,-50%) scale(.72)}
      .keyboard{position:fixed;left:50%;bottom:15px;width:min(1080px,96vw);padding:15px 22px 19px;border:1px solid #ffffff29;border-radius:27px;background:#0d1119fc;box-shadow:0 32px 110px #000c;transform:translateX(-50%);pointer-events:auto}
      .keyboard-head{height:42px;padding:0 7px 8px;display:flex;align-items:center;justify-content:space-between}
      .keyboard-head>div{display:flex;align-items:baseline;gap:12px}
      .keyboard-head strong{font-size:17px}
      .keyboard-context{color:#909bad;font-size:12px}
      .keyboard-head small{color:#6e798b;font-size:9px;font-weight:800;letter-spacing:.11em}
      .key-row{display:flex;justify-content:center;gap:7px;margin:6px 0}
      .key{min-width:63px;height:47px;padding:0 12px;display:grid;place-items:center;border:2px solid transparent;border-radius:10px;background:linear-gradient(#2c3442,#242b38);color:#f7f8fb;box-shadow:inset 0 1px #ffffff0f,0 3px 0 #171c24;font-size:14px;font-weight:740}
      .key-shift,.key-backspace,.key-clear,.key-done{min-width:104px}
      .key-space{min-width:350px}
      .key.active{background:#51448c}
      .key.selected{border-color:white;background:#755feb;transform:translateY(-3px);box-shadow:0 9px 22px #513cb95c}
    </style>
    <section class="chrome">
      <div class="tabs-row">
        <div class="brand"><i>W</i><span>WatchOS Browser</span></div>
        <div class="tabs"></div>
        <button class="new-tab" data-action="new-tab" aria-label="New tab">+</button>
      </div>
      <form class="toolbar">
        <button type="button" class="nav" data-action="back" aria-label="Back">←</button>
        <button type="button" class="nav" data-action="forward" aria-label="Forward">→</button>
        <button type="button" class="nav" data-action="reload" aria-label="Reload">↻</button>
        <button type="button" class="nav" data-action="home" aria-label="Browser home">⌂</button>
        <label class="address-shell">
          <span class="security">●</span>
          <input class="address" aria-label="Address and search" autocomplete="off" spellcheck="false">
          <button class="go" type="submit">GO</button>
        </label>
      </form>
    </section>
    <div class="pointer"></div>
    <section class="keyboard" hidden>
      <div class="keyboard-head">
        <div><strong>Keyboard</strong><span class="keyboard-context">Enter text</span></div>
        <small>ARROWS TO MOVE &nbsp;·&nbsp; ENTER TO TYPE &nbsp;·&nbsp; ESC TO CLOSE</small>
      </div>
      <div class="key-rows"></div>
    </section>
  `;

  const chromeShell = shadow.querySelector(".chrome");
  const tabsElement = shadow.querySelector(".tabs");
  const toolbar = shadow.querySelector(".toolbar");
  const address = shadow.querySelector(".address");
  const pointer = shadow.querySelector(".pointer");
  const keyboard = shadow.querySelector(".keyboard");
  const keyboardContext = shadow.querySelector(".keyboard-context");
  const keyRows = shadow.querySelector(".key-rows");

  keyboardRows.forEach((keys, rowIndex) => {
    const rowElement = document.createElement("div");
    rowElement.className = "key-row";
    keys.forEach((key, columnIndex) => {
      const keyElement = document.createElement("span");
      keyElement.className = `key key-${key.toLowerCase()}`;
      keyElement.dataset.row = String(rowIndex);
      keyElement.dataset.column = String(columnIndex);
      keyElement.textContent = keyLabels[key] ?? key;
      rowElement.append(keyElement);
    });
    keyRows.append(rowElement);
  });

  let x = innerWidth / 2;
  let y = Math.max(180, innerHeight * .42);
  let keyRow = 1;
  let keyColumn = 0;
  let inputTarget = null;
  let shifted = false;

  function extensionMessage(message) {
    return chrome.runtime.sendMessage(message).catch(() => null);
  }

  function renderTabs(tabs = []) {
    tabsElement.replaceChildren();
    for (const tab of tabs) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `tab${tab.active ? " active" : ""}`;
      button.dataset.tabId = String(tab.id);
      const icon = document.createElement("span");
      icon.className = "tab-icon";
      icon.textContent = (tab.title || "N").trim().charAt(0).toUpperCase();
      const title = document.createElement("span");
      title.className = "tab-title";
      title.textContent = tab.title || "New tab";
      const close = document.createElement("span");
      close.className = "tab-close";
      close.dataset.closeTab = String(tab.id);
      close.textContent = "×";
      button.append(icon, title, close);
      tabsElement.append(button);
      if (tab.active) address.value = tab.url || location.href;
    }
  }

  async function refreshTabs() {
    const response = await extensionMessage({ type: "tabs:list" });
    if (response?.tabs) renderTabs(response.tabs);
    else address.value = location.href;
  }

  function normaliseAddress(value) {
    const text = String(value).trim();
    if (!text) return null;
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return text;
    if (text.includes(".") && !text.includes(" ")) return `https://${text}`;
    return `https://www.google.com/search?q=${encodeURIComponent(text)}`;
  }

  chromeShell.addEventListener("click", (event) => {
    const close = event.target.closest("[data-close-tab]");
    if (close) {
      event.stopPropagation();
      extensionMessage({ type: "tabs:close", tabId: Number(close.dataset.closeTab) });
      return;
    }
    const tab = event.target.closest("[data-tab-id]");
    if (tab) {
      extensionMessage({ type: "tabs:activate", tabId: Number(tab.dataset.tabId) });
      return;
    }
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "new-tab") extensionMessage({ type: "tabs:create" });
    if (["back", "forward", "reload", "home"].includes(action)) {
      extensionMessage({ type: action });
    }
  });

  toolbar.addEventListener("submit", (event) => {
    event.preventDefault();
    const url = normaliseAddress(address.value);
    if (url) extensionMessage({ type: "navigate", url });
    hideKeyboard();
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "tabs:changed") renderTabs(message.tabs);
  });

  function editable(element) {
    return element?.matches?.("input:not([type=button]):not([type=submit]), textarea, [contenteditable=true]");
  }

  function renderPointer() {
    pointer.style.left = `${x}px`;
    pointer.style.top = `${y}px`;
  }

  function renderKeyboard() {
    keyboard.querySelectorAll(".key").forEach((key) => {
      key.classList.toggle("selected",
        Number(key.dataset.row) === keyRow && Number(key.dataset.column) === keyColumn);
      key.classList.toggle("active", key.classList.contains("key-shift") && shifted);
      const value = keyboardRows[Number(key.dataset.row)][Number(key.dataset.column)];
      if (/^[A-Z]$/.test(value)) key.textContent = shifted ? value : value.toLowerCase();
    });
  }

  function showKeyboard(target) {
    if (!editable(target)) return;
    inputTarget = target;
    keyboardContext.textContent = target.getAttribute?.("aria-label") || target.placeholder || "Enter text";
    keyboard.hidden = false;
    pointer.hidden = true;
    keyRow = 1;
    keyColumn = 0;
    shifted = false;
    renderKeyboard();
  }

  function hideKeyboard() {
    keyboard.hidden = true;
    pointer.hidden = false;
    inputTarget?.focus?.();
  }

  function insertText(text) {
    if (!inputTarget) return;
    if (inputTarget.isContentEditable) {
      document.execCommand("insertText", false, text);
    } else {
      const start = inputTarget.selectionStart ?? inputTarget.value.length;
      const end = inputTarget.selectionEnd ?? start;
      inputTarget.setRangeText(text, start, end, "end");
      inputTarget.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    }
  }

  function backspace() {
    if (!inputTarget) return;
    if (inputTarget.isContentEditable) {
      document.execCommand("delete", false);
      return;
    }
    const start = inputTarget.selectionStart ?? inputTarget.value.length;
    const end = inputTarget.selectionEnd ?? start;
    const from = start === end ? Math.max(0, start - 1) : Math.min(start, end);
    inputTarget.setRangeText("", from, Math.max(start, end), "end");
    inputTarget.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  }

  function pressKey() {
    const key = keyboardRows[keyRow][keyColumn];
    if (key === "DONE") return hideKeyboard();
    if (key === "SHIFT") {
      shifted = !shifted;
      renderKeyboard();
      return;
    }
    if (key === "CLEAR") {
      if (inputTarget.isContentEditable) inputTarget.textContent = "";
      else inputTarget.value = "";
      inputTarget.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      return;
    }
    if (key === "BACKSPACE") return backspace();
    const value = key === "SPACE"
      ? " "
      : /^[A-Z]$/.test(key)
        ? shifted ? key : key.toLowerCase()
        : key;
    insertText(value);
    if (shifted && /^[A-Z]$/.test(key)) shifted = false;
    renderKeyboard();
  }

  function moveKeyboard(direction) {
    if (direction === "ArrowUp") keyRow = (keyRow - 1 + keyboardRows.length) % keyboardRows.length;
    if (direction === "ArrowDown") keyRow = (keyRow + 1) % keyboardRows.length;
    const rowLength = keyboardRows[keyRow].length;
    if (direction === "ArrowLeft") keyColumn = (keyColumn - 1 + rowLength) % rowLength;
    if (direction === "ArrowRight") keyColumn = (keyColumn + 1) % rowLength;
    keyColumn = Math.min(keyColumn, rowLength - 1);
    renderKeyboard();
  }

  function targetAtPointer() {
    const shadowTarget = shadow.elementFromPoint?.(x, y);
    if (shadowTarget && shadowTarget !== host) return shadowTarget;
    return document.elementFromPoint(x, y);
  }

  function clickPointer() {
    pointer.classList.add("clicking");
    setTimeout(() => pointer.classList.remove("clicking"), 120);
    const target = targetAtPointer();
    if (!target) return;
    target.focus?.();
    target.click?.();
    if (editable(target)) showKeyboard(target);
  }

  document.addEventListener("focusin", (event) => {
    if (editable(event.target)) showKeyboard(event.target);
  }, true);
  shadow.addEventListener("focusin", (event) => {
    if (editable(event.target)) showKeyboard(event.target);
  });

  document.addEventListener("keydown", (event) => {
    if (keyboard.hidden) {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.key === "ArrowUp") y = Math.max(16, y - 38);
        if (event.key === "ArrowDown") y = Math.min(innerHeight - 16, y + 38);
        if (event.key === "ArrowLeft") x = Math.max(16, x - 38);
        if (event.key === "ArrowRight") x = Math.min(innerWidth - 16, x + 38);
        renderPointer();
      } else if (event.key === "Enter") {
        event.preventDefault();
        event.stopImmediatePropagation();
        clickPointer();
      }
      return;
    }
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      moveKeyboard(event.key);
    } else if (event.key === "Enter") {
      event.preventDefault();
      event.stopImmediatePropagation();
      pressKey();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      hideKeyboard();
    }
  }, true);

  addEventListener("resize", () => {
    x = Math.min(x, innerWidth - 16);
    y = Math.min(y, innerHeight - 16);
    renderPointer();
  });

  renderPointer();
  refreshTabs();
})();
