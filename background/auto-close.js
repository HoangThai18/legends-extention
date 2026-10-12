// Đóng tất cả tab thuộc config khi không tab nào trong số đó được dùng suốt getMinutes() phút, phòng khi bỏ quên tab.
// "Đang dùng" = tab đang hiện ở cửa sổ đang focus và người dùng còn thao tác trên máy, hoặc tab đang hiện và phát tiếng.
// Mốc lần dùng cuối lưu trong chrome.storage.session và kiểm tra bằng chrome.alarms,
// vì service worker bị tắt khi rảnh nên không giữ được biến hay setTimeout.

function createAutoClose({ ready, isTarget, getMinutes, closeAll }) {
  const KEY = "lastUsed";
  const ALARM = "autoClose";
  // Không bấm phím, không động chuột bấy nhiêu giây thì coi là đã rời máy (Chrome cho tối thiểu 15)
  const IDLE_SECONDS = 15;
  let queue = Promise.resolve();
  const enabled = () => getMinutes() > 0;

  // Id các tab đang được dùng. Popup của extension đang mở thì Chrome báo cửa sổ không còn focus,
  // nên popup gửi kèm id cửa sổ của nó (popupWindowId) để cửa sổ đó vẫn được tính là đang xem
  async function usedIds(targets, popupWindowId) {
    const [state, focused] = await Promise.all([
      chrome.idle.queryState(IDLE_SECONDS),
      chrome.windows.getLastFocused().catch(() => null)
    ]);
    const inFront = (tab) => tab.windowId === popupWindowId || (focused?.focused && tab.windowId === focused.id);
    const watching = (tab) => state === "active" && inFront(tab);
    return new Set(targets.filter((t) => t.active && (t.audible || watching(t))).map((t) => t.id));
  }

  // Trả về trạng thái cho popup: { limit, tabs, closesAt }. limit = 0 là đang tắt
  async function run(popupWindowId) {
    await ready;
    const limit = enabled() ? getMinutes() * 60000 : 0;
    const all = await chrome.tabs.query({});
    const targets = all.filter((t) => isTarget(t.url || t.pendingUrl || ""));
    // Đang tắt, hoặc hết tab thuộc config → xoá mốc, lần sau thì đếm từ đầu
    if (!limit || !targets.length) {
      await chrome.storage.session.remove(KEY);
      return { limit, tabs: [] };
    }

    const using = await usedIds(targets, popupWindowId);
    const now = Date.now();
    let { [KEY]: lastUsed } = await chrome.storage.session.get(KEY);
    if (using.size || !lastUsed) {
      lastUsed = now;
      await chrome.storage.session.set({ [KEY]: now });
    } else if (now - lastUsed >= limit) {
      await chrome.storage.session.remove(KEY);
      await closeAll();
      return { limit, tabs: [] };
    }
    const tabs = targets.map((t) => ({
      id: t.id,
      windowId: t.windowId,
      title: t.title,
      url: t.url || t.pendingUrl,
      active: using.has(t.id)
    }));
    return { limit, tabs, closesAt: lastUsed + limit };
  }

  // Xếp hàng để hai sự kiện đến cùng lúc không cùng đóng tab
  function check(popupWindowId) {
    const next = () => run(popupWindowId);
    return (queue = queue.then(next, next));
  }

  // Gọi lại khi đổi số phút: bật thì đặt alarm, tắt thì gỡ
  async function refresh() {
    await ready;
    if (!enabled()) return chrome.alarms.clear(ALARM);
    // Chỉ tạo khi chưa có: tạo lại mỗi lần service worker thức dậy sẽ làm alarm đếm lại từ đầu
    if (!(await chrome.alarms.get(ALARM))) chrome.alarms.create(ALARM, { periodInMinutes: 0.5 });
  }

  function start() {
    refresh();
    chrome.alarms.onAlarm.addListener((alarm) => alarm.name === ALARM && check());
    // Quay lại tab giữa hai lần alarm vẫn được ghi nhận ngay
    chrome.tabs.onActivated.addListener(() => check());
    chrome.tabs.onRemoved.addListener(() => check());
    chrome.windows.onFocusChanged.addListener(() => check());
    chrome.idle.setDetectionInterval(IDLE_SECONDS);
    chrome.idle.onStateChanged.addListener(() => check());
  }

  return { start, refresh, check };
}
