import path from "node:path";

export default {
    reportPath: (jobId:string) => path.resolve(process.cwd(), `reports/${jobId}`),
}