# Webhooks gate status (SDD §34.2.2 / §10.13) — Post-M4

> Outbound webhooks on the outbox → Redis / dispatcher path. Live tenant endpoints beyond the local mock are not required for PASS (local).

| # | Criterion | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Subscription CRUD (`org_admin`) | PASS (local) | `tenant-service` `/v1/tenant/webhooks` |
| 2 | HTTPS / SSRF egress controls | PASS (local) | `@ngois/webhook-egress` tests |
| 3 | Payload strips PII (IDs/metadata only) | PASS (local) | `smoke:webhooks-e2e` |
| 4 | HMAC `X-NGOIS-Signature` t=,v1= | PASS (local) | mock receiver verifies |
| 5 | Delivery history visible | PASS (local) | `GET .../deliveries` |
| 6 | Test delivery endpoint | PASS (local) | `POST .../test` |
| 7 | Suspend / disable subscription | PASS (local) | PATCH status + exhaust path |
| 8 | Hourly quota constant enforced in dispatcher | PASS (local) | `HOURLY_DELIVERY_QUOTA=1000` |
| 9 | Dispatcher worker (Redis or outbox fallback) | PASS (local) | `webhook-dispatcher` |
| 10 | UI `/settings/webhooks` | PASS (local) | `WebhooksView.vue` |

```powershell
npm run test -w @ngois/webhook-egress
npm run smoke:webhooks-e2e
npm run verify:webhooks-gates
```
