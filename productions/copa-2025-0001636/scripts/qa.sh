#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
case "${1:?Expected geo or reconstruction}" in
  geo) name=Chicago_Geographic_Location ;;
  reconstruction) name=Hubbard_Case_2D_Reconstruction ;;
  *) exit 2 ;;
esac
scan="qa/$1-blackdetect.log"
ffmpeg -hide_banner -nostats -threads 2 -filter_threads 1 -v info -i "renders/$name.mp4" \
  -vf 'blackdetect=d=0.07:pix_th=0.10:pic_th=0.985' -an -f null - 2>"$scan"
if rg -q 'black_start:' "$scan"; then
  rg 'black_start:' "$scan"
  exit 1
fi
printf '%s: whole-stream decode and black-frame check passed\n' "$name"
