---
name: trackstar
description: Start here for any task that calls the Trackstar API, the unified REST API for warehouse management systems (WMS), shopping carts, and carriers. Covers authentication, the base URL, response shapes, pagination, filtering, errors, rate limits, and the sandbox. Load before trackstar-connect, trackstar-sync, or trackstar-write.
metadata:
  author: trackstar
  version: "1.0"
---

# Trackstar

Trackstar is a unified API for supply chain logistics. Integrate once and the same endpoints work across every supported WMS, cart, or carrier integration within a vertical. Trackstar syncs data from each connected system on a schedule and serves it from its own copy; writes are forwarded to the connected system in real time.

There is no official SDK. Call the REST API with plain HTTP from any language. The only client library is `@trackstar/react-trackstar-link` (and an Angular equivalent), which renders the connect modal in a frontend.

## Basics

- Base URL: `https://production.trackstarhq.com`. HTTPS only. Requests and responses are JSON. Every response carries an `X-Request-Id` header worth logging.
- Verticals and path prefixes: `/wms/...`, `/cart/...`, `/carrier/...`. Management endpoints (`/link/...`, `/connections`, `/integrations/...`, `/magic-links`, `/sandbox/...`) have no prefix.
- Docs index: https://docs.trackstarhq.com/llms.txt. Append `.md` to any docs URL for Markdown. Full OpenAPI: https://production.trackstarhq.com/openapi.json. Postman: https://production.trackstarhq.com/postman.json.

## Authentication

Two headers:

```
x-trackstar-api-key: <organization API key, from the dashboard>
x-trackstar-access-token: <connection access token, one per connected system>
```

- The API key identifies the organization and is required on every request. It is created in the dashboard under Settings, API keys. Keys are full access or read only.
- The access token identifies one connection (one customer's WMS, cart, or carrier). It comes back from the token exchange when a customer connects, from a sandbox generation call, or from the dashboard's Connections page. Data endpoints need it; organization-level endpoints (`/link/token`, `/link/exchange`, `/connections`, `/integrations/...`, `/magic-links`) take the API key alone.
- Read both from environment variables. Never print, log, or commit them. Never put the API key in frontend code; the frontend only handles link tokens and auth codes.

## Response shapes

- List endpoints return `{"data": [...], "next_token": "..." | null, "total_count": n}`.
- Single-item endpoints return `{"data": {...}}`.
- Write endpoints return `{"data": {...}, "id": "...", "unused_fields": [...]}`, where `data` is the record as Trackstar now holds it and `unused_fields` lists body fields the integration ignored.
- Every record carries `id`, `created_date`, `updated_date` (from the source system), `trackstar_created_date`, and `trackstar_updated_date` (when Trackstar's copy changed). Most also carry `trackstar_tags`.
- Dates are ISO 8601 in UTC, for example `2026-01-01T00:00:00Z`.

## Pagination

- Default and maximum page size is 1000; set `limit` to change it.
- Pass the response's `next_token` as the `page_token` query parameter to get the next page. Stop when `next_token` is null.
- Repeat every filter on every page. A page token does not remember the original filters.

## Filtering

Filters use bracket syntax: `field[operator]=value`. Operators: `eq` (also plain `field=value`), `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `nin`. For `in` and `nin` pass a comma-separated list of at most 100 values; more returns a 422, so split the request.

```
GET /wms/orders?status=fulfilled
GET /wms/orders?status[in]=fulfilled,open
GET /wms/orders?created_date[gte]=2026-01-01T00:00:00Z&created_date[lte]=2026-01-31T23:59:59Z
GET /wms/orders?ids[in]=id1,id2
```

- Date ranges with both `gte` and `lte` are the fastest queries.
- `ids[in]` fetches specific records by ID; when it is present every other filter is ignored.
- Use `trackstar_updated_date[gte]` for incremental syncs of what changed in Trackstar since your last run. `updated_date` is the source system's own timestamp.
- Unknown filter fields or operators return a 422 naming the parameter. Each endpoint's reference page lists its filterable fields.

## Errors

Standard HTTP status codes. Error bodies always have `error` and `origin`:

```json
{"error": "Sample error message", "origin": "trackstar"}
```

- `origin` is `trackstar` for errors Trackstar raised and `integration` for errors the connected system returned. Show integration errors to the caller unchanged; they usually name the field the vendor rejected.
- 401: bad API key or access token.
- 403 on a write: the endpoint is disabled for this organization or connection (`create_return is disabled for this connection`).
- 404: the record is not in Trackstar's copy for this connection.
- 422: validation failed. The body names the location and field. Includes null or empty-string values in write bodies and filter lists over 100 values.
- 429: rate limited. Wait for `retry-after` seconds.
- 501: the connected integration does not implement this endpoint (`Endpoint get_returns is not implemented for Cool WMS`). Treat it as a capability gap, not a transient error. The connection's `available_actions` lists what it does support.

## Rate limits

Per access token: 10 GET requests per second, 50 POST, PUT, PATCH, or DELETE requests per second. Response headers `x-ratelimit-limit`, `x-ratelimit-remaining`, `x-ratelimit-reset` (epoch seconds), and `retry-after` report the current state. Different access tokens have independent budgets.

## Sandbox

Each organization gets one sandbox connection per vertical with generated data, so you can build without real credentials.

```
POST /sandbox/generate-sandbox/{wms|cart|carrier}
headers: x-trackstar-api-key
```

Returns `access_token`, `connection_id`, `integration_name` (`sandbox`), and `available_actions`. The call is idempotent: the sandbox for that vertical keeps the same connection ID and is reset to fresh data every time. Sandbox tokens are also on the dashboard's Connections page (rows named Sandbox), and the Link modal can offer a Sandbox integration when the `sandbox` option is set.

Sandbox data can be edited in the dashboard's Data Explorer, and edits fire webhooks, so a full webhook flow can be tested end to end. Simulation endpoints move records through their lifecycle: `PUT /sandbox/simulate/orders/{order_id}/fulfill`, `PUT /sandbox/simulate/returns/{return_id}/receive`, `POST /sandbox/simulate/cart/orders`, `POST /sandbox/simulate/cart/products`.

## Where things are documented

| Topic | Page |
| --- | --- |
| Setup walkthrough with code | https://docs.trackstarhq.com/how-to-guides/getting-started.md |
| Auth, pagination, filtering, errors, rate limits | https://docs.trackstarhq.com/how-to-guides/about-the-api.md |
| Sync model and initial sync | https://docs.trackstarhq.com/how-to-guides/syncing-data.md |
| Webhooks | https://docs.trackstarhq.com/how-to-guides/webhooks/webhooks.md |
| Writes and write-info | https://docs.trackstarhq.com/how-to-guides/programmatic-writes.md |
| Sandbox | https://docs.trackstarhq.com/how-to-guides/sandbox.md |
| Agent resources and prompts | https://docs.trackstarhq.com/how-to-guides/build-with-ai.md |
| Endpoint reference | `https://docs.trackstarhq.com/api-reference/wms-api/orders/get.md`, swapping the vertical (`wms-api`, `cart-api`, `carrier-api`), the resource, and the page (`info`, `get`, `get-item`, `post`, `put`) |

## Related skills

- `trackstar-connect`: connecting a customer's system and managing the connection.
- `trackstar-sync`: reading data, incremental syncs, webhooks, and how resources relate.
- `trackstar-write`: creating and updating records, tags, and passthrough requests.
