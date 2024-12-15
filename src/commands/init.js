const fs = require('fs').promises;
const path = require('path');
const { logger } = require('../utils/logger');
const { validateProjectName } = require('../utils/validator');
const { getBaseTemplate } = require('../templates/base');
const remoteTemplateManager = require('../templates/remote');

async function createProject(options, pluginManager) {
    try {
        logger.info(`Creating new project: ${options.name}`);

        // Validate project name
        if (!validateProjectName(options.name)) {
            throw new Error('Invalid project name');
        }

        const projectPath = path.join(process.cwd(), options.name);

        // Create project directory
        await fs.mkdir(projectPath, { recursive: true });

        let template;
        // Handle remote template if URL is provided
        if (options.url) {
            logger.info(`Fetching remote template from: ${options.url}`);
            try {
                template = await remoteTemplateManager.fetchTemplate(options.url);
                await remoteTemplateManager.detectAndCheckoutDefaultBranch(template.path);
                // Load template files after fetching
                template = await remoteTemplateManager.loadTemplateFiles(template);
                logger.success('Remote template fetched successfully');

                // Set default template configuration for remote templates
                template.dependencies = template.dependencies || {};
                template.devDependencies = template.devDependencies || {};
                
                // Try to read package.json from remote template
                try {
                    const pkgJsonPath = path.join(template.path, 'package.json');
                    const pkgJson = JSON.parse(await fs.readFile(pkgJsonPath, 'utf-8'));
                    template.dependencies = { ...pkgJson.dependencies };
                    template.devDependencies = { ...pkgJson.devDependencies };
                } catch (pkgError) {
                    logger.warn('No package.json found in remote template, using empty dependency lists');
                }
            } catch (error) {
                logger.error(`Failed to fetch remote template: ${error.message}`);
                throw error;
            }
        } else {
            // Get local template content
            if (!options.template) {
                throw new Error('No template specified and no remote URL provided');
            }
            template = getBaseTemplate(options.template);
        }

        // Apply plugins
        if (pluginManager) {
            await pluginManager.applyPlugins(template);
        }

        // Create project structure
        await createProjectStructure(projectPath, template);

        // Cleanup remote template files if necessary
        if (options.templateUrl) {
            await remoteTemplateManager.cleanup();
        }

        logger.success(`Project ${options.name} created successfully`);
        return { success: true, projectPath };
    } catch (error) {
        // Cleanup on error for remote templates
        if (options.templateUrl) {
            await remoteTemplateManager.cleanup().catch(cleanupError => {
                logger.warn(`Failed to cleanup remote template: ${cleanupError.message}`);
            });
        }
        logger.error(`Failed to create project: ${error.message}`);
        throw error;
    }
}

