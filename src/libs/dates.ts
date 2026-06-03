/**
 * Gets current date and hour
 * @returns { string } Date and hour in format "YYYY-MM-DD HH:mm:ss"
 */
export const currentDateFormatted:()=>string = ():string => {
    const now = new Date();
    const date = now.toLocaleDateString("es-MX");
    const time = now.toLocaleTimeString("es-MX", { hour12: false });
    return `${date} ${time}`;
}

/**
 * Generates a Mongoose query to find documents within a date range
 * @param {Date} startDate - Start date of the range
 * @param {Date} endDate - End date of the range
 * @param {String} dateField - Date field in the collection (default: 'createdAt')
 * @returns {Object} Mongoose query
 */

export const buildDateRangeQuery = (
    startDate: Date = new Date(),
    endDate: Date|null = null,
    dateField: string = 'createdAt'
): object => {
    const start = new Date(startDate);

    const durationADay = (24 * 60 * 60 * 1000) - 1;
    const end = endDate ? new Date(endDate) : new Date(start.getTime() + durationADay);

    return {
        [dateField]: {
            $gte: start,
            $lte: end
        }
    };
};