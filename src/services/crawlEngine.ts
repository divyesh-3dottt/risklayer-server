import { chromium, Browser, BrowserContext, Page } from "playwright";
import { randomUUID } from "node:crypto";
import robotsParser from "robots-parser";
import axios from "axios";
import db from "../config/db";
import { logger } from "../utils/logger";
import { assertSafeUrl } from "../utils/ssrfGuard";

interface PageSignal {
    url: string;
    depth: number;
    title: string;
    meta: any;
    status_code: number;
    content_type: string;
    extracted_json: {
        headings: { level: number; text: string; innerHTML: string; selector: string; snippet: string }[];
        links_internal: { href: string; text: string; html: string; selector: string; snippet: string }[];
        links_external: { href: string; text: string; html: string; selector: string; snippet: string }[];
        images: { src: string; alt: string | null; width: string | null; height: string | null; selector: string; snippet: string }[];
        forms: { id: string | null; labels: string[]; orphan_inputs_count: number; selector: string; snippet: string }[];
        inline_styles: { selector: string; snippet: string }[];
        has_favicon: boolean;
        html_lang: string | null;
        total_scripts: number;
        has_ssl: boolean;
        body_text_sample?: string;
        canonical: string | null;
        og_title: string | null;
        og_image: string | null;
        twitter_card: string | null;
        gtm_present: boolean;
        descriptions: string[];
        strong_tags_count: number;
        social_links: string[];
        // Integrated from Agent
        security_headers: {
            csp: boolean;
            x_frame_options: boolean;
            hsts: boolean;
            x_content_type: boolean;
            referrer_policy: boolean;
            server: string | null;
        };
        compliance: {
            has_cookie_banner: boolean;
            cookie_signals_found: string[];
        };
        accessibility: {
            has_aria_labels: boolean;
            has_skip_link: boolean;
            has_role_attributes: boolean;
        };
        performance: {
            has_lazy_load: boolean;
            render_blocking_scripts: number;
        };
    };
}

// Global Hard Limits
const MAX_PAGES = 20;
const MAX_DEPTH = 2;
const PAGE_TIMEOUT = 20000;
const GLOBAL_TIMEOUT = 120000; // 120 seconds

const IGNORE_EXTENSIONS = [
    '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.pdf', '.zip', '.exe', '.docx', '.xlsx', '.mp4', '.mp3'
];
const IGNORE_PATHS = ['/login', '/wp-admin', '/admin', '/api/', '/graphql', '/auth'];

/**
 * Main entry point for the crawl process.
 */
