# dnSurfer Suite

*A web browser that surfs entirely over DNS*

![Preview screenshot](https://github.com/nadchif/dnSurfer/blob/main/screenshots/loaded%20page.png?raw=true)

**dnSurfer** is a proof-of-concept browser that operates entirely over DNS, using a client–server connection to turn DNS queries into text-only web content.

1. **DNS Browser (Desktop/Electron)** — A text-only browser that fetches pages entirely over DNS TXT records.
2. **Custom DNS Server (Node.js)** — Serves stripped-down web pages as DNS responses.

No HTTPS. No TCP. Just DNS queries slipping past wifi captive portals.

---

# Quick Start – How to Run the Browser

#### Pre-requisites

- [Node.js 20+](https://nodejs.org/en/download)
- [Git](https://git-scm.com/)
- Custom DNS Server [(See how to setup server)](server/README.md)

#### Steps

1. Clone this project
```bash
git clone https://github.com/nadchif/dnSurfer.git
```

2. Change directory to the cloned folder
```bash
cd dnSurfer
```

3. Launch Browser
```bash
npm run browser
```

## How It Works

Best explained in the blog post I published [here](https://dev.to/dchif/making-a-browser-that-slips-past-wi-fi-captive-portals-and-why-this-loophole-isnt-worth-it-13o)

---

## Bundling / Compiling Executable

1. Change directory to the desktop client folder:
```
cd desktop-client
```
2. Install dependencies
```
npm install
```
3. Build app

- MacOS 
```
npm run dist:mac
```
- Windows
```
npm run dist:win
```
- Linux
```
npm run dist:linux
```

# More Documentation

- [DNS Server setup](server/README.md)

- [Desktop Client (Browser)](desktop-client/README.md)

- [Blog Post](https://dev.to/dchif/making-a-browser-that-slips-past-wi-fi-captive-portals-and-why-this-loophole-isnt-worth-it-13o)

## Note

⚠️ This is a **fun, educational project** — it’s slow, stripped-down, and not suited for sensitive data.
