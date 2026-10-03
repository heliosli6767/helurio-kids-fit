# HELURIO Kids Fit Studio

A voice-controlled virtual try-on prototype powered by a local decision model and Lucy VTON.

## Demo

[▶ Watch the HELURIO demo video](./Helurio-demo-change%20cloths.mp4)

## How it works

1. Browser speech recognition turns a clothing request into text.
2. Local **StartLux-Decision-4B** selects a typed wardrobe label through `/v1/systemone`.
3. **Lucy Virtual Try-On 3.5** receives the camera stream and garment reference image.
4. The selected top or trousers appears on the live video stream.

StartLux is a structured decision model, not a general-purpose chatbot or GPT replacement. Model weights are not included in this repository.

## Run locally

Start StartLux on port `8090` from your own StartLux-Decision checkout:

```bash
python -m startlux_decision.server \
  --model /path/to/StartLux-Decision-4B \
  --port 8090 \
  --int8
```

Start the local browser bridge:

```bash
python3 startlux-cors-proxy.py
```

Serve the website:

```bash
python3 -m http.server 4173 --directory dist
```

Open <http://127.0.0.1:4173>, enter a Decart API Platform key in **接口设置**, and allow camera and microphone access.

## Security and privacy

- Lucy API keys are entered at runtime and stored only in browser session storage.
- Never commit API keys, model weights, `.env` files, or local virtual environments.
- Enabling Lucy sends the camera stream and garment reference to Decart's service.
- Obtain appropriate consent when a child uses the camera.

## Licensing

The site code in this repository is separate from StartLux model weights and the Decart service. Check each provider's current license and terms before commercial use. The StartLux weights used during development were distributed under a non-commercial license.
