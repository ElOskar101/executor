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