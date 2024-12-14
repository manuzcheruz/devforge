# NodeForge - Node.js Development Workflow Automation Tool

A powerful CLI tool that standardizes project setup and configuration through template-based project generation. Features a plugin system for extensibility and customization of project templates.

## 🚀 Quick Start

```bash
# Install globally
npm install -g nodeforge

# Create a new Express API project
nodeforge init -n my-api -t express-api

# Create a React app with TypeScript
nodeforge init -n my-app -t react-app --vars "useTypescript=true"

# Create a full-featured API with documentation
nodeforge init -n my-api -t express-api -v full --vars "includeDocs=true"
```

## 🎯 Key Features

### 1. Template-Based Project Generation

Create new projects using pre-configured templates with customizable variants:

```bash
# Basic usage
nodeforge init -n my-project -t express-api

# With specific variant and variables
nodeforge init -n my-project -t express-api -v full --vars "port=4000,useTypescript=true"
```

Available Templates:
- `express-api` (variants: minimal, full)
- `react-app` (variants: basic, full)
- `cli-tool` (variants: basic)
- `monorepo` (variants: default)

### 2. Environment Management

Synchronize and validate development environments:

```bash
# Sync development environment
nodeforge env --sync

# Check environment consistency
nodeforge env --check

# Repair environment issues
nodeforge env --repair
```

### 3. API Development Lifecycle

Manage API development with built-in tools:

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

### 4. Database Operations

Integrated database management using Prisma:

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

### 5. Performance Optimization

Tools for optimizing application performance:

```bash
# Analyze performance
nodeforge optimize --analyze

# Optimize bundle size
nodeforge optimize --bundle

# Monitor memory usage
nodeforge optimize --memory
```

### 6. Security and Compliance

Built-in security scanning and compliance tools:

```bash
# Run security scan
nodeforge security --scan

# Check licenses
nodeforge security --licenses

# Check vulnerabilities
nodeforge security --vulnerabilities
```

## 🔌 Plugin System

NodeForge features a powerful plugin system that allows extending functionality:

### Core Plugin Types:
1. Environment Plugins - Manage development environment
2. API Plugins - Handle API lifecycle
3. Database Plugins - Database operations

Example of implementing a custom plugin:

```javascript
const { APIPlugin } = require('nodeforge/plugins');

class CustomAPIPlugin extends APIPlugin {
    constructor() {
        super({
            name: 'custom-api-plugin',
            version: '1.0.0',
            type: 'api',
            capabilities: {
                design: true,
                mock: true,
                test: true
            }
        });
    }

    async designAPI(context) {
        // Implementation
    }
}
```

## 📝 Template Customization

Create custom templates in your project:

```
my-custom-template/
├── template/
│   ├── src/
│   │   └── index.js
│   ├── package.json
│   └── README.md
├── config.json
└── hooks.js
```

### Template Configuration (config.json):
```json
{
  "name": "custom-template",
  "description": "My custom project template",
  "variables": {
    "port": {
      "type": "number",
      "default": 3000,
      "description": "Server port number"
    },
    "useTypescript": {
      "type": "boolean",
      "default": false,
      "description": "Enable TypeScript support"
    }
  },
  "variants": {
    "minimal": ["index.js", "package.json"],
    "full": ["**/*"]
  }
}
```

### Template Hooks (hooks.js):
```javascript
module.exports = {
  beforeCreate: async (context) => {
    // Run before template creation
  },
  afterCreate: async (context) => {
    // Run after template creation
  }
};
```

## 🛠️ Development Setup

To set up the development environment:

1. Clone the repository:
```bash
git clone https://github.com/your-username/nodeforge.git
cd nodeforge
```

2. Install dependencies:
```bash
npm install
```

3. Link for local development:
```bash
npm link
```

4. Run tests:
```bash
npm test
```

## 🔍 Troubleshooting

### Common Issues and Solutions

1. **Template Creation Fails**
   - Check template path exists
   - Verify template configuration format
   - Ensure all required variables are provided

2. **Plugin Execution Errors**
   ```bash
   # Check plugin status
   nodeforge plugin --list
   
   # Repair plugin installation
   nodeforge plugin --repair
   ```

3. **Database Connection Issues**
   - Verify database credentials
   - Check if database service is running
   - Ensure migrations are up to date

4. **Environment Sync Problems**
   ```bash
   # Check environment status
   nodeforge env --check
   
   # Force environment repair
   nodeforge env --repair --force
   ```

## 📋 CLI Commands Reference

| Command | Description | Options |
|---------|-------------|----------|
| `init` | Create new project | `-t, --template`, `-n, --name`, `-v, --variant`, `--vars` |
| `env` | Manage environment | `--sync`, `--check`, `--repair` |
| `api` | API development | `--design`, `--mock`, `--test`, `--document` |
| `db` | Database operations | `--migrate`, `--seed`, `--backup`, `--restore` |
| `optimize` | Performance tools | `--analyze`, `--bundle`, `--memory` |
| `security` | Security scanning | `--scan`, `--licenses`, `--vulnerabilities` |
| `config` | Configuration | `--load`, `--save` |

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow the established coding style
- Add tests for new features
- Update documentation as needed
- Ensure all tests pass before submitting PR

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 💬 Support

- Documentation: [https://nodeforge.dev](https://nodeforge.dev)
- Issue Tracker: [GitHub Issues](https://github.com/your-username/nodeforge/issues)
- Community Chat: [Discord](https://discord.gg/nodeforge)
