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
                choices: ['express-api', 'react-app', 'cli-tool'],
                when: !options.template
            }
        ]);
    }

    run(args) {
        this.program.parse(args);
    }
}

module.exports = new CLI();
