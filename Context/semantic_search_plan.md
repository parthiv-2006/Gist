# 🧠 Feature: Semantic Library Search ("Ask Your Second Brain")

## Overview
We are leveling up the Gist Library from a static list into a searchable, intelligent knowledge base. This feature enables users to perform **semantic queries** across all their saved gists—not just searching for keywords, but asking questions and getting answers based on their history (RAG).

## Core Requirements
1. **Vector Embeddings**: Every time a gist is saved, the backend must generate a vector embedding of the `original_text` and `explanation` and store it in MongoDB.
2. **Similarity Search**: Implement a specialized search endpoint that uses vector similarity to find the most relevant gists for a user's query.
3. **RAG Integration**: Create an "Ask Gist" feature where the LLM uses retrieved library entries as context to answer a user's specific question.
4. **Search UI**: Add a search/ask bar in the "Library" tab of the extension popup.

---

## Technical Implementation Plan

### 1. Vectorization Layer (`gist-backend`)
- **Embedding Model**: Use Google's `text-embedding-004` (via the existing `google-genai` SDK) to generate 768-dimensional embeddings.
- **Update Save Logic (`app/routes/simplify.py`)**: 
  - Before inserting into MongoDB, generate an embedding for a concatenated string of `original_text` and `explanation`.
  - Add the `embedding` field (array of floats) to the document.

### 2. Search Infrastructure (`gist-backend/app/db.py`)
- **Index Configuration**: Configure a **Vector Search Index** in MongoDB Atlas (named `vector_index`) on the `embedding` field. 
- *Note for Claude*: If running locally without Atlas Search, provide a fallback using cosine similarity in Python (using numpy) or Pinecone (via the available MCP).

### 3. The "Ask" Route (`gist-backend/app/routes/search.py`)
- **New Endpoint**: `POST /library/ask`
- **Logic**:
  1. Receive user `query`.
  2. Embed the user's `query`.
  3. Perform a vector search in MongoDB to find the Top-5 most similar gists.
  4. Construct a prompt for Gemini: *"Based on these saved notes from the user's library: {RetrievedGists}, answer the following question: {query}"*
  5. Return the generated answer and links/references to the source gists.

### 4. Extension UI: Semantic Search (`gist-extension/src/popup/App.tsx`)
- **Search Bar**: Add a modern, high-contrast search input at the top of the Library tab.
- **Query States**:
  - **Searching**: Show a pulse animation (using `c.accent`).
  - **Results**: Display the AI-generated answer in a highlighted "Gist Answer" card, followed by the specific gists used as context.
- **Aesthetic**: Use a "Glassmorphism" look for the search results (blur background, semi-transparent cards).

---

## Context Files

- **`gist-backend/app/db.py`**: Current DB connection manager. Update to handle vector search queries.
- **`gist-backend/app/routes/simplify.py`**: Existing save logic. Inject embedding generation here.
- **`gist-backend/app/services/gemini.py`**: Add an `embed_text` function here.
- **`gist-extension/src/popup/App.tsx`**: Add the search interface and "Ask" state management.

## Execution Guardrails
1. **Privacy**: Never send embeddings to third parties other than the configured LLM provider.
2. **Performance**: Vector generation and search should be non-blocking. Use `asyncio.gather` where appropriate.
3. **Zero-Result State**: If the semantic search score is too low, provide a helpful "I couldn't find anything relevant in your library yet" message with a suggestion to gist more content.

**Action for Claude Code**: 
1. Start by adding embedding support to the backend services. 
2. Update the background saving process to include embeddings.
3. Implement the `/library/ask` RAG endpoint.
4. Finally, update the UI to expose the search/ask bar.
