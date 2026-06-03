import {buildDateRangeQuery} from "./dates";
import {ParsedQs} from "qs";

type RawQueryValue = string | ParsedQs | (string | ParsedQs)[] | undefined;

type SupportedQueryParam = "by" | "client" | "clinic" | "execution" | "bot" | "from" | "to" | "dateField" | "status";

const SUPPORTED_QUERY_PARAMS: Set<SupportedQueryParam> = new Set([
    "by",
    "client",
    "clinic",
    "execution",
    "bot",
    "from",
    "to",
    "dateField",
    "status"
]);

export interface Query {
    by?: string[];
    client?: string[];
    clinic?: string[];
    status?: string[];
    execution?: string[];
    bot?: string[];
    from?: Date;
    to?: Date;
    dateField?: string;
}

type MongoQuery = Record<string, unknown>;

export const createQuery = async (rawQuery: ParsedQs = {}): Promise<MongoQuery> => {
    try{
        let query: MongoQuery = {};
        const r = transformQuery(rawQuery);

        if (r["by"])
            query = addParams(query, {createdBy: r.by});

        if (r["client"])
            query = addParams(query, {client: r.client});

        if (r["status"])
            query = addParams(query, {status: r.status});

        if (r["clinic"])
            query = addParams(query, {clinic: r.clinic});

        if (r["execution"]) {
            query = addParams(query, {execution: r.execution});
        }
        if (r["bot"])
            query = addParams(query, {botName: r["bot"][0]});

        if ((r.from && !r.to) || (r.from && r.to))
            query = addParams(query, buildDateRangeQuery(r.from, r.to, r.dateField) as MongoQuery);

        return query;

    }catch (e) {
        if (e instanceof Error) {
            throw new Error(e.message);
        }
        throw new Error("Unable to create query from request parameters");
    }
}

function addParams(query: MongoQuery, params: MongoQuery): MongoQuery {
    return { ...query, ...params };
}

/**
 * Validates supported query params and converts req.query into strongly typed values.
 */
export const transformQuery = (rawQuery: ParsedQs): Query => {
    const query = rawQuery as Record<string, RawQueryValue>;
    const filteredQuery = Object.fromEntries(
        Object.entries(query).filter(([key]) => SUPPORTED_QUERY_PARAMS.has(key as SupportedQueryParam))
    ) as Partial<Record<SupportedQueryParam, RawQueryValue>>;

    return {
        by: toStringArray(filteredQuery.by, "by"),
        client: toStringArray(filteredQuery.client, "client"),
        clinic: toStringArray(filteredQuery.clinic, "clinic"),
        execution: toStringArray(filteredQuery.execution, "execution"),
        bot: toStringArray(filteredQuery.bot, "bot"),
        from: toDate(filteredQuery.from, "from"),
        to: toDate(filteredQuery.to, "to"),
        dateField: toSingleString(filteredQuery.dateField, "dateField"),
        status: toStringArray(filteredQuery.status, "status")
    };
};

function toStringArray(value: RawQueryValue, key: string): string[] | undefined {
    const values = normalizeRawValue(value, key);
    if (!values) {
        return undefined;
    }

    return values.flatMap((item) => item.split(",")).map((item) => item.trim()).filter(Boolean);
}

function toSingleString(value: RawQueryValue, key: string): string | undefined {
    const values = normalizeRawValue(value, key);
    if (!values || values.length === 0) {
        return undefined;
    }

    if (values.length > 1) {
        throw new Error(`Query parameter '${key}' only accepts one value`);
    }

    return values[0].trim();
}

function toDate(value: RawQueryValue, key: string): Date | undefined {
    const dateInput = toSingleString(value, key);
    if (!dateInput) {
        return undefined;
    }

    const parsedDate = new Date(dateInput);
    if (Number.isNaN(parsedDate.getTime())) {
        throw new Error(`Query parameter '${key}' must be a valid date`);
    }

    return parsedDate;
}

function normalizeRawValue(value: RawQueryValue, key: string): string[] | undefined {
    if (value === undefined) {
        return undefined;
    }

    const valueList = Array.isArray(value) ? value : [value];
    const normalized: string[] = [];

    for (const entry of valueList) {
        if (typeof entry !== "string") {
            throw new Error(`Query parameter '${key}' must be a string`);
        }
        normalized.push(entry);
    }

    return normalized;
}
