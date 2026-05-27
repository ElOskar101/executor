import assert from "node:assert/strict";
import test from "node:test";

import { formatLogChunk, formatLogLine } from "../src/libs/logger";

test("formatLogLine uses timestamp, context, stream and message", () => {
  const line = formatLogLine({
	timestamp: "2026-05-27T12:00:00.000Z",
	context: "playwright.worker",
	stream: "stdout",
	message: "hello",
  });

  assert.equal(line, "2026-05-27T12:00:00.000Z [playwright.worker] [stdout] hello");
});

test("formatLogChunk preserves multiline messages line by line", () => {
  const chunk = formatLogChunk({
	timestamp: "2026-05-27T12:00:00.000Z",
	context: "playwright.worker",
	stream: "stderr",
	message: "line1\nline2\n",
  });

  assert.equal(
	chunk,
	"2026-05-27T12:00:00.000Z [playwright.worker] [stderr] line1\n2026-05-27T12:00:00.000Z [playwright.worker] [stderr] line2\n",
  );
});

