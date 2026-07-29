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
    width: 20rem; max-width: 90vw;
    border: 1px solid #e7e5e4; border-radius: 0.5rem;
    background: #fff; box-shadow: 0 10px 25px rgb(0 0 0 / 0.12); overflow: hidden;
  }
  html.dark .ts-dd-panel { background: #18181b; border-color: #44403c; box-shadow: 0 10px 25px rgb(0 0 0 / 0.5); }
  .ts-dd-search {
    width: 100%; padding: 0.5rem 0.75rem; border: none; border-bottom: 1px solid #e7e5e4;
    background: transparent; color: inherit; outline: none; font-size: 0.875rem;
  }
  html.dark .ts-dd-search { border-bottom-color: #44403c; }
  .ts-dd-list { max-height: 17.5rem; overflow-y: auto; margin: 0; padding: 0.25rem; list-style: none; }
  .ts-dd-option {
    padding: 0.375rem 0.625rem; border-radius: 0.375rem; cursor: pointer;
    color: #44403c; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  html.dark .ts-dd-option { color: #d6d3d1; }
  .ts-dd-option:hover, .ts-dd-option.ts-dd-active { background: #f5f5f4; }
  html.dark .ts-dd-option:hover, html.dark .ts-dd-option.ts-dd-active { background: #292524; }
  .ts-dd-option.ts-dd-selected { color: #7691DA; font-weight: 600; }
  .ts-dd-empty { padding: 0.5rem 0.625rem; opacity: 0.6; }
`;

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
  const tabs = getTabs(tabList);
  return labelOf(selected || tabs[0]);
}

function buildWidget(tabList) {
  const container = document.createElement('div');
  container.setAttribute(WIDGET_ATTR, '');
  container._tsTabList = tabList;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ts-dd-button';
  button.setAttribute('aria-haspopup', 'listbox');
  button.setAttribute('aria-expanded', 'false');

  const label = document.createElement('span');
  label.className = 'ts-dd-label';
  label.textContent = selectedLabelOf(tabList);
  container._tsLabel = label;

  const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  chevron.setAttribute('class', 'ts-dd-chevron');
  chevron.setAttribute('width', '16');
  chevron.setAttribute('height', '16');
  chevron.setAttribute('viewBox', '0 0 16 16');
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

  const list = document.createElement('ul');
  list.className = 'ts-dd-list';
  list.setAttribute('role', 'listbox');

  panel.appendChild(search);
  panel.appendChild(list);
  container.appendChild(button);
  container.appendChild(panel);

  function rebuildOptions(filter) {
    list.textContent = '';
    const tabs = getTabs(tabList);
    const query = filter.trim().toLowerCase();
    let shown = 0;
    tabs.forEach(tab => {
      const text = labelOf(tab);
      if (query && !text.toLowerCase().includes(query)) return;
      const option = document.createElement('li');
      option.className = 'ts-dd-option';
      option.setAttribute('role', 'option');
      option.textContent = text;
      if (tab.getAttribute('aria-selected') === 'true') option.classList.add('ts-dd-selected');
      option.addEventListener('click', () => {
        tab.click();
        if (label.textContent !== text) label.textContent = text;
        closePanel();
      });
      list.appendChild(option);
      shown += 1;
    });
    if (shown === 0) {
      const empty = document.createElement('li');
      empty.className = 'ts-dd-empty';
      empty.textContent = 'No matches';
      list.appendChild(empty);
    }
  }

  function openPanel() {
    rebuildOptions('');
    search.value = '';
    panel.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    const selected = list.querySelector('.ts-dd-selected');
    if (selected) selected.scrollIntoView({ block: 'center' });
    search.focus();
  }

  function closePanel() {
    panel.hidden = true;
    button.setAttribute('aria-expanded', 'false');
  }
  container._tsClosePanel = closePanel;

  button.addEventListener('click', () => {
    if (panel.hidden) openPanel();
    else closePanel();
  });

  search.addEventListener('input', () => rebuildOptions(search.value));

  search.addEventListener('keydown', event => {
    const options = Array.from(list.querySelectorAll('.ts-dd-option'));
    if (options.length === 0) {
      if (event.key === 'Escape') { closePanel(); button.focus(); }
      return;
    }
    const activeIndex = options.findIndex(option => option.classList.contains('ts-dd-active'));
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const next = Math.min(Math.max(activeIndex + step, 0), options.length - 1);
      options.forEach(option => option.classList.remove('ts-dd-active'));
      options[next].classList.add('ts-dd-active');
      options[next].scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter') {
      event.preventDefault();
      (options[activeIndex] || options[0]).click();
    } else if (event.key === 'Escape') {
      closePanel();
      button.focus();
    }
  });

  return container;
}

function enhanceTabLists() {
  injectStyles();

  // Remove widgets orphaned by a React re-render that replaced their tab list.
  document.querySelectorAll(`[${WIDGET_ATTR}]`).forEach(widget => {
    const tabList = widget._tsTabList;
    if (!tabList || !tabList.isConnected) {
      widget.remove();
      return;
    }
    // Keep the button label in sync when Mintlify changes the selection
    // (e.g. synced tabs elsewhere on the page).
    const current = selectedLabelOf(tabList);
    if (widget._tsLabel.textContent !== current) widget._tsLabel.textContent = current;
  });

  document.querySelectorAll('ul[data-component-part="tabs-list"]').forEach(tabList => {
    if (tabList.dataset.tsEnhanced === 'true') return;
    if (getTabs(tabList).length < MIN_TABS) return;
    tabList.dataset.tsEnhanced = 'true';
    tabList.style.setProperty('display', 'none', 'important');
    tabList.parentElement.insertBefore(buildWidget(tabList), tabList);
  });
}

document.addEventListener('click', event => {
  document.querySelectorAll(`[${WIDGET_ATTR}]`).forEach(widget => {
    if (!widget.contains(event.target)) widget._tsClosePanel();
  });
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', enhanceTabLists);
} else {
  enhanceTabLists();
}

const tabDropdownObserver = new MutationObserver(enhanceTabLists);
tabDropdownObserver.observe(document.body, { childList: true, subtree: true });
