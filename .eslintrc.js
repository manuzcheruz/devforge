module.exports = {
    parser: '@typescript-eslint/parser',
    extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
        'plugin:prettier/recommended'
    ],
    plugins: ['@typescript-eslint', 'prettier'],
    env: {
        node: true,
        es6: true,
        jest: true
    },
    parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module'
    },
    rules: {
        'prettier/prettier': 'error',
        '@typescript-eslint/explicit-function-return-type': 'off',
        '@typescript-eslint/no-explicit-any': 'warn',
        'no-unused-vars': 'off',
        '@typescript-eslint/no-unused-vars': ['error', { 
            'argsIgnorePattern': '^_',
            'varsIgnorePattern': '^_'
        }]
    },
    ignorePatterns: ['dist/', 'node_modules/', 'coverage/']
};
