---
name: trackstar-connect
description: Connect a customer's WMS, cart, or carrier system to Trackstar and manage the resulting connection. Use for link tokens, the Trackstar Link component, Magic Links, exchanging auth codes for access tokens, sandbox connections, connection health and errors, disabled endpoints, and reinstalling credentials. Load the trackstar skill first for auth and error basics.
metadata:
  author: trackstar
  version: "1.0"
---

# Connecting systems to Trackstar

A connection is one customer's system (a WMS account, a cart store, a carrier account) linked to your Trackstar organization. Each connection has a `connection_id` and an access token. Everything else in the API is scoped by that token.

Three ways to create a connection:

| Method | When to use | Code required |
| --- | --- | --- |
| Trackstar Link embedded in your app | The standard product flow; customers connect from inside your UI | Frontend component plus two backend endpoints |
| Magic Link | You send the customer a URL; no UI to build | None (dashboard) or one API call |
| Dashboard | You already hold the customer's credentials, or internal testing | None |

## The embedded flow

```
your frontend            your backend                     Trackstar
     |  POST /get-link-token  |                                |
     |----------------------->|  POST /link/token (API key)    |
     |                        |------------------------------->|
     |   linkToken            |          { link_token }        |
     |<-----------------------|<-------------------------------|
     |  open Link modal with linkToken; customer picks an integration and signs in
     |<-------------------------------------------------------->|
     |  onSuccess(authCode, integrationName)                     |
     |  POST /store-token     |                                |
     |----------------------->|  POST /link/exchange (API key) |
     |                        |------------------------------->|
     |                        |  { access_token, connection_id, integration_name, customer_id, available_actions }
     |                        |<-------------------------------|
     |                        |  store against the customer    |
```

1. `POST /link/token` with the API key returns a short-lived `link_token`. Optional body fields: `customer_id` (your identifier for the customer; it is stored on the connection and returned on exchange) and `connection_id` (only when re-authenticating an existing connection, see Reinstalling below).
2. The frontend opens the Link modal with that token. The customer chooses an integration, enters credentials, and grants access to each endpoint the connection will sync. Endpoints your organization has disabled are skipped.
3. The modal calls `onSuccess(authCode, integrationName)`. The auth code is temporary.
4. `POST /link/exchange` with the API key and `{"auth_code": "..."}` returns the permanent `access_token` plus `connection_id`, `integration_name`, `customer_id`, and `available_actions`.
5. Store `access_token`, `connection_id`, `integration_name`, and `available_actions` with the customer. The access token is a secret. The connection ID is what webhooks carry, so it is how you route events back to a customer.

`available_actions` lists the endpoints this connection supports (for example `get_orders`, `create_order`). Anything not listed returns 501 (unsupported by the integration) or 403 (disabled by policy). Use it to decide which features to show a customer.

Reference code for both backend endpoints in Python and Node is in the Getting Started guide: https://docs.trackstarhq.com/how-to-guides/getting-started.md

## The frontend component

Packages: `@trackstar/react-trackstar-link` (React), `@trackstar/angular-trackstar-link` (Angular), or the script at `https://link.trackstarhq.com/main.js` for vanilla JavaScript. Props of `TrackstarConnectButton` and `Trackstar.init`:

| Prop | Required | Meaning |
| --- | --- | --- |
| `getLinkToken` | yes | Async function returning a link token from your backend |
| `onSuccess(authCode, integrationName)` | yes | Send the auth code to your backend for exchange |
| `onClose`, `onLoad` | no | Lifecycle callbacks |
| `integrationType` | no | `wms` (default), `cart`, or `carrier` |
| `sandbox` | no | `true` adds a Sandbox integration to the list, useful in development |
| `integrationAllowList`, `integrationBlockList` | no | Restrict the list by `integration_name`; mutually exclusive. A one-item allow list skips the picker |
| `integrationsWithEndpoints` | no | Only show integrations supporting these endpoints, for example `["get_returns", "create_return"]` |
| `buttonId` | no | Required when rendering several buttons on one page |
| `logo`, `style` | no | Branding and button styling |

