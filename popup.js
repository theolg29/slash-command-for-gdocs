const toggle = document.getElementById("enabled");

chrome.storage.sync.get({ enabled: true }, (result) => {
  toggle.checked = result.enabled !== false;
});

toggle.addEventListener("change", () => {
  chrome.storage.sync.set({ enabled: toggle.checked });
});
