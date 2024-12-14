import { z } from 'zod';

// Environment Manager Types
export const environmentConfigSchema = z.object({
    nodeVersion: z.string().optional(),
    npmVersion: z.string().optional(),
    requiredPackages: z.array(z.string()).optional(),
    configFiles: z.array(z.string()).optional()
});

export type EnvironmentConfig = z.infer<typeof environmentConfigSchema>;

export interface ValidationResult {
    success: boolean;
    details: {
        nodeVersion?: string;
        npmVersion?: string;
        projectPath?: string;
        issues?: string[];
    };
}

export interface SyncResult {
    success: boolean;
    details: {
        nodeVersion?: string;
        npmVersion?: string;
        syncedConfigs?: string[];
        issues?: string[];
    };
}

export interface RepairResult {
    success: boolean;
    details: {
        actions: string[];
        issues?: string[];
    };
}
