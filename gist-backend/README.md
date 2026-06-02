---
title: Gist Backend
emoji: 📝
colorFrom: green
colorTo: gray
sdk: docker
app_port: 8080
pinned: false
---

# Gist Backend

FastAPI service for the [Gist](https://github.com/parthiv-2006/Gist) browser
extension — proxies Google Gemini and streams plain-language explanations via
SSE, with a MongoDB-backed gist library.

> The YAML header above is the Hugging Face **Space card** metadata. It tells
> HF to build this repo with the Docker SDK and expose the container's port
> 8080. It is ignored by the Docker build (`*.md` is in `.dockerignore`) and by
> normal local/Render runs — it only matters when this folder is deployed as a
> Hugging Face Space.

## Run locally

```bash
python -m venv venv && venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Deployment

This backend is containerized (see `Dockerfile`) and runs on any host that
injects a `$PORT`. The `deploy-hf.yml` GitHub workflow mirrors this folder to a
Hugging Face Space on every push to `main`.
