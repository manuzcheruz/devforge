const { DatabasePlugin, DATABASE_ACTIONS } = require('../interfaces/database');
const { LIFECYCLE_EVENTS } = require('../interfaces/base');
const { execSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const { logger } = require('../../utils/logger');

class PrismaDatabasePlugin extends DatabasePlugin {
    constructor() {
        super({
            name: 'core-prisma-database',
            version: '1.0.0',
            type: 'database',
            description: 'Prisma database plugin for NodeForge',
            author: 'NodeForge',
            capabilities: {
                migrations: true,
                seeding: true,
                backup: true,
                restore: true
            },
            hooks: [
                {
                    event: LIFECYCLE_EVENTS.PRE_EXECUTE,
                    handler: async (context) => {
                        logger.info(`Starting Prisma operation: ${context.action}`);
                    }
                },
                {
                    event: LIFECYCLE_EVENTS.POST_EXECUTE,
                    handler: async (context) => {
                        logger.info(`Completed Prisma operation: ${context.action}`);
                    }
                },
                {
                    event: LIFECYCLE_EVENTS.ERROR,
                    handler: async (context) => {
                        logger.error(`Prisma operation failed: ${context.error.message}`);
                    }
                }
            ]
        });

        // Initialize plugin state
        this.setState('lastMigration', null);
    }

    async migrate(context = {}) {
        try {
            const projectPath = context.projectPath || process.cwd();
            logger.info(`Running database migrations for project at: ${projectPath}`);
            
            // Verify Prisma is installed and schema exists
            const prismaSchemaPath = path.join(projectPath, 'prisma', 'schema.prisma');
            try {
                await fs.access(prismaSchemaPath);
            } catch (error) {
                throw new Error('Prisma schema not found. Initialize Prisma first.');
            }

            // Run migrations
            execSync('npx prisma migrate dev', {
                cwd: projectPath,
                stdio: 'inherit'
            });

            // Get list of applied migrations
            const migrationsDir = path.join(projectPath, 'prisma', 'migrations');
            const migrations = await fs.readdir(migrationsDir);

            return {
                success: true,
                details: {
                    migrations
                }
            };
        } catch (error) {
            logger.error(`Migration failed: ${error.message}`);
            return {
                success: false,
                details: {
                    issues: [error.message]
                }
            };
        }
    }

    async seed(context = {}) {
        try {
            const projectPath = context.projectPath || process.cwd();
            logger.info(`Seeding database for project at: ${projectPath}`);

            // Check if seed file exists
            const seedFile = path.join(projectPath, 'prisma', 'seed.ts');
            try {
                await fs.access(seedFile);
            } catch (error) {
                throw new Error('Seed file not found. Create prisma/seed.ts first.');
            }

            // Run seeding
            execSync('npx prisma db seed', {
                cwd: projectPath,
                stdio: 'inherit'
            });

            return {
                success: true,
                details: {
                    seededData: ['Database seeded successfully']
                }
            };
        } catch (error) {
            logger.error(`Seeding failed: ${error.message}`);
            return {
                success: false,
                details: {
                    issues: [error.message]
                }
            };
        }
    }

    async backup(context = {}) {
        try {
            const projectPath = context.projectPath || process.cwd();
            const backupPath = context.backupPath || path.join(projectPath, 'backups');
            
            logger.info(`Backing up database for project at: ${projectPath}`);
            
            // Create backup directory
            await fs.mkdir(backupPath, { recursive: true });
            
            // Create backup using Prisma
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupFile = path.join(backupPath, `backup-${timestamp}.sql`);
            
            execSync(`pg_dump \${DATABASE_URL} > ${backupFile}`, {
                cwd: projectPath,
                stdio: 'inherit'
            });

            return {
                success: true,
                details: {
                    backupFile
                }
            };
        } catch (error) {
            logger.error(`Backup failed: ${error.message}`);
            return {
                success: false,
                details: {
                    issues: [error.message]
                }
            };
        }
    }

    async restore(context = {}) {
        try {
            const projectPath = context.projectPath || process.cwd();
            const backupFile = context.backupPath;
            
            if (!backupFile) {
                throw new Error('Backup file path is required for restore');
            }
            
            logger.info(`Restoring database for project at: ${projectPath}`);
            
            execSync(`psql \${DATABASE_URL} < ${backupFile}`, {
                cwd: projectPath,
                stdio: 'inherit'
            });

            return {
                success: true,
                details: {
                    restoredFrom: backupFile
                }
            };
        } catch (error) {
            logger.error(`Restore failed: ${error.message}`);
            return {
                success: false,
                details: {
                    issues: [error.message]
                }
            };
        }
    }
}

const prismaDatabasePlugin = new PrismaDatabasePlugin();

module.exports = {
    name: prismaDatabasePlugin.config.name,
    version: prismaDatabasePlugin.config.version,
    type: prismaDatabasePlugin.config.type,
    execute: prismaDatabasePlugin.config.execute,
    capabilities: prismaDatabasePlugin.config.capabilities
};
