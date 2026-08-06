# Image Scraper Extension

Automatically extract text from images when the active model has no native vision support.

## What it does

When a user attaches images to a prompt but the active model cannot process images natively, this extension:

1. Detects that the model has no vision capability
2. Writes the attached images to temporary files
3. Runs IBM Unstructured OCR on each image via a Python worker
4. Injects the extracted text into the prompt with clear `[Image: filename]` tags
5. Strips raw image bytes so the text-only model never sees them

The main model receives enriched text input, not binary image data.

## Example output

```
[Image-extracted text from attached images (non-vision model fallback):]
[Image: screenshot.png]
Error: Connection refused at localhost:3000
Stack trace: ...

[End of image-extracted text. Re-examine any image with vision_analyze if needed.]

<original user prompt here>
```

## Requirements

- Python 3.10+ with `unstructured[all]` installed
- IBM Unstructured handles PDF, images, Word, HTML, and 60+ formats

Install Unstructured:

```bash
pip install unstructured[all]
```

Or for lighter install:

```bash
pip install unstructured[pdf,image]
```

## Configuration

No configuration needed. The extension is built-in and auto-activates when:
- The active model has no `image` in its input capabilities
- The user prompt includes attached images

## UI Feedback

When OCR runs, the status bar shows:
- Status key: `image-scraper` with count of images being processed
- Animated working indicator: 👁  reading / 👁  reading. / 👁  reading.. / 👁  reading...

## Architecture

```
User prompt with images
    │
    ▼
before_agent_start event
    │
    ▼
image-scraper extension
    │
    ├─ Model has vision? → Skip (images pass through natively)
    │
    └─ No vision:
        ├─ Write images to ~/.porcupine/image-scraper/tmp/
        ├─ Spawn Python worker (process.execPath + worker.py)
        ├─ Worker runs: unstructured.partition.auto.partition()
        ├─ Returns JSON: [{path, text}, ...]
        ├─ Build enriched prompt with [Image: filename] tags
        └─ Return { prompt: enrichedPrompt }
            │
            ▼
        agent-session.ts patches user message
            │
            ▼
        Main model receives text-only prompt
```

## Dependencies

- **IBM Unstructured** (`unstructured` PyPI package) — document/image partitioning
- **Python worker script** — cached at `~/.porcupine/image-scraper/worker.py`

## Limitations

- Images are written to disk as temporary files (base64 decoded first)
- OCR quality depends on Unstructured's model selection per format
- 60-second timeout per image batch
- Embedded base64 images without a local path get a placeholder note

## See also

- `docs/extensions.md` — `before_agent_start` event documentation
- Hermes `_preprocess_images_with_vision` — equivalent pre-processing pattern
- IBM Unstructured docs: https://docs.unstructured.io
