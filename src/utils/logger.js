const chalk = require('chalk');

class Logger {
    info(message) {
        console.log(chalk.blue('ℹ'), message);
    }

    success(message) {
        console.log(chalk.green('✓'), message);
    }

    error(message) {
        console.error(chalk.red('✗'), message);
    }

    warn(message) {
        console.warn(chalk.yellow('⚠'), message);
    }
    
    progress(step, total, message) {
        const percent = Math.round((step / total) * 100);
        const progressBar = '█'.repeat(Math.floor(percent / 4)) + '░'.repeat(25 - Math.floor(percent / 4));
        console.log(`${chalk.cyan('⟳')} [${progressBar}] ${percent}% - ${message}`);
    }
    
    startOperation(message) {
        console.log(chalk.cyan('▶'), message);
        return Date.now();
    }

    endOperation(startTime, message) {
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(chalk.green('✓'), `${message} (${duration}s)`);
    }
}

module.exports = { logger: new Logger() };
