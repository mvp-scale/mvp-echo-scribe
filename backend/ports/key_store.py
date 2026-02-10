"""KeyStorePort — abstract interface for API key validation."""

from abc import ABC, abstractmethod
from typing import Optional


class KeyStorePort(ABC):
    @abstractmethod
    def validate(self, key: str) -> bool:
        """Return True if the key is valid and active."""

    @abstractmethod
    def get_name(self, key: str) -> Optional[str]:
        """Return the human-readable name for a key, or None."""
