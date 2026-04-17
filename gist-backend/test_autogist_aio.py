import asyncio
import os
import sys

sys.path.insert(0, os.path.abspath('c:/Users/Parthiv Paul/Documents/Gist/gist-backend'))
from dotenv import load_dotenv

load_dotenv('c:/Users/Parthiv Paul/Documents/Gist/gist-backend/.env')

from google import genai
from google.genai import types as genai_types
from app.services.gemini import GEMINI_MODEL

_PROMPT_TEMPLATE = (
    "You are an ambient reading assistant. "
    "The user is currently reading the text below on their screen. "
    "Extract exactly 3 ultra-concise key takeaways (each maximum 15 words). "
    "Return ONLY a valid JSON array of exactly 3 strings, nothing else.\n\n"
    "Text:\n{text}"
)

async def main():
    api_key = os.environ.get("GEMINI_API_KEY")
    client = genai.Client(api_key=api_key)
    prompt = _PROMPT_TEMPLATE.format(text="The quick brown fox jumps over the lazy dog.")

    print("Using aio...")
    try:
        result = await client.aio.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config=genai_types.GenerateContentConfig(
                response_mime_type="application/json",
            ),
        )
        print("Success AIO:", result.text)
    except Exception as e:
        print("Error AIO:", e)

    print("Using sync...")
    try:
        result2 = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config=genai_types.GenerateContentConfig(
                response_mime_type="application/json",
            ),
        )
        print("Success Sync:", result2.text)
    except Exception as e:
        print("Error Sync:", e)

asyncio.run(main())
