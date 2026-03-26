import { z } from "zod";

/**
 * TypeScript Interfaces and Validation for the User model.
 */

export const RequestVerifySchema = z.object({
    email: z.string().email("Invalid email address"),
    captchaToken: z.string().optional(),
});

export const VerifyOtpSchema = z.object({
    email: z.string().email("Invalid email address"),
    otp: z.string().length(6, "OTP must be 6 digits"),
});

export type IRequestVerifyInput = z.infer<typeof RequestVerifySchema>;
export type IVerifyOtpInput = z.infer<typeof VerifyOtpSchema>;

export interface IUser {
    id: string;
    email: string;
    is_verified: boolean;
    created_at: Date;
    updated_at: Date;
}
