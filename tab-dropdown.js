// Replaces very long Mintlify tab bars (the per-integration schema tabs on API
// reference pages) with a searchable dropdown. Tab bars with fewer than
// MIN_TABS tabs (e.g. ChannelId/ChannelName, code-language tabs) are left alone.
//
// Same approach as required.js: mutate the rendered DOM, re-run via a
// MutationObserver so Mintlify/React re-renders and SPA navigation are handled.
// The dropdown drives the real (hidden) tabs by clicking them, so Mintlify's
// own tab state stays in sync.

const MIN_TABS = 10;
const WIDGET_ATTR = 'data-ts-tab-dropdown';

const STYLE = `
  [${WIDGET_ATTR}] { position: relative; margin: 0.25rem 0 1rem; font-size: 0.875rem; }
  [${WIDGET_ATTR}] li::before, [${WIDGET_ATTR}] li::marker { content: none; }
  .ts-dd-button {
    display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;
    min-width: 16rem; max-width: 100%; padding: 0.5rem 0.75rem;
    border: 1px solid #e7e5e4; border-radius: 0.5rem;
    background: #fff; color: #1c1917; font-weight: 600; font-size: 0.875rem; cursor: pointer;
  }
  .ts-dd-button:hover { border-color: #7691DA; }
  html.dark .ts-dd-button { background: #18181b; border-color: #44403c; color: #e7e5e4; }
  .ts-dd-chevron { flex: none; opacity: 0.6; }
  .ts-dd-panel {
    position: absolute; z-index: 50; margin-top: 0.25rem;
    width: min(20rem, calc(100vw - 2rem));
    border: 1px solid #e7e5e4; border-radius: 0.5rem;
    background: #fff; box-shadow: 0 10px 25px rgb(0 0 0 / 0.12); overflow: hidden;
  }
  html.dark .ts-dd-panel { background: #18181b; border-color: #44403c; box-shadow: 0 10px 25px rgb(0 0 0 / 0.5); }
  .ts-dd-search {
    width: 100%; padding: 0.5rem 0.75rem; border: none; border-bottom: 1px solid #e7e5e4;
    background: transparent; color: inherit; outline: none; font-size: 0.875rem;
  }
  html.dark .ts-dd-search { border-bottom-color: #44403c; }
  .ts-dd-list { max-height: 17.5rem; overflow-y: auto; margin: 0; padding: 0.25rem; list-style: none; position: relative; }
  .ts-dd-option {
    padding: 0.375rem 0.625rem; border-radius: 0.375rem; cursor: pointer;
    color: #44403c; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  html.dark .ts-dd-option { color: #d6d3d1; }
  .ts-dd-option:hover, .ts-dd-option.ts-dd-active { background: #f5f5f4; }
  html.dark .ts-dd-option:hover, html.dark .ts-dd-option.ts-dd-active { background: #292524; }
  .ts-dd-option.ts-dd-selected { color: #2E3B72; font-weight: 600; }
  html.dark .ts-dd-option.ts-dd-selected { color: #7691DA; }
  .ts-dd-empty { padding: 0.5rem 0.625rem; opacity: 0.6; }
`;

const widgetState = new WeakMap();
let widgetCount = 0;

function injectStyles() {
  if (document.getElementById('ts-tab-dropdown-style')) return;
  const style = document.createElement('style');
  style.id = 'ts-tab-dropdown-style';
  style.textContent = STYLE;
  document.head.appendChild(style);
}

function getTabs(tabList) {
  return Array.from(tabList.querySelectorAll(':scope > li[data-component-part="tab"]'));
}

function labelOf(tab) {
  const button = tab.querySelector('[data-component-part="tab-button"]');
  return (button || tab).textContent.trim();
}

function selectedLabelOf(tabList) {
  const selected = tabList.querySelector(':scope > li[aria-selected="true"]');
  return labelOf(selected || getTabs(tabList)[0]);
}

// "Staci Americas (AMWare)" -> "staci-americas-amware"
function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Scroll within the dropdown list only — scrollIntoView would also scroll the
// page itself, yanking the docs content around when the panel opens.
function scrollOptionIntoView(list, option, center) {
  const top = option.offsetTop - list.offsetTop;
  const bottom = top + option.offsetHeight;
  if (center) {
    list.scrollTop = top - (list.clientHeight - option.offsetHeight) / 2;
  } else if (top < list.scrollTop) {
    list.scrollTop = top;
  } else if (bottom > list.scrollTop + list.clientHeight) {
    list.scrollTop = bottom - list.clientHeight;
  }
}

