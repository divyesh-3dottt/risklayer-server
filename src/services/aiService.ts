import axios from 'axios';
import { logger } from '../utils/logger';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

/**
 * Clean HTML for AI token budget (similar to reference agent)
 */
function prepareHTMLForAI(raw: string): string {
    if (!raw) return "";
    return raw
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 10000); // Token budget
}

export async function generateExecutiveSummary(
    score: number, 
    findings: any[], 
    url: string, 
    rawSignals?: any, 
    rawHtml?: string
) {
    if (!ANTHROPIC_API_KEY) {
        logger.warn("ANTHROPIC_API_KEY not set or empty. Using fallback summary.");
        return generateFallbackSummary(score, findings);
    }

    try {
        const cleanedHtml = rawHtml ? prepareHTMLForAI(rawHtml) : "No HTML sample provided.";
        
        // Use a much more sophisticated "Power Prompt" mirroring the reference agent
        const prompt = `
        You are RiskLayer, a high-end autonomous website security and compliance audit engine.
        Website: ${url}
        Overall Integrity Score: ${score}/100
        
        DETERMINISTIC SIGNALS (Found by our crawler):
        ${rawSignals ? JSON.stringify(rawSignals, null, 2).slice(0, 5000) : "Signals not provided."}

        VERIFIED FINDINGS:
        ${findings.map(f => `- [${f.severity.toUpperCase()}] ${f.category}: ${f.message}`).join('\n')}

        HTML CONTEXT (Cleaned):
        ${cleanedHtml}

        TASK:
        Write a professional, punchy 'Executive Summary' and 'Intelligence Briefing' for this scan.
        It should be 4-5 sentences long.
        Focus on structural integrity, legal exposure, and technical trust factors.
        Speak in the first person plural ("We detected...", "Our analysis suggests...").
        Talk like a senior cyber-security lead at a Fortune 500 company.
        
        Return ONLY the summary text. No markdown, no labels like 'Summary:'.
        `;

        const response = await axios.post(
            'https://api.anthropic.com/v1/messages',
            {
                model: 'claude-3-5-sonnet-20240620',
                max_tokens: 500,
                system: "You are a senior security auditor and compliance expert. You provide high-fidelity, professional summaries of technical scans.",
                messages: [{ role: 'user', content: prompt }]
            },
            {
                headers: {
                    'x-api-key': ANTHROPIC_API_KEY,
                    'anthropic-version': '2023-06-01',
                    'Content-Type': 'application/json'
                }
            }
        );

        const content = response.data.content[0].text;
        return content.trim();

    } catch (error: any) {
        if (error.response) {
            logger.error(`AI Service Error (Anthropic API Response):`, {
                status: error.response.status,
                data: error.response.data
            });
        } else {
            logger.error("AI Service Error (Network/Request):", error.message);
        }
        return generateFallbackSummary(score, findings);
    }
}

function generateFallbackSummary(score: number, findings: any[]) {
    const critical = findings.filter(f => f.severity === 'critical').length;
    const high = findings.filter(f => f.severity === 'high').length;

    if (score > 90) return "Our automated audit indicates an excellent security and compliance posture with minimal exposure.";
    if (score > 70) return `Your website maintains a standard security profile, though we identified ${findings.length} issues, including ${high} high-priority concerns that require attention.`;
    return `Critical intervention is recommended. Our scan detected ${critical} critical vulnerabilities and ${high} high-risk issues that significantly impact your legal and security integrity.`;
}
