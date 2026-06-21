// RTK constants: caps and thresholds.
export const RAW_CAP = 10 * 1024 * 1024; // 10 MiB
export const MIN_COMPRESS_SIZE = 500; // bytes; skip tiny blobs
export const DETECT_WINDOW = 1024; // autodetect peeks first N chars
export const GIT_DIFF_HUNK_MAX_LINES = 100; // per-hunk line cap
export const GIT_DIFF_CONTEXT_KEEP = 3; // context lines around changes
export const DEDUP_LINE_MAX = 2000; // dedupLog truncation cap

// Per-command output caps (full profile defaults)
export const GREP_PER_FILE_MAX = 10; // max matches shown per file
export const FIND_PER_DIR_MAX = 10; // max files shown per dir
export const FIND_TOTAL_DIR_MAX = 20; // max dirs shown total

// Raised caps for "safe" profile (coding-agent clients): avoid false capping
// when an agent relies on complete results to plan edits.
export const GREP_PER_FILE_MAX_SAFE = 50;
export const FIND_PER_DIR_MAX_SAFE = 50;
export const FIND_TOTAL_DIR_MAX_SAFE = 100;

// git status caps
export const STATUS_MAX_FILES = 10; // max staged/modified files listed
export const STATUS_MAX_UNTRACKED = 10; // max untracked files listed

// ls compaction
export const LS_EXT_SUMMARY_TOP = 5; // top-N extensions in summary
export const LS_NOISE_DIRS = [
  "node_modules",
  ".git",
  "target",
  "__pycache__",
  ".next",
  "dist",
  "build",
  ".cache",
  ".turbo",
  ".vercel",
  ".pytest_cache",
  ".mypy_cache",
  ".tox",
  ".venv",
  "venv",
  "env", // Python legacy virtualenv; .env (dotenv) intentionally excluded
  "coverage",
  ".nyc_output",
  ".DS_Store",
  "Thumbs.db",
  ".idea",
  ".vscode",
  ".vs",
  "*.egg-info",
  ".eggs",
];

// tree output cap (safeguard against very large trees)
export const TREE_MAX_LINES = 200;

// Cursor Glob "Result of search in '...' (total N files):" list
export const SEARCH_LIST_PER_DIR_MAX = 10;
export const SEARCH_LIST_TOTAL_DIR_MAX = 20;
// Raised caps for "safe" profile (coding-agent clients).
export const SEARCH_LIST_PER_DIR_MAX_SAFE = 50;
export const SEARCH_LIST_TOTAL_DIR_MAX_SAFE = 100;

// Smart truncate fallback
export const SMART_TRUNCATE_HEAD = 120; // lines kept from top
export const SMART_TRUNCATE_TAIL = 60; // lines kept from bottom
export const SMART_TRUNCATE_MIN_LINES = 250; // only kick in above this

// readNumbered (files with "  N|content" lines, e.g. Cursor read_file)
export const READ_NUMBERED_MIN_HIT_RATIO = 0.7;

// Filter name strings
export const FILTERS = {
  GIT_DIFF: "git-diff",
  GIT_STATUS: "git-status",
  GIT_LOG: "git-log",
  GREP: "grep",
  FIND: "find",
  LS: "ls",
  TREE: "tree",
  DEDUP_LOG: "dedup-log",
  SMART_TRUNCATE: "smart-truncate",
  READ_NUMBERED: "read-numbered",
  SEARCH_LIST: "search-list",
  BUILD_OUTPUT: "build-output",
};