function buildWidget(tabList) {
  const widgetId = `ts-dd-${++widgetCount}`;
  const listId = `${widgetId}-listbox`;

  const container = document.createElement('div');
  container.setAttribute(WIDGET_ATTR, '');
  // not-prose: keep Mintlify's typography styles (list bullets etc.) off the widget
  container.className = 'not-prose';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ts-dd-button';
  button.setAttribute('aria-haspopup', 'listbox');
  button.setAttribute('aria-expanded', 'false');

  const label = document.createElement('span');
  label.className = 'ts-dd-label';
  label.textContent = selectedLabelOf(tabList);

  const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  chevron.setAttribute('class', 'ts-dd-chevron');
  chevron.setAttribute('width', '16');
  chevron.setAttribute('height', '16');
  chevron.setAttribute('viewBox', '0 0 16 16');
  chevron.setAttribute('aria-hidden', 'true');
  chevron.innerHTML = '<path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>';

  button.appendChild(label);
  button.appendChild(chevron);

  const panel = document.createElement('div');
  panel.className = 'ts-dd-panel';
  panel.hidden = true;

  const search = document.createElement('input');
  search.className = 'ts-dd-search';
  search.type = 'text';
  search.placeholder = 'Search…';
  search.setAttribute('role', 'combobox');
  search.setAttribute('aria-expanded', 'false');
  search.setAttribute('aria-controls', listId);
  search.setAttribute('aria-autocomplete', 'list');
  search.setAttribute('aria-label', 'Search tabs');

  const list = document.createElement('ul');
  list.className = 'ts-dd-list';
  list.id = listId;
  list.setAttribute('role', 'listbox');

  panel.appendChild(search);
  panel.appendChild(list);
  container.appendChild(button);
  container.appendChild(panel);

  function getOptions() {
    return Array.from(list.querySelectorAll('.ts-dd-option'));
  }

  function setActive(option) {
    getOptions().forEach(other => {
      if (other !== option) other.classList.remove('ts-dd-active');
    });
    if (option) {
      option.classList.add('ts-dd-active');
      search.setAttribute('aria-activedescendant', option.id);
      scrollOptionIntoView(list, option, false);
    } else {
      search.removeAttribute('aria-activedescendant');
    }
  }

  function rebuildOptions(filter) {
    list.textContent = '';
    search.removeAttribute('aria-activedescendant');
    const query = filter.trim().toLowerCase();
    getTabs(tabList).forEach((tab, index) => {
      const text = labelOf(tab);
      if (query && !text.toLowerCase().includes(query)) return;
      const option = document.createElement('li');
      option.className = 'ts-dd-option';
      option.id = `${widgetId}-option-${index}`;
      option.setAttribute('role', 'option');
      const isSelected = tab.getAttribute('aria-selected') === 'true';
      option.setAttribute('aria-selected', String(isSelected));
      if (isSelected) option.classList.add('ts-dd-selected');
      option.textContent = text;
      list.appendChild(option);
    });
    if (getOptions().length === 0) {
      const empty = document.createElement('li');
      empty.className = 'ts-dd-empty';
      empty.setAttribute('role', 'presentation');
      empty.textContent = 'No matches';
      list.appendChild(empty);
    }
  }

  // Resolve the real tab at click time rather than capturing it when the
  // panel opened — a React re-render can replace the <li>s in between.
  function selectOption(option) {
    const text = option.textContent;
    const tab = getTabs(tabList).find(candidate => labelOf(candidate) === text);
    if (tab) {
      tab.click();
      if (label.textContent !== text) label.textContent = text;
      writeIntegrationHash(text);
    }
    closePanel(true);
  }

  function openPanel() {
    rebuildOptions('');
    search.value = '';
    panel.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    search.setAttribute('aria-expanded', 'true');
    const selected = list.querySelector('.ts-dd-selected');
    if (selected) scrollOptionIntoView(list, selected, true);
    search.focus({ preventScroll: true });
  }

  function closePanel(refocus) {
    if (panel.hidden) return;
    panel.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    search.setAttribute('aria-expanded', 'false');
    if (refocus) button.focus({ preventScroll: true });
  }

  button.addEventListener('click', () => {
    if (panel.hidden) openPanel();
    else closePanel(true);
  });

  list.addEventListener('click', event => {
    const option = event.target.closest('.ts-dd-option');
    if (option) selectOption(option);
  });

  search.addEventListener('input', () => rebuildOptions(search.value));

  search.addEventListener('keydown', event => {
    const options = getOptions();
    if (options.length === 0) return;
    const activeIndex = options.findIndex(option => option.classList.contains('ts-dd-active'));
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive(options[activeIndex === -1 ? 0 : Math.min(activeIndex + 1, options.length - 1)]);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(options[activeIndex === -1 ? options.length - 1 : Math.max(activeIndex - 1, 0)]);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      selectOption(options[activeIndex] || options[0]);
    }
  });

  container.addEventListener('keydown', event => {
    if (event.key === 'Escape') closePanel(true);
  });

  widgetState.set(container, { tabList, label, closePanel });
  return container;
}

