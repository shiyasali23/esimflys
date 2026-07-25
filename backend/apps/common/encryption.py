import hashlib
import hmac

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings


class EncryptionError(Exception):
    pass


def _key_for(version):
    key = settings.FIELD_ENCRYPTION_KEYS.get(version)
    if not key:
        raise EncryptionError(f"No field-encryption key configured for version {version}.")
    return key.encode() if isinstance(key, str) else key


def _fernet(version):
    return Fernet(_key_for(version))


def encrypt(plaintext):
    if plaintext is None:
        return None, None
    if isinstance(plaintext, str):
        plaintext = plaintext.encode()
    version = settings.FIELD_ENCRYPTION_KEY_VERSION
    return _fernet(version).encrypt(plaintext), version


def decrypt(token, version):
    if token is None:
        return None
    try:
        return _fernet(version).decrypt(bytes(token)).decode()
    except InvalidToken as exc:
        raise EncryptionError("Could not decrypt the stored value.") from exc


def iccid_blind_index(iccid):
    key = settings.ICCID_HMAC_KEY
    if not key:
        raise EncryptionError("ICCID_HMAC_KEY is not configured.")
    if isinstance(key, str):
        key = key.encode()
    return hmac.new(key, iccid.strip().encode(), hashlib.sha256).digest()
