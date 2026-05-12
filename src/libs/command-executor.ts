import { exec, spawn } from "node:child_process";
import { promisify } from 'util';
import path from "node:path";

const execAsync = promisify(exec);

/**
 * Validates that a project exists in the Playwright configuration
 * @param projectName - The name of the project to validate
 * @param playwrightFolder - Path to the Playwright root folder
 * @returns true if a project exists, false otherwise
 */
export const validateProjectExists = async (projectName: string, playwrightFolder: string): Promise<boolean> => {
    try {
        // Use exec to run a command that extracts project names from playwright.config.ts
        const command = `node ${path.resolve(__dirname, '../scripts/check-playwright-project.js')} ${projectName}`;

        console.info(`Searching at ${playwrightFolder} for project: ${projectName}`);
        const { stdout } = await execAsync(command, { shell: '/bin/bash', maxBuffer: 10 * 1024 * 1024 });
        console.info(`Results for ${projectName}:\n${stdout}`);

        const projectNames = stdout
            .split('\n')
            .filter(line => line.trim().length > 0)
            .map(line => line.trim());

        return projectNames.includes(projectName);
    } catch (error) {
        console.error(`Error validating project: ${error}`);
        return false;
    }
};

export const runPlaywrightProject = async (projectName: string, workers: number, retries: number, headed: boolean) => {
    const playwrightFolder = process.env.PLAYWRIGHT_PROJECT_ROOT_FOLDER || 'playwright';
    const command = `cd "${playwrightFolder}"; npxd playwright test --project=${projectName} --workers=${workers} --retries=${retries} ${headed ? '--headed':''}`;
    return spawn(command, { shell: '/bin/bash'});
};

export const stopPlaywrightExecution = async (serviceId: string) => {
    return spawn(`kill -9 ${serviceId}`, { shell: '/bin/bash', stdio: 'inherit' });
};

export const getPlaywrightExecutions = async () => {

}

