#!/usr/bin/env bash
set -euo pipefail

bash scripts/download_kaggle_data.sh
bash scripts/download_critic_data.sh
python3 scripts/verify_data_cache.py
