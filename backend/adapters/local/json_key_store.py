"""JsonFileKeyStore — validates API keys from a JSON file (current behavior)."""

import json
import logging
from typing import Optional

from ports.key_store import KeyStorePort

logger = logging.getLogger(__name__)


class JsonFileKeyStore(KeyStorePort):
    def __init__(self, keys_file: str = "/data/api-keys.json"):
        self._keys_file = keys_file

    def _load(self) -> dict:
        try:
            with open(self._keys_file) as f:
                data = json.load(f)
            return {k["key"]: k for k in data.get("keys", []) if k.get("active", True)}
        except (FileNotFoundError, json.JSONDecodeError) as e:
            logger.warning(f"Could not load keys file: {e}")
            return {}

    def validate(self, key: str) -> bool:
        return key in self._load()

    def get_name(self, key: str) -> Optional[str]:
        keys = self._load()
        entry = keys.get(key)
        return entry.get("name") if entry else None
