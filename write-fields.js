// Two layout fixes for the write schemas in the API reference.
//
// 1. A Body section is split into the required fields, which stay on screen
//    under a "Required" heading, and the optional ones, which move behind a
//    "Show N optional fields" button that starts closed. Per integration the
//    optional fields are most of the schema: ShipHero's create-order has 31 of
//    them against 3 required, DCL 13 against 2, and the median integration 4
//    against 4.
// 2. An "Available options:" enum list longer than ENUM_PREVIEW values shows
//    the first few and a "+N more" link. Most enums in the spec are two or
//    three values, but DCL's shipping_method_id lists 983 and Amazon's
//    carrier_name 594, which bury the rest of the page.
//
// Same tactic as required.js and tab-dropdown.js: rewrite what Mintlify
// rendered, and re-run from a MutationObserver so re-renders, integration tab
// switches and SPA navigation are all picked up.
//
// Everything is done in place. No node React rendered is moved or removed, so
// there is nothing for hydration to trip over: the rows are reordered with
// flex `order`, hidden with `display: none`, and the only nodes we own are the
// heading, the button and the enum link.
//
// This runs inside an IIFE because Mintlify loads every root-level .js as a
// plain script sharing one global scope, and required.js and tab-dropdown.js
// already have names like `observer`, `STYLE` and `start` out there.

