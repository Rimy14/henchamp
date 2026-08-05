/**
 * Simple In-Memory Cache Service
 * Production: Replace with Redis for multi-server deployments
 */

class CacheService {
    constructor() {
        this.cache = new Map();
        this.stats = {
            hits: 0,
            misses: 0,
            sets: 0
        };
    }

    /**
     * Get value from cache
     * @param {string} key - Cache key
     * @returns {any|null} - Cached value or null if expired/not found
     */
    get(key) {
        const item = this.cache.get(key);

        if (!item) {
            this.stats.misses++;
            return null;
        }

        // Check expiration
        if (item.expires && item.expires < Date.now()) {
            this.cache.delete(key);
            this.stats.misses++;
            return null;
        }

        this.stats.hits++;
        return item.data;
    }

    /**
     * Set value in cache
     * @param {string} key - Cache key
     * @param {any} data - Data to cache
     * @param {number} ttl - Time to live in seconds (default: 300 = 5 minutes)
     */
    set(key, data, ttl = 300) {
        this.cache.set(key, {
            data,
            expires: Date.now() + (ttl * 1000),
            createdAt: Date.now()
        });
        this.stats.sets++;
    }

    /**
     * Delete specific key from cache
     * @param {string} key - Cache key
     */
    delete(key) {
        this.cache.delete(key);
    }

    /**
     * Clear all cache entries matching a pattern
     * @param {string} pattern - Pattern to match (e.g., 'items:*')
     */
    deletePattern(pattern) {
        const regex = new RegExp(pattern.replace('*', '.*'));
        for (const key of this.cache.keys()) {
            if (regex.test(key)) {
                this.cache.delete(key);
            }
        }
    }

    /**
     * Clear all cache
     */
    clear() {
        this.cache.clear();
        this.stats = { hits: 0, misses: 0, sets: 0 };
    }

    /**
     * Get cache statistics
     */
    getStats() {
        return {
            ...this.stats,
            size: this.cache.size,
            hitRate: this.stats.hits / (this.stats.hits + this.stats.misses) || 0
        };
    }

    /**
     * Clean expired entries (run periodically)
     */
    cleanExpired() {
        const now = Date.now();
        let cleaned = 0;

        for (const [key, item] of this.cache.entries()) {
            if (item.expires && item.expires < now) {
                this.cache.delete(key);
                cleaned++;
            }
        }

        return cleaned;
    }
}

// Create singleton instance
const cacheService = new CacheService();

// Auto-clean expired entries every 5 minutes
setInterval(() => {
    const cleaned = cacheService.cleanExpired();
    if (cleaned > 0) {
        console.log(`🧹 Cache: Cleaned ${cleaned} expired entries`);
    }
}, 5 * 60 * 1000);

export default cacheService;
