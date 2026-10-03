"""Convert GADM Tunisia ADM1 GeoJSON into a projected TypeScript module.

Projection: Web Mercator (EPSG:3857 style) so relative shapes and areas stay
correct, then normalised into an SVG-friendly viewBox coordinate space.

Usage:
    python tools/build_tunisia_geo.py [output.ts]

The source GeoJSON is downloaded once into tools/cache/ and reused afterwards,
so re-runs are offline. No third-party packages required.
"""

import io
import json
import math
import os
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE_URL = (
    "https://raw.githubusercontent.com/hamzabenarfa/tunisia-3d-map/"
    "main/src/assets/maps/tunisia.json"
)
BASE = os.path.join(HERE, "cache")
CACHE_PATH = os.path.join(BASE, "tunisia-adm1.geojson")
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
    HERE, os.pardir, "src", "data", "tunisiaGeo.ts"
)


def load_source():
    if os.path.exists(CACHE_PATH):
        return json.load(io.open(CACHE_PATH, encoding="utf-8"))
    os.makedirs(BASE, exist_ok=True)
    print(f"downloading {SOURCE_URL}")
    with urllib.request.urlopen(SOURCE_URL, timeout=60) as response:
        payload = response.read()
    with io.open(CACHE_PATH, "wb") as fh:
        fh.write(payload)
    return json.loads(payload.decode("utf-8"))

# --- Official accented names (GADM uses non-accented variants) -------------
NAME_FIXES = {
    "Beja": "Béja",
    "Gabes": "Gabès",
    "Kebili": "Kébili",
    "Medenine": "Médenine",
    "Kef": "Le Kef",
}

# --- point decimation -----------------------------------------------------
def perp_dist(p, a, b):
    (x, y), (x1, y1), (x2, y2) = p, a, b
    dx, dy = x2 - x1, y2 - y1
    if dx == 0 and dy == 0:
        return math.hypot(x - x1, y - y1)
    t = max(0.0, min(1.0, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)))
    return math.hypot(x - (x1 + t * dx), y - (y1 + t * dy))


def douglas_peucker(pts, tol):
    if len(pts) < 3:
        return pts
    dmax, idx = 0.0, 0
    for i in range(1, len(pts) - 1):
        d = perp_dist(pts[i], pts[0], pts[-1])
        if d > dmax:
            dmax, idx = d, i
    if dmax > tol:
        left = douglas_peucker(pts[: idx + 1], tol)
        right = douglas_peucker(pts[idx:], tol)
        return left[:-1] + right
    return [pts[0], pts[-1]]


def area_of(pts):
    if len(pts) < 3:
        return 0.0
    s = 0.0
    for i in range(len(pts) - 1):
        s += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1]
    return abs(s) / 2.0


def rdp(ring, tol, min_pts):
    """RDP with a floor on retained points so tiny polygons stay visible."""
    out = douglas_peucker(ring, tol)
    if len(out) < min_pts:
        step = max(1, len(ring) // min_pts)
        kept = ring[::step]
        if kept[0] != ring[0]:
            kept[0] = ring[0]
        if kept[-1] != ring[-1]:
            kept.append(ring[-1])
        return kept
    return out


# --- projection ------------------------------------------------------------
def mercator(lon, lat):
    x = lon
    y = math.degrees(math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)))
    return [x, y]


raw = load_source()

features = []
for ft in raw["features"]:
    props = ft["properties"]
    name = NAME_FIXES.get(props["name"], props["name"])
    geom = ft["geometry"]
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]

    rings = []
    for poly in polys:
        for ring in poly:
            if len(ring) >= 4:
                rings.append(ring)

    if not rings:
        continue

    # keep the outer ring (largest area) + holes that are meaningfully large
    projected = [([mercator(c[0], c[1]) for c in r]) for r in rings]
    indexed = sorted(
        range(len(projected)), key=lambda i: area_of(projected[i]), reverse=True
    )
    outer = projected[indexed[0]]
    area_outer = area_of(outer)

    simplified = [rdp(outer, tol=0.004, min_pts=10)]
    for i in indexed[1:]:
        if area_of(projected[i]) > area_outer * 0.02:  # real hole, not a sliver
            simplified.append(rdp(projected[i], tol=0.004, min_pts=6))

    center = props.get("center") or [0, 0]
    features.append(
        {
            "name": name,
            "adcode": props.get("adcode"),
            "center": [round(center[0], 4), round(center[1], 4)],
            "rings": [[(round(x, 5), round(y, 5)) for x, y in r] for r in simplified],
        }
    )