(function () {
  'use strict';

  const ROW = '.primitive-param-field, .object-param-field, .array-param-field';
  const FIELDS_ATTR = 'data-ts-fields';
  const ENUM_ATTR = 'data-ts-enum';
  const OWNED_ATTR = 'data-ts-owned';

  // A schema with one or two optional fields is already readable, and hiding
  // them behind a click just costs a click.
  const MIN_OPTIONAL = 3;
  // Above the spec's 90th percentile enum (8 values), so only the genuinely
  // long lists collapse.
  const ENUM_PREVIEW = 10;
  // Past this, even the opened list is worth a scroll box rather than a
  // thousand codes pushing the page down.
  const ENUM_SCROLL_AT = 40;

  const STYLE = `
    [${FIELDS_ATTR}] { display: flex; flex-direction: column; }
    [${FIELDS_ATTR}] > [data-ts-field="required"] { order: 1; }
    [${FIELDS_ATTR}] > [data-ts-field="optional"] { order: 3; }
    [${FIELDS_ATTR}="closed"] > [data-ts-field="optional"] { display: none; }

    /* Tailwind's last:border-b-0 lands on whichever row is last in the markup,
       which is no longer the row that is last on screen. */
    [${FIELDS_ATTR}] > [data-ts-field] { border-bottom-width: 1px; }
    [${FIELDS_ATTR}] > [data-ts-field][data-ts-last] { border-bottom-width: 0; }

    /* Sits between the section titles ("Body", "Headers") and a field label:
       their colour and weight, a step down in size. */
    .ts-wf-required-heading {
      order: 0; padding-top: 1.5rem;
      font-size: 0.8125rem; font-weight: 600; letter-spacing: 0.05em;
      text-transform: uppercase; color: #1c1917;
    }
    html.dark .ts-wf-required-heading { color: #fff; }

    /* Shaped like Mintlify's own "Show child attributes" control, so it reads
       as part of the page rather than something bolted on. */
    .ts-wf-optional-button {
      order: 2; display: flex; align-items: center; gap: 0.75rem;
      width: 100%; margin: 1.5rem 0; padding: 0.75rem 0.875rem;
      border: 1px solid #e7e5e4; border-radius: 0.75rem; background: none;
      font-size: 0.875rem; color: #57534e; text-align: left; cursor: pointer;
    }
    .ts-wf-optional-button:hover { background: rgba(250, 250, 249, 0.5); color: #1c1917; }
    html.dark .ts-wf-optional-button { border-color: rgba(255, 255, 255, 0.1); color: #d6d3d1; }
    html.dark .ts-wf-optional-button:hover { background: rgba(255, 255, 255, 0.05); color: #e7e5e4; }
    .ts-wf-chevron { flex: none; opacity: 0.6; transition: transform 0.15s ease; }
    [${FIELDS_ATTR}="open"] .ts-wf-chevron { transform: rotate(90deg); }

    [${ENUM_ATTR}="closed"] > div.inline-block:nth-child(n+${ENUM_PREVIEW + 1}) { display: none; }
    [${ENUM_ATTR}="open"][data-ts-enum-scroll] { max-height: 18rem; overflow-y: auto; }
    .ts-wf-enum-button {
      border: 0; background: none; padding: 0; cursor: pointer; white-space: nowrap;
      font-size: inherit; font-weight: 600; color: #2E3B72;
    }
    html.dark .ts-wf-enum-button { color: #7691DA; }
    .ts-wf-enum-button:hover { text-decoration: underline; }
  `;

  // Mintlify replaces these nodes constantly, so the open/closed choices live
  // here instead of on the DOM.
  let optionalOpen = false;
  const openEnums = new WeakSet();

  function injectStyle() {
    if (document.getElementById('ts-write-fields-style')) return;
    const style = document.createElement('style');
    style.id = 'ts-write-fields-style';
    style.textContent = STYLE;
    document.head.appendChild(style);
  }

  function chevron() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'ts-wf-chevron');
    svg.setAttribute('width', '10');
    svg.setAttribute('height', '10');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = '<path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>';
    return svg;
  }

  function plural(count, word) {
    return `${count} ${word}${count === 1 ? '' : 's'}`;
  }

  // ---- Required and optional body fields -----------------------------------

  function bodySections() {
    return Array.from(document.querySelectorAll('.api-section')).filter(function (section) {
      const title = section.querySelector('.api-section-heading-title');
      return title !== null && title.textContent.trim() === 'Body';
    });
  }

  // The schema's own fields. Anything under .expandable-content is a child
  // attribute of one of them and travels with its parent row.
  function schemaRows(section) {
    const rows = [];
    section.querySelectorAll('.param-head[id^="body-"]').forEach(function (head) {
      if (head.closest('.expandable-content') !== null) return;
      const row = head.closest(ROW);
      if (row !== null && rows.indexOf(row) === -1) rows.push(row);
    });
    return rows;
  }

  // Read the pill off the row's OWN head. Asking the row would find the pill on
  // a required child of an optional object and promote the whole block.
  function isRequired(row) {
    const head = row.querySelector('.param-head');
    return head !== null && head.querySelector('[data-component-part="field-required-pill"]') !== null;
  }

  function ownedNode(container, role) {
    return container.querySelector(`[${OWNED_ATTR}="${role}"]`);
  }

  function unsplit(container) {
    container.removeAttribute(FIELDS_ATTR);
    container.querySelectorAll(`[${OWNED_ATTR}]`).forEach(function (node) { node.remove(); });
    container.querySelectorAll('[data-ts-field]').forEach(function (row) {
      row.removeAttribute('data-ts-field');
      row.removeAttribute('data-ts-last');
    });
  }

  function buildOptionalButton() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ts-wf-optional-button not-prose';
    button.setAttribute(OWNED_ATTR, 'optional-button');
    button.appendChild(chevron());
    button.appendChild(document.createElement('span'));
    button.addEventListener('click', function () {
      optionalOpen = !optionalOpen;
      applyOptionalState();
    });
    return button;
  }

  function applyOptionalState() {
    document.querySelectorAll(`[${FIELDS_ATTR}]`).forEach(function (container) {
      container.setAttribute(FIELDS_ATTR, optionalOpen ? 'open' : 'closed');

      const rows = Array.from(container.querySelectorAll(':scope > [data-ts-field]'));
      const shown = rows.filter(function (row) {
        return optionalOpen || row.dataset.tsField === 'required';
      });
      rows.forEach(function (row) { row.removeAttribute('data-ts-last'); });
      if (shown.length > 0) shown[shown.length - 1].setAttribute('data-ts-last', '');

      const button = ownedNode(container, 'optional-button');
      if (button === null) return;
      const count = rows.filter(function (row) { return row.dataset.tsField === 'optional'; }).length;
      button.setAttribute('aria-expanded', String(optionalOpen));
      const label = `${optionalOpen ? 'Hide' : 'Show'} ${plural(count, 'optional field')}`;
      const span = button.querySelector('span');
      if (span.textContent !== label) span.textContent = label;
    });
  }

  function splitFields(container, rows) {
    const required = rows.filter(isRequired);
    const optional = rows.filter(function (row) { return !isRequired(row); });

    // With no required field the button would hide the whole schema, and with
    // only one or two optional fields there is nothing worth hiding.
    if (required.length === 0 || optional.length < MIN_OPTIONAL) {
      if (container.hasAttribute(FIELDS_ATTR)) unsplit(container);
      return;
    }

    required.forEach(function (row) { row.dataset.tsField = 'required'; });
    optional.forEach(function (row) { row.dataset.tsField = 'optional'; });

    if (ownedNode(container, 'required-heading') === null) {
      const heading = document.createElement('div');
      heading.className = 'ts-wf-required-heading not-prose';
      heading.setAttribute(OWNED_ATTR, 'required-heading');
      heading.textContent = 'Required';
      container.insertBefore(heading, rows[0]);
    }
    if (ownedNode(container, 'optional-button') === null) {
      container.appendChild(buildOptionalButton());
    }
    if (!container.hasAttribute(FIELDS_ATTR)) container.setAttribute(FIELDS_ATTR, 'closed');
  }

  function splitBodyFields() {
    const live = new Set();
    bodySections().forEach(function (section) {
      const byContainer = new Map();
      schemaRows(section).forEach(function (row) {
        const container = row.parentElement;
        if (container === null) return;
        if (!byContainer.has(container)) byContainer.set(container, []);
        byContainer.get(container).push(row);
      });
      byContainer.forEach(function (rows, container) {
        live.add(container);
        splitFields(container, rows);
      });
    });
    // A container Mintlify emptied on a tab switch would otherwise keep our
    // heading and button, labelling nothing.
    document.querySelectorAll(`[${FIELDS_ATTR}]`).forEach(function (container) {
      if (!live.has(container)) unsplit(container);
    });
  }

  // ---- Long enum lists -----------------------------------------------------

  function enumLists() {
    return Array.from(document.querySelectorAll('div.whitespace-pre-wrap.prose-sm')).filter(function (list) {
      const first = list.firstChild;
      return first !== null && first.nodeType === Node.TEXT_NODE
        && first.textContent.indexOf('Available options') === 0;
    });
  }

  function enumValues(list) {
    return Array.from(list.querySelectorAll(':scope > div.inline-block'));
  }

  function applyEnumState(list) {
    const values = enumValues(list);
    const open = openEnums.has(list);
    const button = ownedNode(list, 'enum-button');

    list.setAttribute(ENUM_ATTR, open ? 'open' : 'closed');
    if (values.length > ENUM_SCROLL_AT) list.setAttribute('data-ts-enum-scroll', '');
    else list.removeAttribute('data-ts-enum-scroll');

    if (button === null) return;
    button.setAttribute('aria-expanded', String(open));
    const label = open ? 'Show fewer' : `+${values.length - ENUM_PREVIEW} more`;
    if (button.textContent !== label) button.textContent = label;
  }

  function collapseEnums() {
    enumLists().forEach(function (list) {
      let button = ownedNode(list, 'enum-button');

      if (enumValues(list).length <= ENUM_PREVIEW) {
        list.removeAttribute(ENUM_ATTR);
        list.removeAttribute('data-ts-enum-scroll');
        if (button !== null) button.remove();
        return;
      }

      if (button === null) {
        button = document.createElement('button');
        button.type = 'button';
        button.className = 'ts-wf-enum-button';
        button.setAttribute(OWNED_ATTR, 'enum-button');
        button.addEventListener('click', function () {
          if (openEnums.has(list)) openEnums.delete(list);
          else openEnums.add(list);
          applyEnumState(list);
        });
      }
      // Re-append rather than insert once: a re-render can add values after it.
      if (button.parentElement !== list || button.nextSibling !== null) list.appendChild(button);
      applyEnumState(list);
    });
  }

  // ---- Deep links ----------------------------------------------------------

  // tab-dropdown.js turns #integration=shiphero&field=packing_note into a
  // scroll to that field, and Mintlify's own anchors are #body-…. Either can
  // name an optional field, and scrolling to one we have hidden goes nowhere,
  // so a link that asks for a field opens the optional group first.
  function hashNamesField() {
    let hash = '';
    try {
      hash = decodeURIComponent(location.hash.slice(1));
    } catch (error) {
      return false;
    }
    return /(^|&)field=/.test(hash) || /^body-/.test(hash);
  }

  function openForDeepLink() {
    if (!hashNamesField() || optionalOpen) return;
    optionalOpen = true;
    applyOptionalState();
  }

  // ---- Wiring --------------------------------------------------------------

  function enhance() {
    splitBodyFields();
    collapseEnums();
    applyOptionalState();
    openForDeepLink();
  }

  let queued = false;
  const writeFieldsObserver = new MutationObserver(function (records) {
    if (queued) return;
    // Our own writes come back through here, and required.js reacts to every
    // node we add, so acting on them would keep the two scripts busy.
    const relevant = records.some(function (record) {
      const target = record.target instanceof Element ? record.target : record.target.parentElement;
      return target === null || target.closest(`[${OWNED_ATTR}]`) === null;
    });
    if (!relevant) return;
    queued = true;
    requestAnimationFrame(function () {
      queued = false;
      enhance();
    });
  });

  window.addEventListener('hashchange', openForDeepLink);

  function begin() {
    injectStyle();
    enhance();
    writeFieldsObserver.observe(document.body, { childList: true, subtree: true });
  }

  // Same reason tab-dropdown.js waits for load: adding nodes to a
  // React-managed parent before hydration finishes causes a mismatch.
  if (document.readyState === 'complete') begin();
  else window.addEventListener('load', begin);
})();
