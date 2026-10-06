import { localize, languagePreference, languageKey, setLanguage, t } from "./lib/i18n.js";

const select = document.getElementById("language");
const status = document.getElementById("settings-status");
let statusKey = "settingsLocal";
function render() {
  localize();
  select.value = languagePreference();
  status.textContent = t(statusKey);
  status.classList.toggle("error", statusKey === "settingsError");
}
select.addEventListener("change", () => {
  try {
    setLanguage(select.value);
    statusKey = "settingsSaved";
    render();
  } catch {
    statusKey = "settingsError";
    render();
  }
});
window.addEventListener("storage", (event) => { if (event.key === languageKey || event.key === null) render(); });
render();
