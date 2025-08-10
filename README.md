# dnSurfer Suite

*A web browser that surfs entirely over DNS*

![Preview screenshot](https://github.com/nadchif/dnSurfer/blob/main/screenshots/loaded%20page.png?raw=true)

**dnSurfer** is a proof-of-concept browser that operates entirely over DNS, using a client–server connection to turn DNS queries into text-only web content.

1. **DNS Browser (Desktop/Electron)** — A text-only browser that fetches pages entirely over DNS TXT records.
2. **Custom DNS Server (Node.js)** — Serves stripped-down web pages as DNS responses.

No HTTPS. No TCP. Just DNS queries slipping past wifi captive portals.


---

## Quick Start – How to Run the Browser

```bash
npm run browser
```

NOTE that You’ll need to already have the DNS server running. See [server/README.md](server/README.md) for instructions.


---

## How It Works

```
[ Browser (Electron) ] → DNS Query → [ Custom DNS Server ] → Fetch Page → Convert to Markdown → DNS TXT Response → Render in Browser
```



#### DNS Server

See [server/README.md](server/README.md)

---

#### Browser Client

See [desktop-client/README.md](desktop-client/README.md)

## Note

⚠️ This is a **fun, educational project** — it’s slow, stripped-down, and not suited for sensitive data.