Integration names come from `GET /integrations/{integration_type}` (API key only, rate limited to one call per minute). Full prop reference: https://docs.trackstarhq.com/how-to-guides/trackstar-link.md

## Magic Links

A hosted version of the same modal. Generate one in the dashboard (Connections, Generate Magic Link) or with `POST /magic-links` using the API key. Body fields: `integration_type`, `link_duration`, `customer_id`, `connection_id` (reinstall only), `integration_allow_list`, `integration_block_list`, `integrations_with_endpoints`, `disabled_functions`, `enabled_functions`. The customer opens the returned URL, connects, and the access token appears on the dashboard's Connections page and through `GET /connections`. `GET /magic-links`, `GET /magic-links/{id}`, and `DELETE /magic-links/{id}` manage them.

## Sandbox connections

`POST /sandbox/generate-sandbox/{wms|cart|carrier}` with the API key creates or resets the sandbox for that vertical and returns its `access_token` and `connection_id`. Going through the Link modal with `sandbox` enabled produces the same connection and exercises the full exchange flow. See the trackstar skill for details.

## Reading connection state

- `GET /connections` (API key, paginated) lists every connection. `GET /connections/{connection_id}` returns one.
- Fields: `connection_id`, `integration_name`, `integration_display_name`, `integration_type`, `customer_id`, `created_at`, `last_used`, `times_used`, `available_actions`, `webhooks_disabled`, `me` (account identifiers in the connected system), `sync_schedules[]` (per function: `last_crawl_start`, `last_crawl_end`, `latest_data`, `sync_frequency` in seconds, `sync_status`), `historical_sync_completed` (map of function name to boolean), and `errors[]`.
- A connection is ready to query for a resource when `historical_sync_completed` is true for that function, or when the `connection.historical-sync-completed` webhook has arrived for it. Resource data is empty before that.
- `PATCH /connections` (API key plus access token) updates the connection's `customer_id` or `webhooks_disabled`. `DELETE /connections` (API key plus access token) removes it.

## Connection errors

Trackstar monitors every connection. Two kinds of problem appear in `errors[]` and as `connection-error.created`, `connection-error.updated`, and `connection-error.deleted` webhooks:

- **Invalid credentials (blocking).** Trackstar cannot authenticate. Nothing syncs until the customer reinstalls. `affected_endpoints[].preventing_sync` is true.
- **Missing permissions (non-blocking).** Credentials work but lack access to some resources. Everything else keeps syncing; only the listed endpoints are affected. Fixed by widening the customer's role in their system or reinstalling with broader credentials.

Each error carries `error_message`, `affected_endpoints[]` (endpoint plus `preventing_sync`), `first_seen`, and `last_seen`. Guide: https://docs.trackstarhq.com/how-to-guides/connection-issues.md

## Reinstalling a connection

To replace credentials without creating a new connection, pass the existing `connection_id` when creating the link token (`POST /link/token`) or the magic link. The customer signs in again and the same `connection_id` and access token keep working. A brand-new connection would get a new ID and a new 30-day initial sync.

## Disabled endpoints

Organizations can turn off endpoints they never use, per integration type, in the dashboard under Connection Settings. A disabled endpoint does not sync, is not validated during Link, is omitted from `available_actions`, and rejects writes with a 403. A Magic Link can disable extra endpoints for the connection it installs or re-enable organization-disabled ones for that connection only. Re-enabling resumes syncs and backfills what was missed.

Sync schedules can also be paused per connection: `PATCH /schedules/{function_name}/toggle` and `PATCH /schedules/toggle-all`, both with the API key and access token.

## Checklist for an agent building this

- Backend exposes a link-token endpoint and an exchange endpoint; the frontend never sees the API key.
- The exchange handler stores `access_token`, `connection_id`, `integration_name`, and `available_actions` keyed by your customer.
- Nothing reads data until `historical_sync_completed` or the completion webhook says the resource is ready.
- Connection-error webhooks are handled, at minimum by prompting the customer to reconnect on a blocking error.
- Reinstalls reuse the `connection_id`.
