import {spawn, ChildProcessByStdio} from "node:child_process";
import path from "node:path";
import {Readable} from "node:stream";

/**
 * Validates that a project exists in the Playwright configuration
 * @param projectName - The name of the project to validate
 * @param playwrightFolder - Path to the Playwright root folder
 * @returns true if a project exists, false otherwise
 */
export const validateProjectExists = async (projectName: string, playwrightFolder: string): Promise<boolean> => {
    return new Promise((resolve) => {
        const scriptPath = path.resolve(__dirname, "../scripts/check-playwright-project.js");
        const child = spawn("node", [scriptPath, projectName], {
            cwd: playwrightFolder,
            shell: false,
            stdio: ["ignore", "pipe", "pipe"],
        });

        let stdout = "";

        child.stdout.on("data", (data) => {
            stdout += data.toString();
        });

        child.on("error", () => resolve(false));
        child.on("close", () => {
            const projectNames = stdout
                .split("\n")
                .filter((line) => line.trim().length > 0)
                .map((line) => line.trim());

            resolve(projectNames.includes(projectName));
        });
    });
};

/*export const runPlaywrightProject = async (projectName: string, workers: number, retries: number, headed: boolean) => {
    const playwrightFolder = process.env.PLAYWRIGHT_PROJECT_ROOT_FOLDER || 'playwright';
    const command = `cd "${playwrightFolder}"; npx playwright test --project=${projectName} --workers=${workers} --retries=${retries} ${headed ? '--headed':''}`;
    return spawn(command, { shell: '/bin/bash'});
};
*/

export const stopPlaywrightExecution = async (serviceId: string) => {
    return spawn("kill", ["-TERM", serviceId], { shell: false, stdio: "inherit" });
};

export const getPlaywrightExecutions = async () => {

}



export type RunOptions = {
    project: string;
    workers: number;
    retries: number;
    headed: boolean;
    playwrightFolder: string;
};

export function runPlaywrightProject({
                                         project,
                                         workers,
                                         retries,
                                         headed,
                                         playwrightFolder
                                     }: RunOptions): ChildProcessByStdio<null, Readable, Readable> {
    const safeWorkers = Math.max(1, Math.min(Number(workers) || 1, Number(process.env.MAX_PLAYWRIGHT_WORKERS || 8)));
    const safeRetries = Math.max(0, Math.min(Number(retries) || 0, Number(process.env.MAX_PLAYWRIGHT_RETRIES || 3)));
    const args = [
        "playwright",
        "test",
        `--project=${project}`,
        `--workers=${safeWorkers}`,
        `--retries=${safeRetries}`,
        ...(headed ? ["--headed"] : []),
    ];

    return spawn("npx", args, {
        cwd: playwrightFolder,
        shell: false, // prevents shell injection
        stdio: ["ignore", "pipe", "pipe"],
    });
}
