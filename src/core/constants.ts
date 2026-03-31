export const HARNESS_DIRNAME = ".harness";
export const INTERVIEW_THRESHOLD = 0.2;
export const MAX_REPEATED_FAILURES = 3;
export const MAX_AUTO_REOPENS = 2;

export const GREENFIELD_WEIGHTS = {
  goal: 0.4,
  constraints: 0.3,
  criteria: 0.3,
  context: 0
} as const;

export const BROWNFIELD_WEIGHTS = {
  goal: 0.35,
  constraints: 0.25,
  criteria: 0.25,
  context: 0.15
} as const;

export const ARCHITECT_WEIGHTS = {
  domain_scope: 0.2,
  work_units: 0.25,
  team_topology: 0.2,
  verification_strategy: 0.25,
  user_operating_style: 0.1
} as const;

export const SNAPSHOT_IGNORE_DIRS = new Set([
  ".git",
  ".harness",
  "node_modules",
  "dist",
  "coverage"
]);

export const BROWNFIELD_IGNORE_DIRS = new Set([
  ".git",
  ".harness",
  "node_modules",
  "dist",
  "coverage",
  "references"
]);
