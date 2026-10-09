// Nhớ các lần đóng tab bằng phím tắt, mới nhất đứng đầu.
// Lưu trong chrome.storage.session: chỉ nằm trong bộ nhớ, tự mất khi tắt trình duyệt.

function createClosedTabs() {
  const KEY = "closedTabs";
  const MAX_BATCHES = 10;

  // [{ time, tabs: [{ url, title }] }]
  async function list() {
    const { [KEY]: batches = [] } = await chrome.storage.session.get(KEY);
    return Array.isArray(batches) ? batches : [];
  }

  async function remember(tabs) {
    const entries = tabs
      .map((t) => ({ url: t.url || t.pendingUrl, title: t.title || "" }))
      .filter((t) => t.url);
    if (!entries.length) return;
    const batches = await list();
    batches.unshift({ time: Date.now(), tabs: entries });
    return chrome.storage.session.set({ [KEY]: batches.slice(0, MAX_BATCHES) });
  }

  // Mở lại cả lần đóng thứ `batch`, hoặc chỉ tab thứ `tab` trong lần đó.
  // Tab đã mở lại thì bỏ khỏi danh sách. Trả về số tab được mở.
  async function restore(batch = 0, tab) {
    const batches = await list();
    const entry = batches[batch];
    if (!entry) return 0;
    const picked = tab === undefined ? entry.tabs.splice(0) : entry.tabs.splice(tab, 1);
    if (!entry.tabs.length) batches.splice(batch, 1);
    await chrome.storage.session.set({ [KEY]: batches });
    picked.forEach((t, i) => chrome.tabs.create({ url: t.url, active: i === picked.length - 1 }));
    return picked.length;
  }

  function clear() {
    return chrome.storage.session.remove(KEY);
  }

  return { list, remember, restore, clear };
}
