import asyncio
import os
import sys

sys.path.insert(0, os.path.abspath('c:/Users/Parthiv Paul/Documents/Gist/gist-backend'))
from dotenv import load_dotenv

load_dotenv('c:/Users/Parthiv Paul/Documents/Gist/gist-backend/.env')

from app.routes.autogist import _generate_takeaways

async def main():
    try:
        res = await _generate_takeaways("The sky is blue and the sun is hot.")
        print("SUCCESS:", res)
    except Exception as e:
        import traceback
        traceback.print_exc()

asyncio.run(main())
