
import { join } from "https://deno.land/std@0.223.0/path/mod.ts";
interface LoggingConfig {
    logDir: string;
    infoLog: string;
    errorLog: string;
}

interface Config {
    logging: LoggingConfig;
}

const config: Config = JSON.parse(await Deno.readTextFile('config.json'));
const infoPath = join(config.logging.logDir, config.logging.infoLog);
const errorPath = join(config.logging.logDir, config.logging.errorLog);

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

export function requestLoggingPermissions()
{
    // request r/w permissions if needed
    const readPerm = Deno.permissions.requestSync({name: "read"});
    const writePerm = Deno.permissions.requestSync({name: "write"});

    if (readPerm.state === "denied") console.log("Deno does not have permission to read. Logging may be impossible.\n");
    if (writePerm.state === "denied") console.log("deno does not have permission to write. Editing or creating new log filels may be impossible.\n")
}


// basic logging function
export async function log(logType: string, message: string, context: object = {}) {
    const entry = {
        timestamp: new Date().toISOString(),
        logType,
        message,
        ...context,
    };

    // if the logs directory does not exist, create it
    await Deno.mkdir(config.logging.logDir, { recursive: true });

    try {
        switch(logType) {
            case "INFO":
                console.log(entry);
                await Deno.writeTextFile(infoPath, JSON.stringify(entry) + "\n", { append: true });
                break;
            case "ERROR":
                console.error(entry);
                await Deno.writeTextFile(errorPath, JSON.stringify(entry) + "\n", { append: true });
                break;
            default:
                throw new Error(`Unknown log type: ${logType}`);
        }
    } catch (error) {
        console.error(`Failed to write log entry: ${error}`);
    }
}

export default log;