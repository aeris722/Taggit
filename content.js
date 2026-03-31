const BUTTON_CLASS = "threadvault-tag-btn";

function getChatPanel() {
  return document.querySelector('[aria-label="Chats"]') 
      || document.querySelector('[class*="chat"]');
}

function createButton(y) {
  const btn = document.createElement("button");

  btn.innerText = "🏷";
  btn.className = BUTTON_CLASS;

  Object.assign(btn.style, {
    position: "fixed",
    top: `${y}px`,
    right: "20px",
    zIndex: 999999,
    background: "red",
    color: "white",
    padding: "4px",
    borderRadius: "6px"
  });

  btn.onclick = () => {
    console.log("Clicked at Y:", y);
  };

  document.body.appendChild(btn);
}

/**
 * Overlay fake rows
 */
function renderOverlay() {
  const panel = getChatPanel();
  if (!panel) return;

  const rect = panel.getBoundingClientRect();

  const rowHeight = 70; // approx
  const count = Math.floor(rect.height / rowHeight);

  // remove old
  document.querySelectorAll(`.${BUTTON_CLASS}`).forEach(e => e.remove());

  for (let i = 0; i < count; i++) {
    const y = rect.top + i * rowHeight + 20;
    createButton(y);
  }
}

setInterval(renderOverlay, 1500);