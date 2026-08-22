#!/usr/bin/env bash
set -euo pipefail

archive="data/downloads/tmdb-comprehensive-v1.zip"
destination="data/raw/tmdb-comprehensive-v1"
url="https://www.kaggle.com/api/v1/datasets/download/rishabhkumar2003/the-movie-database-tmdb-comprehensive-dataset"
expected_sha256="395888227be599a3181084bda47defe38be5e6198f12c6e76656c0a39d6bf3a7"

mkdir -p "$(dirname "$archive")" "$destination"
curl --fail --location "$url" --output "$archive"

actual_sha256="$(shasum -a 256 "$archive" | awk '{print $1}')"
if [[ "$actual_sha256" != "$expected_sha256" ]]; then
  echo "Dataset archive checksum changed; expected v1 $expected_sha256 but received $actual_sha256." >&2
  echo "Audit the new Kaggle version before rebuilding the checked-in cache." >&2
  exit 1
fi

unzip -o "$archive" -d "$destination"

python3 scripts/build_historical_model.py --source-dir "$destination"
