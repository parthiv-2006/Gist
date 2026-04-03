# 📚 Feature: The "Gist Library" (Personal Knowledge Base)

## Overview
We are adding a "Library" feature to the Gist extension. The goal is to create a persistent "History" view where every passage the user has ever "Gisted" is automatically saved and categorized by AI (e.g., "Legal", "Code", "Medical", "Finance"). This transforms Gist from a transient tool into a long-term learning repository.

## Requirements
1. **Categorized Storage**: Whenever a user gists a piece of text, the backend must save the original text, the AI-generated explanation, the source URL, and an AI-determined category to a MongoDB database.
2. **Library View**: The extension popup (`App.tsx`) needs a new "Library" tab that lists all saved gists, organized or filtered by their category.
3. **MongoDB Integration**: The application backend will use MongoDB to store this data. 

**For Claude Code**: You have access to the MongoDB MCP server. Use it to help provision/validate our MongoDB setup if necessary during development (e.g., using `atlas-local-create-deployment` or validating schemas), and configure our backend to connect to it via `pymongo` or `motor` (async).

---

## Technical Implementation Plan

### 1. Backend Connectivity & Data Model (`gist-backend`)
- **Dependencies**: Add `motor` (async MongoDB driver) or `pymongo` to `gist-backend/requirements.txt`.
- **Database Connection**: Create a new file (e.g. `app/db.py`) to manage the MongoDB connection pool using `motor.motor_asyncio.AsyncIOMotorClient`. Load the MongoDB connection URI from the `.env` file (`MONGODB_URI`).
- **Data Schema**:
  - `_id`: ObjectId
  - `original_text`: str
  - `explanation`: str
  - `mode`: str (e.g. "ELI5", "Standard")
  - `url`: str
  - `category`: str (AI-categorized tag)
  - `created_at`: datetime

### 2. Update AI Generation to Categorize (`gist-backend/app/routes/simplify.py`)
- Modify the existing prompt or the response handling for explanations to also return a brief standard **category** classification for the text (e.g., "Code", "Legal", "Medical", "Science", "General").
- After generating the explanation, asynchronously insert the resulting document into the MongoDB `gists` collection.
- *Note: Ensure your response format supports returning the explanation text to the frontend unaltered while silently logging the whole record internally.*

### 3. Add a Library Retrieval Route (`gist-backend/app/routes/library.py`)
- Create a new FastAPI route: `GET /library`.
- This route should query the MongoDB collection, sort by `created_at` descending, and return a list of saved gists.
- Wire this new router into `gist-backend/app/main.py`.

### 4. Extension UI: The Library Tab (`gist-extension/src/popup/App.tsx`)
- **Navigation State**: Introduce state (e.g., `activeTab`) to switch between the main "Capture" view and the "Library" view.
- **Library Component**: Create a UI view that fetches data from `GET http://127.0.0.1:8000/library` when mounted.
- **Rendering**: 
  - Display the saved gists as cards. 
  - Show the category badge prominently.
  - Add basic scrolling (`overflowY: "auto"`).
  - Ensure the aesthetic aligns with our Carbon/premium dark mode design (use `c.bgCard`, `c.border`, `c.textSecondary`, etc.).

---

## Context Files

These are the core files you will need to read, modify, and reference:

- **`gist-backend/app/main.py`**: FastAPI entrypoint. Add the new library router here.
- **`gist-backend/app/routes/simplify.py`**: The current core route generating the LLM explanations. Modify this to save to MongoDB.
- **`gist-backend/requirements.txt`**: Add MongoDB dependencies here.
- **`gist-extension/src/popup/App.tsx`**: The React UI for the extension. Add the Tab system and Library view here.

## Execution Guardrails
1. **Aesthetics**: When updating `App.tsx`, maintain the existing "Carbon" aesthetic (dark background, `#10b981` accents, clean borders). Do not introduce basic unstyled HTML.
2. **Async MongoDB**: Because FastAPI is async, prefer using `motor` so that database operations don't block the Python event loop.
3. **Environment Variables**: Use `.env` pattern for `MONGODB_URI`. Gracefully handle the absence of a DB connection during local dev (e.g., log a warning instead of crashing if MongoDB isn't running).

**Action for Claude Code**: Begin directly by creating the MongoDB connection structure in the backend, updating the `simplify.py` route to auto-categorize and save queries, and then wire up the new backend code to the UI.
