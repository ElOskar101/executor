const config = require('/home/oscar/WebstormProjects/playwright_test/playwright.config.ts');

const projectName = process.argv[2];

const exists = config.projects?.some(
    p => p.name === projectName
);

process.exit(exists ? 0 : 1);