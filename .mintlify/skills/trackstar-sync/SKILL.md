---
name: trackstar-sync
description: Read data from a Trackstar connection and keep it fresh. Use for the sync model (scheduled, force, and on-demand syncs), waiting for the initial sync, listing and filtering resources, incremental syncs, webhooks and signature verification, and how orders, products, inventory, and warehouses relate to each other. Load the trackstar skill first for auth, pagination, and error basics.
metadata:
  author: trackstar
  version: "1.0"
---

# Reading and syncing data with Trackstar

Reads never hit the connected system. Trackstar pulls from it on a schedule, normalizes each record into the canonical schema, stores it, and serves that copy. `GET` responses are therefore fast and rate-limit friendly, but only as fresh as the last sync.

## The sync model

| | Scheduled | Force | On-demand |
| --- | --- | --- | --- |
| Starts | Automatically, per resource | `POST /connections/sync` or the dashboard | `POST /connections/on-demand-syncs` or the dashboard |
| Window | Last sync to now | Last sync to now | Custom `start_time` to `end_time` |
| Scope | Every resource on its own schedule | All resources, or the ones in `functions_to_sync` | One function per job |
| Done signal | Resource webhooks such as `order.updated` | `connection.force-sync-completed` | `connection.sync-job-completed` |

Default schedules: WMS orders, inventory, products, returns, bills, inbound shipments, and inventory ledger hourly; WMS shipping methods, warehouses, warehouse customers, and warehouse locations every 12 hours; cart orders and products hourly; cart warehouses every 12 hours; carrier invoice line items daily. Schedules are configurable per connection by Trackstar support.

### Initial sync

