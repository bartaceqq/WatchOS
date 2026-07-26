const form = document.querySelector("#address-form");
const input = document.querySelector("#address");

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
