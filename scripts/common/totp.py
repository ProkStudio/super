#!/usr/bin/env python3
"""RFC 6238 TOTP (Google Authenticator compatible)."""
import base64
import hashlib
import hmac
import re
import struct
import time

BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'


def normalize_secret(secret):
    return re.sub(r'\s+', '', str(secret or '')).upper().rstrip('=')


def is_totp_secret(value):
    v = normalize_secret(value)
    if not v:
        return False
    if re.fullmatch(r'\d{6,8}', v):
        return False
    return bool(re.fullmatch(r'[A-Z2-7]+', v)) and len(v) >= 8


def _base32_decode(secret):
    normalized = normalize_secret(secret)
    if not normalized:
        return b''

    bits = ''.join(
        bin(BASE32_ALPHABET.index(c))[2:].zfill(5)
        for c in normalized
        if c in BASE32_ALPHABET
    )
    data = bytearray()
    for i in range(0, len(bits) - 7, 8):
        data.append(int(bits[i:i + 8], 2))
    return bytes(data)


def generate_totp(secret, period=30, digits=6, now=None):
    epoch = int((now if now is not None else time.time()))
    counter = epoch // period
    remaining = period - (epoch % period)

    key = _base32_decode(secret)
    if not key:
        return {'ok': False, 'error': 'invalid_secret', 'code': '', 'remaining': remaining, 'period': period}

    msg = struct.pack('>Q', counter)
    digest = hmac.new(key, msg, hashlib.sha1).digest()
    offset = digest[-1] & 0x0f
    binary = struct.unpack('>I', digest[offset:offset + 4])[0] & 0x7fffffff
    code = str(binary % (10 ** digits)).zfill(digits)

    return {
        'ok': True,
        'code': code,
        'remaining': remaining,
        'period': period,
        'progress': remaining / period,
    }
