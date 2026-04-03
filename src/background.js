importScripts("lib/storage.js");

const storageApi = globalThis.NopeTabStorage;

async function maybeRedirectTab(tabId, tabUrl) {
  if (!tabUrl || !/^https?:/i.test(tabUrl)) {
    return;
  }

  const data = await storageApi.getData();
  const hostname = new URL(tabUrl).hostname;
  const blockState = storageApi.getBlockState(data, hostname);
  if (!blockState.blocked) {
    return;
  }

  const destination = storageApi.getBlockedPageUrl(tabUrl);
  if (tabUrl === destination) {
    return;
  }

  await chrome.tabs.update(tabId, { url: destination });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "loading" && tab.url) {
    maybeRedirectTab(tabId, tab.url);
  }
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId);
  if (tab.url) {
    maybeRedirectTab(activeInfo.tabId, tab.url);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const action = message && message.type;

  (async () => {
    if (action === "get-state") {
      const data = await storageApi.getData();
      const targetUrl = message && message.payload ? message.payload.targetUrl : null;
      const hostname =
        targetUrl && /^https?:/i.test(targetUrl)
          ? new URL(targetUrl).hostname
          : sender && sender.tab && sender.tab.url && /^https?:/i.test(sender.tab.url)
            ? new URL(sender.tab.url).hostname
            : null;

      sendResponse({ ok: true, data, blockState: storageApi.getBlockState(data, hostname) });
      return;
    }

    if (action === "save-options") {
      const nextData = await storageApi.updateData(() => ({
        siteRules: message.payload.siteRules,
        settings: {
          blockMessage: message.payload.settings.blockMessage,
          emergencyLabel: message.payload.settings.emergencyLabel
        },
        emergencyUnlock: {
          activeSiteDomain: null,
          activeRuleId: null,
          occurrenceStart: null,
          unlockedAt: null
        }
      }));

      const targetUrl = message && message.payload ? message.payload.targetUrl : null;
      const hostname = targetUrl && /^https?:/i.test(targetUrl) ? new URL(targetUrl).hostname : null;
      sendResponse({ ok: true, data: nextData, blockState: storageApi.getBlockState(nextData, hostname) });
      return;
    }

    if (action === "emergency-unlock") {
      const targetUrl = message && message.payload ? message.payload.targetUrl : null;
      const hostname =
        targetUrl && /^https?:/i.test(targetUrl)
          ? new URL(targetUrl).hostname
          : sender && sender.tab && sender.tab.url && /^https?:/i.test(sender.tab.url)
            ? new URL(sender.tab.url).hostname
            : null;

      const currentData = await storageApi.getData();
      const blockState = storageApi.getBlockState(currentData, hostname);
      if (!blockState.activeRule || !blockState.siteEntry) {
        sendResponse({ ok: false, error: "emergency-unlock-not-available" });
        return;
      }

      const nextData = await storageApi.updateData((data) => ({
        siteRules: data.siteRules,
        settings: data.settings,
        emergencyUnlock: {
          activeSiteDomain: blockState.siteEntry.domain,
          activeRuleId: blockState.activeRule.rule.id,
          occurrenceStart: blockState.activeRule.occurrenceStart,
          unlockedAt: Date.now()
        }
      }));

      sendResponse({ ok: true, data: nextData, blockState: storageApi.getBlockState(nextData, hostname) });
      return;
    }

    if (action === "open-target-tab") {
      const target = message && message.payload ? message.payload.targetUrl : null;
      if (!target) {
        sendResponse({ ok: false, error: "missing-target" });
        return;
      }

      if (sender.tab && sender.tab.id) {
        await chrome.tabs.update(sender.tab.id, { url: target });
      } else {
        await chrome.tabs.create({ url: target });
      }

      sendResponse({ ok: true });
      return;
    }

    sendResponse({ ok: false, error: "unknown-action" });
  })().catch((error) => {
    console.error("NopeTab action failed", action, error);
    sendResponse({ ok: false, error: String(error) });
  });

  return true;
});