features.sort(key=lambda f: f["name"])

# --- global bounds -> viewBox ---------------------------------------------
minx = min(p[0] for f in features for r in f["rings"] for p in r)
maxx = max(p[0] for f in features for r in f["rings"] for p in r)
miny = min(p[1] for f in features for r in f["rings"] for p in r)
maxy = max(p[1] for f in features for r in f["rings"] for p in r)

W, H = 1000.0, 1400.0
pad = 6
sx = (W - 2 * pad) / (maxx - minx)
sy = (H - 2 * pad) / (maxy - miny)
scale = min(sx, sy)


def to_view(ring):
    ox = pad + ((W - 2 * pad) - (maxx - minx) * scale) / 2
    oy = pad + ((H - 2 * pad) - (maxy - miny) * scale) / 2
    return [
        (round((x - minx) * scale + ox, 2), round((maxy - y) * scale + oy, 2))
        for x, y in ring
    ]


def ring_to_path(ring):
    pts = to_view(ring)
    if not pts:
        return ""
    d = [f"M{pts[0][0]:.2f} {pts[0][1]:.2f}"]
    for x, y in pts[1:]:
        d.append(f"L{x:.2f} {y:.2f}")
    d.append("Z")
    return "".join(d)


def centroid_of(ring):
    pts = to_view(ring)
    a = cx = cy = 0.0
    for i in range(len(pts) - 1):
        cross = pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1]
        a += cross
        cx += (pts[i][0] + pts[i + 1][0]) * cross
        cy += (pts[i][1] + pts[i + 1][1]) * cross
    if a == 0:
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        return [round(sum(xs) / len(xs), 2), round(sum(ys) / len(ys), 2)]
    a *= 0.5
    return [round(cx / (6 * a), 2), round(cy / (6 * a), 2)]


lines = []
lines.append("// Auto-generated from GADM 4.1 ADM1 boundaries for Tunisia.")
lines.append("// Source: https://github.com/hamzabenarfa/tunisia-3d-map (GADM-derived),")
lines.append("// projected to Web Mercator and normalised to a 1000x1400 SVG viewBox.")
lines.append("// Regenerate with: python tools/build_tunisia_geo.py")
lines.append("")
lines.append("export interface TunisiaRegionShape {")
lines.append("  name: string;")
lines.append("  /** SVG path data in the 1000x1400 viewBox space. */")
lines.append("  path: string;")
lines.append("  /** Label anchor point. */")
lines.append("  centroid: [number, number];")
lines.append("}")
lines.append("")
lines.append(f"export const TUNISIA_VIEWBOX = `0 0 {W:.0f} {H:.0f}`;")
lines.append("")
lines.append("export const TUNISIA_GOV_SHAPES: TunisiaRegionShape[] = [")

for f in features:
    outer = f["rings"][0]
    path = ring_to_path(outer)
    for hole in f["rings"][1:]:
        path += " " + ring_to_path(hole)
    cx, cy = centroid_of(outer)
    lines.append(
        f'  {{ name: {json.dumps(f["name"], ensure_ascii=False)}, '
        f"path: {json.dumps(path)}, centroid: [{cx}, {cy}] }},"
    )

lines.append("];")
lines.append("")
lines.append("export const TUNISIA_SHAPE_BY_NAME = new Map(")
lines.append("  TUNISIA_GOV_SHAPES.map((shape) => [shape.name, shape])")
lines.append(");")
lines.append("")

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with io.open(OUT, "w", encoding="utf-8", newline="\n") as fh:
    fh.write("\n".join(lines))

total_pts = sum(len(r) for f in features for r in f["rings"])
print(f"wrote {OUT}")
print(f"  features : {len(features)}")
print(f"  points   : {total_pts}")
print(f"  size     : {os.path.getsize(OUT)} bytes")
print(f"  names    : {', '.join(f['name'] for f in features)}")