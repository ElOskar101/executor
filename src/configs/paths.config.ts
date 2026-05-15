import path from "node:path";

export default {
    logsFolder: path.resolve(process.cwd(), 'logs'),
    logFilename: (jobId:string)=> path.resolve(process.cwd(), `logs/${jobId}.log`),
    reportPath: (jobId:string) => path.resolve(process.cwd(), `reports/${jobId}`),
}