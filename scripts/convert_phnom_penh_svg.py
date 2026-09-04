import json
import math

with open('src/data/phnomPenhDistricts.json', 'r', encoding='utf-8') as f:
    geo = json.load(f)

all_pts = []
for feat in geo['features']:
    geom = feat['geometry']
    coords = geom['coordinates']
    def flatten(c):
        if isinstance(c[0], (int, float)):
            all_pts.append(c)
        else:
            for sub in c:
                flatten(sub)
    flatten(coords)

min_lng = min(p[0] for p in all_pts)
max_lng = max(p[0] for p in all_pts)
min_lat = min(p[1] for p in all_pts)
max_lat = max(p[1] for p in all_pts)

print(f"Bounding box: lng [{min_lng}, {max_lng}], lat [{min_lat}, {max_lat}]")

# We want a clean SVG canvas, say 600 x 550 with padding
width = 650
height = 600
padding = 30

# Cambodia is near lat 11.5 deg, so cos(11.5 deg) ~ 0.98 for aspect ratio
mid_lat = (min_lat + max_lat) / 2
cos_lat = math.cos(math.radians(mid_lat))

geo_w = (max_lng - min_lng) * cos_lat
geo_h = max_lat - min_lat

scale = min((width - 2 * padding) / geo_w, (height - 2 * padding) / geo_h)

# Center the map in the viewBox
avail_w = geo_w * scale
avail_h = geo_h * scale
offset_x = padding + ((width - 2 * padding) - avail_w) / 2
offset_y = padding + ((height - 2 * padding) - avail_h) / 2

def project(lng, lat):
    x = offset_x + (lng - min_lng) * cos_lat * scale
    # SVG y is inverted (lat goes up, y goes down)
    y = offset_y + (max_lat - lat) * scale
    return round(x, 2), round(y, 2)

def ring_to_path(ring):
    pts = [project(p[0], p[1]) for p in ring]
    if not pts:
        return ""
    d = f"M {pts[0][0]},{pts[0][1]}"
    for p in pts[1:]:
        d += f" L {p[0]},{p[1]}"
    d += " Z"
    return d

def compute_centroid(coords):
    pts = []
    def extract(c):
        if isinstance(c[0], (int, float)):
            pts.append(c)
        else:
            for sub in c:
                extract(sub)
    extract(coords)
    avg_lng = sum(p[0] for p in pts) / len(pts)
    avg_lat = sum(p[1] for p in pts) / len(pts)
    return project(avg_lng, avg_lat)

locations = []
for feat in geo['features']:
    fid = feat['id']
    name_km = feat['properties']['nameKm']
    name_en = feat['properties']['nameEn']
    geom = feat['geometry']
    gtype = geom['type']
    coords = geom['coordinates']

    path_parts = []
    if gtype == "Polygon":
        for ring in coords:
            path_parts.append(ring_to_path(ring))
    elif gtype == "MultiPolygon":
        for poly in coords:
            for ring in poly:
                path_parts.append(ring_to_path(ring))

    full_path = " ".join(path_parts)
    cx, cy = compute_centroid(coords)

    # Fine-tuned label positions for small central Khans so labels never collide
    CUSTOM_CENTERS = {
        "daun-penh": [430, 308],
        "prampir-meakkakra": [388, 334],
        "boeng-keng-kang": [422, 350],
        "chamkar-mon": [418, 385],
        "tuol-kouk": [364, 320],
    }
    if fid in CUSTOM_CENTERS:
        cx, cy = CUSTOM_CENTERS[fid]

    locations.append({
        "id": fid,
        "nameKm": name_km,
        "nameEn": name_en,
        "name": f"{name_km} ({name_en})",
        "path": full_path,
        "center": [cx, cy]
    })

svg_data = {
    "label": "Map of Phnom Penh Khans",
    "viewBox": f"0 0 {width} {height}",
    "locations": locations
}

with open('src/data/phnomPenhSvg.json', 'w', encoding='utf-8') as f:
    json.dump(svg_data, f, ensure_ascii=False, indent=2)

print(f"Successfully generated src/data/phnomPenhSvg.json with {len(locations)} locations!")
