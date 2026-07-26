const rows = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["Z", "X", "C", "V", "B", "N", "M"],
  ["SPACE", "BACKSPACE", ".", "/", "CLEAR", "DONE"]
];

export function createTvKeyboard({ onDone = () => {} } = {}) {
  const shell = document.createElement("section");
  shell.className = "tv-keyboard-shell";
  shell.hidden = true;
  shell.setAttribute("aria-label", "On-screen keyboard");
  shell.innerHTML = `
    <div class="tv-keyboard-head">
      <strong>TV Keyboard</strong>
      <span>Arrows move · OK types · Back closes</span>
    </div>
    <div class="tv-keyboard-rows"></div>
  `;
  document.body.append(shell);
  const rowsElement = shell.querySelector(".tv-keyboard-rows");

  rows.forEach((row, rowIndex) => {
    const rowElement = document.createElement("div");
    rowElement.className = "tv-keyboard-row";
    row.forEach((key, columnIndex) => {
      const keyElement = document.createElement("span");
      keyElement.className = "tv-key";
      keyElement.dataset.row = String(rowIndex);
      keyElement.dataset.column = String(columnIndex);
      keyElement.textContent = {
        SPACE: "Space",
        BACKSPACE: "⌫",
        CLEAR: "Clear",
        DONE: "Done"
      }[key] ?? key;
      rowElement.append(keyElement);
    });
    rowsElement.append(rowElement);
  });

  let target = null;
  let row = 0;
  let column = 0;

  function render() {
    shell.querySelectorAll(".tv-key").forEach((key) => {
      key.classList.toggle("selected",
        Number(key.dataset.row) === row && Number(key.dataset.column) === column);
    });
  }

  function open(nextTarget) {
    target = nextTarget;
    shell.hidden = false;
    row = 0;
    column = 0;
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

  function press() {
    const key = rows[row][column];
    if (key === "DONE") {
      close(true);
      return;
    }
    if (key === "CLEAR") {
      target.value = "";
      target.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    if (key === "BACKSPACE") {
      const end = target.selectionStart ?? target.value.length;
      const start = target.selectionEnd !== end ? target.selectionEnd : Math.max(0, end - 1);
      target.setRangeText("", Math.min(start, end), Math.max(start, end), "end");
      target.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    insert(key === "SPACE" ? " " : key);
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
    if (command === "up") row = (row - 1 + rows.length) % rows.length;
    if (command === "down") row = (row + 1) % rows.length;
    const rowLength = rows[row].length;
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
