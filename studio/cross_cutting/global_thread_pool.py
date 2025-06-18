from concurrent.futures import ThreadPoolExecutor
from typing import Optional

_global_thread_pool: Optional[ThreadPoolExecutor] = None


def get_thread_pool() -> ThreadPoolExecutor:
    global _global_thread_pool
    if _global_thread_pool is None:
        raise RuntimeError("Thread pool not initialized")
    return _global_thread_pool


def initialize_thread_pool():
    global _global_thread_pool
    _global_thread_pool = ThreadPoolExecutor(max_workers=24, thread_name_prefix="global_thread_pool_")


def cleanup_thread_pool():
    global _global_thread_pool
    if _global_thread_pool:
        _global_thread_pool.shutdown(wait=True)
        _global_thread_pool = None
