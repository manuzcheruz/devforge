import chalk from 'chalk';

class Logger {
    info(message: string): void {
        console.log(chalk.blue('ℹ'), message);
    }

    success(message: string): void {
        console.log(chalk.green('✓'), message);
    }

    warn(message: string): void {
        console.log(chalk.yellow('⚠'), message);
    }

    error(message: string): void {
        console.log(chalk.red('✗'), message);
    }

    startOperation(message: string): number {
        console.log(chalk.blue('▶'), message);
        return Date.now();
    }

    endOperation(startTime: number, message: string): void {
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        this.success(`${message} (${duration}s)`);
    }

    progress(current: number, total: number, message: string): void {
        const percentage = Math.round((current / total) * 100);
        const progressBar = this.getProgressBar(percentage);
        console.log(`⟳ [${progressBar}] ${percentage}% - ${message}`);
    }

    private getProgressBar(percentage: number): string {
        const width = 25;
        const filled = Math.round((percentage / 100) * width);
        return '█'.repeat(filled) + '░'.repeat(width - filled);
    }
}

export const logger = new Logger();
