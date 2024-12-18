const { z } = require('zod');
const { Plugin, LIFECYCLE_EVENTS } = require('./base');

// Database Actions
const DATABASE_ACTIONS = {
    MIGRATE: 'migrate',
    SEED: 'seed',
    BACKUP: 'backup',
    RESTORE: 'restore'
};

// Database Plugin Interface Schema extends base plugin schema
const databasePluginSchema = z.object({
    type: z.literal('database'),
    capabilities: z.object({
        migrations: z.boolean(),
        seeding: z.boolean(),
        backup: z.boolean(),
        restore: z.boolean()
    })
});

// Database Context Schema
const databaseContextSchema = z.object({
    action: z.enum(Object.values(DATABASE_ACTIONS)),
    projectPath: z.string(),
    schema: z.string().optional(),
    seedFile: z.string().optional(),
    backupPath: z.string().optional()
});

class DatabasePlugin extends Plugin {
    constructor(config) {
        // Validate database-specific configuration
        databasePluginSchema.parse(config);
        super(config);
        
        // Register default hooks
        this.registerHook(LIFECYCLE_EVENTS.PRE_EXECUTE, this.validateContext.bind(this));
        this.registerHook(LIFECYCLE_EVENTS.PRE_EXECUTE, this.checkDatabaseConnection.bind(this));
    }

    async validateContext(context) {
        try {
            return databaseContextSchema.parse(context);
        } catch (error) {
            throw new Error(`Invalid database context: ${error.message}`);
        }
    }

    async checkDatabaseConnection(context) {
        // This hook ensures database connection is available before execution
        // Implement connection check logic in concrete plugins
        this.setState('connectionChecked', true);
    }

    async onExecute(context) {
        const { action } = context;

        switch (action) {
            case DATABASE_ACTIONS.MIGRATE:
                return this.migrate(context);
            case DATABASE_ACTIONS.SEED:
                return this.seed(context);
            case DATABASE_ACTIONS.BACKUP:
                return this.backup(context);
            case DATABASE_ACTIONS.RESTORE:
                return this.restore(context);
            default:
                throw new Error(`Unsupported database action: ${action}`);
        }
    }

    // Abstract methods to be implemented by concrete database plugins
    async migrate(context) {
        throw new Error('migrate must be implemented by plugin');
    }

    async seed(context) {
        throw new Error('seed must be implemented by plugin');
    }

    async backup(context) {
        throw new Error('backup must be implemented by plugin');
    }

    async restore(context) {
        throw new Error('restore must be implemented by plugin');
    }

    // Helper methods for database plugins
    validateMigration(migration) {
        if (!migration.up || !migration.down) {
            throw new Error('Migration must contain up and down methods');
        }
    }

    validateSeedData(data) {
        if (!Array.isArray(data)) {
            throw new Error('Seed data must be an array');
        }
    }

    getConnectionStatus() {
        return this.getState('connectionChecked') === true;
    }
}

module.exports = {
    DatabasePlugin,
    databasePluginSchema,
    DATABASE_ACTIONS
};
