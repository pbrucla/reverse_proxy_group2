

// interface for a access log
export interface AccessLog {
    method: string,
    url: string,
    protocol: string,
    status: number,
    size: number,
    referer: string,
    userAgent: string,
    responseTime: number,
    upstream_response_time: number,
    backend: string,
}

// basic logging function
export async function log(logType: string, message: string, context: object = {}) {
    const entry = {
        timestamp: new Date().toISOString(),
        logType,
        message,
        ...context,
    };

    try {
        switch(logType) {
            case "INFO":
                await Deno.writeTextFile('info_log.txt', JSON.stringify(entry) + "\n", { append: true });
                break;
            case "ERROR":
                await Deno.writeTextFile('error_log.txt', JSON.stringify(entry) + "\n", { append: true });
                break;
            default:
                throw new Error(`Unknown log type: ${logType}`);
        }
    } catch (error) {
        console.error(`Failed to write log entry: ${error}`);
    }
}

export default log;