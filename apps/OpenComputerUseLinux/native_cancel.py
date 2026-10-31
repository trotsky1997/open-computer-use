"""Cooperative cancellation with short input-release critical sections."""
from contextlib import contextmanager
import signal


class OperationCancelled(BaseException):
    pass


_requested = False
_critical_depth = 0


def check_cancelled():
    if _requested:
        raise OperationCancelled()


def handle_signal(_signum, _frame):
    global _requested
    _requested = True
    if not _critical_depth:
        check_cancelled()


def install_handlers():
    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)


@contextmanager
def defer_cancellation():
    global _critical_depth
    _critical_depth += 1
    try:
        yield
    finally:
        _critical_depth -= 1
        if not _critical_depth:
            check_cancelled()
