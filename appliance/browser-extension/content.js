(() => {
  if (window.top !== window || document.querySelector("#watchos-tv-pointer")) return;

  const keyboardRows = [
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
    ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
    ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
    ["Z", "X", "C", "V", "B", "N", "M"],
    ["SPACE", "BACKSPACE", ".", "/", "DONE"]
  ];

  const style = document.createElement("style");
  style.textContent = `
    #watchos-tv-pointer{position:fixed;left:50%;top:50%;z-index:2147483647;width:28px;height:28px;border:4px solid #fff;border-radius:50%;background:#7c5cff;box-shadow:0 4px 18px #0009;transform:translate(-50%,-50%);pointer-events:none;transition:left .06s linear,top .06s linear}
    #watchos-tv-pointer.clicking{transform:translate(-50%,-50%) scale(.72)}
    #watchos-tv-keyboard{position:fixed;left:50%;bottom:18px;z-index:2147483646;width:min(1040px,96vw);padding:18px;border:1px solid #ffffff2b;border-radius:26px;background:#111722f7;box-shadow:0 28px 90px #000b;transform:translateX(-50%);font-family:Inter,Segoe UI,sans-serif}
    #watchos-tv-keyboard[hidden]{display:none}
    .watchos-key-row{display:flex;justify-content:center;gap:8px;margin:7px 0}
    .watchos-key{min-width:62px;height:52px;padding:0 13px;display:grid;place-items:center;border:2px solid transparent;border-radius:12px;background:#242c3a;color:#fff;font:700 15px Inter,Segoe UI,sans-serif}
    .watchos-key.selected{border-color:#fff;background:#7c5cff;transform:translateY(-3px)}
  `;
  document.documentElement.append(style);

  const pointer = document.createElement("div");
  pointer.id = "watchos-tv-pointer";
  document.documentElement.append(pointer);

  const keyboard = document.createElement("div");
  keyboard.id = "watchos-tv-keyboard";
  keyboard.hidden = true;
  keyboardRows.forEach((row, rowIndex) => {
    const rowElement = document.createElement("div");
    rowElement.className = "watchos-key-row";
    row.forEach((key, columnIndex) => {
      const button = document.createElement("span");
      button.className = "watchos-key";
      button.textContent = key === "BACKSPACE" ? "Del" : key === "SPACE" ? "Space" : key === "DONE" ? "Done" : key;
      button.dataset.row = String(rowIndex);
      button.dataset.column = String(columnIndex);
      rowElement.append(button);
    });
    keyboard.append(rowElement);
  });
  document.documentElement.append(keyboard);

  let x = innerWidth / 2;
  let y = innerHeight / 2;
  let keyRow = 0;
  let keyColumn = 0;
  let inputTarget = null;

  function editable(element) {
    return element?.matches?.("input:not([type=button]):not([type=submit]), textarea, [contenteditable=true]");
  }

  function renderPointer() {
    pointer.style.left = `${x}px`;
    pointer.style.top = `${y}px`;
  }

  function renderKeyboard() {
    keyboard.querySelectorAll(".watchos-key").forEach((key) => {
      key.classList.toggle("selected",
        Number(key.dataset.row) === keyRow && Number(key.dataset.column) === keyColumn);
    });
  }

  function showKeyboard(target) {
    if (!editable(target)) return;
    inputTarget = target;
    keyboard.hidden = false;
    pointer.hidden = true;
    keyRow = 0;
    keyColumn = 0;
    renderKeyboard();
  }

  function hideKeyboard() {
    keyboard.hidden = true;
    pointer.hidden = false;
    inputTarget?.focus();
  }

  function insertText(text) {
    if (!inputTarget) return;
    if (inputTarget.isContentEditable) {
      document.execCommand("insertText", false, text);
    } else {
      const start = inputTarget.selectionStart ?? inputTarget.value.length;
      const end = inputTarget.selectionEnd ?? start;
      inputTarget.setRangeText(text, start, end, "end");
      inputTarget.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  function pressKey() {
    const key = keyboardRows[keyRow][keyColumn];
    if (key === "DONE") {
      hideKeyboard();
      return;
    }
    if (key === "BACKSPACE") {
      if (!inputTarget?.isContentEditable) {
        const end = inputTarget.selectionStart ?? inputTarget.value.length;
        const start = inputTarget.selectionEnd !== end ? inputTarget.selectionEnd : Math.max(0, end - 1);
        inputTarget.setRangeText("", Math.min(start, end), Math.max(start, end), "end");
        inputTarget.dispatchEvent(new Event("input", { bubbles: true }));
      }
      return;
    }
    insertText(key === "SPACE" ? " " : key);
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

  function clickPointer() {
    pointer.classList.add("clicking");
    setTimeout(() => pointer.classList.remove("clicking"), 120);
    const target = document.elementFromPoint(x, y);
    if (!target) return;
    target.focus?.();
    target.click?.();
    if (editable(target)) showKeyboard(target);
  }

  document.addEventListener("focusin", (event) => {
    if (editable(event.target)) showKeyboard(event.target);
  }, true);

  document.addEventListener("keydown", (event) => {
    if (keyboard.hidden) {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.key === "ArrowUp") y = Math.max(16, y - 52);
        if (event.key === "ArrowDown") y = Math.min(innerHeight - 16, y + 52);
        if (event.key === "ArrowLeft") x = Math.max(16, x - 52);
        if (event.key === "ArrowRight") x = Math.min(innerWidth - 16, x + 52);
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
})();
