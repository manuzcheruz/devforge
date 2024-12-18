# DevForge

A comprehensive Node.js development workflow automation tool that standardizes project setup and configuration through template-based project generation. The system features a plugin manager for extensibility and customization of project templates, complemented by integrated project analysis capabilities.

## Features

- 🚀 Template-based Project Generation
- 🔌 Plugin Management System with SDK
- 🏪 Community Template Marketplace
- 📊 Project Analysis Tools
- 🔄 Remote Template Support
- 🛠️ Customizable Configuration
- 📈 Performance Metrics
- 🔍 Code Quality Analysis

## Installation

```bash
npm install -g devforge
```

## Quick Start

```bash
# Create a new project
devforge init -n my-project -t express-api

# Analyze an existing project
devforge analyze

# Check environment setup
devforge env --check
```

## CLI Commands

### Project Initialization
```bash
# Basic project creation
devforge init -n <project-name> -t <template-name>

# With template variant
devforge init -n <project-name> -t <template-name> -v <variant>

# With custom variables
devforge init -n <project-name> -t <template-name> --vars "port=3000,useTypescript=true"

# Using remote template
devforge init -n <project-name> --url <git-repo-url> --version <version>
```

### Project Analysis
```bash
# Full project analysis
devforge analyze

# Specific analysis
devforge analyze --metrics          # Code metrics only
devforge analyze --quality          # Code quality only
devforge analyze --complexity       # Code complexity only
devforge analyze --performance      # Performance metrics only
devforge analyze --documentation    # Documentation coverage

# Analysis with specific focus
devforge analyze --quality --maintainability  # Check maintainability
devforge analyze --quality --issues           # Check code issues
devforge analyze --quality --duplication      # Check code duplication
devforge analyze --performance --async        # Check async patterns
devforge analyze --performance --bundle       # Check bundle size
```

## Plugin SDK

The Plugin SDK provides a powerful event-driven architecture for extending DevForge's functionality.

### Creating a Plugin

```javascript
const { Plugin } = require('@devforge/sdk');

class MyCustomPlugin extends Plugin {
  constructor() {
    super({
      name: 'my-custom-plugin',
      version: '1.0.0',
      type: 'api',
      capabilities: {
        design: true,
        mock: true,
        test: true
      }
    });
  }

  async onInitialize(context) {
    // Plugin initialization logic
    await this.registerHook('preExecute', this.validateInput);
  }

  async validateInput(context) {
    // Input validation logic
    return context;
  }

  async onExecute(context) {
    // Main plugin logic
    return { success: true };
  }
}
```

### Plugin Types and Capabilities

```javascript
// Available plugin types
const pluginTypes = [
  'api',        // API development tools
  'database',   // Database management
  'environment',// Environment configuration
  'security'    // Security scanning
];

// Capability examples by type
const capabilities = {
  api: {
    design: true,     // API design and structure
    mock: true,       // Mock data generation
    test: true,       // Testing utilities
    document: true,   // Documentation generation
    monitor: true     // Performance monitoring
  },
  database: {
    migrations: true, // Schema migrations
    seeding: true,    // Data seeding
    backup: true,     // Database backups
    restore: true     // Restoration features
  }
};
```

### Plugin Lifecycle Events

```javascript
// Register lifecycle hooks
await plugin.registerHook('preInit', async (context) => {
  // Pre-initialization logic
});

await plugin.registerHook('postExecute', async (result) => {
  // Post-execution processing
});

// Available lifecycle events
const LIFECYCLE_EVENTS = [
  'preInit',     // Before initialization
  'postInit',    // After initialization
  'preExecute',  // Before execution
  'postExecute', // After execution
  'error',       // Error handling
  'cleanup'      // Resource cleanup
];
```

## Template Marketplace

DevForge includes a built-in marketplace for discovering and sharing templates.

### Using the Marketplace

```bash
# Search for templates
devforge search "api template"

# Install template
devforge install -t express-api-advanced

# Publish template
devforge publish ./my-template

# Update template
devforge update -t express-api-advanced
```

### Template Management API

```javascript
const { MarketplaceManager } = require('@devforge/marketplace');

// Initialize marketplace
const marketplace = new MarketplaceManager();

// Publish template
await marketplace.publishTemplate({
  name: 'my-template',
  version: '1.0.0',
  description: 'Custom API template',
  author: 'DevForge Team',
  type: 'project',
  compatibility: {
    nodeVersion: '>=14',
    devforgeVersion: '>=1.0.0'
  }
});

// Search templates
const results = await marketplace.searchTemplates('api', {
  type: 'project',
  tags: ['typescript', 'rest'],
  sort: 'downloads'
});

// Download template
await marketplace.downloadTemplate('template-name', 'latest');
```

## Analysis Tools

### Performance Analysis

```bash
# Run comprehensive performance analysis
devforge analyze --performance

# Specific performance aspects
devforge analyze --performance --async    # Analyze async patterns
devforge analyze --performance --memory   # Memory usage analysis
devforge analyze --performance --cpu      # CPU profiling
devforge analyze --performance --network  # Network performance
devforge analyze --performance --database # Database query analysis
```

### Code Quality Metrics

The analysis tool provides detailed insights into:

```bash
# Run code quality analysis
devforge analyze --quality

# Specific quality checks
devforge analyze --quality --maintainability # Maintainability index
devforge analyze --quality --complexity     # Cyclomatic complexity
devforge analyze --quality --duplication    # Code duplication
devforge analyze --quality --coverage       # Test coverage
```

### Security Analysis

```bash
# Run security analysis
devforge analyze --security

# Specific security checks
devforge analyze --security --dependencies  # Dependency vulnerabilities
devforge analyze --security --staticAnalysis # Static code analysis
devforge analyze --security --secretsScan   # Secrets scanning
```

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## Support

- Documentation: [https://devforge.dev/docs](https://devforge.dev/docs)
- Issues: [GitHub Issues](https://github.com/devforge/devforge/issues)
- Discussions: [GitHub Discussions](https://github.com/devforge/devforge/discussions)

## License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.
