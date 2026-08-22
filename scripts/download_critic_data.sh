#!/usr/bin/env bash
set -euo pipefail

archive="data/downloads/rotten-tomatoes-2025-v1.zip"
destination="data/raw/rotten-tomatoes-2025-v1"
source_file="$destination/rotten_tomatoes_movies_2025.csv"
url="https://www.kaggle.com/api/v1/datasets/download/crawlfeeds/rotten-tomatoes-movies-1000-films-dataset-2024"
expected_archive_sha256="05a770d8c5198ae0ed5268810b9895e7680a6a0914ced456be6b4b0acc5c28de"
expected_file_sha256="0cd4d951bb4c12713e554dec4279310fe2cbba0388a1516fdef079a80e082753"

sha256_file() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    sha256sum "$1" | awk '{print $1}'
  fi
}

mkdir -p "$(dirname "$archive")" "$destination"
curl --fail --location "$url" --output "$archive"

actual_archive_sha256="$(sha256_file "$archive")"
if [[ "$actual_archive_sha256" != "$expected_archive_sha256" ]]; then
  echo "Critic archive checksum changed; audit the new version before using it." >&2
  exit 1
fi

unzip -o "$archive" -d "$destination"
actual_file_sha256="$(sha256_file "$source_file")"
if [[ "$actual_file_sha256" != "$expected_file_sha256" ]]; then
  echo "Critic CSV checksum changed; audit the new file before using it." >&2
  exit 1
fi

python3 scripts/build_critic_outcomes.py
