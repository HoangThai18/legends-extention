// Xoá trang thuộc config khỏi lịch sử duyệt web của Chrome.
// Tự xoá ngay khi Chrome ghi lượt truy cập, và có thể dọn sạch lịch sử cũ theo yêu cầu.

function createHistoryCleaner({ isTarget, isEnabled }) {
  function start() {
    chrome.history.onVisited.addListener((item) => {
      if (isEnabled() && isTarget(item.url)) chrome.history.deleteUrl({ url: item.url }).catch(() => {});
    });
  }

  // Quét toàn bộ lịch sử, xoá các URL khớp rule. Trả về số URL đã xoá.
  async function purge() {
    const items = await chrome.history.search({ text: "", startTime: 0, maxResults: 0 });
    const targets = items.filter((item) => isTarget(item.url));
    await Promise.all(targets.map((item) => chrome.history.deleteUrl({ url: item.url })));
    return targets.length;
  }

  return { start, purge };
}
