importScripts(
  "config.js",
  "rules.js",
  "background/closed-tabs.js",
  "background/tab-closer.js",
  "background/auto-mute.js",
  "background/history-cleaner.js"
);

let rules = RULES;
const ready = getRules().then((r) => (rules = r));

const isTarget = (url) => findRule(rules, url) !== null;
const closedTabs = createClosedTabs();
const tabCloser = createTabCloser({ isTarget, getDecoyUrl: () => DECOY_URL, closedTabs });
const autoMute = createAutoMute({ isTarget, isEnabled: () => AUTO_MUTE });
const historyCleaner = createHistoryCleaner({ isTarget, isEnabled: () => CLEAN_HISTORY });

// Tin nhắn từ content script / popup: thêm loại mới chỉ cần thêm một dòng ở đây
const HANDLERS = {
  closeAll: (msg, sender) => tabCloser.closeAll(sender.tab),
  closedList: () => closedTabs.list(),
  restoreClosed: (msg) => closedTabs.restore(msg.batch, msg.tab),
  clearClosed: () => closedTabs.clear(),
  purgeHistory: () => historyCleaner.purge()
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handler = HANDLERS[msg?.type];
  if (!handler) return;
  ready
    .then(() => handler(msg, sender))
    .then(sendResponse, () => sendResponse(null));
  return true; // trả lời bất đồng bộ
});

chrome.storage.onChanged.addListener((changes) => {
  if (!changes.rules) return;
  rules = changes.rules.newValue || RULES;
  autoMute.refresh();
});

ready.then(autoMute.refresh);
autoMute.start();
historyCleaner.start();
