export class SocketSyncPayloadValidationError extends Error {
    constructor(message: string | undefined) {
        super(message);
        this.name = "SocketSyncPayloadValidationError";
        //this.statusCode = 400;
    }
}

function isPlainObject(value:any) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateRequiredString(value:string, propertyName:string) {
    if (typeof value !== "string" || value.trim() === "") {
        throw new SocketSyncPayloadValidationError(`${propertyName} is required and must be a non-empty string`);
    }

    return value.trim();
}

export function validateSyncEmitPayload(payload:Payload) {
    if (!isPlainObject(payload)) {
        throw new SocketSyncPayloadValidationError("payload must be an object");
    }

    const room = validateRequiredString(payload.room, "room");
    const event = validateRequiredString(payload.event, "event");

    if (payload.message !== undefined && payload.message !== null && typeof payload.message !== "string") {
        throw new SocketSyncPayloadValidationError("message must be a string when provided");
    }

    if (payload.meta !== undefined && payload.meta !== null && !isPlainObject(payload.meta)) {
        throw new SocketSyncPayloadValidationError("meta must be an object when provided");
    }

    return {
        ...payload,
        room,
        event
    };
}

interface data {
    text: string;
    clientId?: string;
    room?: string;
    sentAt?: string;
    cell?: string;
}

export interface Payload
{
    room: string;
    event: 'sync:change' | 'sync:refresh';
    message?: string;
    meta?: Record<string, unknown>;
    data: data;
}

export const emitChangeService = async (payload:Payload) => {
    const serverUrl = process.env.SOCKET_SYNC_SERVER_URL || "http://localhost:3016";
    const validatedPayload = validateSyncEmitPayload(payload);

    try {
        return await fetch(`${serverUrl}/api/v1/sync/emit`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(validatedPayload)
        });
    }catch (e) {
        throw e
    }
}
