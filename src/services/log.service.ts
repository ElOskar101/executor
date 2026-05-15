import fs from "node:fs";
import path from "node:path";
import { once } from "node:events";

import paths from "../configs/paths.config";

export function ensureLogsFolder() {
    fs.mkdirSync(paths.logsFolder, { recursive: true });
}

export function executionLogPath(executionId: string) {
    return paths.logFilename(executionId);
}

export function createExecutionLogStream(executionId: string) {
    ensureLogsFolder();
    return fs.createWriteStream(executionLogPath(executionId), { flags: "a" });
}

export async function appendExecutionLog(executionId: string, line: string) {
    ensureLogsFolder();
    await fs.promises.appendFile(executionLogPath(executionId), line);
}

export async function readExecutionLog(executionId: string) {
    const logPath = executionLogPath(executionId);

    if (!path.resolve(logPath).startsWith(paths.logsFolder)) {
        throw new Error("Invalid log path");
    }

    try {
        return await fs.promises.readFile(logPath, "utf8");
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return "";
        }

        throw error;
    }
}

export async function closeLogStream(stream: fs.WriteStream) {
    if (stream.closed || stream.destroyed) return;
    stream.end();
    await once(stream, "close");
}
