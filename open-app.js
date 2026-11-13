// The settings live in the app window, so the Preferences button in about:addons
// only opens it. The button stays for a second try after a failure, and for
// reopening without leaving the Add-ons page.
const message = document.getElementById("message");

function open() {
  browser.runtime.sendMessage({ type: "open-app" })
    .then(() => { message.textContent = "Convert Them All is open in its own window."; })
    .catch(() => { message.textContent = "Could not open the app window."; });
}

document.getElementById("open").addEventListener("click", open);
open();
