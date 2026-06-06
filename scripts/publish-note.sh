#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: scripts/publish-note.sh /path/to/note.md [slug]"
  exit 1
fi

note_path="$1"
if [ ! -f "$note_path" ]; then
  echo "Note not found: $note_path"
  exit 1
fi

date_value="${DATE:-$(date +%F)}"
title_value="$(basename "$note_path" .md)"

if [ "$#" -ge 2 ]; then
  slug="$2"
else
  slug="$(printf "%s" "$title_value" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//')"
fi

if [ -z "$slug" ]; then
  echo "Could not infer a URL slug. Pass one explicitly, for example: scripts/publish-note.sh note.md rlhf-notes"
  exit 1
fi

target="_posts/${date_value}-${slug}.md"

if [ -e "$target" ]; then
  echo "Target already exists: $target"
  exit 1
fi

first_line="$(head -n 1 "$note_path")"
if [ "$first_line" = "---" ]; then
  cp "$note_path" "$target"
else
  {
    printf -- "---\n"
    printf "layout: post\n"
    printf "title: \"%s\"\n" "$title_value"
    printf "date: %s\n" "$date_value"
    printf "categories: [Research Notes]\n"
    printf "tags: []\n"
    printf "summary: \"\"\n"
    printf -- "---\n\n"
    cat "$note_path"
  } > "$target"
fi

echo "Published draft: $target"
