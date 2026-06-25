# Idea: Social (deferred)
_Created: 2026-06-15_
_Slug: social-deferred_

## Description
There is **no social UI in the MVP** — not only for scope, but because **comparison is the main amplifier of math anxiety** in exactly this product's users (leaderboards, "someone is already at level 40" feeds harm the primary goal). This is the same **no-shame / no-comparison invariant** that governs error-feedback and [[gamification]]'s "no subtracted state" — when social is eventually designed it must reference that principle, not re-derive it (else "social" silently defaults to leaderboards as genre standard). What *is* laid in now is a minimal **user identity model**: a single explicit local profile with a stable opaque `userId`, which is the anchor progress, the [[activity-event-stream]], and the locked sync-readiness fields attach to. The activity-event stream this node originally bundled has been promoted to its own core-substrate node — see [[activity-event-stream]]. When social is eventually added it is a *new consumer of existing events*, not a core rewrite. See `## Decision`.

## Decision
_Decided: 2026-06-24_

### What Was Decided

**Decision A — User identity model: a single explicit local profile with a stable opaque `userId`; NO account-ready fields.**
The boundary that matters is **anchor vs account**, not single-vs-multi or now-vs-later.

- A **single explicit local profile** with a **stable opaque `userId`** (UUID, generated locally on first launch). Progress and the already-locked sync-readiness fields (logical clocks + device id, owned by [[local-persistence]] / [[activity-event-stream]]) attach to it.
- **Opaque** because the id is an anchor, not meaningful content — the inverse of node-ids being human-read slugs; `userId` is read by no one, it is pure reference.
- **Single** because MVP is single-user. **Locally generated** because no-backend — the id is born on-device, not issued by a server.
- **Account-readiness = id-stability, NOT the presence of auth fields.** A future account attaches *to* this `userId` (an account "claims" the local identity) rather than replacing it; the local UUID stays stable through the arrival of an account and **progress never migrates to a new id**.
- **Persist now:** `{ userId: opaque-local-uuid }` + the locked sync-readiness fields.
  **Do NOT persist now:** `profiles[]`, email, auth tokens, server-id.

**Decision B — Social deferral + default format: CONFIRMED (locked decision #7).**
- Social UI is **out of MVP** — comparison is the primary amplifier of math anxiety in these users.
- Default format when social is eventually added: **cooperative + opt-in** (shared milestones, shared goals, support); competition/leaderboards a **separate toggle, off by default**.
- Implementation: a **new consumer of [[activity-event-stream]]'s durable class** — no core rewrite.
- This default is a consequence of the shared no-shame / no-comparison invariant (see Description), not a standalone preference.

### Alternatives Considered
| Option | Why not chosen |
|--------|----------------|
| Implicit identity (no explicit id) | [[local-persistence]] already requires persisting identity, and the locked sync-readiness fields need *something* to attach to. Contradicts an already-made decision. |
| Multi-profile now ("dad + daughter on one tablet") | A product *feature*, not an identity foundation. Pulls in profile-switch UI, per-profile isolation, pick-on-launch — none needed by MVP, all addable *on top of* the single-profile anchor later. Building rooms for residents who don't exist yet. |
| Account-ready fields now (email, auth, server-id) — **the main trap** | Account ≠ identity. Account-readiness is id-*stability*, not auth fields. Empty auth fields do nothing in a no-backend MVP, and risk someone *using* them (collecting email "for later") — needless PII from anxious teens and a silent pre-violation of the locked no-backend decision. |
| Social: competitive/leaderboard default | Comparison is the exact mechanism this product exists to reduce. Cooperative + opt-in is the only default consistent with the no-shame invariant. |

### Rationale
Identity is *who this local user is* (the anchor progress and sync attach to); an account is *how they authenticate to a server*. The first is needed now; the second is not. The single opaque local `userId` is the cheapest shape that is a true anchor — a future account or sync layer bolts on with **zero progress migration** because the id never changes. Deferring social and fixing its default as cooperative/opt-in keeps the build aligned with the same anxiety-reduction invariant the rest of the app obeys.

### Implications
- [[local-persistence]] — now has a concrete user-identity shape to persist: `{ userId: opaque-local-uuid }` + sync-readiness fields. No `profiles[]`/email/auth columns.
- [[activity-event-stream]] — events attach to this stable `userId`; future social UI plugs in as a new consumer of the durable class.
- [[gamification]] / error-feedback — share the no-shame / no-comparison invariant that fixes social's cooperative default; social must cite it, not re-derive it.
- A future accounts/sync layer attaches to the existing `userId` with no migration — the account claims the local identity.

## Priority
deferred

## Maturity
ready

## Notes
- Brief §7, locked decision #7. The event-stream portion was reclassified out per triage **R5 / decision #16** → [[activity-event-stream]].
- **MVP-time obligation despite the "deferred" priority:** the user identity model is laid in now (also needed by [[local-persistence]]).
- Default format when social is added: **cooperative and opt-in** (share milestones, shared goals, support). Competition/leaderboards = a separate, toggleable mechanic, off by default.
- The social UI is a consumer of [[activity-event-stream]] — built later with no core rewrite.

## Connections
_Mapped 2026-06-15 via /architector:map._

**Depends on (←):**
- ← [[local-persistence]] — user identity model persisted here (MVP-time obligation despite deferred priority)
- ← [[activity-event-stream]] — future social UI is a new consumer of these events (no core rewrite)

## History
- 2026-06-15 /architector:new — social UI deferred (comparison amplifies anxiety); identity + event stream laid in.
- 2026-06-15 /architector:triage — event stream split out to [[activity-event-stream]] (R5 / decision #16); this node now scopes the deferred social UI + identity model only.
- 2026-06-24 /architector:decide — locked **user identity model** as a single explicit local profile with a stable opaque locally-generated `userId` and NO account-ready fields (account ≠ identity; account-readiness = id-stability, not auth fields); confirmed **social deferral** with a **cooperative + opt-in** default (competition off), tied to the shared no-shame invariant. All open questions resolved → `ready`.
