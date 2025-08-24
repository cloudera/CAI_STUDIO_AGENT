from __future__ import annotations

from typing import Dict


def summary_cache_get(cache: Dict[str, str], key: str):
    return cache.get(key)


def summary_cache_put(cache: Dict[str, str], capacity: int, key: str, value: str) -> None:
    if key in cache:
        cache[key] = value
        return
    if len(cache) >= max(1, int(capacity)):
        try:
            first_key = next(iter(cache))
            cache.pop(first_key, None)
        except Exception:
            cache.clear()
    cache[key] = value

