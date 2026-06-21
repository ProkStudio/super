#!/usr/bin/env python3
"""QR scan stub for Google login."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common.utils import load_config, progress, result, random_delay


def main():
    config = load_config()
    profile_ids = config.get('profileIds', [])
    total = len(profile_ids) or 1

    for i, pid in enumerate(profile_ids or ['demo']):
        progress('scan_qr', int((i / total) * 100), f'Opening profile {pid}')
        random_delay(1, 2)
        progress('scan_qr', int(((i + 0.5) / total) * 100), 'Waiting for QR code...')
        random_delay(2, 4)
        progress('scan_qr', int(((i + 0.8) / total) * 100), 'QR detected — scan simulated')
        random_delay(1, 2)
        progress('scan_qr', int(((i + 1) / total) * 100), f'Profile {pid} authorized (stub)')

    result({'ok': True, 'scanned': len(profile_ids)})


if __name__ == '__main__':
    main()
