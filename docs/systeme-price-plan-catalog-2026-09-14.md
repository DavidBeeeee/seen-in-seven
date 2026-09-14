# Systeme price-plan disposition, 2026-09-14

This is the verified catalog decision made while repairing the purchase-to-access path.

| Plan | Offer | Decision | Reason |
| --- | --- | --- | --- |
| 3424955 | The Momentum Hub Monthly, $250/month | Routed to `eee` and `boardroom` | This is the current Momentum Hub plan. |
| 3376492 | SeenInSeven Retail, $297 | Routed to `seeninseven` | This is the current retail offer, and a real sale had already reached it. |
| 3155525 | SeenInSeven, $311 | Retired in Systeme | It was the obsolete second public price for SeenInSeven. |
| 3134754 | The Momentum Hub, $77/month | Retired in Systeme; route retained | The old price must not remain purchasable, while its route must continue to resolve cancellation events from existing subscriptions. |
| 3122717 | Unlimited One-on-One Support, $250/month | Left live and deliberately unrouted | It collides with the current Momentum Hub and private Ultimate Partnership price. Its exact fulfillment promise is not established well enough to grant an application or erase the plan. This is the only unresolved catalog decision. |
| 3122074 | 3 Reasons You've Failed, $297 | Retired in Systeme | It is an obsolete offer with no defined current delivery path. |
| 3122070 | 7 Videos 7 Days, $7 USD | Existing route retained to `seeninseven` | This purchase path is already proven end to end. |
| 3122062 | 7 Videos 7 Days, EUR 7 | Retired in Systeme | It duplicated the challenge price in another currency and had no delivery route. |

The stored $297 sale, message `01a087ca-46ea-7cef-a7f2-605f967d2843`, was replayed after the route was added. It now records `processed`, created an active `seeninseven` grant and entitlement, and the Systeme contact carries the `777 - Purchase` tag.

The webhook database function now records an unmapped plan as `failed`, not `ignored`. Studio already counts and displays failed webhook events in its Commerce panel, so the next unmapped sale reaches a screen David uses. A synthetic unmapped sale, `workerbee-unmapped-test-20260914`, verified that path.

Future purchase and cancellation tag writes still need an event-driven Systeme API credential in the deployed webhook. The connector can write a tag during an attended run, as it did for the repaired sale, but its protected credential cannot be copied into Vercel and is not a webhook runtime. That remaining automation is kept open rather than represented as complete.
