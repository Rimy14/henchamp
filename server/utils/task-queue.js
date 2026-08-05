/**
 * Simple Task Queue Service
 * Handles background tasks asynchronously
 * Production: Replace with Bull/BullMQ for multi-server deployments
 */

import logger from './logger.js';

class TaskQueue {
    constructor() {
        this.queues = new Map();
        this.workers = new Map();
        this.stats = {
            processed: 0,
            failed: 0,
            pending: 0
        };
    }

    /**
     * Create a new queue
     * @param {string} name - Queue name
     * @param {function} processor - Task processor function
     * @param {object} options - Queue options
     */
    createQueue(name, processor, options = {}) {
        if (this.queues.has(name)) {
            logger.warn(`Queue ${name} already exists`);
            return;
        }

        this.queues.set(name, {
            tasks: [],
            processor,
            options: {
                concurrency: options.concurrency || 1,
                retries: options.retries || 3,
                retryDelay: options.retryDelay || 5000
            },
            processing: 0
        });

        this.startWorker(name);
        logger.info(`📬 Queue created: ${name}`);
    }

    /**
     * Add task to queue
     * @param {string} queueName - Queue name
     * @param {object} data - Task data
     * @returns {Promise} - Resolves when task is queued
     */
    async add(queueName, data) {
        const queue = this.queues.get(queueName);

        if (!queue) {
            throw new Error(`Queue ${queueName} not found`);
        }

        const task = {
            id: `${queueName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            data,
            attempts: 0,
            maxAttempts: queue.options.retries + 1,
            createdAt: Date.now(),
            status: 'pending'
        };

        queue.tasks.push(task);
        this.stats.pending++;

        // Trigger worker if idle
        this.processNext(queueName);

        return task.id;
    }

    /**
     * Start worker for a queue
     */
    startWorker(queueName) {
        const worker = setInterval(() => {
            this.processNext(queueName);
        }, 100); // Check every 100ms

        this.workers.set(queueName, worker);
    }

    /**
     * Process next task in queue
     */
    async processNext(queueName) {
        const queue = this.queues.get(queueName);

        if (!queue) return;

        // Check concurrency limit
        if (queue.processing >= queue.options.concurrency) {
            return;
        }

        // Get next pending task
        const task = queue.tasks.find(t => t.status === 'pending');

        if (!task) return;

        // Mark as processing
        task.status = 'processing';
        queue.processing++;
        this.stats.pending--;

        try {
            // Execute processor
            await queue.processor(task.data);

            // Success
            task.status = 'completed';
            this.stats.processed++;

            // Remove from queue
            const index = queue.tasks.indexOf(task);
            if (index > -1) {
                queue.tasks.splice(index, 1);
            }

            logger.info(`✅ Task completed: ${task.id}`);
        } catch (error) {
            task.attempts++;

            if (task.attempts >= task.maxAttempts) {
                // Failed permanently
                task.status = 'failed';
                this.stats.failed++;

                logger.error(`❌ Task failed permanently: ${task.id}`, error);

                // Remove from queue
                const index = queue.tasks.indexOf(task);
                if (index > -1) {
                    queue.tasks.splice(index, 1);
                }
            } else {
                // Retry
                task.status = 'pending';
                this.stats.pending++;

                logger.warn(`⚠️ Task failed, will retry (${task.attempts}/${task.maxAttempts}): ${task.id}`);

                // Delay retry
                setTimeout(() => {
                    this.processNext(queueName);
                }, queue.options.retryDelay);
            }
        } finally {
            queue.processing--;
        }
    }

    /**
     * Get queue stats
     */
    getStats(queueName) {
        if (queueName) {
            const queue = this.queues.get(queueName);
            return {
                name: queueName,
                pending: queue.tasks.filter(t => t.status === 'pending').length,
                processing: queue.processing,
                total: queue.tasks.length
            };
        }

        return {
            ...this.stats,
            queues: Array.from(this.queues.keys()).map(name => this.getStats(name))
        };
    }

    /**
     * Stop all workers
     */
    shutdown() {
        for (const [name, worker] of this.workers.entries()) {
            clearInterval(worker);
            logger.info(`Queue ${name} stopped`);
        }
    }
}

// Create singleton instance
const taskQueue = new TaskQueue();

export default taskQueue;