export async function startCrawl(scanId: string, startUrl: string) {
    const startTime = Date.now();
    let browser: Browser | null = null;
    const visited = new Set<string>();
    const queue: { url: string; depth: number }[] = [];
    let origin: string = "";
    let robots: any = null;

    try {
        const normalizedUrl = normalizeUrl(startUrl);
        const urlObj = new URL(normalizedUrl);
        origin = urlObj.origin;

        logger.info(`[SCAN:${scanId}] 🚀 STARTING CRAWL | Target: ${normalizedUrl} | Origin: ${origin}`);

        // 2. Initial SSRF Protection
        logger.info(`[SCAN:${scanId}] 🛡️ Validating SSRF Safety...`);
        await assertSafeUrl(normalizedUrl);
        logger.info(`[SCAN:${scanId}] ✅ Target URL is safe.`);

        // 3. Status Update
        await db.scan.update({
            where: { id: scanId },
            data: { status: "crawling" }
        });

        // 4. Fetch robots.txt
        logger.info(`[SCAN:${scanId}] 🤖 Checking robots.txt...`);
        const robotsUrl = `${origin}/robots.txt`;
        const robotsRes = await axios.get(robotsUrl, { timeout: 5000 }).catch(() => null);
        if (robotsRes) {
            robots = robotsParser(robotsUrl, robotsRes.data);
            logger.info(`[SCAN:${scanId}] 🤖 Found robots.txt. Rules applied.`);
        } else {
            logger.info(`[SCAN:${scanId}] 🤖 No robots.txt found. Continuing with default rules.`);
        }

        // Save robots.txt status for rules engine
        await db.scanPage.create({
            data: {
                id: randomUUID(),
                scan_id: scanId,
                url: robotsUrl,
                depth: 1,
                status_code: robotsRes ? robotsRes.status : 404,
                content_type: "text/plain",
                title: "Robots.txt",
                meta: {},
                extracted_json: {}
            }
        });

        // 5. Launch Browser
        logger.info(`[SCAN:${scanId}] 🌐 Launching Playwright Browser...`);
        browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 RiskLayerBot/1.0',
            viewport: { width: 1280, height: 720 },
            ignoreHTTPSErrors: true
        });

        queue.push({ url: normalizedUrl, depth: 0 });
        logger.info(`[SCAN:${scanId}] 📥 Added root page to queue.`);

        while (queue.length > 0 && visited.size < MAX_PAGES) {
            if (Date.now() - startTime > GLOBAL_TIMEOUT) {
                logger.warn(`[SCAN:${scanId}] ⚠️ Global timeout reached.`);
                break;
            }

            const current = queue.shift();
            if (!current) break;

            logger.info(`[SCAN:${scanId}] 🔍 NEXT PAGE [${visited.size}/${MAX_PAGES}]: ${current.url} (Depth: ${current.depth})`);

            try {
                const result = await processPage(current.url, current.depth, scanId, context, {
                    visited,
                    queue,
                    origin,
                    robots
                });
                
                // If this was the root page (depth 0), update origin based on where we actually landed
                if (current.depth === 0 && result?.actualOrigin) {
                    if (result.actualOrigin !== origin) {
                        logger.info(`[SCAN:${scanId}] 🔄 Origin updated from ${origin} to ${result.actualOrigin} due to redirect.`);
                        origin = result.actualOrigin;
                    }
                }
            } catch (pError) {
                logger.error(`[SCAN:${scanId}] ❌ Fatal page error: ${current.url}`, pError);
            }
        }

        logger.info(`[SCAN:${scanId}] 🏁 CRAWL STAGE COMPLETE | Visited: ${visited.size} | Queue Left: ${queue.length}`);

        // 6. Transition to Rules Evaluation (Handled in controller after startCrawl but also here for safety)
        logger.info(`[SCAN:${scanId}] ⚖️ Transitioning to Rules Engine...`);
        await db.scan.update({
            where: { id: scanId },
            data: { status: "rules_evaluation" }
        });

    } catch (error) {
        logger.error(`[SCAN:${scanId}] 💀 CRAWL ENGINE FATAL ERROR:`, error);
        await db.scan.update({
            where: { id: scanId },
            data: { status: "failed" }
        });
    } finally {
        if (browser) {
            logger.info(`[SCAN:${scanId}] 🔌 Closing browser.`);
            await browser.close();
        }
    }
}

/**
 * Normalize URLs to avoid duplicates (e.g., https://site.com/ vs https://site.com)
 */
function normalizeUrl(urlStr: string): string {
    try {
        const u = new URL(urlStr);
        u.hash = '';
        // Remove trailing slash except for root origin
        let path = u.pathname.replace(/\/+$/, '') || '/';
        return `${u.protocol}//${u.host.toLowerCase()}${path}${u.search}`;
    } catch {
        return urlStr;
    }
}

async function initRobots(origin: string) {
    try {
        const res = await axios.get(`${origin}/robots.txt`, { timeout: 5000 });
        return robotsParser(`${origin}/robots.txt`, res.data);
    } catch (e) {
        return null;
    }
}

