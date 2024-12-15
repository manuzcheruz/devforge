# test-variant-project

## Description
A Node.js project created with NodeSmith

## Setup
1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file based on `.env.example`

3. Start the development server:
```bash
npm run dev
```

## Available Scripts
- `npm start`: Start the production server
- `npm run dev`: Start development server with hot reload
- `npm test`: Run tests
- `npm run lint`: Check code style
- `npm run lint:fix`: Fix code style issues
- `npm run format`: Format code with Prettier

## Git Hooks
- Pre-commit: Runs linting and tests
- Commit-msg: Enforces conventional commit messages
