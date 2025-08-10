const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const dgram = require('dgram');
const dns = require('dns');
const { Buffer } = require('buffer');
const dnsPacket = require('dns-packet');
const prompt = require('electron-prompt');
const { DNS_SERVER_HOST, DNS_TIMEOUT_MS, MAX_FETCH_ATTEMPTS, RETRY_BASE_DELAY_MS } = require('./config');

let cachedDnsServer;
let runtimeDnsServer;

// Functions to save/load DNS server configuration
function getConfigPath() {
  return path.join(app.getPath('userData'), 'dns-config.json');
}

function loadSavedDnsServer() {
  try {
    const configPath = getConfigPath();
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      console.log('[CONFIG] Loaded saved DNS server:', config.dnsServer);
      return config.dnsServer;
    }
  } catch (err) {
    console.warn('[CONFIG] Failed to load saved DNS server:', err.message);
  }
  return '127.0.0.1';
}

function saveDnsServer(dnsServer) {
  try {
    const configPath = getConfigPath();
    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify({ dnsServer }, null, 2));
    console.log('[CONFIG] Saved DNS server:', dnsServer);
  } catch (err) {
    console.warn('[CONFIG] Failed to save DNS server:', err.message);
  }
}

// Check for required APP_DNS_SERVER environment variable
if (!process.env.APP_DNS_SERVER) {
  console.warn('[CONFIG] APP_DNS_SERVER environment variable not set, will prompt user');
}

async function promptForDnsServer() {
  try {
    const savedDnsServer = loadSavedDnsServer();
    const host = await prompt({
      title: 'dnSurfer Configuration',
      label: 'Enter DNS Server:',
      value: savedDnsServer,
      width: 480,
      minWidth:480,
      resizable: false,
      alwaysOnTop: true,
      inputAttrs: {
        type: 'text',
        placeholder: 'Enter DNS server (e.g., ec2-12-123-123-12.compute-1.amazonaws.com)'
      },
      type: 'input'
    });

    if (host === null) {
      console.log('[CONFIG] DNS configuration cancelled, exiting');
      app.quit();
      return;
    }

    runtimeDnsServer = host.trim() || '127.0.0.1';
    saveDnsServer(runtimeDnsServer)
    console.log('[CONFIG] Using runtime DNS server:', runtimeDnsServer);
    return { host: runtimeDnsServer, port: '53' };
  } catch (err) {
    console.error('[CONFIG] Error prompting for DNS server:', err);
    app.quit();
  }
}

function createWindow() {
  const preloadPath = path.join(app.getAppPath(), 'preload.js');
  const win = new BrowserWindow({
    width: 1024,
    height: 640,
    minWidth: 480,
    center: true,
    fullscreenable: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // devTools: false
    }
  });

  win.setMenuBarVisibility(false);
  
  win.loadFile('index.html');
}

function dnsQuery(domain, timeoutMs = DNS_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const client = dgram.createSocket('udp4');
    const id = Math.floor(Math.random() * 65535);

    const query = dnsPacket.encode({
      type: 'query',
      id: id,
      flags: dnsPacket.RECURSION_DESIRED,
      questions: [{
        type: 'TXT',
        class: 'IN',
        name: domain
      }]
    });
    
    // Use cached DNS server IP if available, otherwise use runtime or config DNS server
    const serverAddress = cachedDnsServer || runtimeDnsServer || DNS_SERVER_HOST;
    console.log('[DNS] Query id=%d domain=%s len=%d server=%s timeout=%dms %s', 
      id, domain, query.length, serverAddress, timeoutMs, 
      cachedDnsServer ? '(cached IP)' : '(hostname)');
    console.log('[DNS] Dig command: dig @%s %s TXT +short', serverAddress, domain);
    
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { client.close(); } catch {}
      console.warn('[DNS] Timeout waiting for response id=%d domain=%s', id, domain);
      reject(new Error('DNS timeout'));
    }, timeoutMs);
    client.send(query, 53, serverAddress);
    client.on('message', (msg) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        const response = dnsPacket.decode(msg);
        const txtRecord = response.answers.find(answer => answer.type === 'TXT');
        if (txtRecord && txtRecord.data) {
          const txt = Array.isArray(txtRecord.data) ? 
            txtRecord.data.map(buf => buf.toString('utf8')).join('') : 
            txtRecord.data.toString('utf8');
          console.log('[DNS] Parsed TXT len=%d', txt.length);
          resolve(txt);
        } else {
          console.warn('[DNS] No TXT record found in response');
          resolve('');
        }
      } catch(err) {
        console.error('[DNS] Parse error', err);
        reject(err);
      } finally {
        client.close();
      }
    });
    client.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      console.error('[DNS] Socket error', err);
      try { client.close(); } catch {}
      reject(err);
    });
  });
}

