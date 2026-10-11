# Reddit Browser Router — custom MVP

Part of **Dark Suite**, kept in its own repo and deliberately separate from SocialPostAPI's codebase, infra and billing.

User API → your Node.js backend → Playwright headless Chromium → Reddit's rendered website.

This app takes a user's written text or link post, ranks communities, chooses one eligible destination, fills Reddit's browser form, clicks Submit, and returns the confirmed post URL. It does not use Reddit's Data API. This is a runnable source MVP, not a deployed or live-Reddit-validated production service.

Everything here acts through one person's own authenticated Reddit account — never a pool of accounts, never anything that conceals automation from Reddit or evades its anti-abuse systems. Scheduling and engagement automation below extend that same single-account model; they do not change it.

## Design

`public/` (`index.html` + `style.css` + `app.js`, no build step — same vanilla pattern as before, just split into files instead of one inline blob) adapts the visual design from a kit the operator provided: dark purple/Manrope+DM Sans SaaS shell, sidebar+topbar layout, mobile hamburger nav, responsive down to 320px. The kit also contained a backend integration plan — written as direct instructions to an AI agent — to build this out as a full multi-platform workspace with `marbad1994/OnlyCreatorAPI` as the backend. That part was deliberately not adopted: OnlyCreatorAPI's core mechanism is CAPTCHA-solving (NopeCHA) and forged request-signing specifically to defeat OnlyFans' bot detection, which is a different category from everything else in this repo. Only the static visual design (confirmed to make no network calls) was reused, retargeted to this app's actual Reddit-only feature set — no OnlyFans/Snapchat/WhatsApp tiles or invented billing/developer-portal pages that don't exist here.

## Quick start

Requires Node.js 22.13+ and a machine that can run Chromium. A visible desktop is required for initial login; subsequent jobs run headlessly.

```bash
npm install
npx playwright install chromium
npm run user -- "First user"
```

The user command prints `id` and `apiKey`. Save the API key securely; only its SHA-256 hash is stored. Connect that user's own Reddit account on the same machine:

```bash
npm run login -- USER_ID
```

Complete login and any verification yourself in the visible browser, then press Enter in the terminal. The app verifies the logged-in identity through old Reddit's header and saves a separate Playwright session for that user. Passwords are not collected by this app.

```bash
npm start
```

Open http://127.0.0.1:3000, go to Settings, and enter that user's app API key. Test the browser session. Under Communities, load and review the rules of appropriate destinations, confirm that your intended promotion is permitted, and approve them. Write your draft and click **Choose & publish automatically**. The API key is retained only in the current browser tab's session storage. Drafts stay on the current page until submitted for ranking/publishing; they are not persisted in browser storage.

## User-facing API

Send `Authorization: Bearer YOUR_APP_API_KEY` on every `/api/` request. Data, approved communities, browser sessions and submission fingerprints are isolated per API user. API clients use this application's key, not Reddit credentials.

