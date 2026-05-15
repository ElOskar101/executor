const DEFAULT_PROJECTS = ["cigna", "aetna", "shared"];

export function getAllowedPlaywrightProjects(): string[] {
    return (process.env.ALLOWED_PLAYWRIGHT_PROJECTS || DEFAULT_PROJECTS.join(","))
        .split(",")
        .map((project) => project.trim())
        .filter(Boolean);
}

export function assertAllowedPlaywrightProject(project: string) {
    const allowedProjects = getAllowedPlaywrightProjects();

    if (!allowedProjects.includes(project)) {
        throw new Error(`Project "${project}" is not allowed. Allowed projects: ${allowedProjects.join(", ")}`);
    }
}

export function getPlaywrightRootFolder() {
    const playwrightFolder = process.env.PLAYWRIGHT_PROJECT_ROOT_FOLDER;

    if (!playwrightFolder) {
        throw new Error("PLAYWRIGHT_PROJECT_ROOT_FOLDER is not configured");
    }

    return playwrightFolder;
}
