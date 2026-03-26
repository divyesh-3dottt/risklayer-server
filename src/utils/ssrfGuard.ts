import dns from "node:dns/promises";
import ipaddr from "ipaddr.js";
import { createApiError, isApiError } from "./ApiError";

/**
 * Validates a URL to prevent SSRF (Server-Side Request Forgery) attacks.
 * Blocks private, loopback, and non-unicast IP ranges.
 */
export async function assertSafeUrl(urlStr: string): Promise<void> {
    try {
        let normalizedUrl = urlStr.trim();
        if (!/^https?:\/\//i.test(normalizedUrl)) {
            normalizedUrl = `https://${normalizedUrl}`;
        }
        
        const urlObj = new URL(normalizedUrl);

        // Only allow http and https
        if (urlObj.protocol !== "http:" && urlObj.protocol !== "https:") {
            throw createApiError(400, "Invalid protocol. Only http and https are allowed.");
        }

        const { hostname } = urlObj;

        // In development, you might want to allow localhost, but for production, block it.
        // We'll follow the spec strictly: Section 9.1
        const { address } = await dns.lookup(hostname);
        const ip = ipaddr.parse(address);

        // Blocks private, loopback, linkLocal, etc.
        if (ip.range() !== "unicast") {
            throw createApiError(400, "Blocked: URL points to a private or non-unicast IP range.");
        }

        // Also block metadata IP explicitly
        if (address === "169.254.169.254") {
            throw createApiError(400, "Blocked: URL points to a cloud metadata IP.");
        }
    } catch (error: any) {
        if (isApiError(error)) throw error;
        throw createApiError(400, `Invalid URL or hostname resolution failed: ${error.message}`);
    }
}
