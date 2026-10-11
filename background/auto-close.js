// Tự đóng từng tab thuộc config khi tab đó không được dùng suốt getMinutes() phút, phòng khi bỏ quên tab.
// "Đang dùng" = tab đang hiện ở cửa sổ đang focus và người dùng còn thao tác trên máy, hoặc tab đang hiện và phát tiếng.
// Mốc lần dùng cuối của từng tab lưu trong chrome.storage.session và kiểm tra bằng chrome.alarms,
// vì service worker bị tắt khi rảnh nên không giữ được biến hay setTimeout.

function createAutoClose({ ready, isTarget, getMinutes, closeIdle }) {
  const KEY = "lastUsed";
  const ALARM = "autoClose";
  // Không bấm phím, không động chuột bấy nhiêu giây thì coi là đã rời máy (Chrome cho tối thiểu 15)
  const IDLE_SECONDS = 15;
  let queue = Promise.resolve();
  const enabled = () => getMinutes() > 0;
  // Thông tin cho popup hiện danh sách tab
  const describe = (t) => ({ id: t.id, windowId: t.windowId, title: t.title, url: t.url || t.pendingUrl });

  // Id các tab đang được dùng
  async function usedIds(targets) {
    const [state, focused] = await Promise.all([
      chrome.idle.queryState(IDLE_SECONDS),
      chrome.windows.getLastFocused().catch(() => null)
    ]);
    const watching = (tab) => state === "active" && focused?.focused && tab.windowId === focused.id;
    return new Set(targets.filter((t) => t.active && (t.audible || watching(t))).map((t) => t.id));
  }

  // Trả về { limit, tabs } cho popup: tab nào đang dùng, tab nào đang đếm và đóng lúc nào. limit = 0 là đang tắt
  async function run() {
    await ready;
    const tabs = await chrome.tabs.query({});
    const targets = tabs.filter((t) => isTarget(t.url || t.pendingUrl || ""));
    if (!enabled() || !targets.length) {
      await chrome.storage.session.remove(KEY);
      return { limit: 0, tabs: targets.map(describe) };
    }

    const { [KEY]: saved = {} } = await chrome.storage.session.get(KEY);
    const using = await usedIds(targets);
    const now = Date.now();
    const limit = getMinutes() * 60000;
    // Tab mới gặp lần đầu thì đếm từ bây giờ. Ghi lại từ đầu nên tab đã đóng tự rơi khỏi danh sách
    const lastUsed = {};
    const expired = [];
    for (const tab of targets) {
      const last = using.has(tab.id) ? now : saved[tab.id] || now;
      if (now - last >= limit) expired.push(tab.id);
      else lastUsed[tab.id] = last;
    }
    await chrome.storage.session.set({ [KEY]: lastUsed });
    if (expired.length) await closeIdle(expired);

    return {
      limit,
      tabs: targets
        .filter((t) => t.id in lastUsed)
        .map((t) => ({ ...describe(t), active: using.has(t.id), closesAt: lastUsed[t.id] + limit }))
    };
  }

  // Xếp hàng để hai sự kiện đến cùng lúc không cùng đóng tab
  function check() {
    return (queue = queue.then(run, run));
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
    chrome.tabs.onActivated.addListener(check);
    chrome.windows.onFocusChanged.addListener(check);
    chrome.idle.setDetectionInterval(IDLE_SECONDS);
    chrome.idle.onStateChanged.addListener(check);
  }

  return { start, refresh, check };
}
