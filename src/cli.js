const { Command } = require('commander');
const inquirer = require('inquirer');
const { logger } = require('./utils/logger');
const { createProject } = require('./commands/init');
const { loadConfig } = require('./commands/config');

class CLI {
    constructor() {
        this.program = new Command();
        this.setupCommands();
    }

    setupCommands() {
        this.program
            .version('1.0.0')
            .description('NodeForge - Node.js Development Workflow Automation Tool');

        this.program
            .command('init')
            .description('Create a new Node.js project')
            .option('-t, --template <template>', 'Project template to use')
            .option('-n, --name <name>', 'Project name')
            .action(async (options) => {
                const answers = await this.promptProjectDetails(options);
                await createProject({ ...options, ...answers });
            });

        this.program
            .command('config')
            .description('Manage configuration')
            .option('-l, --load <path>', 'Load configuration from file')
            .option('-s, --save <path>', 'Save configuration to file')
            .action(async (options) => {
                if (options.load) {
                    const config = await loadConfig(options.load);
                    logger.info('Configuration loaded successfully');
                    console.log(config);
                }
            });

        this.program
            .command('env')
            .description('Manage development environment synchronization')
            .option('-s, --sync', 'Synchronize development environment')
            .option('-c, --check', 'Check environment consistency')
            .action(async (options) => {
                const nodeForge = require('./index');
                await nodeForge.syncEnvironment(options);
            });

        this.program
            .command('api')
            .description('Manage API development lifecycle')
            .option('-d, --design', 'Design API endpoints')
            .option('-m, --mock', 'Generate API mocks')
            .option('-t, --test', 'Run API tests')
            .action(async (options) => {
                const nodeForge = require('./index');
                await nodeForge.manageAPI(options);
            });

        this.program
            .command('microservices')
            .description('Manage microservices development')
            .option('-i, --init', 'Initialize microservice')
            .option('-r, --run', 'Run microservices locally')
            .option('-d, --deploy', 'Deploy microservices')
            .action(async (options) => {
                const nodeForge = require('./index');
                await nodeForge.manageMicroservices(options);
            });

        this.program
            .command('optimize')
            .description('Optimize application performance')
            .option('-a, --analyze', 'Analyze performance')
            .option('-b, --bundle', 'Optimize bundle size')
            .option('-m, --memory', 'Check memory usage')
            .action(async (options) => {
                const nodeForge = require('./index');
                await nodeForge.optimizePerformance(options);
            });

        this.program
            .command('security')
            .description('Manage security and compliance')
            .option('-s, --scan', 'Run security scan')
            .option('-l, --licenses', 'Check licenses')
            .option('-v, --vulnerabilities', 'Check vulnerabilities')
            .action(async (options) => {
                const nodeForge = require('./index');
                await nodeForge.analyzeSecurity(options);
            });

        this.program
            .command('analyze')
            .description('Analyze project')
            .argument('[path]', 'Project path', '.')
            .action(async (path) => {
                const nodeForge = require('./index');
                const analysis = await nodeForge.analyzeProject(path);
                logger.info('Project analysis complete');
                console.log(analysis);
            });
    }

    async promptProjectDetails(options) {
        if (options.name && options.template) {
            return options;
        }

        return inquirer.prompt([
            {
                type: 'input',
                name: 'name',
                message: 'Project name:',
                when: !options.name
            },
            {
                type: 'list',
                name: 'template',
                message: 'Select a template:',
                choices: ['express-api', 'react-app', 'cli-tool', 'monorepo'],
                when: !options.template
            }
        ]);
    }

    run(args) {
        this.program.parse(args);
    }
}

module.exports = new CLI();
