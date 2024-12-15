# NodeForge

A powerful Node.js development workflow automation tool that standardizes project setup and configuration through template-based project generation. The system features a plugin manager for extensibility and customization of project templates.

## Features

- 🚀 Quick project scaffolding with multiple template options
- 🔄 Remote template support with version control
- 🎯 Template variants for different use cases
- 🛠 Customizable project configuration
- 🔌 Plugin system for extensibility
- 📦 Built-in dependency management
- 🔒 Security and best practices enforcement

## Installation

```bash
npm install -g nodeforge
```

## Quick Start

Create a new project using a built-in template:

```bash
nodeforge init -n my-api -t express-api
```

## Template Options

### Built-in Templates

1. Express API (`express-api`)
   ```bash
   nodeforge init -n my-api -t express-api
   ```

2. Fastify API (`fastify-api`)
   ```bash
   nodeforge init -n my-api -t fastify-api
   ```

3. GraphQL API (`graphql-api`)
   ```bash
   nodeforge init -n my-api -t graphql-api
   ```

4. CLI Tool (`cli-tool`)
   ```bash
   nodeforge init -n my-cli -t cli-tool
   ```

### Remote Templates
### Remote Template Features

#### Version Control Support
```bash
# Use specific version tag
nodeforge init -n my-project --url https://github.com/username/repo.git --version v1.2.3

# Use specific branch
nodeforge init -n my-project --url https://github.com/username/repo.git --version develop

# Use specific commit hash
nodeforge init -n my-project --url https://github.com/username/repo.git --version a1b2c3d
```

#### Template Caching
NodeForge automatically caches remote templates to improve performance and reduce network usage:
- Templates are cached for 24 hours
- Cached templates are stored in `~/.nodeforge/template-cache`
- Cache is automatically cleaned up after 7 days

#### Supported Git Providers
- GitHub
- GitLab
- Bitbucket
- Azure DevOps
- Generic Git repositories

#### Best Practices
1. Always specify a version when using remote templates for reproducibility
2. Use HTTPS URLs for public repositories
3. Ensure the repository contains a valid `package.json`
4. Include a `nodeforge.json` for template configuration

#### Troubleshooting
Common issues and solutions:
1. Template fetch fails
   - Check repository URL
   - Verify network connection
   - Ensure repository is public or proper credentials are provided

2. Version not found
   - Check if version tag exists in repository
   - Try using the latest version
   - Use branch name instead of version tag

3. Template validation fails
   - Verify repository structure
   - Check package.json format
   - Ensure all required files are present


Use any Git repository as a template:

```bash
# Use latest version
nodeforge init -n my-project --url https://github.com/username/repo.git

# Use specific version
nodeforge init -n my-project --url https://github.com/username/repo.git --version 1.2.3
```

### Template Variants

Most templates support different variants:

```bash
# Minimal variant
nodeforge init -n my-api -t express-api -v minimal

# Full-featured variant
nodeforge init -n my-api -t express-api -v full
```

### Template Variables

Customize your project with variables:

```bash
# Single variable
nodeforge init -n my-api -t express-api --vars "port=4000"

# Multiple variables
nodeforge init -n my-api -t express-api --vars "port=4000,useTypescript=true,includeDocs=true"
```

## Additional Features

### Environment Management

```bash
# Check environment consistency
nodeforge env --check

# Sync development environment
nodeforge env --sync

# Repair environment issues
nodeforge env --repair
```

### API Development

```bash
# Design API endpoints
nodeforge api --design

# Generate API mocks
nodeforge api --mock

# Run API tests
nodeforge api --test

# Generate API documentation
nodeforge api --document
```

### Database Operations

```bash
# Run migrations
nodeforge db --migrate

# Seed database
nodeforge db --seed

# Backup database
nodeforge db --backup ./backups/my-backup.sql

# Restore from backup
nodeforge db --restore ./backups/my-backup.sql
```

### Security

```bash
# Run security scan
nodeforge security --scan

# Check licenses
nodeforge security --licenses

# Check vulnerabilities
nodeforge security --vulnerabilities
```

## Template Development

### Structure
A valid template should have the following structure:

```
my-template/
├── package.json
├── nodeforge.json (optional)
└── src/
    └── ... (template files)
```

### Template Configuration
Create a `nodeforge.json` in your template repository:

```json
{
  "template": {
    "name": "my-template",
    "version": "1.0.0",
    "description": "My custom template",
    "variants": ["minimal", "full"],
    "variables": {
      "port": "3000",
      "useTypescript": false
    }
  }
}
```

## Plugin Development

NodeForge supports custom plugins to extend its functionality. Here's how to create your own plugin:

### Plugin Structure
```javascript
const { BasePlugin } = require('@nodeforge/sdk');

class MyCustomPlugin extends BasePlugin {
    constructor() {
        super({
            name: 'my-plugin',
            version: '1.0.0',
            description: 'My custom plugin',
            category: 'performance', // or 'api', 'security', etc.
            capabilities: {
                myFeature: true
            }
        });
    }

    async initialize(context) {
        // Setup plugin
    }

    async execute(context) {
        // Plugin logic
        return results;
    }
}
```

### Plugin Categories
- environment: Environment management plugins
- api: API development tools
- microservices: Microservices-related plugins
- performance: Performance analysis tools
- security: Security scanning and analysis
- database: Database management tools

### Plugin Lifecycle
1. initialization: Plugin setup
2. execution: Main plugin logic
3. cleanup: Resource cleanup

### Example Usage
```javascript
const plugin = new MyCustomPlugin();
await plugin.initialize(context);
const results = await plugin.execute(context);
await plugin.cleanup();
```

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## License

This project is licensed under the ISC License.