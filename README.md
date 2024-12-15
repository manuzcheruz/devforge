# NodeForge

A Node.js development workflow automation tool that standardizes project setup and configuration through template-based project generation. The system features a plugin manager for extensibility and customization of project templates, complemented by integrated project analysis capabilities.

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
npm install -g nodeforge
```

## Quick Start

```bash
# Create a new project
nodeforge init -n my-project -t express-api

# Analyze an existing project
nodeforge analyze

# Check environment setup
nodeforge env --check
```

## CLI Commands

### Project Initialization
```bash
# Basic project creation
nodeforge init -n <project-name> -t <template-name>

# With template variant
nodeforge init -n <project-name> -t <template-name> -v <variant>

# With custom variables
nodeforge init -n <project-name> -t <template-name> --vars "port=3000,useTypescript=true"

# Using remote template
nodeforge init -n <project-name> --url <git-repo-url> --version <version>
```

### Project Analysis
```bash
# Full project analysis
nodeforge analyze

# Specific analysis
nodeforge analyze --metrics          # Code metrics only
nodeforge analyze --quality          # Code quality only
nodeforge analyze --complexity       # Code complexity only
nodeforge analyze --performance      # Performance metrics only
nodeforge analyze --documentation    # Documentation coverage

# Analysis with specific focus
nodeforge analyze --quality --maintainability  # Check maintainability
nodeforge analyze --quality --issues           # Check code issues
nodeforge analyze --quality --duplication      # Check code duplication
nodeforge analyze --performance --async        # Check async patterns
nodeforge analyze --performance --bundle       # Check bundle size
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
nodeforge analyze --performance
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
nodeforge analyze --coverage

# Specific coverage checks
nodeforge analyze --coverage --unit       # Unit test coverage
nodeforge analyze --coverage --integration # Integration test coverage
nodeforge analyze --coverage --summary     # Coverage summary
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
nodeforge analyze --documentation
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
nodeforge init -n my-project --url https://github.com/username/repo.git
```

Version control support:
```bash
# Use specific version
nodeforge init -n my-project --url <repo-url> --version v1.2.3

# Use specific branch
nodeforge init -n my-project --url <repo-url> --version develop
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

- Documentation: [https://nodeforge.dev/docs](https://nodeforge.dev/docs)
- Issues: [GitHub Issues](https://github.com/nodeforge/nodeforge/issues)
- Discussions: [GitHub Discussions](https://github.com/nodeforge/nodeforge/discussions)

## License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.
