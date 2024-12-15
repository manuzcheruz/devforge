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
            .description('NodeSmith - Node.js Project Development & Analysis Tool');

        this.program
            .command('init')
            .description('Create a new Node.js project')
            .option('-t, --template <template>', 'Project template to use')
            .option('-n, --name <name>', 'Project name')
            .option('-v, --variant <variant>', 'Template variant to use (e.g., minimal, full)')
            .option('--url <url>', 'Remote template repository URL')
            .option('--version <version>', 'Template version to use (tag, branch, or commit)')
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
                const projectConfig = {
                    ...options,
                    ...answers,
                    variables: parsedVars,
                    isRemote: !!options.url,
                    templateUrl: options.url
                };
                try {
                    const result = await createProject(projectConfig);
                    if (result.success) {
                        logger.success(`Project ${projectConfig.name} created successfully${projectConfig.version ? ` with version ${projectConfig.version}` : ''}`);
                    }
                } catch (error) {
                    logger.error(`Failed to create project: ${error.message}`);
                    process.exit(1);
                }
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
                const nodeSmith = require('./index'); 
                await nodeSmith.syncEnvironment(options);
            });

        this.program
            .command('api')
            .description('Manage API development lifecycle')
            .option('-d, --design', 'Design API endpoints')
            .option('-m, --mock', 'Generate API mocks')
            .option('-t, --test', 'Run API tests')
            .action(async (options) => {
                const nodeSmith = require('./index'); 
                await nodeSmith.manageAPI(options);
            });

        this.program
            .command('microservices')
            .description('Manage microservices development')
            .option('-i, --init', 'Initialize microservice')
            .option('-r, --run', 'Run microservices locally')
            .option('-d, --deploy', 'Deploy microservices')
            .action(async (options) => {
                const nodeSmith = require('./index'); 
                await nodeSmith.manageMicroservices(options);
            });

        this.program
            .command('optimize')
            .description('Optimize application performance')
            .option('-a, --analyze', 'Analyze performance')
            .option('-b, --bundle', 'Optimize bundle size')
            .option('-m, --memory', 'Check memory usage')
            .action(async (options) => {
                const nodeSmith = require('./index'); 
                await nodeSmith.optimizePerformance(options);
            });

        this.program
            .command('security')
            .description('Manage security and compliance')
            .option('-s, --scan', 'Run security scan')
            .option('-l, --licenses', 'Check licenses')
            .option('-v, --vulnerabilities', 'Check vulnerabilities')
            .action(async (options) => {
                const nodeSmith = require('./index'); 
                await nodeSmith.analyzeSecurity(options);
            });

        this.program
            .command('db')
            .description('Manage database operations')
            .option('-m, --migrate', 'Run database migrations')
            .option('-s, --seed', 'Seed the database with initial data')
            .option('-b, --backup [path]', 'Backup the database')
            .option('-r, --restore <path>', 'Restore database from backup')
            .action(async (options) => {
                const nodeSmith = require('./index'); 
                await nodeSmith.manageDatabase(options);
            });

        this.program
            .command('analyze')
            .description('Analyze project structure and dependencies')
            .argument('[path]', 'Project path', '.')
            .option('-f, --format <format>', 'Output format (json, text)', 'text')
            .option('-o, --output <file>', 'Save analysis to file')
            .action(async (path, options) => {
                const ProjectAnalyzer = require('./analyzer');
                try {
                    const analyzer = new ProjectAnalyzer();
                    const analysis = await analyzer.analyzeProject(path);
                    
                    if (options.format === 'json') {
                        const output = JSON.stringify(analysis, null, 2);
                        if (options.output) {
                            await fs.promises.writeFile(options.output, output);
                            logger.success(`Analysis saved to ${options.output}`);
                        } else {
                            console.log(output);
                        }
                    } else {
                        const { formatTextReport } = require('./utils/formatter');
                        const report = formatTextReport(analysis);
                        if (options.output) {
                            await fs.promises.writeFile(options.output, report);
                            logger.success(`Analysis saved to ${options.output}`);
                        } else {
                            console.log(report);
                        }
                    }
                    
                    logger.success('Project analysis complete');
                } catch (error) {
                    logger.error(`Analysis failed: ${error.message}`);
                    process.exit(1);
                }
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

        // Handle remote template URLs
        if (options.url) {
            // Validate Git URL format
            const gitUrlRegex = /^(https?:\/\/|git@)([^\/:]+)[\/:]([^\/:]+)\/(.+?)(\.git)?$/;
            if (!gitUrlRegex.test(options.url)) {
                logger.error('Invalid Git repository URL format');
                process.exit(1);
            }

            if (options.name) {
                return { name: options.name, url: options.url };
            }

            const answers = await inquirer.prompt([{
                type: 'input',
                name: 'name',
                message: 'Project name:',
                validate: (input) => {
                    try {
                        require('../utils/validator').validateProjectName(input);
                        return true;
                    } catch (error) {
                        return error.message;
                    }
                }
            }]);
            return { ...answers, url: options.url };
        }

        // For local templates
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