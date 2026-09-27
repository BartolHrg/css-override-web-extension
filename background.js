/* global GLOBAL_KEY, TAB_OVERRIDE_KEY, debug, getHostname */

// tabId -> exact CSS code currently injected into that tab
const applied = new Map();
// tabId -> every distinct CSS code injected into that tab, oldest first (capped).
// A page restored from the back/forward cache keeps the CSS it had when it was left,
// which may be an older version than what `applied` knows about.
const injectedCodes = new Map();
const HISTORY_LIMIT = 10;
// tabId -> promise of the last queued apply, so applies to one tab never interleave
const queues = new Map();

const getTabOverride = async (tabId, hostname) => {
  const override = await browser.sessions.getTabValue(tabId, TAB_OVERRIDE_KEY);
  if (override && override.hostname === hostname && override.state !== 'default') {
    return override.state === 'on';
  }
  return undefined;
};

const buildCode = async (tabId, hostname) => {
  const keys = hostname ? [GLOBAL_KEY, hostname] : [GLOBAL_KEY];
  const data = await browser.storage.sync.get(keys);
  const global = data[GLOBAL_KEY];
  const site = hostname ? data[hostname] : undefined;

  const parts = [];
  // global first, so the site style wins ties
  if (global && global.enabled && global.style) {
    parts.push(global.style);
  }
  if (site && site.style) {
    const override = await getTabOverride(tabId, hostname);
    const siteOn = override !== undefined ? override : site.enabled;
    if (siteOn) {
      parts.push(site.style);
    }
  }
  return parts.join('\n');
};

const remember = (tabId, code) => {
  const codes = (injectedCodes.get(tabId) || []).filter((c) => c !== code);
  codes.push(code);
  injectedCodes.set(tabId, codes.slice(-HISTORY_LIMIT));
};

// Remove each code this tab has ever had, once. On a fresh page these are no-ops;
// on a back/forward cache restore one of them is the stale CSS the page came back with.
const removeKnownCodes = async (tabId) => {
  const codes = injectedCodes.get(tabId) || [];
  await Promise.all(codes.map((code) => browser.tabs.removeCSS(tabId, { code })
    .catch((e) => debug(`Failed to remove old styles from tab ${tabId}: ${e}`))));
};

const applyNow = async (tabId, hostname, reset) => {
  if (reset) {
    applied.delete(tabId);
    await removeKnownCodes(tabId);
  }
  const code = await buildCode(tabId, hostname);
  const old = applied.get(tabId) || '';
  if (code === old) {
    return;
  }
  if (old) {
    await browser.tabs.removeCSS(tabId, { code: old });
    applied.delete(tabId);
  }
  if (code) {
    await browser.tabs.insertCSS(tabId, { code, runAt: 'document_start' });
    applied.set(tabId, code);
    remember(tabId, code);
  }
};

// reset: the tab navigated, so `applied` no longer describes the document
const applyToTab = (tabId, hostname, reset = false) => {
  const previous = queues.get(tabId) || Promise.resolve();
  const next = previous
    .then(() => applyNow(tabId, hostname, reset))
    .catch((e) => debug(`Failed to apply styles to tab ${tabId}: ${e}`));
  queues.set(tabId, next);
  return next;
};

// Re-apply to every tab, or only to tabs on the given hostnames
const applyToTabs = async (hostnames) => {
  const tabs = await browser.tabs.query({});
  tabs.forEach((tab) => {
    const hostname = getHostname(tab.url);
    if (!hostnames || hostnames.has(hostname)) {
      applyToTab(tab.id, hostname);
    }
  });
};

const onStorageChanged = (changes, area) => {
  if (area !== 'sync') {
    return;
  }
  const keys = Object.keys(changes);
  if (keys.includes(GLOBAL_KEY)) {
    applyToTabs();
  } else {
    applyToTabs(new Set(keys));
  }
};

const onMessage = (request) => {
  debug(`Message ${request.action}`);
  if (request.action === 'applyTab') {
    return browser.tabs.get(request.tabId)
      .then((tab) => applyToTab(tab.id, getHostname(tab.url)))
      .then(() => true);
  }
  return undefined;
};

// Fires once per top-level navigation, after the new document exists
// (unlike tabs.onUpdated, which fires many times per load and may still see the old document)
const onNavigationCommitted = ({ tabId, frameId, url }) => {
  if (frameId !== 0) {
    return;
  }
  applyToTab(tabId, getHostname(url), true);
};

const onTabRemoved = (tabId) => {
  applied.delete(tabId);
  injectedCodes.delete(tabId);
  queues.delete(tabId);
};

const initializeExtension = () => {
  debug('Initializing extension');
  browser.runtime.onMessage.addListener(onMessage);
  browser.storage.onChanged.addListener(onStorageChanged);
  browser.webNavigation.onCommitted.addListener(onNavigationCommitted);
  browser.tabs.onRemoved.addListener(onTabRemoved);
  applyToTabs();
};

initializeExtension();
