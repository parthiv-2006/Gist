# app/services/categorize.py
"""
Lightweight keyword-based text categorizer.

Uses pattern matching to assign one of the standard categories without an
extra LLM call, keeping the library-save path cheap and non-blocking.
"""

_RULES: list[tuple[str, list[str]]] = [
    ("Code", [
        "def ", "function ", "class ", "import ", "const ", "var ", "let ",
        "return ", "=>", "async ", "await ", "if (", "for (", "while (",
        "console.log", "print(", "null", "undefined", "boolean", "string",
        "int ", "void ", "public ", "private ", "static ",
        "variable", "method", "parameter", "argument", "runtime",
        "compiler", "syntax", "loop", "array", "object", "interface",
        "api", "endpoint", "library", "framework", "repository", "commit",
        "bug", "debug", "deploy", "server", "database", "cache",
        "javascript", "python", "typescript", "java", "c++", "rust", "go",
        "html", "css", "sql", "json", "http", "rest", "graphql",
    ]),
    ("Legal", [
        "whereas", "herein", "pursuant", "liable", "jurisdiction",
        "plaintiff", "defendant", "indemnif", "arbitration", "attorney",
        "court", "statute", "regulation", "contractual", "obligation",
        "warranty", "covenant", "tort", "remedy", "damages",
        "clause", "contract", "agreement", "legal", "law ", "laws ",
        "rights", "copyright", "patent", "trademark", "license",
        "gdpr", "privacy policy", "terms of service", "intellectual property",
        "enforcement", "compliance", "legislation", "ruling", "verdict",
    ]),
    ("Medical", [
        "patient", "diagnosis", "treatment", "symptom", "clinical",
        "therapy", "disease", "dosage", "prescription", "physician",
        "medication", "prognosis", "pathology", "surgical", "chronic",
        "acute ", "inflammatory", "receptor", "genome", "protein",
        "vaccine", "virus", "bacteria", "cancer", "tumor", "blood",
        "organ", "nerve", "muscle", "cell", "tissue", "immune",
        "drug", "trial", "study", "placebo", "randomized", "dose",
        "health", "hospital", "nurse", "surgery", "medical",
    ]),
    ("Finance", [
        "revenue", "profit", "investment", "portfolio", "equity",
        "dividend", "asset", "liability", "balance sheet", "earnings",
        "market cap", "valuation", "hedge", "derivative", "fiscal",
        "quarterly", "shareholder", "amortization", "depreciation",
        "stock", "bond", "interest rate", "inflation", "gdp",
        "bank", "loan", "debt", "credit", "tax", "budget",
        "fund", "trader", "market", "price", "cost", "fee",
        "startup", "funding", "venture", "ipo", "acquisition",
    ]),
    ("Science", [
        "hypothesis", "methodology", "conclusion", "experiment",
        "algorithm", "theorem", "equation", "quantum", "molecule",
        "neural network", "empirical", "statistical", "velocity",
        "entropy", "photon", "chromosome", "gravity", "coefficient",
        "research", "study", "data", "analysis", "results", "finding",
        "physics", "chemistry", "biology", "math", "model",
        "measurement", "energy", "force", "mass", "element",
        "evolution", "species", "climate", "atmosphere", "reaction",
        "ai", "machine learning", "deep learning", "llm", "gpt",
    ]),
]


def categorize_text(text: str) -> str:
    """
    Return the best-matching category label for the given text.
    Scoring is a simple keyword-hit count; ties go to the first rule.
    Falls back to 'General' when no category scores above zero.
    """
    lower = text.lower()
    scores: dict[str, int] = {}
    for label, keywords in _RULES:
        scores[label] = sum(1 for kw in keywords if kw in lower)

    best_label = max(scores, key=lambda k: scores[k])
    return best_label if scores[best_label] > 0 else "General"
