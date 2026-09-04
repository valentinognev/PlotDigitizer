from __future__ import annotations

import sys
from pathlib import Path

_TESTS = Path(__file__).resolve().parents[1]
_HERE = Path(__file__).resolve().parent
for _p in (_TESTS, _HERE):
    _s = str(_p)
    if _s not in sys.path:
        sys.path.insert(0, _s)
