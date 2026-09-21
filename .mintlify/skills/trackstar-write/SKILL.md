---
name: trackstar-write
description: Create, update, and cancel records in a system connected through Trackstar. Use for write endpoints, the write-info schema per integration, base versus integration-specific fields, the non-null rule, write error handling, Trackstar tags, and passthrough requests to an integration's own API. Load the trackstar skill first for auth and error basics.
metadata:
  author: trackstar
  version: "1.0"
---

# Writing data through Trackstar

Writes are the opposite of reads: no sync is involved. `POST`, `PUT`, `PATCH`, and `DELETE` requests are forwarded to the connected system immediately and its answer comes straight back, including any validation message it produced. Trackstar stores the resulting record, so it is readable through `GET` right away, and emits the matching webhook.

Because writes touch a customer's live system, develop against a sandbox connection first (`POST /sandbox/generate-sandbox/{type}` with the API key) and only switch tokens once the flow works.

## Write endpoints

All take the API key and the connection's access token. Every request must send `Content-Type: application/json`.

| Vertical | Endpoint | Action |
| --- | --- | --- |
| WMS | `POST /wms/orders`, `PUT /wms/orders/{order_id}`, `PUT /wms/orders/{order_id}/cancel` | Create, update, cancel an order |
| WMS | `POST /wms/orders/{order_id}/shipments` | Record a shipment with tracking for an order |
| WMS | `POST /wms/orders/{order_id}/file` | Attach a file (for example a label) to an order |
| WMS | `POST /wms/products`, `PUT /wms/products/{product_id}` | Create, update a product |
| WMS | `POST /wms/kits`, `PUT /wms/kits/{kit_id}` | Create, update a kit (bundle) |
| WMS | `POST /wms/inbound-shipments`, `PUT /wms/inbound-shipments/{inbound_shipment_id}`, `PUT /wms/inbound-shipments/{inbound_shipment_id}/receive` | Create, update, receive an ASN |
| WMS | `POST /wms/returns`, `PUT /wms/returns/{return_id}`, `PUT /wms/returns/{return_id}/cancel` | Create, update, cancel a return |
| WMS | `PUT /wms/inventory/{inventory_id}/adjust` | Adjust an inventory quantity |
| Cart | `PUT /cart/products/{product_id}/adjust-inventory`, `PUT /cart/products/batch-adjust-inventory` | Adjust one product's inventory, or many in a batch |
| Cart | `POST /cart/orders/{order_id}/shipments` | Create an order shipment (fulfillment) |
| Cart | `POST /cart/orders/{order_id}/refund` | Refund an order |
| Carrier | none | Read only apart from tags |

Exact bodies: `https://docs.trackstarhq.com/api-reference/{wms-api|cart-api}/{resource}/{post|put|cancel|create-shipment|adjust|...}.md`. Every resource also has a tags endpoint, described below.

Which writes a connection actually supports is in its `available_actions` (for example `create_order`, `update_order`, `cancel_order`). A write the integration lacks returns 501; one the organization disabled returns 403 without reaching the integration.

## Base schema versus integration schema

The request body is unified across integrations for each action (the base schema). Individual integrations may require extra fields, make base fields required, or ignore some. Two ways to learn the exact shape:

1. The reference page for the endpoint shows the base schema and one tab per integration.
2. `GET /integrations/{integration_type}/{integration_name}/write-info` with the API key returns an OpenAPI document for that integration's write operations, with `required` arrays per schema. Add the access token and the response also includes connection-specific values such as the allowed `return_cause` codes for that account. `integration_name` comes from the connection (`GET /connections/{connection_id}` or the exchange response).

`GET /integrations/{integration_type}` and `GET /integrations/{integration_type}/{integration_name}` summarize each integration's `write_operations[]` with `required_base_schema_fields`, `optional_base_schema_fields`, and `integration_specific_fields`; both are rate limited to one call per minute, so cache the result.

Procedure for an agent: call write-info for the connection's integration, build the body from the required and optional fields it lists, and treat any field it does not list as unsupported for that integration.

