import { z } from 'zod';

export const userSchema = z.object({
    id: z.number().optional(),
    email: z.string().email(),
    name: z.string().min(1),
    createdAt: z.date().optional(),
    updatedAt: z.date().optional(),
});

export type User = z.infer<typeof userSchema>;

export const validateUser = (data: unknown): User => {
    return userSchema.parse(data);
};
