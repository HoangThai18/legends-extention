// Lưu trong chrome.storage.session: chỉ nằm trong bộ nhớ, tự mất khi tắt trình duyệt.

function createClosedTabs() {
  const KEY = "closedTabs";

  // keep = nối vào danh sách đang nhớ thay vì ghi đè
  async function remember(tabs, keep = false) {
    const urls = tabs.map((t) => t.url || t.pendingUrl).filter(Boolean);
    const { [KEY]: old = [] } = keep ? await chrome.storage.session.get(KEY) : {};
    return chrome.storage.session.set({ [KEY]: [...old, ...urls] });
  }

  async function count() {
    const { [KEY]: urls = [] } = await chrome.storage.session.get(KEY);
    return urls.length;
  }

  // Mở lại các tab đã nhớ, trả về số tab được mở
  async function restore() {
    const { [KEY]: urls = [] } = await chrome.storage.session.get(KEY);
    await chrome.storage.session.remove(KEY);
    urls.forEach((url, i) => chrome.tabs.create({ url, active: i === urls.length - 1 }));
    return urls.length;
  }

  return { remember, count, restore };
}
