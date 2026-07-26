const form = document.querySelector("#address-form");
const input = document.querySelector("#address");
const clock = document.querySelector("#browser-clock");

function updateClock() {
  clock.textContent = new Intl.DateTimeFormat([], {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date());
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const value = input.value.trim();
  if (!value) return;
  const target = /^[a-z][a-z0-9+.-]*:\/\//i.test(value)
    ? value
    : value.includes(".") && !value.includes(" ")
      ? `https://${value}`
      : `https://www.google.com/search?q=${encodeURIComponent(value)}`;
  location.assign(target);
});

updateClock();
setInterval(updateClock, 15_000);