async function createProjectStructure(projectPath, template) {
    const { exec } = require('child_process');
    const util = require('util');
    const execPromise = util.promisify(exec);
    const { TemplateProcessor } = require('../templates/processor');
    const templateProcessor = new TemplateProcessor();
    
    const startTime = logger.startOperation('Setting up project structure');
    
    try {
        // Create base files
        logger.info('Creating project files...');
        let fileCount = 0;
        const totalFiles = Object.keys(template.files).length;
        
        for (const [filePath, content] of Object.entries(template.files)) {
            const fullPath = path.join(projectPath, filePath);
            await fs.mkdir(path.dirname(fullPath), { recursive: true });
            await fs.writeFile(fullPath, content.trim() + '\n');
            fileCount++;
            logger.progress(fileCount, totalFiles, `Creating ${path.basename(filePath)}`);
        }
        
        // Initialize git repository with proper error handling
        process.chdir(projectPath);
        logger.info('Initializing git repository...');
        try {
            await execPromise('git init');
        } catch (gitError) {
            logger.warn('Git initialization failed, continuing without git...');
        }
        
        // Create package.json with proper configuration
        logger.info('Creating package.json...');
        const packageJson = {
            name: path.basename(projectPath),
            version: '1.0.0',
            description: `A Node.js project created with NodeForge`,
            main: 'src/index.js',
            scripts: {
                start: 'node src/index.js',
                dev: 'nodemon src/index.js',
                test: 'jest --coverage',
                lint: 'eslint .',
                'lint:fix': 'eslint . --fix',
                format: 'prettier --write "**/*.{js,json,md}"',
                prepare: 'husky install'
            },
            keywords: [],
            author: '',
            license: 'ISC'
        };
        
        await fs.writeFile(
            path.join(projectPath, 'package.json'),
            JSON.stringify(packageJson, null, 2) + '\n'
        );
        
        // Install dependencies with proper error handling and progress tracking
        logger.info('Installing project dependencies...');
        const dependencies = Object.entries(template.dependencies || {})
            .map(([pkg, version]) => `${pkg}@${version}`);
            
        const devDependencies = Object.entries(template.devDependencies || {})
            .map(([pkg, version]) => `${pkg}@${version}`);
        
        if (dependencies.length > 0) {
            try {
                logger.info('Installing dependencies...');
                await execPromise(`npm install --save ${dependencies.join(' ')} --loglevel error`);
                logger.success('Dependencies installed successfully');
            } catch (npmError) {
                logger.error(`Failed to install dependencies: ${npmError.message}`);
                throw npmError;
            }
        }
        
        if (devDependencies.length > 0) {
            logger.info('Installing development dependencies...');
            try {
                await execPromise(`npm install --save-dev ${devDependencies.join(' ')} --loglevel error`);
            } catch (npmError) {
                logger.error(`Failed to install dev dependencies: ${npmError.message}`);
                throw npmError;
            }
        }
        
        // Setup git hooks and configurations if git was initialized successfully
        try {
            const gitStatus = await execPromise('git status');
            if (gitStatus) {
                logger.info('Setting up git hooks...');
                // Ensure husky is installed as a dev dependency first
                await execPromise('npm install --save-dev husky@^8.0.3 @commitlint/cli@^17.0.0 @commitlint/config-conventional@^17.0.0 --loglevel error');
                
                // Initialize husky with proper error handling
                try {
                    await execPromise('npx husky install');
                    await execPromise('npm pkg set scripts.prepare="husky install"');
                    
                    // Create .husky directory explicitly
                    const huskyDir = path.join(projectPath, '.husky');
                    await fs.mkdir(huskyDir, { recursive: true });
                    
                    // Add hooks with proper permissions
                    await execPromise('npx husky add .husky/commit-msg "npx --no -- commitlint --edit $1"');
                    await execPromise('npx husky add .husky/pre-commit "npm run lint && npm run test"');
                    await execPromise('chmod +x .husky/commit-msg .husky/pre-commit');
                    
                    logger.info('Creating commit lint configuration...');
                    await fs.writeFile(
                        path.join(projectPath, 'commitlint.config.js'),
                        'module.exports = {extends: ["@commitlint/config-conventional"]};' + '\n'
                    );
                    
                    logger.success('Git hooks setup completed successfully');
                } catch (huskyError) {
                    logger.warn(`Husky setup failed: ${huskyError.message}`);
                    logger.info('Continuing with basic git configuration...');
                }
            }
        } catch (hooksError) {
            logger.warn(`Git hooks setup skipped: ${hooksError.message}`);
        }
        
        // Create README.md with project documentation
        logger.info('Creating project documentation...');
        await fs.writeFile(
            path.join(projectPath, 'README.md'),
            generateReadme(template, path.basename(projectPath))
        );
        
        // Create environment files
        await fs.writeFile(
            path.join(projectPath, '.env.example'),
            'NODE_ENV=development\nPORT=3000\n'
        );
        
        await fs.writeFile(
            path.join(projectPath, '.gitignore'),
            'node_modules/\n.env\ncoverage/\n.DS_Store\n'
        );
        
        process.chdir('..');
        logger.endOperation(startTime, 'Project setup completed');
        return { success: true };
    } catch (error) {
        logger.error(`Failed to initialize project: ${error.message}`);
        // Attempt cleanup on failure
        try {
            if (process.cwd().includes(path.basename(projectPath))) {
                process.chdir('..');
            }
            await fs.rm(projectPath, { recursive: true, force: true });
        } catch (cleanupError) {
            logger.error(`Failed to cleanup after error: ${cleanupError.message}`);
        }
        throw error;
    }
}

function generateReadme(template, projectName) {
    return `# ${projectName}

## Description
A Node.js project created with NodeForge

## Setup
1. Install dependencies:
\`\`\`bash
npm install
\`\`\`

2. Create a \`.env\` file based on \`.env.example\`

3. Start the development server:
\`\`\`bash
npm run dev
\`\`\`

## Available Scripts
- \`npm start\`: Start the production server
- \`npm run dev\`: Start development server with hot reload
- \`npm test\`: Run tests
- \`npm run lint\`: Check code style
- \`npm run lint:fix\`: Fix code style issues
- \`npm run format\`: Format code with Prettier

## Git Hooks
- Pre-commit: Runs linting and tests
- Commit-msg: Enforces conventional commit messages
`;
}

module.exports = { createProject };