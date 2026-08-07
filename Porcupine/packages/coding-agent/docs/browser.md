# Browser use

Porcupine ships a native browser-use module built on **Playwright** (the OSS
automation engine). The agent can open a real Chromium page, navigate, click,
type, extract text, take screenshots, and run JavaScript against it — useful for
reading rendered SPAs, checking live state, filling forms, or capturing visual
proof before taking an action.

## Setup (one-time)

Playwright is an optional, lazily-loaded dependency. Install it and download the
Chromium binary once:

```sh
npx playwright install chromium
```

No browser is installed at package-install time, so daily use of Porcupine never
pulls in a browser unless you want one.

## Headed vs headless

- By default the browser runs **headless** (no visible window).
- To watch what the agent is doing in real time, set `PORCUPINE_BROWSER_VISIBLE=1`.
  When set, the browser window stays open so you can see navigations and clicks.
- This also works from the terminal:

```sh
PORCUPINE_BROWSER_VISIBLE=1 porcupine
```

## Safety

Agent-controlled browsing is scoped to be conservative by default:

- **Dedicated profile.** Each headless/headed session uses an isolated Chromium
  context, so browsing never touches your personal profile, saved passwords, or
  extension state.
- **Sessions close after idle.** The shared browser session is closed and reset
  when the app exits or reloads; long-lived pages are never kept around between
  sessions.
- **No credential auto-fill.** Authentication fields are never auto-filled. The
  agent reaches a login page only because the code asked for it, and credentials
  are never injected silently.
- **Timeouts.** Every navigation and network-touching call gets a timeout
  (15 seconds by default), so a hung page can never stall the agent forever.

## Tool reference

All tools operate on a single shared browser session. Call `browser_navigate`
first to open a page; everything else acts on that open page.

| Tool                 | Arguments                                    | Description                                                    |
| -------------------- | -------------------------------------------- | -------------------------------------------------------------- |
| `browser_navigate`   | `url`, optional `timeoutMs`                  | Open a URL; launches headless Chromium on first use. Returns URL + title. |
| `browser_click`      | `selector`                                   | Click the first element matching a CSS selector.                |
| `browser_type`       | `selector`, `text`                           | Type text into an input field matching a CSS selector.          |
| `browser_extract`    | optional `selector`                          | Extract visible text from a selector, or the whole page body.   |
| `browser_screenshot` | optional `path`                              | Save a full-page PNG; returns the saved file path.              |
| `browser_evaluate`   | `expression`                                 | Evaluate a JavaScript expression and return the result.         |

Failures — badly formed URLs, missing elements, and timeouts — come back as
readable messages, never bare stack dumps.

## Examples

Open a page and read its rendered heading:

```
browser_navigate { "url": "https://example.com" }
browser_extract { "selector": "h1" }
```

Search a site by filling a form and checking the results:

```
browser_navigate { "url": "https://duckduckgo.com" }
browser_type { "selector": "#searchbox_input", "text": "playwright headless" }
browser_click { "selector": "button[type=submit]" }
browser_extract
```

Count rows in a rendered table with JavaScript:

```
browser_navigate { "url": "https://example.com/data" }
browser_evaluate { "expression": "document.querySelectorAll('tr').length" }
```

Capture a screenshot before reporting a finding:

```
browser_screenshot { "path": "report-overview.png" }
```
