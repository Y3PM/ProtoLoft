#!/usr/bin/env python3
"""Development-only tracing of user-selected ImageGen concepts (requires OpenCV).

The shipped JS contains only geometry; production does not load this tool or PNGs.
01 is read from the actual SVG logo without raster tracing or geometry rounding.
"""
import json
from pathlib import Path
import xml.etree.ElementTree as ET

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '.dev/tmp/avatar-integration-20261125'
OUT.mkdir(parents=True, exist_ok=True)


def trace(board_name, row, col, pose_id, number, name):
    board = cv2.imread(str(ROOT / '.dev/docs/avatar-designs' / board_name))
    assert board is not None, board_name
    # Only the numbered artwork cell, excluding the caption below it.
    cell = board[row * 500:row * 500 + 460, col * 512:(col + 1) * 512]
    b, g, r = [cell[:, :, channel].astype(np.int16) for channel in range(3)]
    field = ((b - r > 9) & (b > 180) & (g > 100)).astype(np.uint8)
    contours, _ = cv2.findContours(field, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    (cx, cy), radius = cv2.minEnclosingCircle(max(contours, key=cv2.contourArea))
    assert 200 < radius < 235, (pose_id, radius)
    blue = (b - r > 80) & (g - r > 40) & (b - g > 20)
    shapes = []
    for role, mask in [('d', blue & (r < 55)), ('l', blue & (r >= 55))]:
        # Remove one-pixel anti-alias fringes before extracting solid color planes.
        mask = cv2.morphologyEx(mask.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        traced = np.zeros_like(mask)
        for contour in sorted(contours, key=cv2.contourArea, reverse=True):
            if cv2.contourArea(contour) < 20:
                continue
            polygon = cv2.approxPolyDP(contour, 1.15, True)
            cv2.fillPoly(traced, [polygon], 1)
            points = polygon[:, 0, :].astype(float)
            points[:, 0] = (points[:, 0] - cx + radius) * 64 / radius
            points[:, 1] = (points[:, 1] - cy + radius) * 64 / radius
            shapes.append([role, ' '.join(f'{x:.2f},{y:.2f}' for x, y in points)])
        intersection = np.count_nonzero(mask & traced)
        union = np.count_nonzero(mask | traced)
        score = intersection / union
        assert score > .96, (pose_id, role, score)
        print(f'{number} {name} {role}: mask IoU={score:.4f}')
    red = ((r > 220) & (g < 160) & (b < 120) & (r - g > 80)).astype(np.uint8)
    contours, _ = cv2.findContours(red, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    (dx, dy), dr = cv2.minEnclosingCircle(max(contours, key=cv2.contourArea))
    return dict(id=pose_id, number=number, name=name, transform='', polys=shapes,
                dot=dict(cx=round((dx - cx + radius) * 64 / radius, 2),
                         cy=round((dy - cy + radius) * 64 / radius, 2),
                         r=round(dr * 64 / radius, 2)))


def main():
    logo = ET.parse(ROOT / 'assets/images/logo-icon.svg').getroot()
    ns = {'s': 'http://www.w3.org/2000/svg'}
    polygons = [['d' if node.attrib['fill'].lower() == '#0076de' else 'l', node.attrib['points']]
                for node in logo.findall('.//s:polygon', ns)]
    ball = logo.find('.//s:circle', ns)
    poses = [dict(id='leap', number='01', name='标准 Logo',
                  transform='translate(10.24 10.24) scale(0.42)', polys=polygons,
                  dot={key: float(ball.attrib[key]) for key in ['cx', 'cy', 'r']})]
    concepts = '2026-11-25-avatar-logo-concepts.png'
    variants = '2026-11-25-avatar-logo-poses.png'
    for spec in [(concepts, 0, 1, 'shoulder', '02', '半身'),
                 (concepts, 0, 2, 'head', '03', '象首'),
                 (concepts, 1, 0, 'trunk', '04', '抬鼻'),
                 (variants, 0, 0, 'sit', '07', '静坐'),
                 (variants, 0, 1, 'bow', '08', '低头'),
                 (variants, 1, 0, 'walk', '10', '迈步'),
                 (variants, 1, 2, 'rest', '12', '侧卧')]:
        poses.append(trace(*spec))
    (OUT / 'poses.json').write_text(json.dumps(poses, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    main()
