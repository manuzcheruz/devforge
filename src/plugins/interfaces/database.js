const { z } = require('zod');

// Database Plugin Interface Schema
const databasePluginSchema = z.object({
    name: z.string(),
    version: z.string(),
    type: z.enum(['database']),
    capabilities: z.object({
        migrations: z.boolean(),
        seeding: z.boolean(),
        backup: z.boolean(),
        restore: z.boolean()
    }),
    execute: z.function()
        .args(z.object({
            action: z.enum(['migrate', 'seed', 'backup', 'restore']),
            context: z.object({
                projectPath: z.string(),
                schema: z.string().optional(),
                seedFile: z.string().optional(),
                backupPath: z.string().optional()
            }).optional()
        }))
        .returns(z.promise(z.object({
            success: z.boolean(),
            details: z.object({
                migrations: z.array(z.string()).optional(),
                seededData: z.array(z.string()).optional(),
                issues: z.array(z.string()).optional()
            })
        })))
});

class DatabasePlugin {
    constructor(config) {
        this.config = databasePluginSchema.parse(config);
    }

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
}

module.exports = {
    DatabasePlugin,
    databasePluginSchema
};