function enhanceTabLists() {
  document.querySelectorAll(`[${WIDGET_ATTR}]`).forEach(widget => {
    const state = widgetState.get(widget);
    const tabList = state && state.tabList;
    // Widget orphaned by a React re-render that replaced its tab list.
    if (!tabList || !tabList.isConnected) {
      widget.remove();
      return;
    }
    // Tab list shrank below the threshold (or Mintlify markup changed):
    // restore the native tab bar rather than leaving it hidden.
    if (getTabs(tabList).length < MIN_TABS) {
      tabList.style.removeProperty('display');
      delete tabList.dataset.tsEnhanced;
      widget.remove();
      return;
    }
    // Keep the button label in sync when Mintlify changes the selection
    // (e.g. synced tabs elsewhere on the page).
    const current = selectedLabelOf(tabList);
    if (state.label.textContent !== current) state.label.textContent = current;
  });

  document.querySelectorAll('ul[data-component-part="tabs-list"]').forEach(tabList => {
    if (tabList.dataset.tsEnhanced === 'true') return;
    if (getTabs(tabList).length < MIN_TABS) return;
    tabList.dataset.tsEnhanced = 'true';
    tabList.style.setProperty('display', 'none', 'important');
    tabList.parentElement.insertBefore(buildWidget(tabList), tabList);
  });
}

// ---- Integration deep links ------------------------------------------------
// Mintlify only renders the ACTIVE tab's panel into the DOM, and names its
// field anchors by the variant's POSITION (#body-one-of-5-reference-id). Two
// problems with that: the element doesn't exist until tab 5 is selected, so
// the link lands nowhere; and the number silently repoints at a DIFFERENT
// integration as soon as one is added earlier in the alphabet.
//
// So we accept both forms and normalize the address bar to the stable one:
//
//   #integration=<name>[&field=<field_path>]
//
// Field paths keep the API's snake_case (field=reference_id) — Mintlify's DOM
// ids use hyphens, so we swap on the way in and out.

const REVEAL_DEADLINE_MS = 3000;
let revealToken = 0;

function hashTarget() {
  try {
    return decodeURIComponent(location.hash.slice(1));
  } catch (error) {
    return '';
  }
}

function scrollToAnchor(element) {
  // The anchor divs carry no scroll-margin of their own; without it the
  // target lands underneath Mintlify's sticky header.
  if (!parseFloat(getComputedStyle(element).scrollMarginTop)) {
    element.style.scrollMarginTop = 'var(--scroll-mt, 6rem)';
  }
  element.scrollIntoView();
}

// Reject anything that isn't a Mintlify-shaped field path, so it can't reach
// the attribute selector below.
function fieldPath(raw) {
  if (!raw) return null;
  const path = raw.toLowerCase().replace(/_/g, '-');
  return /^[a-z0-9-]+$/.test(path) ? path : null;
}

// Both hash forms answer the same two questions: which variant, which field.
function parseHash(id) {
  const named = /^integration=([^&]+)(?:&field=([^&]+))?$/.exec(id);
  if (named) return { slug: named[1].toLowerCase(), field: fieldPath(named[2]) };
  // Lazy prefix so we match the FIRST one-of index — that's the top-level
  // variant. Later ones (…-warehouse-customer-id-one-of-0) are nested
  // schemas inside the panel and travel with the field path.
  const positional = /^(.*?)one-of-(\d+)(?:-(.*))?$/.exec(id);
  if (positional) {
    return { index: Number(positional[2]), field: fieldPath(positional[3]), exactId: id };
  }
  return null;
}

