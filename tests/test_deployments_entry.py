import pytest
from unittest.mock import patch, MagicMock
import os

__import__('pysqlite3')
import sys
sys.modules['sqlite3'] = sys.modules.pop('pysqlite3')