## The non-null rule

Every field in a write body is non-nullable. Sending `null`, `""`, or `"none"` for any field returns 422, because connected systems disagree on what a null means (clear the field, reject the request, or ignore it). Omit fields you do not intend to set. Build bodies by including only keys that have a value.

## Responses and errors

Success returns `{"data": {...}, "id": "...", "unused_fields": [...]}`. `data` is the record as Trackstar now holds it, `id` is the new or updated record's ID, and `unused_fields` lists body fields the integration accepted but did not use. Log `unused_fields`; it is the only signal that a value silently did not carry over.

- 422 from Trackstar (`origin: "trackstar"`): schema validation failed before the request left Trackstar. The body names the field.
- 4xx with `origin: "integration"`: the connected system rejected the write. Surface its `error` text unchanged; it usually names the field or business rule (unknown SKU, missing warehouse, duplicate order number).
- 403: the endpoint is disabled for this organization or connection.
- 501: the integration does not implement this write.
- Reads and writes share the same `id`, so after a successful create, `GET /{prefix}/{resource}/{id}` returns the record.

Idempotency: send an `Idempotency-Key` header (a unique value per write, such as a UUID, up to 255 characters) on any write except passthrough. A retry with the same key within 24 hours returns the first successful response with an `Idempotent-Replayed: true` header and does not write again. 409 means the first request is still running; 400 means the key was already used with a different endpoint or body. Keys are scoped to a connection. If the first attempt returned an error, the key is released and the retry writes again, so a write the integration accepted before erroring can still duplicate. For that case, rely on the source system's own uniqueness rule (for example `order_number` or `reference_id` on orders). Guide: https://docs.trackstarhq.com/how-to-guides/programmatic-writes.md

## Trackstar tags

Tags attach your own metadata to any record in Trackstar without writing to the source system. A tag is a string or a one-key object: `"rush"` or `{"channel": "wholesale"}`.

`PUT /{prefix}/{resource}/{id}/trackstar-tags` with `{"trackstar_tags": [...]}` replaces the record's tag list. Supported on WMS inventory, products, orders, inbound shipments, returns, and warehouses; cart orders, products, and warehouses; carrier invoice line items. Tags are returned in `trackstar_tags` on reads and can be sent inside a create body under the same key. Guide: https://docs.trackstarhq.com/how-to-guides/trackstar-tags.md

## Passthrough requests

When Trackstar has no endpoint for something the integration's own API offers, call that API through Trackstar with the credentials already stored on the connection.

```
POST /{wms|cart}/passthrough
headers: x-trackstar-api-key, x-trackstar-access-token
{
  "method": "GET",
  "path": "/api/v1/custom-endpoint",
  "params": {"page": "1"},
  "headers": {"X-Extra": "value"},
  "data": {}
}
```

- `method` is one of GET, POST, PUT, PATCH, DELETE. `path` is the integration's own path (or the GraphQL endpoint with the query in `data`). Trackstar adds authentication headers; yours are merged in on top.
- The response is always a 200 from Trackstar wrapping the integration's answer: `{"status_code": 404, "headers": {...}, "body": ...}`. Check `status_code` yourself; a vendor 404 or 422 is returned, not raised.
- Write `path` the way the vendor documents it; Trackstar does not add or strip a leading slash for you.
- Supported by default for WMS and cart integrations that expose a standard HTTP API. Integrations that exchange files (SFTP, email, bucket drops) or speak SOAP only have no passthrough.
- Passthrough writes hit the vendor directly and are not normalized, stored, or webhooked by Trackstar.

Guide: https://docs.trackstarhq.com/how-to-guides/passthrough-requests.md

## Checklist for an agent building this

- Developed and tested against a sandbox token before any production token.
- Body built from write-info for the connection's integration; unlisted fields left out.
- No null or empty-string values anywhere in the body.
- `origin: "integration"` errors passed through to the caller; 403 and 501 handled as capability gaps.
- `unused_fields` logged; the created record read back by `id`.
- Retries guarded by a lookup on the source system's unique field.