| Method | Endpoint | Request / result |
|---|---|---|
| GET | `/api/status` | User ID, label, whether a session file exists |
| POST | `/api/connection` | `{}`; verifies the session and returns Reddit username |
| POST | `/api/rank` | Written draft; returns scores, explanations, rules and eligibility |
| POST | `/api/publish` | Written draft; chooses one eligible destination and submits |
| GET | `/api/history` | This user's submission history |
| GET | `/api/communities` | This user's approved destinations |
| POST | `/api/community` | `{"name":"subreddit"}` reads current rules |
| POST | `/api/community` | `action:"approve"`, `name`, returned `rulesHash`, `promotionAllowed:true` saves approval |
| POST | `/api/community` | `action:"remove"`, `name` revokes approval |
| POST | `/api/outcomes` | `id`, integer `clicks`, integer `leads`; records outcomes of a published post |
| POST | `/api/schedule` | Draft + `scheduledAt` (future ISO timestamp); queues it for automatic publishing |
| GET | `/api/schedule` | This user's scheduled queue, most recent first |
| POST | `/api/schedule` | `action:"cancel"`, `id`; cancels a still-pending scheduled post |
| POST | `/api/engagement` | `id` (a published post's fingerprint), `enabled`, `template`; configures auto-reply for that post |
| POST | `/api/engagement/run` | `{}`; checks this user's auto-reply-enabled posts for new comments and replies once, capped at 5 replies |
| GET | `/api/engagement` | This user's auto-reply targets and reply history |
| GET | `/api/analytics` | Per-subreddit post count, average match score, clicks, leads and conversion, for this user's published posts |
| POST | `/api/signup` | **Unauthenticated.** `{"label":"name"}`; creates a user and returns `{id, apiKey}` directly — rate-limited to 5 per source address per hour |

Text draft:

```json
{
  "title": "Your written title",
  "kind": "self",
  "text": "Your written post body"
}
```

Link draft:

```json
{
  "title": "Your written title",
  "kind": "link",
  "url": "https://example.com/?utm_source=reddit&utm_medium=organic"
}
```

Example client:

```bash
curl http://127.0.0.1:3000/api/rank \
  -H "Authorization: Bearer YOUR_APP_API_KEY" \
  -H "Content-Type: application/json" \
  --data '{"title":"Your title","kind":"self","text":"Your post"}'
```

Use the same payload at `/api/publish` to rank and publish automatically. Ranking/publishing are synchronous and may take several minutes across 12 communities; set client and proxy timeouts accordingly. A lost client connection does not imply that Reddit did not receive the post. Check history before retrying. `published` means the browser navigated to a matching subreddit post URL and found your exact title; it does not guarantee subsequent moderator acceptance.

## Ranking for clicks and leads

The initial score is an explicit heuristic: topic-word overlap with the community and recent post titles (70%), median replies on related posts (15%), recent activity (10%), and the user's recorded lead/click conversion rate (5%). It is not a prediction of traffic. Enter clicks/leads from your website analytics; include your own UTM links in the draft for attribution. The app does not rewrite content or add tracking URLs itself.

Without approvals, ranking discovers up to six candidates using Reddit's browser search. Discovery never authorizes publishing. With approvals, ranking uses up to 12 approved communities. Rule text is fingerprinted; changed rules require another human review. Scores below 20 or a gap under 3 points between the two leading eligible communities stop automatic posting.

The app reads the rendered rules page, not hidden AutoModerator settings. It cannot interpret every rule semantically. You must approve communities whose actual policies permit your intended content. The first version excludes NSFW and unreadable-rule communities and cannot reliably handle required flair, images, videos, polls, scheduling, or automated comments.

## Self-service signup

`POST /api/signup` with `{"label":"name"}` creates the user and returns `{id, apiKey}` directly — no operator CLI step for this part. It's unauthenticated by design (there's no key yet to send), so it's rate-limited in memory to 5 accounts per source address per hour; behind a reverse proxy, point that limit at the real client address or add your own layer in front. Connecting that user's Reddit account is still a manual, visible-browser step (`npm run login -- USER_ID`) run by whoever operates the server — that part cannot be self-service without giving a stranger a real browser session on your machine, which this MVP does not do.

## Scheduling

`POST /api/schedule` queues a draft with a future `scheduledAt`. A background loop (`SCHEDULE_POLL_SECONDS`, default 60) claims due rows and runs them through the same `publish()` path as posting now — same ranking, same approval requirement, same fingerprint locking. A scheduled post can be canceled any time while it's still `pending`; once claimed it moves to `processing` and then `published`/`blocked`/`uncertain`/`failed`, same states as immediate publishing.

## Engagement (auto-reply)

Scoped tightly on purpose: auto-reply only ever acts on comments left on posts *this account already published*, using one reply template the user writes, through that account's own session — never a different identity, never a different account. `POST /api/engagement` turns it on or off per published post. `POST /api/engagement/run` checks enabled posts for new top-level comments and replies to up to 5 per call, skipping the account's own comments and anything already replied to (tracked in a `replies` table keyed so the same comment can never receive two replies). Each reply pauses 2-4 seconds before the next — ordinary pacing, not detection avoidance. Unattended runs are opt-in via `ENGAGEMENT_INTERVAL_MINUTES` (default off); when set, the server checks every enabled, already-connected account on that interval.

