function createTabCloser({ isTarget, getDecoyUrl, closedTabs }) {
  // Không truyền senderTab = tự đóng (không tab nào gọi)
  async function closeAll(senderTab) {
    const tabs = await chrome.tabs.query({});
    const targets = tabs.filter((t) => t.id === senderTab?.id || isTarget(t.url || t.pendingUrl || ""));
    if (!targets.length) return;

    // Mở tab mồi trước khi đóng, để cửa sổ không bị đóng theo khi hết tab
    const decoyUrl = getDecoyUrl();
    if (decoyUrl && senderTab) {
      chrome.tabs.create({ url: decoyUrl, windowId: senderTab.windowId, index: senderTab.index, active: true });
    } else if (decoyUrl) {
      // Tự đóng: chỉ mở tab mồi ở những cửa sổ sắp hết tab
      const kept = new Set(tabs.filter((t) => !targets.includes(t)).map((t) => t.windowId));
      const emptied = new Set(targets.map((t) => t.windowId).filter((id) => !kept.has(id)));
      for (const windowId of emptied) chrome.tabs.create({ url: decoyUrl, windowId });
    }
    chrome.tabs.remove(targets.map((t) => t.id)).catch(() => {});
    closedTabs.remember(targets);
  }

  return { closeAll };
}
