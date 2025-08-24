from __future__ import annotations

import os
from functools import lru_cache


@lru_cache(maxsize=64)
def load_prompt(filename: str) -> str:
    """Load a prompt file by name from the prompts directory.

    Returns an empty string if the file cannot be read.
    """
    try:
        base_dir = os.path.dirname(__file__)
        path = os.path.join(base_dir, filename)
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    except Exception:
        return ""