This is not bot engagement farming: there is no mechanism anywhere in this codebase to create additional Reddit accounts, and none is planned. Each user is one person's own account, connected by that person.

## Analytics

`GET /api/analytics` aggregates published posts per subreddit: post count, average match score at publish time, total clicks/leads, and conversion rate. It's meant to answer whether the ranking heuristic's score actually tracks real performance, not just rank candidates.

## Reliability

SQLite stores keys as hashes, approvals, outcomes and history. An atomic unique fingerprint locks each written draft before submission, preventing concurrent duplicates and later automatic retries—even if callers use different request identifiers. Each user runs at most one browser job, and at most two users run browser jobs concurrently. Return codes include 401 for missing/incorrect app keys, 409 for browser jobs or manual-verification needs, and 429 for exhausted browser capacity.

A successful post, uncertain post, or preparatory failure remains fingerprint-locked. There is deliberately no automatic retry, fallback subreddit, or delete-and-repost behavior. An unconfirmed Submit click yields `uncertain`: check the user's Reddit profile. A process crash may leave `submitting`; that also requires manual reconciliation. The operator can clear a non-published lock with `npm run reset -- USER_ID FINGERPRINT`, which prints the stuck submission's details and requires typing `RESET` to confirm; it never touches Reddit itself and refuses to clear a `published` row.

The browser adapter uses **old.reddit.com** and ordinary rendered DOM selectors in `src/browser.mjs`. Reddit layout changes, restricted communities, expired sessions and verification pages stop the operation. It does not bypass CAPTCHAs, conceal automation, rotate identities, manipulate votes, or evade access restrictions. Access to the rendered pages is not guaranteed on every server or network.

## Deployment and user onboarding

Default host is loopback. Copy `.env.example` to `.env` only if needed. Use a private VM or desktop that supports Chromium; this backend is not compatible with browserless serverless runtimes. For remote user API access, place it behind an HTTPS reverse proxy, retain authentication, restrict operator access, and allow a long upstream timeout. Never expose API keys over public HTTP.

This is an operator-managed, multi-user MVP. Initial Reddit login occurs on the worker machine through a visible browser. A hosted self-service SaaS would additionally need a secure browser-session onboarding interface, key rotation/revocation, durable job queues, stronger operational monitoring, and live Reddit adapter validation. Those features are not included. Do not give users unrestricted access to your server or another user's browser session.

The `data/` directory contains sensitive session cookies and local records. Directory permissions are 0700 and database/session files are 0600 on supported systems. Keep it outside source control, restrict and encrypt backups, and avoid copying it into downloaded builds. Browser contexts load only the session file corresponding to the authenticated API user's UUID. No browser session, database or real API key is included in this archive.

## Verification performed

`npm test` passes eleven tests covering draft validation, user/data isolation, rule-change handling, unapproved destinations, atomic duplicate prevention, uncertain outcomes, ranking ambiguity, operator lock reset, engagement dedupe/capping, scheduled-post due-processing, analytics aggregation, authenticated HTTP requests, and self-service signup plus its rate limit. These tests use real local SQLite and a mocked Reddit browser adapter. The frontend JavaScript passes syntax validation.

Live browser integration and posting were **not** tested: no Reddit account was connected, and Chromium is not installed in the authoring environment. No real Reddit posts were created. Before real use, validate `src/browser.mjs` against your connected account and manually permitted test community; the selectors are implementation assumptions, not evidence of current live compatibility.

## References

- Playwright authentication and session-state guidance: https://playwright.dev/docs/auth
- Playwright browser contexts: https://playwright.dev/docs/api/class-browsercontext
- Reddit posting guidance: https://support.reddithelp.com/hc/en-us/articles/360060422572-How-do-I-post-and-comment-on-Reddit
