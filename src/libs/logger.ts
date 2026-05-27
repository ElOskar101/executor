export type LogStream = "stdout" | "stderr" | "system";
export type LogLevel = "debug" | "info" | "warn" | "error";

type FormatLogLineInput = {
  context: string;
  message: string;
  stream?: LogStream;
  timestamp?: Date | string;
};

type WriteConsoleLogInput = FormatLogLineInput & {
  level?: LogLevel;
  error?: unknown;
};

export type ContextLogger = {
  debug: (message: string, meta?: Omit<WriteConsoleLogInput, "context" | "message" | "level">) => void;
  info: (message: string, meta?: Omit<WriteConsoleLogInput, "context" | "message" | "level">) => void;
  warn: (message: string, meta?: Omit<WriteConsoleLogInput, "context" | "message" | "level">) => void;
  error: (message: string, meta?: Omit<WriteConsoleLogInput, "context" | "message" | "level">) => void;
  formatChunk: (message: string, stream?: LogStream, timestamp?: Date | string) => string;
};

/**
 * Convert a timestamp to ISO string format. i.e.: 2024-01-01T00:00:00.000Z
 * @param timestamp
 */
function toIsoTimestamp(timestamp?: Date | string) {
  if (timestamp instanceof Date) return timestamp.toISOString();
  if (typeof timestamp === "string") return timestamp;
  return new Date().toISOString();
}

/**
 * Split a message into chunks based on line breaks. Use when a message has multiple lines.
 * @param message
 */
function splitMessageChunks(message: string) {
  if (!message) return [];
  const normalized = message.replace(/\r\n/g, "\n");
  return normalized.match(/[^\n]*\n|[^\n]+/g) || [];
}

/**
 * Stringify an error object into a string representation.
 * @param error
 */
function stringifyError(error: unknown) {
  if (error instanceof Error) return error.stack || error.message;

  if (typeof error === "string") return error;

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/**
 * Format a log line with context, timestamp, and message. The output should be like: [2024-01-01T00:00:00.000Z] [context] message
 * @param input
 */
export function formatLogLine(input: FormatLogLineInput) {
  const timestamp = toIsoTimestamp(input.timestamp);
  const streamPrefix = input.stream ? ` [${input.stream}]` : "";
  return `${timestamp} [${input.context}]${streamPrefix} ${input.message}`;
}

/**
 * Format a log chunk with context, timestamp, and message. The output should be like: [2024-01-01T00:00:00.000Z] [context] message\n
 * @param input
 */
export function formatLogChunk(input: FormatLogLineInput) {
  const chunks = splitMessageChunks(input.message);
  if (chunks.length === 0) return "";

  return chunks
    .map((chunk) => {
      const hasLineBreak = chunk.endsWith("\n");
      const cleanMessage = hasLineBreak ? chunk.slice(0, -1) : chunk;
      const line = formatLogLine({
        context: input.context,
        message: cleanMessage,
        stream: input.stream,
        timestamp: input.timestamp,
      });
      return hasLineBreak ? `${line}\n` : line;
    })
    .join("");
}

/**
 * Write a log message to the console with the appropriate level and formatting.
 * Depending on the log level, the message will be printed to the console using console.debug, console.info, console.warn, or console.error.
 * @param input
 */
export function writeConsoleLog(input: WriteConsoleLogInput) {
  const output = formatLogChunk(input).trimEnd();
  const logLevel = input.level || "info";

  if (!output && !input.error) return;

  const consoleFn =
    logLevel === "debug"
      ? console.debug
      : logLevel === "warn"
      ? console.warn
      : logLevel === "error"
      ? console.error
      : console.info;

  if (input.error) {
    consoleFn(`${output}\n${stringifyError(input.error)}`.trim());
    return;
  }

  consoleFn(output);
}

/**
 * This function creates a logger with the specified context. It provides methods for logging at different levels (debug, info, warn, error).
 * @param context
 */
export function createLogger(context: string): ContextLogger {
  const write = (level: LogLevel, message: string, meta?: Omit<WriteConsoleLogInput, "context" | "message" | "level">) => {
    writeConsoleLog({
      context,
      message,
      level,
      stream: meta?.stream,
      timestamp: meta?.timestamp,
      error: meta?.error,
    });
  };

  return {
    debug: (message, meta) => write("debug", message, meta),
    info: (message, meta) => write("info", message, meta),
    warn: (message, meta) => write("warn", message, meta),
    error: (message, meta) => write("error", message, meta),
    formatChunk: (message, stream, timestamp) =>
      formatLogChunk({
        context,
        message,
        stream,
        timestamp,
      }),
  };
}

