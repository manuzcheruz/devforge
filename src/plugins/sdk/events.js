const { EventEmitter } = require('events');
const { logger } = require('../../utils/logger');

class PluginEventEmitter extends EventEmitter {
    constructor() {
        super();
        this.transformers = new Map();
        this.middlewares = new Map();
        this.eventHistory = new Map();
    }

    // Register event transformer
    transform(eventName, transformer) {
        if (!this.transformers.has(eventName)) {
            this.transformers.set(eventName, new Set());
        }
        this.transformers.get(eventName).add(transformer);
        return this;
    }

    // Register event middleware
    use(eventPattern, middleware) {
        if (!this.middlewares.has(eventPattern)) {
            this.middlewares.set(eventPattern, new Set());
        }
        this.middlewares.get(eventPattern).add(middleware);
        return this;
    }

    // Enhanced emit with transformation and middleware support
    async emitAsync(eventName, payload) {
        try {
            // Track event
            const eventId = `${eventName}-${Date.now()}`;
            const eventContext = {
                id: eventId,
                name: eventName,
                timestamp: new Date().toISOString(),
                payload
            };

            // Apply middlewares
            let shouldContinue = true;
            for (const [pattern, middlewares] of this.middlewares) {
                if (eventName.match(pattern)) {
                    for (const middleware of middlewares) {
                        shouldContinue = await middleware(eventContext);
                        if (!shouldContinue) {
                            logger.info(`Event ${eventName} blocked by middleware`);
                            return false;
                        }
                    }
                }
            }

            // Apply transformations
            let transformedPayload = payload;
            if (this.transformers.has(eventName)) {
                for (const transformer of this.transformers.get(eventName)) {
                    transformedPayload = await transformer(transformedPayload);
                }
            }

            // Store event in history
            this.eventHistory.set(eventId, {
                ...eventContext,
                transformedPayload,
                completedAt: new Date().toISOString()
            });

            // Emit the event with transformed payload
            return super.emit(eventName, transformedPayload);
        } catch (error) {
            logger.error(`Event emission failed: ${error.message}`);
            throw error;
        }
    }

    // Get event history
    getEventHistory(eventName = null) {
        if (eventName) {
            return Array.from(this.eventHistory.values())
                .filter(event => event.name === eventName);
        }
        return Array.from(this.eventHistory.values());
    }

    // Clear event history
    clearEventHistory() {
        this.eventHistory.clear();
    }
}

module.exports = {
    PluginEventEmitter,
    // Define standard event names
    EVENTS: {
        PLUGIN: {
            REGISTERED: 'plugin:registered',
            INITIALIZED: 'plugin:initialized',
            ERROR: 'plugin:error'
        },
        LIFECYCLE: {
            PRE_INIT: 'lifecycle:pre-init',
            POST_INIT: 'lifecycle:post-init',
            PRE_EXECUTE: 'lifecycle:pre-execute',
            POST_EXECUTE: 'lifecycle:post-execute',
            PRE_CLEANUP: 'lifecycle:pre-cleanup',
            POST_CLEANUP: 'lifecycle:post-cleanup'
        }
    }
};
