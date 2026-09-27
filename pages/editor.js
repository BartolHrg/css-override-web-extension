/* global GLOBAL_KEY, debug, normalizeHostname */

// Mirror of storage.sync, plus entries added here that haven't been saved yet
let SITE_DATA = {};
let ACTIVE_KEY = GLOBAL_KEY;

const displayName = (key) => (key === GLOBAL_KEY ? 'Global (all sites)' : key);

// entry field -> textarea id
const STYLE_FIELDS = { style: 'styleData', importantStyle: 'importantStyleData' };

// Entries saved before importantStyle existed don't have it, so fill in defaults
const getEntry = (key) => ({
  enabled: true, style: '', importantStyle: '', ...SITE_DATA[key],
});

const readStyles = () => {
  const styles = {};
  Object.entries(STYLE_FIELDS).forEach(([field, id]) => {
    styles[field] = document.getElementById(id).value.trim();
  });
  return styles;
};

const writeStyles = (styles) => {
  Object.entries(STYLE_FIELDS).forEach(([field, id]) => {
    document.getElementById(id).value = styles[field];
  });
};

const isDirty = () => {
  const entry = getEntry(ACTIVE_KEY);
  const styles = readStyles();
  return Object.keys(STYLE_FIELDS).some((field) => styles[field] !== entry[field]);
};

const confirmDiscard = () => !isDirty()
  || window.confirm('You have unsaved changes. Discard them?'); // eslint-disable-line no-alert

// storage.sync limit per item: key length + JSON length of the value
const QUOTA_BYTES_PER_ITEM = browser.storage.sync.QUOTA_BYTES_PER_ITEM || 8192;

const showError = (message) => {
  const status = document.getElementById('status');
  status.textContent = message;
  status.classList.toggle('hidden', !message);
};

// Returns whether the write succeeded; on failure the error is shown in the editor
const saveEntry = async (key, entry) => {
  try {
    await browser.storage.sync.set({ [key]: entry });
    showError('');
    return true;
  } catch (e) {
    const size = key.length + JSON.stringify(entry).length;
    const sizeInfo = size > QUOTA_BYTES_PER_ITEM
      ? ` This entry is ${size} bytes; the limit is ${QUOTA_BYTES_PER_ITEM} bytes for both styles together.`
      : '';
    showError(`Couldn't save: ${e.message || e}.${sizeInfo}`);
    return false;
  }
};

const renderList = () => {
  const ul = document.getElementById('siteList');
  ul.textContent = '';
  const hostnames = Object.keys(SITE_DATA).filter((key) => key !== GLOBAL_KEY).sort();
  [GLOBAL_KEY, ...hostnames].forEach((key) => {
    const li = document.createElement('li');
    li.textContent = displayName(key);
    li.classList.toggle('active', key === ACTIVE_KEY);
    li.classList.toggle('disabled', !getEntry(key).enabled);
    li.addEventListener('click', () => {
      // eslint-disable-next-line no-use-before-define
      if (key !== ACTIVE_KEY && confirmDiscard()) selectEntry(key);
    });
    ul.appendChild(li);
  });
};

const renderEditor = () => {
  const entry = getEntry(ACTIVE_KEY);
  document.getElementById('siteName').textContent = displayName(ACTIVE_KEY);
  document.getElementById('chkEnabled').checked = entry.enabled;
  writeStyles(entry);
  document.getElementById('btnRename').disabled = ACTIVE_KEY === GLOBAL_KEY;
};

const selectEntry = (key) => {
  ACTIVE_KEY = key;
  showError('');
  const params = new URLSearchParams(window.location.search);
  params.set('hostname', key);
  window.history.replaceState({}, '', `${window.location.pathname}?${params}`);
  renderList();
  renderEditor();
};

// Background re-applies styles to open tabs via storage.onChanged
const btnEventSave = async () => {
  const entry = { ...getEntry(ACTIVE_KEY), ...readStyles() };
  // Only record the entry once saved, so a failed save still counts as unsaved changes
  if (await saveEntry(ACTIVE_KEY, entry)) {
    SITE_DATA[ACTIVE_KEY] = entry;
    renderList();
  }
};

