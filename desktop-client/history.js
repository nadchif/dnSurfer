/**
 * Browsing history manager
 */
class BrowsingHistory {
  constructor() {
    if (BrowsingHistory.instance) {
      return BrowsingHistory.instance;
    }
    
    this.stack = [];
    this.index = -1; // points at current URL within stack
    
    BrowsingHistory.instance = this;
  }

  /**
   * Get singleton instance
   */
  static getInstance() {
    if (!BrowsingHistory.instance) {
      BrowsingHistory.instance = new BrowsingHistory();
    }
    return BrowsingHistory.instance;
  }

  /**
   * Add a new URL to history (pushes to stack and updates index)
   */
  push(url) {
    if (this.index >= 0 && this.stack[this.index] === url) {
      // URL is already current, no-op
      return;
    }
    
    // If we're not at the end, remove everything after current position
    if (this.index < this.stack.length - 1) {
      this.stack.splice(this.index + 1);
    }
    
    this.stack.push(url);
    this.index = this.stack.length - 1;
  }

  /**
   * Navigate to previous URL in history
   */
  goBack() {
    if (this.canGoBack()) {
      this.index--;
      return this.stack[this.index];
    }
    return null;
  }

  /**
   * Navigate to next URL in history
   */
  goForward() {
    if (this.canGoForward()) {
      this.index++;
      return this.stack[this.index];
    }
    return null;
  }

  /**
   * Check if we can go back
   */
  canGoBack() {
    return this.index > 0;
  }

  /**
   * Check if we can go forward
   */
  canGoForward() {
    return this.index >= 0 && this.index < this.stack.length - 1;
  }

  /**
   * Get current URL
   */
  getCurrentUrl() {
    if (this.index >= 0 && this.index < this.stack.length) {
      return this.stack[this.index];
    }
    return null;
  }

  /**
   * Set current URL without pushing to history (used for programmatic navigation)
   */
  setCurrent(url) {
    if (this.index >= 0 && this.index < this.stack.length) {
      this.stack[this.index] = url;
    }
  }

  /**
   * Navigate to a specific index in history
   */
  goToIndex(targetIndex) {
    if (targetIndex >= 0 && targetIndex < this.stack.length) {
      this.index = targetIndex;
      return this.stack[this.index];
    }
    return null;
  }

  /**
   * Get recent history items (for display)
   */
  getRecentHistory(limit = 10) {
    return this.stack.slice(-limit).reverse().map((url, reverseIndex) => ({
      url,
      index: this.stack.length - 1 - reverseIndex,
      isCurrent: this.stack.length - 1 - reverseIndex === this.index
    }));
  }

  /**
   * Clear all history
   */
  clear() {
    const size = this.stack.length;
    this.stack.length = 0;
    this.index = -1;
    console.log(`[History] Cleared ${size} history entries`);
  }

  /**
   * Get history size
   */
  size() {
    return this.stack.length;
  }

  /**
   * Check if history is empty
   */
  isEmpty() {
    return this.stack.length === 0;
  }
}

// Export the class and create singleton instance
const browsingHistory = BrowsingHistory.getInstance();

export { BrowsingHistory, browsingHistory };
