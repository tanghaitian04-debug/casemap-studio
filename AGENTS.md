# Codex instructions — CaseMap Studio

This is a real, working static web editor + Python/FFmpeg video renderer. Read README.md and examples/demo.json before editing.

## Primary task

When a user supplies a case description, create or update `examples/case.json` to tell the story using the V1 schema. Keep all map coordinates normalized [0,1], all times in seconds, and preserve compatibility with both `engine.js` and `render.py`.

## Critical accuracy rules

- Distinguish verified facts from illustrative reconstruction. Do not invent exact locations, timestamps, routes, identities, shot directions, or sequences when not provided or sourced.
- If the user has not supplied lawful map imagery, use the bundled fictional demo map and explicitly label it fictional. Never claim it is an actual case location.
- Keep `案件过程示意动画 · 非真实现场画面` visible in output.
- Do not scrape Google Earth or other copyrighted map services or remove attributions.
- Never copy another creator's original footage, likenesses, or map screenshots without rights.
- Keep the map credit accurate and editable.

## Implementation rules

- Never change an unrelated GitHub repository, DNS record, or existing deployment.
- Preserve V1 JSON keys and backward compatibility. For schema changes, update both renderers and tests.
- Prefer using `examples/demo.json` as a template; add actors and events only for events supported by the supplied case facts.
- If a user asks for natural-language automation, Codex should create the JSON directly; do not claim the webpage itself is connected to an LLM API.
- Use provided local assets only; don't embed API keys or external map service tokens in the frontend.

## Validation before commit

```bash
python -m pip install -r requirements.txt
python render.py --project examples/case.json --check
python render.py --project examples/case.json --preview 8 --output out/case-preview.png
pytest -q
```

For full render: `python render.py --project examples/case.json --output out/case-map.mp4`.

Explain any missing map images, portraits, timecodes, or other inputs. GitHub Actions `Render CaseMap MP4` exports the MP4 as a workflow artifact.
