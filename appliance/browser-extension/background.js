const homeUrl = "http://127.0.0.1:8787/browser/";

function tabSummary(tab) {
  return {
    id: tab.id,
    active: Boolean(tab.active),
    title: tab.title || "New tab",
    url: tab.url || "",
    favIconUrl: tab.favIconUrl || ""
  };
}

async function tabsInWindow(windowId) {
  return (await chrome.tabs.query({ windowId })).map(tabSummary);
}

async function notifyWindow(windowId) {
  if (!Number.isInteger(windowId)) return;
  const tabs = await chrome.tabs.query({ windowId });
  const payload = { type: "tabs:changed", tabs: tabs.map(tabSummary) };
  await Promise.all(tabs.map((tab) =>
    chrome.tabs.sendMessage(tab.id, payload).catch(() => {})
  ));
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;
  const windowId = sender.tab?.windowId;
  (async () => {
    if (message.type === "tabs:list") {
      sendResponse({ tabs: await tabsInWindow(windowId) });
      return;
    }
    if (message.type === "tabs:create") {
      await chrome.tabs.create({ windowId, url: homeUrl, active: true });
    } else if (message.type === "tabs:activate") {
      await chrome.tabs.update(Number(message.tabId), { active: true });
    } else if (message.type === "tabs:close") {
      const tabs = await chrome.tabs.query({ windowId });
      if (tabs.length <= 1) await chrome.tabs.update(tabId, { url: homeUrl });
      else await chrome.tabs.remove(Number(message.tabId));
    } else if (message.type === "navigate") {
      await chrome.tabs.update(tabId, { url: String(message.url) });
    } else if (message.type === "back") {
      await chrome.tabs.goBack(tabId).catch(() => {});
    } else if (message.type === "forward") {
      await chrome.tabs.goForward(tabId).catch(() => {});
    } else if (message.type === "reload") {
      await chrome.tabs.reload(tabId);
    } else if (message.type === "home") {
      await chrome.tabs.update(tabId, { url: homeUrl });
    }
    sendResponse({ ok: true });
  })().catch((error) => sendResponse({ error: error.message }));
  return true;
});

chrome.tabs.onCreated.addListener((tab) => notifyWindow(tab.windowId));
chrome.tabs.onRemoved.addListener((_tabId, info) => notifyWindow(info.windowId));
chrome.tabs.onActivated.addListener((info) => notifyWindow(info.windowId));
chrome.tabs.onUpdated.addListener((_tabId, _changeInfo, tab) => notifyWindow(tab.windowId));
