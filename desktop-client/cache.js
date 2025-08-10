/**
 * Page cache
 */
class PageCache {
  constructor() {
    if (PageCache.instance) {
      return PageCache.instance;
    }
    
    this.cache = new Map();
    this.config = {
      maxSize: 50,           // Maximum number of cached pages
      ttlMs: 5 * 60 * 1000  // 5 minutes TTL
    };
    
    PageCache.instance = this;
  }

  /**
   * Get singleton instance
   */
  static getInstance() {
    if (!PageCache.instance) {
      PageCache.instance = new PageCache();
    }
    return PageCache.instance;
  }

  /**
   * Normalize URL for consistent caching
   */
  getCacheKey(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.toString();
    } catch {
      return url;
    }
  }

  /**
   * Get cached page content if available and not expired
   */
  get(url) {
    const key = this.getCacheKey(url);
    const cached = this.cache.get(key);
    
    if (!cached) return null;
    
    // Check if cache entry has expired
    if (Date.now() - cached.timestamp > this.config.ttlMs) {
      this.cache.delete(key);
      console.log('[Cache] Expired entry removed for', key);
      return null;
    }
    
    console.log('[Cache] Hit for', key);
    return cached.content;
  }

  /**
   * Store page content in cache with LRU eviction
   */
  set(url, content) {
    const key = this.getCacheKey(url);
    
    // Implement LRU eviction if cache is full
    if (this.cache.size >= this.config.maxSize) {
      // Remove oldest entry (first in Map)
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
      console.log('[Cache] Evicted oldest entry:', firstKey);
    }
    
    this.cache.set(key, {
      content,
      timestamp: Date.now(),
      url: key
    });
    
    console.log('[Cache] Stored page for', key, `(${this.cache.size}/${this.config.maxSize})`);
  }

  /**
   * Remove a specific page from cache
   */
  remove(url) {
    const key = this.getCacheKey(url);
    const deleted = this.cache.delete(key);
    console.log(deleted ? `[Cache] Removed ${key}` : `[Cache] Not found: ${key}`);
    return deleted;
  }

  /**
   * Clear all cached pages
   */
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    console.log(`[Cache] Cleared ${size} cached pages`);
  }

  /**
   * Check if a page exists in cache (regardless of expiration)
   */
  has(url) {
    const key = this.getCacheKey(url);
    return this.cache.has(key);
  }

  /**
   * Get cache configuration
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * Update cache configuration
   */
  setConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }
}

// Export the class and create singleton instance
const pageCache = PageCache.getInstance();

export { PageCache, pageCache };
