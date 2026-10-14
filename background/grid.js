function createGrid({ isTarget }) {
  async function tile({ left, top, width, height }) {
    const tabs = (await chrome.tabs.query({})).filter((t) => isTarget(t.url || t.pendingUrl || ""));
    const cols = Math.ceil(Math.sqrt(tabs.length));
    const rows = Math.ceil(tabs.length / cols);
    const w = Math.floor(width / cols);
    const h = Math.floor(height / rows);
    for (const [i, tab] of tabs.entries()) {
      await chrome.windows.create({
        tabId: tab.id,
        type: "popup",
        left: left + (i % cols) * w,
        top: top + Math.floor(i / cols) * h,
        width: w,
        height: h
      });
      chrome.tabs.sendMessage(tab.id, { type: "fill" }).catch(() => {});
    }
  }

  return { tile };
}
