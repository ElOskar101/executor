import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, chmodSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { runPlaywrightProject } from "../src/libs/command-executor";

const sampleMeta = {
  bot: {
    botName: "eligibility-bot",
    targetUrl: "https://example.test",
    username: "runner",
    password: "secret",
    otherInformation: {}
  },
  patients: [],
  config: {},
  rv: {}
};

function waitForClose(child: ReturnType<typeof runPlaywrightProject>): Promise<number | null> {
  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => resolve(code));
  });
}

test("runPlaywrightProject runs create-context before playwright", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "executor-command-test-"));
  const binFolder = path.join(tempRoot, "bin");
  mkdirSync(binFolder, { recursive: true });

  const playwrightFolder = path.join(tempRoot, "playwright");
  mkdirSync(playwrightFolder, { recursive: true });

  const npxArgsFile = path.join(tempRoot, "npx-args.txt");
  const npxEnvFile = path.join(tempRoot, "npx-env.txt");
  const contextFile = path.join(playwrightFolder, "context.txt");

  const oldPath = process.env.PATH;
  const oldArgsFile = process.env.NPX_ARGS_FILE;
  const oldEnvFile = process.env.NPX_ENV_FILE;

  try {
    writeFileSync(
      path.join(playwrightFolder, "package.json"),
      JSON.stringify(
        {
          name: "playwright-test-fixture",
          private: true,
          scripts: {
            "create-context": "node ./create-context.js"
          }
        },
        null,
        2
      )
    );

    writeFileSync(
      path.join(playwrightFolder, "create-context.js"),
      "const fs=require('node:fs');fs.writeFileSync('context.txt',`RUN_ID=${process.env.RUN_ID}\\nENV=${process.env.ENV}\\n`);\n"
    );

    const fakeNpxScript = `#!/usr/bin/env sh
printf '%s\n' "$@" > "$NPX_ARGS_FILE"
printf 'RUN_ID=%s\nENV=%s\nHTML_PATH=%s\nMETA=%s\n' "$RUN_ID" "$ENV" "$HTML_PATH" "$META" > "$NPX_ENV_FILE"
exit 0
`;

    const fakeNpxPath = path.join(binFolder, "npx");
    writeFileSync(fakeNpxPath, fakeNpxScript);
    chmodSync(fakeNpxPath, 0o755);

    process.env.PATH = `${binFolder}:${oldPath || ""}`;
    process.env.NPX_ARGS_FILE = npxArgsFile;
    process.env.NPX_ENV_FILE = npxEnvFile;

    const child = runPlaywrightProject({
      project: "smoke",
      workers: 2,
      retries: 1,
      headed: true,
      playwrightFolder,
      jobId: "job-123",
      context: sampleMeta
    });

    const code = await waitForClose(child);
    assert.equal(code, 0);

    assert.equal(existsSync(contextFile), true, "create-context script should run first");
    assert.equal(existsSync(npxArgsFile), true, "fake npx should be invoked");

    const args = readFileSync(npxArgsFile, "utf8");
    assert.match(args, /playwright/);
    assert.match(args, /test/);
    assert.match(args, /--project=smoke/);
    assert.match(args, /--workers=2/);
    assert.match(args, /--retries=1/);
    assert.match(args, /--headed/);

    const envInfo = readFileSync(npxEnvFile, "utf8");
    assert.match(envInfo, /RUN_ID=job-123/);
    assert.match(envInfo, /ENV=production/);
    assert.match(envInfo, /HTML_PATH=.*job-123/);
    assert.match(envInfo, /META=.*"botName":"eligibility-bot"/);
  } finally {
    process.env.PATH = oldPath;
    if (oldArgsFile === undefined) delete process.env.NPX_ARGS_FILE;
    else process.env.NPX_ARGS_FILE = oldArgsFile;

    if (oldEnvFile === undefined) delete process.env.NPX_ENV_FILE;
    else process.env.NPX_ENV_FILE = oldEnvFile;

    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("runPlaywrightProject does not run playwright when create-context fails", async () => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "executor-command-test-fail-"));
  const binFolder = path.join(tempRoot, "bin");
  mkdirSync(binFolder, { recursive: true });

  const playwrightFolder = path.join(tempRoot, "playwright");
  mkdirSync(playwrightFolder, { recursive: true });

  const npxArgsFile = path.join(tempRoot, "npx-args.txt");
  const oldPath = process.env.PATH;
  const oldArgsFile = process.env.NPX_ARGS_FILE;

  try {
    writeFileSync(
      path.join(playwrightFolder, "package.json"),
      JSON.stringify(
        {
          name: "playwright-test-fixture",
          private: true,
          scripts: {
            "create-context": "node ./create-context.js"
          }
        },
        null,
        2
      )
    );

    writeFileSync(path.join(playwrightFolder, "create-context.js"), "process.exit(1);\n");

    const fakeNpxScript = `#!/usr/bin/env sh
printf '%s\n' "$@" > "$NPX_ARGS_FILE"
exit 0
`;

    const fakeNpxPath = path.join(binFolder, "npx");
    writeFileSync(fakeNpxPath, fakeNpxScript);
    chmodSync(fakeNpxPath, 0o755);

    process.env.PATH = `${binFolder}:${oldPath || ""}`;
    process.env.NPX_ARGS_FILE = npxArgsFile;

    const child = runPlaywrightProject({
      project: "smoke",
      workers: 1,
      retries: 0,
      headed: false,
      playwrightFolder,
      jobId: "job-124",
      context: sampleMeta
    });

    const code = await waitForClose(child);
    assert.notEqual(code, 0);
    assert.equal(existsSync(npxArgsFile), false, "npx should not run if create-context fails");
  } finally {
    process.env.PATH = oldPath;
    if (oldArgsFile === undefined) delete process.env.NPX_ARGS_FILE;
    else process.env.NPX_ARGS_FILE = oldArgsFile;
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

