import { z } from "zod";

/**
 * Zod schemas for the auth use cases — single source of truth for input shapes
 * at the boundary (docs/00 §2). Types are inferred, never hand-written.
 *
 * Password policy: min 10 chars with at least one letter and one digit. Kept
 * deliberately simple and centralized so it can be tightened in one place.
 */

const password = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .regex(/[A-Za-z]/, "Password must contain a letter")
  .regex(/[0-9]/, "Password must contain a digit");

const email = z.string().trim().toLowerCase().email("Invalid email");

/** Consent captured at registration (GDPR proof of consent — docs/09 §9.3). */
const consentInput = z.object({
  type: z.string().min(1), // e.g. "privacy_policy_v1", "terms_v1"
  granted: z.boolean(),
  version: z.string().min(1),
});

export const registerSchema = z.object({
  organizationId: z.string().min(1),
  name: z.string().trim().min(1, "Name is required").max(120),
  email,
  password,
  recaptchaToken: z.string().optional(),
  recaptchaV2Token: z.string().optional(),
  consents: z.array(consentInput).default([]),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  organizationId: z.string().min(1),
  email,
  password: z.string().min(1, "Password is required"),
  recaptchaToken: z.string().optional(),
  recaptchaV2Token: z.string().optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const verifyEmailSchema = z.object({
  token: z.string().min(1),
});
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const requestPasswordResetSchema = z.object({
  organizationId: z.string().min(1),
  email,
  recaptchaToken: z.string().optional(),
  recaptchaV2Token: z.string().optional(),
});
export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: password,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: password,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
