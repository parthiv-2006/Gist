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
    ]),
    ("Legal", [
        "whereas", "herein", "pursuant", "liable", "jurisdiction",
        "plaintiff", "defendant", "indemnif", "arbitration", "attorney",
        "court", "statute", "regulation", "contractual", "obligation",
        "warranty", "covenant", "tort", "remedy", "damages",
    ]),
    ("Medical", [
        "patient", "diagnosis", "treatment", "symptom", "clinical",
        "therapy", "disease", "dosage", "prescription", "physician",
        "medication", "prognosis", "pathology", "surgical", "chronic",
        "acute ", "inflammatory", "receptor", "genome", "protein",
    ]),
    ("Finance", [
        "revenue", "profit", "investment", "portfolio", "equity",
        "dividend", "asset", "liability", "balance sheet", "earnings",
        "market cap", "valuation", "hedge", "derivative", "fiscal",
        "quarterly", "shareholder", "amortization", "depreciation",
    ]),
    ("Science", [
        "hypothesis", "methodology", "conclusion", "experiment",
        "algorithm", "theorem", "equation", "quantum", "molecule",
        "neural network", "empirical", "statistical", "velocity",
        "entropy", "photon", "chromosome", "gravity", "coefficient",
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