ipcMain.handle('fetchPage', async (event, { url, page }) => {
  console.log('[IPC] fetchPage url=%s page=%d', url, page);
  const b64full = Buffer.from(url, 'utf8').toString('base64');
  const labels = b64full.match(/.{1,60}/g) || [b64full];
  const appDnsDomain = process.env.APP_DNS_DOMAIN || 'dns.me';
  const domain = `${labels.join('.')}.${page}.${appDnsDomain}`;
  console.log('[IPC] domain=%s', domain);
  
  // Retry logic for fetching page
  let success = false;
  let lastError = null;
  
  console.log('[IPC] Starting page fetch with', MAX_FETCH_ATTEMPTS, 'max attempts');
  for (let attempt = 1; attempt <= MAX_FETCH_ATTEMPTS; attempt++) {
    console.log('[IPC] Page fetch attempt', attempt, 'of', MAX_FETCH_ATTEMPTS, 'for page', page);
    try {
      const dynamicTimeout = DNS_TIMEOUT_MS + (attempt - 1) * 2000; // increase timeout per retry
      const txt = await dnsQuery(domain, dynamicTimeout);
      console.log('[IPC] Page fetch SUCCESS on attempt', attempt, 'for page', page, 'len=%d', txt.length);
      
      // Cache DNS server IP after first successful chunk (page 0)
      if (page === 0 && !cachedDnsServer) {
        const currentDnsHost = runtimeDnsServer || DNS_SERVER_HOST;
        if (!/^\d+\.\d+\.\d+\.\d+$/.test(currentDnsHost)) {
          try {
            cachedDnsServer = await new Promise((resolve, reject) => {
              dns.resolve4(currentDnsHost, (err, addresses) => {
                if (err) reject(err);
                else if (addresses && addresses.length > 0) resolve(addresses[0]);
                else reject(new Error('No IP found'));
              });
            });
            console.log('[DNS-Cache] Cached DNS server IP:', cachedDnsServer);
          } catch (err) {
            console.warn('[DNS-Cache] Failed to resolve DNS server IP:', err.message);
          }
        }
      }
      
      return txt;
    } catch (err) {
      lastError = err;
      const msg = err && err.message ? err.message : String(err);
      console.warn('[IPC] Page fetch attempt', attempt, 'FAILED for page', page, 'with error:', msg);
      
      if (attempt < MAX_FETCH_ATTEMPTS) {
        const delay = RETRY_BASE_DELAY_MS * attempt + Math.random() * 80;
        console.warn('[IPC] RETRYING page', page, 'nextAttempt', attempt + 1, 'in', Math.round(delay) + 'ms', 'reason:', msg);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.error('[IPC] Page', page, 'EXHAUSTED all', MAX_FETCH_ATTEMPTS, 'attempts');
      }
    }
  }
  
  console.error('[IPC] fetchPage failed after', MAX_FETCH_ATTEMPTS, 'attempts:', lastError);
  return `Error: ${lastError.message}`;
});

ipcMain.handle('openExternal', async (event, url) => {
  console.log('[IPC] openExternal url=%s', url);
  try {
    await shell.openExternal(url);
    console.log('[IPC] Successfully opened external URL:', url);
  } catch (err) {
    console.error('[IPC] Failed to open external URL:', url, err);
    throw err;
  }
});

app.whenReady().then(async () => {
  await promptForDnsServer();
  createWindow();
});
