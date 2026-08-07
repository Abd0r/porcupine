# Email (IMAP/SMTP)

Porcupine can read your mailbox (inbox, drafts, sent), save drafts, and send
email through any IMAP/SMTP provider (Gmail, Outlook, iCloud, Fastmail, ...)
using an **app password**. No paid services, no API keys.

## Setup (2 minutes)

1. Enable IMAP in your provider's settings and create an **app password**
   (not your normal password):
   - **Gmail:** Google Account → Security → 2-Step Verification → App passwords
     (IMAP/SMTP both use `imap.gmail.com` / `smtp.gmail.com`, port 993/465,
     SSL). Needs 2FA enabled.
   - **Outlook:** Account → Security → App passwords (`outlook.office365.com`
     IMAP, `smtp-mail.outlook.com` SMTP).
   - **iCloud:** Apple ID → Sign-In & Security → App-Specific Passwords
     (`imap.mail.me.com` / `smtp.mail.me.com`).
2. Configure Porcupine. Add the mailbox block to settings
   (`~/.porcupine/agent/settings.json`):

```json
{
  "email": {
    "host": "imap.gmail.com",
    "port": 993,
    "secure": true,
    "user": "you@gmail.com",
    "draftsFolder": "Drafts",
    "sentFolder": "Sent",
    "timeoutMs": 15000
  }
}
```

The **app password is stored separately** in the credential store
(never in settings.json or logs).

## Commands

| Command | What it does |
| ------- | ------------ |
| `/email status` | Connected host/user + folder message counts |
| `/email inbox` | Recent inbox messages |
| `/email drafts` | Saved drafts |
| `/email read <id>` | Read one message (subject, from, body text) |
| `/email draft --to <x> --subject <y> --body <z>` | Save a draft (quotes for multi-word values) |
| `/email send <draftId>` | Send a saved draft |

## Agent tools

- `email_list(folder)` — inbox / drafts / sent
- `email_read(id)` — one message as text
- `email_draft(to, subject, body)` — save a draft, returns the draft id
- `email_send(draftId)` — send a saved draft

## Notes and limits (v1)

- **Text only**: HTML bodies are downgraded to text; attachments are not
  supported yet.
- Every network call has a timeout (default 15 s) and errors come back as
  readable one-liners, never stack traces.
- The password is never echoed by commands or tools.
- Drafts are saved to the provider's drafts folder (IMAP APPEND), so they
  appear in your mail client too.
