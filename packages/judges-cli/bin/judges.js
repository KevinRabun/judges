#!/usr/bin/env node

import { runCli } from "../dist/cli.js";

runCli(process.argv).catch((error) => {
  console.error("CLI error:", error);
  process.exit(1);
});