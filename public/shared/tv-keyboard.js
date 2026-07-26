const letterRows = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["SHIFT", "Z", "X", "C", "V", "B", "N", "M", "BACKSPACE"],
  ["CLEAR", "@", "SPACE", ".", "/", "DONE"]
];

const labels = {
  SHIFT: "Shift",
  BACKSPACE: "Backspace",
  CLEAR: "Clear",
  SPACE: "Space",
  DONE: "Done"
};

export function createTvKeyboard({ onDone = () => {} } = {}) {
  const shell = document.createElement("section");
  shell.className = "tv-keyboard-shell";
  shell.hidden = true;
  shell.setAttribute("aria-label", "On-screen keyboard");
  shell.innerHTML = `
    <div class="tv-keyboard-head">
      <div><strong>Keyboard</strong><span id="tv-keyboard-context">Enter text</span></div>
      <small>ARROWS TO MOVE &nbsp;·&nbsp; ENTER TO TYPE &nbsp;·&nbsp; ESC TO CLOSE</small>
    </div>
    <div class="tv-keyboard-rows"></div>
  `;
  document.body.append(shell);
  const rowsElement = shell.querySelector(".tv-keyboard-rows");
  const contextElement = shell.querySelector("#tv-keyboard-context");

  letterRows.forEach((keys, rowIndex) => {
    const rowElement = document.createElement("div");
    rowElement.className = "tv-keyboard-row";
    keys.forEach((key, columnIndex) => {
      const keyElement = document.createElement("span");
      keyElement.className = `tv-key tv-key-${key.toLowerCase()}`;
      keyElement.dataset.row = String(rowIndex);
      keyElement.dataset.column = String(columnIndex);
      keyElement.textContent = labels[key] ?? key;
      rowElement.append(keyElement);
    });
    rowsElement.append(rowElement);
  });

  let target = null;
  let row = 1;
  let column = 0;
  let shifted = false;

  function render() {
    shell.querySelectorAll(".tv-key").forEach((key) => {
      key.classList.toggle("selected",
        Number(key.dataset.row) === row && Number(key.dataset.column) === column);
      key.classList.toggle("active", key.classList.contains("tv-key-shift") && shifted);
      const value = letterRows[Number(key.dataset.row)][Number(key.dataset.column)];
      if (/^[A-Z]$/.test(value)) key.textContent = shifted ? value : value.toLowerCase();
    });
  }

  function open(nextTarget) {
    target = nextTarget;
    shell.hidden = false;
    contextElement.textContent = nextTarget?.getAttribute("aria-label")
      ?? nextTarget?.closest("label")?.firstChild?.textContent?.trim()
      ?? nextTarget?.placeholder
      ?? "Enter text";
    row = 1;
    column = 0;
    shifted = false;
    render();
  }

  function close(notify = false) {
    shell.hidden = true;
    target?.focus({ preventScroll: true });
    if (notify) onDone();
  }

  function insert(text) {
    if (!target) return;
    const start = target.selectionStart ?? target.value.length;
    const end = target.selectionEnd ?? start;
    target.setRangeText(text, start, end, "end");
    target.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function backspace() {
    if (!target) return;
    const start = target.selectionStart ?? target.value.length;
    const end = target.selectionEnd ?? start;
    const from = start === end ? Math.max(0, start - 1) : Math.min(start, end);
    target.setRangeText("", from, Math.max(start, end), "end");
    target.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function press() {
    const key = letterRows[row][column];
    if (key === "DONE") return close(true);
    if (key === "SHIFT") {
      shifted = !shifted;
      render();
      return;
    }
    if (key === "CLEAR") {
      target.value = "";
      target.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    if (key === "BACKSPACE") return backspace();
    const value = key === "SPACE"
      ? " "
      : /^[A-Z]$/.test(key)
        ? shifted ? key : key.toLowerCase()
        : key;
    insert(value);
    if (shifted && /^[A-Z]$/.test(key)) shifted = false;
    render();
  }

  function handle(command) {
    if (shell.hidden) return false;
    if (command === "back") {
      close(true);
      return true;
    }
    if (command === "ok") {
      press();
      return true;
    }
    if (command === "up") row = (row - 1 + letterRows.length) % letterRows.length;
    if (command === "down") row = (row + 1) % letterRows.length;
    const rowLength = letterRows[row].length;
    if (command === "left") column = (column - 1 + rowLength) % rowLength;
    if (command === "right") column = (column + 1) % rowLength;
    column = Math.min(column, rowLength - 1);
    render();
    return ["up", "down", "left", "right"].includes(command);
  }

  return {
    open,
    close,
    handle,
    isOpen: () => !shell.hidden
  };
}