function isUrlAllowed(url: string, origin: string, robots: any): boolean {
    try {
        const u = new URL(url);

        // Internal links only (Robust check for www vs non-www)
        const baseOrigin = origin.replace(/^https?:\/\/(www\.)?/, '').toLowerCase();
        const linkOrigin = u.origin.replace(/^https?:\/\/(www\.)?/, '').toLowerCase();
        
        if (baseOrigin !== linkOrigin) return false;

        // Robots.txt check
        if (robots && !robots.isAllowed(url, 'RiskLayerBot')) return false;

        // Ignore list (Paths)
        if (IGNORE_PATHS.some(p => u.pathname.toLowerCase().includes(p.toLowerCase()))) return false;

        // Ignore list (Extensions)
        if (IGNORE_EXTENSIONS.some(ext => u.pathname.toLowerCase().endsWith(ext))) return false;

        // Ignore query param heavy dynamic pages
        if (u.searchParams.size > 5) return false;

        return true;
    } catch {
        return false;
    }
}

async function processPage(
    url: string,
    depth: number,
    scanId: string,
    context: BrowserContext,
    state: { visited: Set<string>; queue: { url: string; depth: number }[]; origin: string; robots: any }
): Promise<{ actualOrigin: string } | void> {
    const normUrl = normalizeUrl(url);
    if (state.visited.has(normUrl)) {
        logger.info(`[SCAN:${scanId}] ⏩ Skipping already visited: ${normUrl}`);
        return;
    }
    state.visited.add(normUrl);

    logger.info(`[SCAN:${scanId}] 📑 Processing Page: ${normUrl}`);
    const page: Page = await context.newPage();

    // PERFORMANCE: Intercept and block unnecessary resources
    await page.route('**/*', route => {
        const type = route.request().resourceType();
        if (['image', 'media', 'font'].includes(type) && !route.request().url().includes('favicon')) {
            return route.abort();
        }
        return route.continue();
    });

    try {
        logger.info(`[SCAN:${scanId}] 🌍 Navigating to ${normUrl}...`);
        const response = await page.goto(normUrl, {
            waitUntil: 'load',
            timeout: PAGE_TIMEOUT
        });

        // ⏱️ Wait for client-side hydration (React/Vite/Next)
        logger.info(`[SCAN:${scanId}] ⏱️ Waiting 2.5s for hydration/JS...`);
        await page.waitForTimeout(2500);

        if (!response) {
            logger.warn(`[SCAN:${scanId}] ⚠️ No response for ${normUrl}. Skipping.`);
            return;
        }

        const actualOrigin = new URL(page.url()).origin;

        const status = response.status();
        logger.info(`[SCAN:${scanId}] 📥 HTTP ${status} received for ${normUrl} (Actual: ${page.url()}).`);

        // Extract Advanced Signals via Injected Script
        logger.info(`[SCAN:${scanId}] 🧬 Extracting DOM signals...`);
        const signals = await page.evaluate(`(function() {
            if (!document.body) return null;

            const getSelector = (el) => {
                const path = [];
                let current = el;
                while (current && current.nodeType === 1) {
                    let selector = current.nodeName.toLowerCase();
                    if (current.id) {
                        selector += '#' + current.id;
                        path.unshift(selector);
                        break;
                    } else {
                        let sibling = current;
                        let nth = 1;
                        while (sibling.previousElementSibling) {
                            sibling = sibling.previousElementSibling;
                            if (sibling.nodeName.toLowerCase() === selector) nth++;
                        }
                        if (nth > 1) selector += ':nth-of-type(' + nth + ')';
                    }
                    path.unshift(selector);
                    current = current.parentElement;
                }
                return path.join(' > ');
            };

            const getSnippet = (el) => {
                return el.outerHTML.slice(0, 500);
            };

            return {
                headings: Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).map(h => ({
                    level: parseInt(h.tagName[1]),
                    text: h.innerText.trim(),
                    innerHTML: h.innerHTML,
                    selector: getSelector(h),
                    snippet: getSnippet(h)
                })),
                images: Array.from(document.querySelectorAll('img')).map(img => ({
                    src: img.src,
                    alt: img.getAttribute('alt'),
                    has_alt_attr: img.hasAttribute('alt'),
                    width: img.getAttribute('width'),
                    height: img.getAttribute('height'),
                    selector: getSelector(img),
                    snippet: getSnippet(img)
                })),
                forms: Array.from(document.querySelectorAll('form')).map(f => {
                    const inputs = Array.from(f.querySelectorAll('input:not([type="hidden"]), select, textarea'));
                    const orphanInputs = inputs.filter(i => {
                        const id = i.getAttribute('id');
                        const hasFor = id ? document.querySelector('label[for="' + id + '"]') : false;
                        const hasWrap = i.closest('label');
                        return !hasFor && !hasWrap;
                    });
                    return {
                        id: f.id || null,
                        labels_count: f.querySelectorAll('label').length,
                        orphan_inputs: orphanInputs.map(i => ({ selector: getSelector(i), snippet: getSnippet(i) })),
                        orphan_inputs_count: orphanInputs.length,
                        selector: getSelector(f),
                        snippet: getSnippet(f)
                    };
                }),
                orphan_inputs: Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]), select, textarea'))
                    .filter(i => {
                         const id = i.getAttribute('id');
                         const hasFor = id ? document.querySelector('label[for="' + id + '"]') : false;
                         const hasWrap = i.closest('label');
                         const hasAria = i.getAttribute('aria-label') || i.getAttribute('aria-labelledby') || i.getAttribute('title');
                         return !hasFor && !hasWrap && !hasAria;
                    })
                    .map(i => ({
                         selector: getSelector(i),
                         snippet: getSnippet(i)
                    })),
                links_internal: Array.from(document.querySelectorAll('a'))
                    .map(a => ({ 
                        href: a.href, 
                        text: (a.innerText || a.textContent || "").trim(), 
                        html: a.innerHTML, 
                        aria_label: a.getAttribute('aria-label'),
                        title: a.getAttribute('title'),
                        image_alts: Array.from(a.querySelectorAll('img')).map(img => img.alt).filter(Boolean),
                        selector: getSelector(a), 
                        snippet: getSnippet(a) 
                    }))
                    .filter(l => l.href && l.href.startsWith(window.location.origin)),
                links_external: Array.from(document.querySelectorAll('a'))
                    .map(a => ({ 
                        href: a.href, 
                        text: (a.innerText || a.textContent || "").trim(), 
                        html: a.innerHTML, 
                        aria_label: a.getAttribute('aria-label'),
                        title: a.getAttribute('title'),
                        image_alts: Array.from(a.querySelectorAll('img')).map(img => img.alt).filter(Boolean),
                        selector: getSelector(a), 
                        snippet: getSnippet(a) 
                    }))
                    .filter(l => l.href && !l.href.startsWith(window.location.origin) && !l.href.startsWith('#')),
                scripts: Array.from(document.querySelectorAll('script')).map(s => s.src).filter(Boolean),
                inline_styles: Array.from(document.querySelectorAll('[style]')).map(el => ({
                    selector: getSelector(el),
                    snippet: getSnippet(el)
                })),
                has_favicon: !!document.querySelector('link[rel*="icon"]'),
                html_lang: document.documentElement.getAttribute('lang'),
                total_scripts: document.querySelectorAll('script').length,
                has_ssl: window.location.protocol === 'https:',
                body_text_sample: document.body.innerText.slice(0, 2000),
                canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') || null,
                og_title: document.querySelector('meta[property="og:title"]')?.getAttribute('content') || null,
                og_image: document.querySelector('meta[property="og:image"]')?.getAttribute('content') || null,
                twitter_card: document.querySelector('meta[name="twitter:card"]')?.getAttribute('content') || null,
                gtm_present: !!document.querySelector('script[src*="googletagmanager.com"]') || Array.from(document.querySelectorAll('script')).some(s => s.innerText.includes('GTM-')),
                descriptions: Array.from(document.querySelectorAll('meta[name="description"]')).map(m => m.getAttribute('content') || ''),
                strong_tags_count: document.querySelectorAll('strong, b').length,
                social_links: Array.from(document.querySelectorAll('a')).filter(a => a.href && a.href.match(/facebook\.com|twitter\.com|linkedin\.com|instagram\.com|youtube\.com|x\.com/i)).map(a => a.href),
                
                // --- Hybrid Agent Signals ---
                compliance: {
                    has_cookie_banner: [
                        'cookieconsent', 'cookie-consent', 'onetrust', 'cookiebot', 'cookie-notice', 
                        'cookie-banner', 'consent-banner', 'cookie-script', 'cookiepro'
                    ].some(sig => document.body.innerHTML.toLowerCase().includes(sig)),
                    cookie_signals_found: [
                        'cookieconsent', 'cookie-consent', 'onetrust', 'cookiebot'
                    ].filter(sig => document.body.innerHTML.toLowerCase().includes(sig))
                },
                accessibility: {
                    has_aria_labels: document.body.innerHTML.toLowerCase().includes('aria-label'),
                    has_skip_link: document.body.innerHTML.toLowerCase().includes('skip-to') || document.body.innerHTML.toLowerCase().includes('#main'),
                    has_role_attributes: document.body.innerHTML.toLowerCase().includes('role="')
                },
                performance: {
                    has_lazy_load: document.body.innerHTML.toLowerCase().includes('loading="lazy"'),
                    render_blocking_scripts: Array.from(document.querySelectorAll('script:not([defer]):not([async])[src]')).length
                },
                cleaned_html: document.body.innerHTML
                    .replace(/<script[\\s\\S]*?<\\/script>/gi, '')
                    .replace(/<style[\\s\\S]*?<\\/style>/gi, '')
                    .replace(/<!--[\\s\\S]*?-->/g, '')
                    .replace(/\\s+/g, ' ')
                    .trim()
                    .slice(0, 10000)
            };
        })()`);

        // NEW: Capture full raw HTML for real line number mapping in the report
        const raw_html = await page.content();

        if (!signals) {
            logger.warn(`[SCAN:${scanId}] ⚠️ DOM evaluation returned null for ${normUrl}.`);
            return { actualOrigin };
        }

        // Extract Security Headers from Response Object
        const headers = response.headers();
        (signals as any).security_headers = {
            csp: !!(headers['content-security-policy']),
            x_frame_options: !!(headers['x-frame-options']),
            hsts: !!(headers['strict-transport-security']),
            x_content_type: !!(headers['x-content-type-options']),
            referrer_policy: !!(headers['referrer-policy']),
            permissions_policy: !!(headers['permissions-policy']),
            xss_protection: !!(headers['x-xss-protection']),
            server: headers['server'] || null,
            powered_by: headers['x-powered-by'] || null
        };

        logger.info(`[SCAN:${scanId}] 📊 Extracted: ${(signals as any).headings.length} headings, ${(signals as any).links_internal.length} internal links, ${(signals as any).images.length} images.`);

        const title = await page.title();
        const metaDescription = await page.evaluate(() => {
            const m = document.querySelector('meta[name="description"]');
            return m ? m.getAttribute('content') : null;
        });

        // Store Signal to DB
        logger.info(`[SCAN:${scanId}] 💾 Saving ${normUrl} to database...`);
        await db.scanPage.create({
            data: {
                id: randomUUID(),
                scan_id: scanId,
                url: normUrl,
                depth: depth,
                status_code: status,
                content_type: response.headers()['content-type'] || 'text/html',
                title: title,
                meta: {
                    description: metaDescription,
                    headers: response.headers()
                },
                extracted_json: signals as any,
                raw_html: raw_html
            }
        });

        // Discovery: Queue new links if depth < MAX_DEPTH
        if (depth < MAX_DEPTH) {
            let addedCount = 0;
            for (const link of (signals as any).links_internal) {
                const normalized = normalizeUrl(link.href);
                if (!state.visited.has(normalized) && isUrlAllowed(normalized, state.origin, state.robots)) {
                    state.queue.push({ url: normalized, depth: depth + 1 });
                    addedCount++;
                }
            }
            if (addedCount > 0) logger.info(`[SCAN:${scanId}] 📥 Discovery: Added ${addedCount} new links to queue (Depth ${depth + 1}).`);
        }

        return { actualOrigin };

    } catch (err) {
        logger.error(`[SCAN:${scanId}] ❌ Error processing ${normUrl}:`, err);
    } finally {
        await page.close();
    }
}
