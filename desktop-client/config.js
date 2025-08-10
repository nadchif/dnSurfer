export const DNS_SERVER_HOST = process.env.APP_DNS_SERVER || '127.0.0.1';
console.log('[CONFIG] Using DNS server host:', DNS_SERVER_HOST);

export const MAX_FETCH_ATTEMPTS = 3;
export const RETRY_BASE_DELAY_MS = 120;
export const DNS_TIMEOUT_MS = 8000;
