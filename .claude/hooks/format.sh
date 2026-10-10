#!/usr/bin/env bash
# PostToolUse hook: formats the files Claude Code edits and reports the lint problems ESLint could not
# fix back to Claude (exit 2), so the agent fixes them before moving on.
file=$(node -e 'let input = ""; process.stdin.on("data", (chunk) => (input += chunk)).on("end", () => process.stdout.write(JSON.parse(input).tool_input?.file_path ?? ""))')
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
[[ -n "$file" && -f "$file" ]] || exit 0

npx --no-install prettier --write --ignore-unknown --log-level warn "$file"
[[ "$file" == *.ts ]] || exit 0

if ! lint=$(npx --no-install eslint --fix --max-warnings 0 "$file" 2>&1); then
  echo "ESLint found problems it could not fix automatically in $file:" >&2
  echo "$lint" >&2
  exit 2
fi
