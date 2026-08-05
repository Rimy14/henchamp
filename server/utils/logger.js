/**
 * Simple logger utility
 */

const LOG_LEVELS = {
    ERROR: 'ERROR',
    WARN: 'WARN',
    INFO: 'INFO',
    DEBUG: 'DEBUG'
};

class Logger {
    constructor() {
        this.level = process.env.LOG_LEVEL || 'INFO';
    }

    formatMessage(level, message, meta = {}) {
        const timestamp = new Date().toISOString();
        const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
        return `[${timestamp}] [${level}] ${message}${metaStr}`;
    }

    error(message, meta = {}) {
        console.error(this.formatMessage(LOG_LEVELS.ERROR, message, meta));
    }

    warn(message, meta = {}) {
        console.warn(this.formatMessage(LOG_LEVELS.WARN, message, meta));
    }

    info(message, meta = {}) {
        console.log(this.formatMessage(LOG_LEVELS.INFO, message, meta));
    }

    debug(message, meta = {}) {
        if (process.env.NODE_ENV === 'development') {
            console.log(this.formatMessage(LOG_LEVELS.DEBUG, message, meta));
        }
    }

    // Log request
    logRequest(req) {
        this.info(`${req.method} ${req.originalUrl}`, {
            ip: req.ip,
            user: req.user?.username
        });
    }

    // Log database query
    logQuery(sql, params = []) {
        this.debug('Database Query', { sql, params });
    }
}

export default new Logger();
