# CLAUDE.md — documentation

Public customer-facing docs site. Powers [docs.trackstarhq.com](https://docs.trackstarhq.com). Built with Mintlify; OpenAPI reference is regenerated from pokedex.

## Repo at a glance

- **Stack:** Mintlify (markdown + MDX, custom theme via `docs.json`)
- **Local preview:** `mintlify dev` (requires `npm i mintlify -g`)
- **Deploys to:** `docs.trackstarhq.com` — auto-deploy from `main` via Mintlify's hosted pipeline
- **OpenAPI source:** `openapi.json` in this repo is generated from pokedex; refresh via the pokedex push script
- **Related repos:** `pokedex` (API source of truth), `trackstar-python` (SDK — separate docs)

## Where to look

- **`docs.json`** — navigation manifest. Defines tab structure, group ordering, page paths. **This is the routing config; pages don't auto-discover.**
- **`introduction.mdx`** — landing page
- **`how-to-guides/`** — narrative customer guides (getting started, syncing data, webhooks, sandbox, etc.)
- **`api-reference/`** — API endpoints, parameter docs. Some pages are hand-written `.mdx`; the auto-generated endpoints come from `openapi.json` via Mintlify's OpenAPI integration.
- **`use-cases/`** — vertical-specific solution narratives
- **`openapi.json`** — generated from pokedex; do NOT hand-edit. Refresh via pokedex's push script.
- **`assets/`, `images/`, `logo/`, `favicon.png`** — static media
- **`required.js`** — Mintlify hook (check before modifying)
- **Cross-cutting context:** `../pokedex/.claude/` for backend semantics that should be reflected in docs

## Critical rules

- **Customer-facing content — every word ships to public docs.** No internal terminology (`connection_id`, `crawl_frequency`, `schedule_row`) without customer-context explanation. No mentions of internal infra (DynamoDB, Celery, Datadog, Lambda function names).
- **Don't reference internal-only endpoints.** Admin endpoints used by oak / pokecenter must not appear in public API reference. If unsure whether an endpoint is public, check the integration's `me`/`safe_me` shape in pokedex and the `openapi.json` `tags` / `x-internal` markers.
- **`openapi.json` is generated.** Edits will be wiped on the next refresh. To change an endpoint's docs, change the pokedex schema (apispec / marshmallow) and regenerate.
- **`docs.json` ordering is intentional.** Pages are ordered by reading flow (getting-started before advanced topics); don't alphabetize. Same for tab order.
- **Customer-visible URLs are stable contracts.** Renaming a page path breaks external links (customer bookmarks, Slack share-links, Linear references). If a rename is necessary, set up a redirect in `docs.json` rather than just moving the file.
- **Code samples must work as written.** Copy-pasteable cURL / Python / Node snippets are the highest-trust part of docs; broken samples destroy customer trust faster than missing docs. Test snippets against the live API before merge.

## Common tasks

### "Add a new how-to guide"

1. Create `how-to-guides/your-topic.mdx`.
2. Add the path to `docs.json` under the appropriate group's `pages` array.
3. Run `mintlify dev` locally; verify navigation + linking.
4. Cross-link from related guides if applicable.

### "Document a new endpoint"

- If it's auto-generated from pokedex: the endpoint appears in `openapi.json` after the pokedex push script refreshes it. No `.mdx` file needed unless you want hand-written narrative around it.
- If it's hand-written: add an `.mdx` file under `api-reference/`, register in `docs.json`, follow the existing endpoint-page conventions.

### "Update the OpenAPI spec"

Don't edit `openapi.json` directly. Either:
1. Update pokedex's apispec / marshmallow schemas and run the push script from pokedex, OR
2. As a temporary measure per the README: copy pokedex's `openapi.json` into this repo, change `docs.json`'s `openapi` key to point to the local file. Revert once the pokedex push script is fixed.

### "Add an image / screenshot"

Drop in `images/` or `assets/`. Reference via relative path in `.mdx`. Prefer SVG for diagrams, PNG for screenshots. Optimize before commit (the deploy doesn't auto-compress).

### "Local preview"

```bash
npm i -g mintlify       # one-time
mintlify dev            # serves at http://localhost:3000
```

If the OpenAPI endpoints aren't loading, see the README troubleshooting section.

## Code style (markdown / MDX)

- `.mdx` over `.md` when you need React components (Mintlify-specific: `<Card>`, `<CodeGroup>`, `<Tabs>`, `<Accordion>`).
- Heading hierarchy: page title is H1 (set in frontmatter, not in body); body starts at H2.
- Code blocks must have language tags (`​```bash`, `​```python`, `​```json`).
- Multi-language examples → `<CodeGroup>` wrapper, not separate sections.

## Things that look wrong but aren't

- **`required.js` at root** — Mintlify hook; check its current behavior before editing.
- **`openapi.json` is committed despite being generated** — Mintlify needs the file at build time; CI doesn't regenerate it. The refresh process is manual (pokedex push script).
- **Some guides reference `pokedex` internals.** Where these leak through (e.g., webhook payload fields named after internal Python attributes), they're customer-facing contracts now — don't rename casually.

## Commit + PR

- Conventional commit prefix: `docs:` is the default; `feat:` for new pages, `fix:` for typo / accuracy fixes.
- PR body: Summary (what changed and why), Test plan (`mintlify dev` rendered correctly; broken-link check; any new code samples verified against live API).
- Customer-visible copy changes deserve careful review — flag in the PR description if you're changing wording on a high-traffic page (intro, getting-started, sync semantics).
