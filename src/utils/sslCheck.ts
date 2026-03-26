import https from "node:https";
import tls from "node:tls";
import { logger } from "./logger";

export interface SSLStatus {
    valid: boolean;
    expiryDate?: Date;
    issuer?: string;
    error?: string;
}

/**
 * Checks if a domain has a valid SSL certificate.
 */
export async function checkSSL(hostname: string): Promise<SSLStatus> {
    return new Promise((resolve) => {
        const options = {
            hostname,
            port: 443,
            method: "GET",
            rejectUnauthorized: false, // We manually check the validity
            agent: false,
            timeout: 5000,
        };

        const req = https.request(options, (res) => {
            const socket = res.socket as tls.TLSSocket;
            const cert = socket.getPeerCertificate();

            if (Object.keys(cert).length === 0) {
                resolve({ valid: false, error: "No certificate found" });
                return;
            }

            const valid = socket.authorized;
            const expiryDate = new Date(cert.valid_to);
            const isExpired = new Date() > expiryDate;

            resolve({
                valid: valid && !isExpired,
                expiryDate,
                issuer: Array.isArray(cert.issuer.O) ? cert.issuer.O[0] : cert.issuer.O,
                error: !valid ? (socket.authorizationError as unknown as string) : (isExpired ? "Certificate expired" : undefined),
            });
        });

        req.on("error", (e) => {
            logger.error(`SSL Check failed for ${hostname}: ${e.message}`);
            resolve({ valid: false, error: e.message });
        });

        req.on("timeout", () => {
            req.destroy();
            resolve({ valid: false, error: "Connection timeout" });
        });

        req.end();
    });
}