// Which tab list, and which tab within it, does this hash mean?
function locate(parsed) {
  const lists = Array.from(document.querySelectorAll('ul[data-component-part="tabs-list"]'))
    .map(getTabs)
    .sort((a, b) => b.length - a.length);
  if (parsed.slug) {
    for (const tabs of lists) {
      const index = tabs.findIndex(tab => slugify(labelOf(tab)) === parsed.slug);
      if (index !== -1) return { tabs, index };
    }
    return null;
  }
  // Longest list holding that many tabs, so small groups (ChannelId/
  // ChannelName, code languages) are never clicked by accident.
  const tabs = lists.find(list => list.length > parsed.index);
  return tabs ? { tabs, index: parsed.index } : null;
}

function findTarget(parsed, index) {
  if (parsed.exactId) return document.getElementById(parsed.exactId);
  if (!parsed.field) return null;
  // Name-based hashes don't carry Mintlify's id prefix ("body-", "parameter-"),
  // so match on the suffix once we know which variant is showing.
  const suffix = `one-of-${index}-${parsed.field}`;
  return document.getElementById(`body-${suffix}`) || document.querySelector(`[id$="${suffix}"]`);
}

function integrationHash(labelText, field) {
  const name = slugify(labelText);
  return `#integration=${name}` + (field ? `&field=${field.replace(/-/g, '_')}` : '');
}

// replaceState: no history entry (so tab-browsing doesn't hijack the back
// button) and no hashchange event, so this can't re-enter the reveal.
function writeHash(hash) {
  if (location.hash === hash) return;
  history.replaceState(null, '', location.pathname + location.search + hash);
}

function writeIntegrationHash(labelText) {
  // A pick supersedes any in-flight reveal, which would otherwise finish and
  // yank the page back to the integration the old link named.
  revealToken++;
  writeHash(integrationHash(labelText, null));
}

function revealHashTarget() {
  const token = ++revealToken;
  const parsed = parseHash(hashTarget());
  if (!parsed) return;
  const deadline = performance.now() + REVEAL_DEADLINE_MS;

  function attempt() {
    if (token !== revealToken) return;
    const found = locate(parsed);
    if (found) {
      const tab = found.tabs[found.index];
      if (tab.getAttribute('aria-selected') !== 'true') {
        // Keep clicking until Mintlify marks the tab selected — a click that
        // lands before React hydration finishes is dropped on the floor.
        tab.click();
      } else {
        const target = findTarget(parsed, found.index);
        if (target) scrollToAnchor(target);
        // Once the tab is up, keep polling for the field until the deadline:
        // the panel renders a beat after the click. Past that, settle for the
        // integration alone rather than leaving a stale positional URL.
        if (target || !parsed.field || performance.now() >= deadline) {
          writeHash(integrationHash(labelOf(tab), target ? parsed.field : null));
          return;
        }
      }
    }
    if (performance.now() < deadline) requestAnimationFrame(attempt);
  }
  attempt();
}

window.addEventListener('hashchange', revealHashTarget);

// pointerdown + capture so a Mintlify component calling stopPropagation()
// can't leave a panel stranded open.
document.addEventListener('pointerdown', event => {
  document.querySelectorAll(`[${WIDGET_ATTR}]`).forEach(widget => {
    const state = widgetState.get(widget);
    if (state && !widget.contains(event.target)) state.closePanel(false);
  });
}, { capture: true });

// Coalesce observer bursts into one pass per frame, and skip passes when every
// mutation happened inside a widget (e.g. option rebuilds while typing).
let enhancePending = false;
const tabDropdownObserver = new MutationObserver(mutations => {
  if (enhancePending) return;
  const relevant = mutations.some(mutation => {
    const target = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
    return !target || !target.closest(`[${WIDGET_ATTR}]`);
  });
  if (!relevant) return;
  enhancePending = true;
  requestAnimationFrame(() => {
    enhancePending = false;
    enhanceTabLists();
  });
});

function start() {
  injectStyles();
  enhanceTabLists();
  revealHashTarget();
  tabDropdownObserver.observe(document.body, { childList: true, subtree: true });
}

// Wait for the full load event rather than DOMContentLoaded: inserting foreign
// nodes into React-managed parents before hydration causes hydration
// mismatches (console errors + a flash of the native tab bar). Post-hydration
// re-renders are picked up by the observer either way.
if (document.readyState === 'complete') {
  start();
} else {
  window.addEventListener('load', start);
}
