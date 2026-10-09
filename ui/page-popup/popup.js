const tbody = document.querySelector("tbody");
const status = document.getElementById("status");
const btn = document.getElementById("add-current");
const icons = document.getElementById("icons");
let rules = [];
let picking = null;

function save() {
  chrome.storage.local.set({ rules: rules.filter((r) => r.match.trim()) });
}

function render() {
  tbody.replaceChildren(
    ...rules.map((rule, i) => {
      const tr = document.createElement("tr");
      for (const field of ["match", "title", "favicon"]) {
        const input = document.createElement("input");
        input.value = rule[field] || "";
        if (field === "favicon") {
          input.onclick = () => {
            picking = input;
            icons.showPopover({ source: input });
          };
          // Xem trước icon trong ô; emoji thì tự hiện bằng chữ
          (input.oninput = () => {
            const url = input.value && URL.parse(input.value, chrome.runtime.getURL(""));
            input.style.backgroundImage = url ? `url("${url}")` : "";
          })();
        }
        input.onchange = () => {
          rule[field] = input.value;
          save();
        };
        tr.insertCell().append(input);
      }
      const del = document.createElement("button");
      del.textContent = "✕";
      del.onclick = () => {
        rules.splice(i, 1);
        save();
        render();
      };
      tr.insertCell().append(del);
      return tr;
    })
  );
}

icons.onclick = (e) => {
  const opt = e.target.closest("button");
  if (!opt) return;
  picking.value = opt.value;
  picking.oninput();
  picking.onchange();
  icons.hidePopover();
};

document.getElementById("add").onclick = () => {
  rules.push({ match: "", title: "", favicon: "" });
  render();
};

Promise.all([getRules(), chrome.tabs.query({ active: true, currentWindow: true })]).then(([r, [tab]]) => {
  rules = r;
  render();
  if (!/^https?:/.test(tab?.url || "")) return (status.textContent = "Không dùng được trên trang này.");
  if (findRule(rules, tab.url)) return (status.textContent = "Trang này đang được ngụy trang.");
  const host = new URL(tab.url).hostname.replace(/^www\./, "");
  btn.textContent = `+ Ngụy trang trang này (${host})`;
  btn.hidden = false;
  btn.onclick = () => {
    rules.push({ match: host, title: "Kế hoạch tuần - Google Tài liệu", favicon: "icons/google-docs.ico" });
    save();
    render();
    btn.hidden = true;
    status.textContent = "Trang này đang được ngụy trang.";
  };
});

// Các lần đóng tab bằng phím tắt: mở lại cả lần hoặc từng tab
const closed = document.getElementById("closed");
const closedList = closed.querySelector("ol");
const send = (msg) => chrome.runtime.sendMessage(msg);

function timeAgo(time) {
  const min = Math.floor((Date.now() - time) / 60000);
  if (min < 1) return "vừa xong";
  if (min < 60) return `${min} phút trước`;
  return `${Math.floor(min / 60)} giờ trước`;
}

function renderClosed(batches) {
  closed.hidden = !batches?.length;
  if (closed.hidden) return;
  closedList.replaceChildren(
    ...batches.map((batch, b) => {
      const li = document.createElement("li");
      const head = document.createElement("button");
      head.className = "batch";
      head.textContent = `↺ Mở lại ${batch.tabs.length} tab · ${timeAgo(batch.time)}`;
      head.onclick = () => send({ type: "restoreClosed", batch: b }).then(() => window.close());
      const tabs = document.createElement("ul");
      tabs.append(
        ...batch.tabs.map((tab, t) => {
          const item = document.createElement("li");
          const open = document.createElement("button");
          open.title = tab.url;
          const title = document.createElement("span");
          title.textContent = tab.title || tab.url;
          const host = document.createElement("small");
          host.textContent = URL.parse(tab.url)?.hostname || "";
          open.append(title, host);
          open.onclick = () => send({ type: "restoreClosed", batch: b, tab: t }).then(loadClosed);
          item.append(open);
          return item;
        })
      );
      li.append(head, tabs);
      return li;
    })
  );
}

const loadClosed = () => send({ type: "closedList" }).then(renderClosed);
loadClosed();
document.getElementById("clear-closed").onclick = () => send({ type: "clearClosed" }).then(loadClosed);

// Quét lịch sử Chrome, xoá mọi URL khớp rule
const purge = document.getElementById("purge-history");
purge.onclick = () => {
  purge.disabled = true;
  send({ type: "purgeHistory" }).then((count) => {
    purge.textContent = count ? `✓ Đã xoá ${count} mục khỏi lịch sử` : "✓ Lịch sử đã sạch";
  });
};
