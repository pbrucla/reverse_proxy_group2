const suspiciousPatterns: RegExp[] = [

];

const userAgentFormat = new RegExp(' .+?[/\s][\d.]+');
const allowedUserAgents = [
    'Mozilla',
    'Chrome',
    'Safari',
    'Edge',
    'Opera',
    'Firefox',
]

export function isSQLInjection(request: string): boolean {
    if (suspiciousPatterns.some((pattern) => pattern.test(request))) {
        return true;
    }
    return false;
}

export function isAllowedUserAgent(userAgent: string): boolean {
    if (!userAgentFormat.test(userAgent)) {
        return false;
    }
    // check user agnet
    return true;
}

export function filterRequest(request: Map<string, string>): boolean {

}