A new connection first pulls the last 30 days of history (configurable up to three years in the dashboard's Connection Settings). Until that finishes for a resource, reads of that resource return nothing. Detect completion by:

- the `connection.historical-sync-completed` webhook, sent once per resource with `data.resource`, `data.oldest_data_date`, and `data.newest_data_date`, or
- `GET /connections/{connection_id}` and the `historical_sync_completed` map (function name to boolean).

Resource webhooks (`order.created` and so on) are not sent for records pulled during the initial sync.

### Force sync

`POST /connections/sync` with the API key and access token. Body optional: `{"functions_to_sync": ["get_orders", "get_inventory"]}`. Runs the normal sync now instead of waiting. It does not backfill history, skips resources already mid-sync, and completes in the background; listen for `connection.force-sync-completed`.

### On-demand sync

Backfills one function over a custom window, for example history older than the initial sync.

```
POST /connections/on-demand-syncs   {"start_time": "2025-12-01T00:00:00Z", "end_time": "2026-01-01T00:00:00Z", "function_name": "get_orders"}
GET  /connections/on-demand-syncs/{sync_job_id}
POST /connections/on-demand-syncs/{sync_job_id}/cancel
```

Job `status` moves `open` to `completed`, `cancelled`, or `stuck`. Supported functions are rolled out per integration: WMS `get_orders`, `get_inbound_shipments`, `get_returns`, `get_bills`, `get_inventory_ledger`; cart `get_orders`; carrier `get_invoice_line_items`. Inventory and products are intentionally excluded (inventory is always a full snapshot, the product catalog is pulled in full on the first sync); use a force sync for those. An unsupported combination returns 400 `On-demand sync is not enabled for {integration_name} {function_name}`.

## Reading resources

Every list endpoint takes the API key and access token, `limit`, `page_token`, `ids[in]`, date filters on `created_date`, `updated_date`, `trackstar_created_date`, and `trackstar_updated_date`, `trackstar_tags`, and resource-specific filters (for example `status` and `warehouse_customer_id` on orders). Filter syntax and pagination are in the trackstar skill.

| Vertical | List endpoints |
| --- | --- |
| WMS | `/wms/orders`, `/wms/inventory`, `/wms/inventory/ledger`, `/wms/products`, `/wms/inbound-shipments`, `/wms/returns`, `/wms/shipping-methods`, `/wms/billing`, `/wms/warehouses`, `/wms/warehouses/{warehouse_id}/locations`, `/wms/warehouse-customers`, plus the lookup lists `/wms/orders/channels` and `/wms/inbound-shipments/suppliers` |
| Cart | `/cart/orders`, `/cart/products`, `/cart/warehouses` |
| Carrier | `/carrier/invoice-line-items`, `/carrier/files` |

Single records: `GET /{prefix}/{resource}/{id}`. Bills and inventory ledger are off by default and enabled by Trackstar on request.

Field-level reference for each resource: `https://docs.trackstarhq.com/api-reference/{wms-api|cart-api|carrier-api}/{resource}/get.md`, with a concept page at `.../{resource}/info.md`.

### Incremental sync recipe

1. Confirm the resource's initial sync is complete.
2. Run `GET /wms/orders?limit=1000&trackstar_updated_date[gte]=<last successful run, UTC>` and follow `next_token` with `page_token`, repeating the filter on each page.
3. Upsert by `id`. Keep `status` and `raw_status` (the source system's own status, useful when `status` is `other`).
4. Record the run time only after the last page succeeds.
5. Stay within 10 GET requests per second per access token; honor `retry-after` on 429.

`trackstar_updated_date` moves whenever Trackstar's copy changes, including when Trackstar first sees a record that is old in the source system, which is what an incremental consumer wants. `updated_date` is the source's timestamp.

## How resources relate (WMS)

- `orders[].line_items[].product_id` points at `/wms/products/{id}`; line items also carry `sku`.
- `products[].inventory_items[].inventory_item_id` is the `id` in `/wms/inventory`. To get stock for a SKU: find the product, take its inventory item IDs, read each inventory item.
- `warehouse_id` on orders, inventory, inbound shipments, and returns points at `/wms/warehouses/{id}`; `/wms/warehouses/{id}/locations` lists bins and shelves inside it.
- `warehouse_customer_id` identifies the merchant that owns the record when the WMS belongs to a 3PL serving many merchants.
- Inbound shipments (ASNs) and returns carry line items with `inventory_item_id` and expected versus received quantities.

Inventory quantity fields: `awaiting` (expected to arrive), `onhand` (total in the warehouse; equals committed plus unfulfillable plus fulfillable unless substitute SKUs are involved), `committed` (already assigned to orders), `unfulfillable` (damaged or quarantined), `fulfillable` (can ship), `sellable` (visible to sales channels). `unsellable` is deprecated. `inventory_by_warehouse_id` breaks the totals down per warehouse.

Cart: `orders[].line_items` reference `/cart/products` by product ID and SKU; a variant's `parent_product_id` points at its parent, and a parent product has `parent_product_id` equal to its own `id`.

Carrier: each invoice line item is one charge, not one shipment or one invoice. Files are the raw invoices with presigned download URLs.

### Status lifecycles

- WMS orders: `open`, `confirmed`, `processing`, `picked`, `packed`, `partially_fulfilled`, `fulfilled`, `backordered`, `exception`, `cancelled`, `other`.
- Cart orders: `open`, `confirmed`, `processing`, `partially_fulfilled`, `fulfilled`, `backordered`, `exception`, `cancelled`, `other`.
- Inbound shipments and returns: `open`, `in-transit`, `receiving`, `received`, `cancelled`, `other`.

`other` means the source uses a custom status; read `raw_status`.

## Webhooks

Configure endpoints in the dashboard's Webhooks page (delivered through Svix). Every payload has:

```json
{
  "connection_id": "...",
  "integration_name": "...",
  "event_type": "order.updated",
  "data": { ...the full record... },
  "previous_attributes": { "status": "open", "line_items.1.received_quantity": 1 }
}
```

- `previous_attributes` appears only on updated events and holds the old values of changed fields. Nested changes use dot paths where integers are array indexes.
- Event names. WMS: `order.created`, `order.updated`, `order.shipment.created`, `inventory.created`, `inventory.updated`, `inventory_ledger.created`, `inventory_ledger.updated`, `product.created`, `product.updated`, `inbound-shipment.created`, `inbound-shipment.updated`, `inbound-shipment.receipt.created`, `return.created`, `return.updated`, `bill.created`, `bill.updated`, `shipping-method.created`, `shipping-method.updated`, `warehouse.created`, `warehouse.updated`, `warehouse-location.created`, `warehouse-location.updated`, `warehouse-customer.created`, `warehouse-customer.updated`. Cart: `cart-order.created`, `cart-order.updated`, `cart-order.cart-shipment.created`, `cart-product.created`, `cart-product.updated`, `cart-warehouse.created`, `cart-warehouse.updated`. Carrier: `carrier-invoice-line-item.created`, `carrier-invoice-line-item.updated`, `carrier-file.created`. Admin: `connection.created`, `connection.deleted`, `connection.historical-sync-completed`, `connection.force-sync-completed`, `connection.sync-job-completed`, `connection.sync-job-stuck`, `connection.schedule-stuck`, `connection-error.created`, `connection-error.updated`, `connection-error.deleted`, `install.failed`. Schemas: https://docs.trackstarhq.com/how-to-guides/webhooks/webhooks.md and the pages under it.
- Timing follows the resource's sync schedule; an hourly resource produces webhooks about hourly.
- Verify signatures with the Svix library and the endpoint's signing secret (headers `svix-id`, `svix-timestamp`, `svix-signature`). Deduplicate on `svix-id`.
- Oversized events arrive with `data_truncated: true`, `data` reduced to `{"id": ...}`, and a `data_url`. Call `data_url` with the API key; it returns a `download_url` valid for 20 minutes that serves the full event.
- Svix transformations (JavaScript run before delivery) can reroute or reshape events, for example sending sandbox or test connections to a staging URL by `connection_id`, `customer_id` prefix, or `integration_name`.
- Sandbox edits made in the dashboard's Data Explorer fire webhooks, so the receiver can be tested without a real connection.

## Trackstar tags

Custom metadata stored on a record in Trackstar only, never written to the source system. `PUT /{prefix}/{resource}/{id}/trackstar-tags` with `{"trackstar_tags": ["tag1", {"key": "value"}]}` replaces the whole list. Tags come back in `trackstar_tags` on every read and are filterable with `trackstar_tags[contains]=tag1,key:value` or `trackstar_tags[not_contains]=...`.

## Checklist for an agent building this

- Waits for `historical_sync_completed` before the first read.
- Pages with `page_token` and repeats filters; filters incrementally on `trackstar_updated_date`.
- Stores `id`, `status`, `raw_status`, and the cross-reference IDs above.
- Treats 501 as "this integration lacks the resource" and 403 as "disabled by policy".
- Verifies webhook signatures, handles `data_truncated`, and applies `previous_attributes` as a diff rather than a full record.
