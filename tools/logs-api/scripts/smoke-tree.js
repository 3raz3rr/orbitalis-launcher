#!/usr/bin/env node
const path = require("path");
const root = "/opt/orbitalis/logs-api";
process.env.LOGS_ROOT =
  process.env.LOGS_ROOT || "/opt/ss13/Configuration/GameStaticFiles/data/logs";
const { buildTree } = require(path.join(root, "lib", "fsTree"));
const t = buildTree();
console.log(
  JSON.stringify(
    {
      years: (t.years || []).slice(0, 3),
      year: t.year,
      month: t.month,
      day: t.day,
      round: t.round,
      fileCount: (t.files || []).length,
      files: (t.files || []).slice(0, 8).map((f) => f.label),
    },
    null,
    2
  )
);
