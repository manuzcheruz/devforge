# DevForge

A comprehensive Node.js development workflow automation tool that standardizes project setup and configuration through template-based project generation. The system features a plugin manager for extensibility and customization of project templates, complemented by integrated project analysis capabilities.

## Features

- 🚀 Template-based Project Generation
- 🔌 Plugin Management System
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

## Project Analysis Features

### Code Quality Analysis

The analysis tool provides comprehensive insights into your project's code quality:

#### Quality Metrics:
- **Maintainability Index (0-100)**
  - Code organization and structure
  - Documentation coverage and quality
  - Complexity metrics integration
  - Naming conventions adherence
  - Error handling practices
  - Code duplication analysis
  - Comment quality and coverage

- **Code Issues Detection**
  - Line length violations (>100 characters)
  - Empty catch blocks detection
  - Console statement usage in production
  - Magic numbers identification
  - TODO comments tracking
  - Nested complexity warnings
  - Error handling coverage
  - Duplicate code sections

- **Best Practices Analysis**
  - ESLint configuration validation
  - Prettier formatting checks
  - Git hooks implementation
  - Package.json structure
  - Development dependencies audit
  - Code organization patterns

### Performance Analysis

```bash
# Run performance analysis
devforge analyze --performance
```

#### Bundle Analysis
- **Bundle Size Metrics**
  - Raw bundle size measurement
  - Gzipped size estimation
  - Individual chunk analysis
  - External dependencies size
  - Tree-shaking effectiveness
  - Code splitting analysis
  - Dynamic import usage

#### Async Patterns Analysis
- **Promise Usage**
  - Promise chain patterns
  - Error handling coverage
  - Async/await usage ratio
  - Promise.all optimizations
  - Concurrent operations
  - Memory leak prevention

- **Callback Patterns**
  - Callback depth analysis
  - Promise conversion opportunities
  - Event emitter usage
  - Memory management
  - Error propagation

- **Event Loop Analysis**
  - Microtask queue usage
  - Task scheduling patterns
  - Timer usage optimization
  - I/O operation handling
  - Event loop blocking detection

### Test Coverage Analysis

Comprehensive test coverage analysis with detailed metrics:

```bash
# Full test coverage analysis
devforge analyze --coverage

# Specific coverage checks
devforge analyze --coverage --unit       # Unit test coverage
devforge analyze --coverage --integration # Integration test coverage
devforge analyze --coverage --summary     # Coverage summary
```

#### Coverage Metrics:
- **Code Coverage Analysis**
  - Lines coverage percentage
  - Functions coverage percentage
  - Branches coverage percentage
  - Statements coverage percentage
  - Class methods coverage

- **Test Suite Analytics**
  - Total test count and distribution
  - Passed/failed/skipped ratio
  - Test execution time tracking
  - Test suite organization
  - Mock coverage tracking
  - Assertion density metrics

### Documentation Analysis

```bash
# Analyze documentation coverage
devforge analyze --documentation
```

Analyzes:
- README.md presence and quality
- API documentation coverage
- JSDoc comments coverage
- Code comments ratio
- Documentation structure
- Example code presence
- Usage instructions
- Contributing guidelines

## Template System

### Built-in Templates

- `express-api`: Express.js REST API
  - Variants: minimal, standard, full
  - TypeScript support
  - OpenAPI documentation
  - Testing setup included

- `fastify-api`: Fastify REST API
  - High-performance focus
  - TypeScript support
  - Swagger documentation
  - Automated testing

- `graphql-api`: GraphQL API
  - Apollo Server setup
  - Type definitions
  - Resolver structure
  - Testing framework

- `cli-tool`: Command Line Tool
  - Commander.js integration
  - Interactive prompts
  - Color output support
  - Testing utilities

### Template Variables

Common variables supported by templates:
```javascript
{
  "port": "3000",
  "useTypescript": false,
  "includeDocs": true,
  "includeTests": true,
  "dockerize": false,
  "apiPrefix": "/api/v1",
  "serverName": "development",
  "logLevel": "info"
}
```

### Remote Templates

Use any Git repository as a template:
```bash
devforge init -n my-project --url https://github.com/username/repo.git
```

Version control support:
```bash
# Use specific version
devforge init -n my-project --url <repo-url> --version v1.2.3

# Use specific branch
devforge init -n my-project --url <repo-url> --version develop
```

## Plugin Development

### Plugin Structure
```typescript
interface Plugin {
  name: string;
  version: string;
  hooks: {
    beforeInit?: () => void;
    afterInit?: () => void;
    beforeAnalysis?: () => void;
    afterAnalysis?: () => void;
  };
  methods: {
    [key: string]: (...args: any[]) => any;
  };
}
```

### Creating a Plugin

1. Create a new directory with plugin files
2. Implement the Plugin interface
3. Add plugin configuration
4. Test plugin functionality
5. Publish to npm (optional)

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## Support

- Documentation: [https://devforge.dev/docs](https://devforge.dev/docs)
- Issues: [GitHub Issues](https://github.com/devforge/devforge/issues)
- Discussions: [GitHub Discussions](https://github.com/devforge/devforge/discussions)

## License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.
