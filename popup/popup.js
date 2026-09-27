/* global TAB_OVERRIDE_KEY, getHostname */

let ACTIVE_TAB;
let HOSTNAME;

const getActiveTab = () => browser.tabs.query({ active: true, currentWindow: true })
  .then((tabs) => tabs[0]);

const getSiteEnabled = async () => {
  const data = await browser.storage.sync.get(HOSTNAME);
  return Boolean(data[HOSTNAME] && data[HOSTNAME].enabled);
};

// 'default' | 'on' | 'off'; an override saved for another hostname no longer applies
const getTabState = async () => {
  const override = await browser.sessions.getTabValue(ACTIVE_TAB.id, TAB_OVERRIDE_KEY);
  if (override && override.hostname === HOSTNAME) {
    return override.state;
  }
  return 'default';
};

const onOff = (enabled) => (enabled ? 'on' : 'off');

const updatePopup = async () => {
  const btnToggleHostname = document.getElementById('btnToggleHostname');
  const btnToggleTab = document.getElementById('btnToggleTab');

  const siteEnabled = await getSiteEnabled();
  const tabState = await getTabState();

  btnToggleHostname.textContent = `Site: ${onOff(siteEnabled).toUpperCase()}`;
  btnToggleHostname.classList.toggle('neutral', !siteEnabled);

  const tabEnabled = tabState === 'default' ? siteEnabled : tabState === 'on';
  btnToggleTab.textContent = tabState === 'default'
    ? `Tab: default (${onOff(siteEnabled)})`
    : `Tab: ${tabState.toUpperCase()}`;
  btnToggleTab.classList.toggle('neutral', !tabEnabled);
};

const toggleHostname = async () => {
  const data = await browser.storage.sync.get(HOSTNAME);
  const site = data[HOSTNAME] || { enabled: false, style: '' };
  // background re-applies styles via storage.onChanged
  await browser.storage.sync.set({ [HOSTNAME]: { ...site, enabled: !site.enabled } });
  await updatePopup();
};

// The first click always flips what the page shows:
// default -> opposite of site -> same as site (pinned) -> default
const toggleTab = async () => {
  const siteState = onOff(await getSiteEnabled());
  const oppositeState = onOff(siteState === 'off');
  const next = {
    default: oppositeState,
    [oppositeState]: siteState,
    [siteState]: 'default',
  }[await getTabState()];

  await browser.sessions.setTabValue(ACTIVE_TAB.id, TAB_OVERRIDE_KEY, {
    hostname: HOSTNAME,
    state: next,
  });
  // sessions changes don't fire storage.onChanged, so tell background directly
  await browser.runtime.sendMessage({ action: 'applyTab', tabId: ACTIVE_TAB.id });
  await updatePopup();
};

const openEditor = () => {
  const page = '../pages/editor.html';
  const url = HOSTNAME ? `${page}?hostname=${encodeURIComponent(HOSTNAME)}` : page;
  browser.tabs.create({ url, active: true });
  window.close();
};

const initializePopup = async () => {
  ACTIVE_TAB = await getActiveTab();
  HOSTNAME = getHostname(ACTIVE_TAB.url);

  const heading = document.getElementById('hostname');
  if (!HOSTNAME) {
    heading.textContent = 'No site';
    document.getElementById('btnToggleHostname').disabled = true;
    document.getElementById('btnToggleTab').disabled = true;
    return;
  }
  heading.textContent = HOSTNAME;
  await updatePopup();
};

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btnToggleHostname').addEventListener('click', toggleHostname);
  document.getElementById('btnToggleTab').addEventListener('click', toggleTab);
  document.getElementById('btnOpenEditor').addEventListener('click', openEditor);
  initializePopup();
});
