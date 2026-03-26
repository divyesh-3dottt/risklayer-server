import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth";
import db from "../config/db";
import { assertSafeUrl } from "../utils/ssrfGuard";
import { sendResponse } from "../utils/ApiResponse";
import { createApiError } from "../utils/ApiError";
import { logger } from "../utils/logger";
import { startCrawl } from "../services/crawlEngine";
import { evaluateRules } from "../services/ruleEngine";
import { StartScanSchema, IStartScanInput, ScanIdParamSchema, IScanIdParam } from "../models";
import { checkSSL } from "../utils/sslCheck";

/**
 * Normalizes a URL to its base (protocol + hostname)
 */
const normalizeUrl = (inputUrl: string): string => {
    try {
        let cleanUrl = inputUrl.trim();
        if (!/^https?:\/\//i.test(cleanUrl)) {
            cleanUrl = `https://${cleanUrl}`;
        }
        const url = new URL(cleanUrl);
        return url.hostname.toLowerCase();
    } catch (e) {
        return inputUrl.toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
    }
};

/**
 * Starts a new scan.
 */
export const startScan = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const validatedData = StartScanSchema.safeParse(req.body);

        if (!validatedData.success) {
            const message = validatedData.error.issues?.[0]?.message || "Validation failed";
            throw createApiError(400, message);
        }

        const { url }: IStartScanInput = validatedData.data;
        const userId = req.user?.userId;
        if (!userId) throw createApiError(401, "User identification failed");

        // 1. Extract and Normalize Domain
        const domain = normalizeUrl(url);

        // 2. Validate hostname (SSRF Guard) - we pass just domain to be safe
        await assertSafeUrl(domain);

        // 3. Resolve Best Starting URL & Verify SSL
        logger.info(`Checking SSL for domain: ${domain}`);
        const sslInfo = await checkSSL(domain);
        
        // We use https if valid, otherwise fallback to http
        const baseProtocol = sslInfo.valid ? "https" : "http";
        
        // Preserve the original path and search if provided, but use the resolved protocol
        let pathAndSearch = "/";
        try {
            const tempUrl = url.includes("://") ? url : `http://${url}`;
            const u = new URL(tempUrl);
            pathAndSearch = u.pathname + u.search;
        } catch (e) {
            // Fallback to root if path parsing fails
        }

        const resolvedUrl = `${baseProtocol}://${domain}${pathAndSearch}`;
        logger.info(`Resolved start URL: ${resolvedUrl} (SSL: ${sslInfo.valid})`);

        // 4. Check for existing scan and "overwrite" (delete old one for this domain)
        const existingScan = await db.scan.findFirst({
            where: {
                user_id: userId,
                domain: domain
            }
        });

        if (existingScan) {
            logger.info(`Overwriting existing scan ${existingScan.id} for domain ${domain}`);
            // Delete dependent records first (Findings and ScanPages)
            await db.finding.deleteMany({ where: { scan_id: existingScan.id } });
            await db.scanPage.deleteMany({ where: { scan_id: existingScan.id } });
            await db.scan.delete({ where: { id: existingScan.id } });
        }

        // 5. Create new Scan row in DB
        const scan = await db.scan.create({
            data: {
                url: resolvedUrl,
                domain: domain,
                user_id: userId,
                ssl_info: sslInfo as any,
                status: "queued",
                is_paid: true // Bypassing payment system as requested
            }
        });

        logger.info(`Scan created: ${scan.id} for domain: ${domain} by user: ${userId}`);

        // 6. Trigger Sequential Scan System (Crawl -> Rules)
        const orchestrateScan = async () => {
            try {
                // Phase 1: Crawl
                await startCrawl(scan.id, resolvedUrl);

                // Phase 2: Rules Evaluation
                await evaluateRules(scan.id);

                logger.info(`Scan system orchestration complete for scan ${scan.id}`);
            } catch (err) {
                logger.error(`Scan orchestration failed for ${scan.id}:`, err);
                await db.scan.update({ where: { id: scan.id }, data: { status: "failed" } });
            }
        };

        orchestrateScan(); // Run in background

        sendResponse(res, 201, "Scan initiated successfully", { scanId: scan.id });
    } catch (error) {
        throw error;
    }
};

/**
 * Gets all scans for the authenticated user
 */
export const getUserScans = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.userId;
        if (!userId) throw createApiError(401, "User identification failed");

        const scans = await db.scan.findMany({
            where: { user_id: userId },
            orderBy: { created_at: 'desc' },
            select: {
                id: true,
                url: true,
                domain: true,
                status: true,
                score: true,
                ssl_info: true,
                created_at: true,
                _count: {
                    select: { findings: true }
                }
            }
        });

        sendResponse(res, 200, "User scans retrieved", scans);
    } catch (error) {
        throw error;
    }
};

/**
 * Gets the status of a scan.
 */
export const getScanStatus = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const validatedParams = ScanIdParamSchema.safeParse(req.params);

        if (!validatedParams.success) {
            throw createApiError(400, (validatedParams.error as any).errors[0].message);
        }

        const { id }: IScanIdParam = validatedParams.data;

        const scan = await db.scan.findUnique({
            where: { id },
            select: { 
                id: true, 
                status: true, 
                score: true,
                scan_pages: {
                    select: {
                        url: true,
                        status_code: true
                    }
                },
                _count: {
                    select: { findings: true }
                }
            }
        });

        if (!scan) throw createApiError(404, "Scan not found");

        sendResponse(res, 200, "Scan status retrieved", scan);
    } catch (error) {
        throw error;
    }
};

/**
 * Gets the scan results (Findings).
 */
export const getScanPreview = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const validatedParams = ScanIdParamSchema.safeParse(req.params);

        if (!validatedParams.success) {
            throw createApiError(400, (validatedParams.error as any).errors[0].message);
        }

        const { id }: IScanIdParam = validatedParams.data;

        const scan = await db.scan.findUnique({
            where: { id },
            include: {
                findings: true,
                scan_pages: true
            }
        });

        if (!scan) throw createApiError(404, "Scan not found");
        if (scan.status !== "preview_ready" && scan.status !== "complete") {
            throw createApiError(400, "Scan results are not ready yet");
        }

        sendResponse(res, 200, "Scan results retrieved", scan);
    } catch (error) {
        throw error;
    }
};
