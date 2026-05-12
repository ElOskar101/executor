import { Response } from "express";

import httpCodes from "../configs/codes-config";
import { currentDateFormatted } from "./dates";

type MessageResponse = {
    message: string;
};

type ErrorLike = {
    message?: string;
    stack?: string;
};

type CountQuery = {
    count: () => Promise<number>;
};

type PaginationModel<TQuery extends Record<string, unknown>> = {
    find: (query?: TQuery, projection?: unknown, options?: unknown) => CountQuery;
};

const normalizeError = (error: unknown): ErrorLike => {
    if (error instanceof Error) {
        return error;
    }

    if (typeof error === "object" && error !== null) {
        return error as ErrorLike;
    }

    return {
        message: String(error),
        stack: ""
    };
};

/**
 * Specially used on catch or exceptions
 * @param { e } error Error object
 * @param { string } file Name of the file that contains the function
 * @param { string } functionName Name of the function
 * @param { Object } res - Request with username & password in its body.
 * @returns { JSON } Error message.
 */
export const onError = (error: unknown, file: string, functionName: string, res: Response): Response => {
    const { message = "Unknown error", stack = "" } = normalizeError(error);
    const location = stack.split("\n")[1]?.trim() ?? "No stack trace available";
    console.error(`${message} | ${file}.ts > ${functionName}(); | ${currentDateFormatted()} \n ${location} `);
    return res.status(httpCodes.INTERNAL_SERVER_ERROR_N).send(error);
}

export const onNotFound = (message: string, res: Response<MessageResponse>): Response<MessageResponse> => {
    //if (!message.toLowerCase().includes('profile picture')) console.error(message);
    return res.status(httpCodes.NOT_FOUND).send({ message: message });
}

export const onSuccess = <T>(data: T, res: Response<T>): Response<T> => {
    return res.status(httpCodes.OK).json(data);
}

export const onPartialSuccess = <T>(data: T, res: Response<T>): Response<T> => {
    return res.status(httpCodes.PARTIAL_CONTENT).json(data);
}

export const onSendFile = (data: string, res: Response): void => {
    res.status(httpCodes.OK).sendFile(data);
}

export const onBadRequest = (message: string, res: Response<MessageResponse>): Response<MessageResponse> => {
    console.error(message);
    return res.status(httpCodes.BAD_REQUEST).send({ message: message });
}

export const onUnauthorized = (message: string, res: Response<MessageResponse>): Response<MessageResponse> => {
    console.error(message);
    return res.status(httpCodes.UNAUTHORIZED).send({ message: message });
}

export const onNotAllowed = (message: string, res: Response<MessageResponse>): Response<MessageResponse> => {
    console.error(message);
    return res.status(httpCodes.NOT_ALLOWED).send({ message: message });
}

export const onNotModify = (message: string, res: Response<MessageResponse>): Response<MessageResponse> => {
    console.error(message);
    return res.status(httpCodes.NOT_MODIFIED).send({ message: message });
}

export const createPaginationResponse = async <TQuery extends Record<string, unknown>>(
    model: PaginationModel<TQuery>,
    query: TQuery = {} as TQuery,
    limit: number = 10
): Promise<{ totalDocs: number; totalPages: number }> => {
    const totalDocs = await model.find(query, undefined, undefined).count();
    const totalPages = Math.ceil(totalDocs / limit);

    return {
        totalDocs,
        totalPages,
    }
}



