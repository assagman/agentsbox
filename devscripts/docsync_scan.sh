#!/usr/bin/env bash
set -euo pipefail

require_cmd() {
    local cmd="$1"
    if ! command -v "$cmd" >/dev/null 2>&1; then
        echo "Error: '$cmd' not found in PATH" >&2
        exit 1
    fi
}

# External deps used by this script
require_cmd fd
require_cmd jq
require_cmd rg
require_cmd git

# Helper to convert stdin lines to JSON array
to_json_array() {
    # Read all input
    local content
    content=$(cat)
    if [[ -z "$content" ]]; then
        echo "[]"
    else
        # Process content: treat as lines, convert to JSON string, slurp into array
        echo "$content" | jq -R . | jq -s .
    fi
}

# Helper to convert file content to JSON string (null if missing)
file_to_string() {
    if [[ -f "$1" ]]; then
        jq -R -s '.' "$1"
    else
        echo "null"
    fi
}

TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

# 1. Docs files
fd -e md -e rst -e txt --type f . | head -50 | to_json_array > "$TEMP_DIR/docs_files.json"

# 2. Docs dirs
fd -t d -g '*doc*' . | to_json_array > "$TEMP_DIR/docs_dirs.json"

# 3. Docs config
{
  fd -g 'mkdocs.yml' . || true
  fd -g 'docusaurus.config.*' . || true
  fd -H -g '.readthedocs.yml' . || true
} | sort -u | to_json_array > "$TEMP_DIR/docs_config.json"

# 4. Structure
fd -t f --max-depth 3 . | head -100 | to_json_array > "$TEMP_DIR/structure.json"

# 5. Entrypoints (Removed by user request)
# (rg -l "^export|^module\\.exports|^pub fn|^func |^def " --type-add 'code:*.{ts,js,go,rs,py}' -t code . 2>/dev/null || true) | to_json_array > "$TEMP_DIR/entrypoints.json"
echo "[]" > "$TEMP_DIR/entrypoints.json"


# 6. Deps
# Package.json specific parts
if [[ -f package.json ]]; then
    jq '{dependencies, devDependencies}' package.json > "$TEMP_DIR/pkg_deps.json" 2>/dev/null || echo "{}" > "$TEMP_DIR/pkg_deps.json"
else
    echo "{}" > "$TEMP_DIR/pkg_deps.json"
fi

file_to_string go.mod > "$TEMP_DIR/go_mod.json"
file_to_string Cargo.toml > "$TEMP_DIR/cargo_toml.json"
file_to_string requirements.txt > "$TEMP_DIR/requirements.txt.json"
file_to_string pyproject.toml > "$TEMP_DIR/pyproject.toml.json"

# 7. Scripts
# Makefile targets
(cat Makefile 2>/dev/null | rg '^[a-zA-Z_-]+:' || true) | to_json_array > "$TEMP_DIR/makefile_targets.json"

# Package.json scripts
if [[ -f package.json ]]; then
    jq '.scripts // {}' package.json > "$TEMP_DIR/pkg_scripts.json" 2>/dev/null || echo "{}" > "$TEMP_DIR/pkg_scripts.json"
else
    echo "{}" > "$TEMP_DIR/pkg_scripts.json"
fi

# 8. Config files
fd -g '*.{yaml,yml,toml,ini,env.example,json,jsonc}' --max-depth 2 . | to_json_array > "$TEMP_DIR/config_files.json"

# 9. Recent changes
last_doc_ts=$(git log -1 --format=%ci -- '*.md' 2>/dev/null || true)
if [[ -n "${last_doc_ts}" ]]; then
  (git log --oneline --since="${last_doc_ts}" -- ':!*.md' 2>/dev/null | head -30 || true) | to_json_array > "$TEMP_DIR/recent_changes.json"
else
  echo "[]" > "$TEMP_DIR/recent_changes.json"
fi

# Assemble final JSON
jq -n \
  --slurpfile docs_files "$TEMP_DIR/docs_files.json" \
  --slurpfile docs_dirs "$TEMP_DIR/docs_dirs.json" \
  --slurpfile docs_config "$TEMP_DIR/docs_config.json" \
  --slurpfile structure "$TEMP_DIR/structure.json" \
  --slurpfile pkg_deps "$TEMP_DIR/pkg_deps.json" \
  --slurpfile go_mod "$TEMP_DIR/go_mod.json" \
  --slurpfile cargo_toml "$TEMP_DIR/cargo_toml.json" \
  --slurpfile requirements "$TEMP_DIR/requirements.txt.json" \
  --slurpfile pyproject "$TEMP_DIR/pyproject.toml.json" \
  --slurpfile makefile_targets "$TEMP_DIR/makefile_targets.json" \
  --slurpfile pkg_scripts "$TEMP_DIR/pkg_scripts.json" \
  --slurpfile config_files "$TEMP_DIR/config_files.json" \
  --slurpfile recent_changes "$TEMP_DIR/recent_changes.json" \
  '{
    docs: {
      files: $docs_files[0],
      dirs: $docs_dirs[0],
      config: $docs_config[0]
    },
    structure: $structure[0],
    deps: {
      package_json: $pkg_deps[0],
      go_mod: $go_mod[0],
      cargo_toml: $cargo_toml[0],
      requirements_txt: $requirements[0],
      pyproject_toml: $pyproject[0]
    },
    scripts: {
      makefile: $makefile_targets[0],
      package_json: $pkg_scripts[0]
    },
    config_files: $config_files[0],
    recent_changes: $recent_changes[0]
  }'
