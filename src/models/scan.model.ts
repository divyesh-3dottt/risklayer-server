import { z } from "zod";

/**
 * TypeScript Interfaces and Validation for the Scan models.
 */

export enum ScanStatus {
    QUEUED = "queued",
    CRAWLING = "crawling",
    RULES_EVALUATION = "rules_evaluation",
    PREVIEW_READY = "preview_ready",
    COMPLETE = "complete",
    FAILED = "failed",
}

export const StartScanSchema = z.object({
    url: z.string().min(1, "URL is required"),
});

export const ScanIdParamSchema = z.object({
    id: z.string().uuid("Invalid Scan ID format"),
});

export type IStartScanInput = z.infer<typeof StartScanSchema>;
export type IScanIdParam = z.infer<typeof ScanIdParamSchema>;

export interface IScan {
    id: string;
    url: string;
    status: ScanStatus;
    score?: number;
    is_paid: boolean;
    user_id: string;
    findings_summary?: any;
    created_at: Date;
    updated_at: Date;
}

export interface IScanPage {
    id: string;
    scan_id: string;
    url: string;
    depth: number;
    status_code?: number;
    content_type?: string;
    title?: string;
    meta?: any;
    extracted_json?: any;
}

export interface IFinding {
    id: string;
    scan_id: string;
    rule_id: string;
    category: "accessibility" | "compliance" | "trust" | "structure";
    severity: "critical" | "high" | "medium" | "low";
    message: string;
    evidence?: any;
}
