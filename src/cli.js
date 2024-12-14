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
            .option('-v, --variant <variant>', 'Template variant to use (e.g., minimal, full)')
            .option('--vars <variables>', 'Template variables in key=value format, comma separated')
            .action(async (options) => {
                // Parse and validate variables from CLI
                const parsedVars = options.vars ? 
                    Object.fromEntries(
                        options.vars.split(',')
                        .map(pair => {
                            const [key, value] = pair.split('=');
                            if (!key || value === undefined) {
                                throw new Error(`Invalid variable format: ${pair}. Use key=value format.`);
                            }
                            return [key.trim(), value.trim()];
                        })
                    ) : 
                    {};
                const answers = await this.promptProjectDetails(options);
                await createProject({ 
                    ...options, 
                    ...answers,
                    variables: parsedVars 
                });
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
            .command('db')
            .description('Manage database operations')
            .option('-m, --migrate', 'Run database migrations')
            .option('-s, --seed', 'Seed the database with initial data')
            .option('-b, --backup [path]', 'Backup the database')
            .option('-r, --restore <path>', 'Restore database from backup')
            .action(async (options) => {
                const nodeForge = require('./index');
                await nodeForge.manageDatabase(options);
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
        const templates = {
            'express-api': {
                variants: ['minimal', 'full'],
                variables: {
                    port: '3000',
                    useTypescript: 'false',
                    includeDocs: 'true'
                }
            },
            'react-app': {
                variants: ['basic', 'full'],
                variables: {
                    port: '3000',
                    includeRouter: 'false',
                    useTypescript: 'false'
                }
            },
            'cli-tool': {
                variants: ['basic'],
                variables: {
                    binName: 'cli'
                }
            },
            'monorepo': {
                variants: ['default'],
                variables: {
                    includeShared: 'true'
                }
            }
        };

        if (options.name && options.template && options.variant && options.vars) {
            return options;
        }

        const answers = await inquirer.prompt([
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
                choices: Object.keys(templates),
                when: !options.template
            }
        ]);

        const selectedTemplate = options.template || answers.template;
        const templateConfig = templates[selectedTemplate];
        
        if (!options.variant && templateConfig.variants?.length > 0) {
            const variantAnswer = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'variant',
                    message: 'Select template variant:',
                    choices: templateConfig.variants,
                    default: templateConfig.variants[0]
                }
            ]);
            answers.variant = variantAnswer.variant;
        } else if (options.variant) {
            // Validate the provided variant
            if (!templateConfig.variants?.includes(options.variant)) {
                logger.error(`Invalid variant '${options.variant}' for template '${selectedTemplate}'`);
                logger.info(`Available variants: ${templateConfig.variants?.join(', ') || 'none'}`);
                process.exit(1);
            }
            answers.variant = options.variant;
        }

        // Prompt for template variables if not provided via CLI
        if (!options.vars) {
            const variablePrompts = Object.entries(templateConfig.variables).map(([key, defaultValue]) => ({
                type: typeof defaultValue === 'boolean' ? 'confirm' : 'input',
                name: `variables.${key}`,
                message: `Enter value for ${key}:`,
                default: defaultValue,
            }));

            const variableAnswers = await inquirer.prompt(variablePrompts);
            
            // Convert dot notation answers to nested object
            answers.variables = Object.entries(variableAnswers).reduce((vars, [key, value]) => {
                const varName = key.split('.')[1];
                vars[varName] = value;
                return vars;
            }, {});
        }

        return { ...options, ...answers };
    }

    run(args) {
        this.program.parse(args);
    }
}

module.exports = new CLI();
