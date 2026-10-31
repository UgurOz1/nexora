import { z } from 'zod';

// Validation that runs in the browser before anything is sent, so people get instant feedback.
// The API validates everything again on its side: this is convenience, never protection.
export const emailSchema = z.email('Enter a valid email address');

export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(128, 'Use at most 128 characters');

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password'),
});

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(100, 'Use at most 100 characters'),
  email: emailSchema,
  password: passwordSchema,
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((values) => values.password === values.confirm, {
    message: 'The passwords do not match',
    path: ['confirm'],
  });

export const organizationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Use at least 2 characters')
    .max(100, 'Use at most 100 characters'),
});

// Text inputs always produce strings; an empty one means "not set".
export const projectSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(100, 'Use at most 100 characters'),
  department: z.string().trim().max(100, 'Use at most 100 characters'),
  description: z.string().trim().max(2000, 'Use at most 2000 characters'),
});

export type LoginValues = z.infer<typeof loginSchema>;
export type RegisterValues = z.infer<typeof registerSchema>;
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;
export type OrganizationValues = z.infer<typeof organizationSchema>;
export type ProjectValues = z.infer<typeof projectSchema>;