const chkEventToggleEnabled = async (event) => {
  // Only the flag is saved; unsaved CSS in the textareas stays unsaved
  const entry = { ...getEntry(ACTIVE_KEY), enabled: event.target.checked };
  if (await saveEntry(ACTIVE_KEY, entry)) {
    SITE_DATA[ACTIVE_KEY] = entry;
    renderList();
  } else {
    event.target.checked = !event.target.checked; // eslint-disable-line no-param-reassign
  }
};

const promptHostname = (message, initial = '') => {
  const input = window.prompt(message, initial); // eslint-disable-line no-alert
  if (input === null) {
    return '';
  }
  const hostname = normalizeHostname(input);
  if (!hostname) {
    window.alert(`"${input}" is not a valid hostname.`); // eslint-disable-line no-alert
    return '';
  }
  if (hostname in SITE_DATA) {
    window.alert(`${hostname} already exists.`); // eslint-disable-line no-alert
    return '';
  }
  return hostname;
};

// New entries only exist here until their first save
const btnEventAdd = () => {
  if (!confirmDiscard()) {
    return;
  }
  const hostname = promptHostname('Hostname (e.g. example.com):');
  if (hostname) {
    SITE_DATA[hostname] = getEntry(hostname);
    selectEntry(hostname);
  }
};

const btnEventRename = async () => {
  const oldKey = ACTIVE_KEY;
  const newKey = promptHostname(`Rename ${oldKey} to:`, oldKey);
  if (!newKey) {
    return;
  }
  const unsavedStyles = readStyles();
  const entry = getEntry(oldKey);
  // Write the new key before removing the old one, so a failure never loses the style
  const stored = await browser.storage.sync.get(oldKey);
  if (stored[oldKey]) {
    if (!await saveEntry(newKey, entry)) {
      return;
    }
    await browser.storage.sync.remove(oldKey);
  }
  SITE_DATA[newKey] = entry;
  delete SITE_DATA[oldKey];
  selectEntry(newKey);
  writeStyles(unsavedStyles);
};

const btnEventDelete = async () => {
  if (!window.confirm(`Delete styles for ${displayName(ACTIVE_KEY)}?`)) { // eslint-disable-line no-alert
    return;
  }
  delete SITE_DATA[ACTIVE_KEY];
  await browser.storage.sync.remove(ACTIVE_KEY);
  selectEntry(GLOBAL_KEY);
};

// Keep in sync with changes made elsewhere (popup toggles, other editor tabs)
const onStorageChanged = (changes, area) => {
  if (area !== 'sync') {
    return;
  }
  const dirty = isDirty();
  Object.entries(changes).forEach(([key, { newValue }]) => {
    if (newValue) {
      SITE_DATA[key] = newValue;
    } else if (key !== ACTIVE_KEY) {
      delete SITE_DATA[key];
    }
  });
  renderList();
  if (ACTIVE_KEY in changes) {
    document.getElementById('chkEnabled').checked = getEntry(ACTIVE_KEY).enabled;
    if (!dirty) {
      writeStyles(getEntry(ACTIVE_KEY));
    }
  }
};

const initializePage = async () => {
  SITE_DATA = await browser.storage.sync.get();
  debug(JSON.stringify(SITE_DATA));

  const params = new URLSearchParams(window.location.search);
  const hostname = params.get('hostname');
  if (hostname && !(hostname in SITE_DATA)) {
    // Opened from the popup for a site with no styles yet; saved on first Save
    SITE_DATA[hostname] = getEntry(hostname);
  }
  selectEntry(hostname || GLOBAL_KEY);
};

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btnAdd').addEventListener('click', btnEventAdd);
  document.getElementById('btnSave').addEventListener('click', btnEventSave);
  document.getElementById('btnRename').addEventListener('click', btnEventRename);
  document.getElementById('btnDelete').addEventListener('click', btnEventDelete);
  document.getElementById('chkEnabled').addEventListener('change', chkEventToggleEnabled);

  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 's') {
      event.preventDefault();
      btnEventSave();
    }
  });
  window.addEventListener('beforeunload', (event) => {
    if (isDirty()) {
      event.preventDefault();
      event.returnValue = ''; // eslint-disable-line no-param-reassign
    }
  });
  browser.storage.onChanged.addListener(onStorageChanged);

  initializePage();
});
