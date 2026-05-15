module.exports = {
  apps: [
    {
      name: "executor-api",
      script: "dist/src/server.js",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "executor-worker",
      script: "dist/src/workers/playwright.worker.js",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
