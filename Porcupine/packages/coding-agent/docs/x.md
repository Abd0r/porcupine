# X (Twitter) Integration

Porcupine integrates with X (Twitter) through a **fully free** route: search,
read, and local drafts need no API key, no developer app, and no paid tier.
Posting is **compose-then-paste** because X no longer offers a free automated
posting API (see below).

## Availability at a glance

| Capability | Free? | Needs credentials? |
| ---------- | ----- | ------------------ |
| `/x search <query>` / `x_search` | Yes | No |
| `/x tweet <id-or-url>` / `x_read` | Yes | No |
| `/x draft "text"` / `x_draft` | Yes | No |
| `/x drafts` / compose with `x_post`, `x_reply` | Yes | No |

`/x status` shows what is available without exposing any secret.

## Why is posting just paste-and-copy?

X discontinued its free developer API tier in February 2026. New developers
are only offered **pay-per-use** pricing (roughly $0.015-$0.20 per post and
$0.005 per read). There is no free official posting path.

Porcupine therefore does not sign you up for paid API usage. Instead, `x_post`
and `x_reply` compose the exact tweet text (with the reply mention / reply-to
line for replies) and copy it to your clipboard. You paste it on x.com to
publish. This is intentional:

- Search, read, and drafts stay free and instant.
- You never spend money on an API you did not opt into.
- The composed block is always shown in the terminal too, so the clipboard is
  a convenience, not a requirement.

If you later want automated posting, the pay-per-use API (`POST /2/tweets`) is
the only option. It is deliberately **not** wired in here.

## Search via web (the paid X search API is NOT used)

`/x search` and `x_search` run the existing free `web_search` cascade scoped
to `site:x.com`. That means whatever the cascade's free backends surface for
`site:x.com <query>` becomes your "tweet" results. No X search API key, no
budget.

Use `/x tweet <url>` (or `x_read`) on a result's URL to pull the full text and
metrics.

## Commands

| Command | Description |
| ------- | ----------- |
| `/x status` | Show what is configured (always reports the free route). |
| `/x search <query>` | Free web_search scoped to site:x.com. |
| `/x tweet <id-or-url>` | Read a tweet: text, author, likes, retweets, replies. |
| `/x draft "text"` | Append a draft to the local drafts file. |
| `/x drafts` | List saved drafts with indices. |
| `/x post <draftIndex>` | Compose a draft as a paste-ready tweet and copy it. |
| `/x reply <tweetUrl> <draftIndex>` | Compose a paste-ready reply (with mention) and copy it. |

## Agent tools

| Tool | Description |
| ---- | ----------- |
| `x_search(query)` | Free web_search scoped to site:x.com. |
| `x_read(idOrUrl)` | Read a tweet (syndication JSON + oEmbed fallback). |
| `x_draft(text)` | Append a draft post to the local drafts file. |
| `x_post(draftIndex)` | Compose a draft as a paste-ready tweet and copy it. |
| `x_reply(tweetUrl, draftIndex)` | Compose a paste-ready reply and copy it. |

## Drafts file

Drafts are JSON at `<agentDir>/x/drafts.json` (writes are atomic and
lock-protected). `agentDir` defaults to `~/.porcupine/agent`.

## Rate-limit and failure notes

- The syndication JSON endpoint and oEmbed are unauthenticated public
  endpoints; they can be rate-limited or may not cover every tweet. When both
  fail, Porcupine returns a clean `could not fetch (rate-limited or deleted)`
  message rather than throwing.
- `x_read` never contains secrets, and `x_post`/`x_reply` return only the
  composed text plus a copy status - nothing is ever posted automatically.

## Enabling posting (optional, pay-per-use)

Porcupine will not enable posting unless you intentionally add paid API
wiring. There is nothing to configure for the free route: search, read, and
drafts work out of the box. If you choose to automate posting later, you would
create an X developer app and add OAuth 2.0 PKCE token storage - out of scope
for the free route and not activated here.
