// Shared helpers, loaded as a plain script before the other scripts
/* eslint-disable no-unused-vars */

// Storage key for the style applied to every site.
// '<' and '>' are forbidden in hostnames, so no tab can ever collide with it.
const GLOBAL_KEY = '<global>';

// sessions.setTabValue key holding a tab's { hostname, state } override
const TAB_OVERRIDE_KEY = 'override';

const debug = (msg) => {
  console.log(`css-override-web-extension: ${msg}`); // eslint-disable-line
};

const getHostname = (url) => {
  try {
    return new URL(url).hostname;
  } catch (e) {
    return '';
  }
};

// Accepts "example.com", "Example.com " or "https://example.com/path".
// Returns '' for anything that isn't a usable hostname.
const normalizeHostname = (input) => {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) {
    return '';
  }
  return getHostname(trimmed.includes('://') ? trimmed : `http://${trimmed}`);
};
