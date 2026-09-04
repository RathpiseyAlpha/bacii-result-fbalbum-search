import json
import os

KHAN_NAME_MAP = {
    "chamkar mon": "chamkar-mon",
    "doun penh": "daun-penh",
    "prampir meakkakra": "prampir-meakkakra",
    "tuol kouk": "tuol-kouk",
    "dangkao": "dangkao",
    "mean chey": "mean-chey",
    "russey keo": "russey-keo",
    "saensokh": "sen-sok",
    "pur senchey": "pur-senchey",
    "chraoy chongvar": "chroy-changvar",
    "praek pnov": "prek-pnov",
    "chbar ampov": "chbar-ampov",
}

KHAN_META = {
    "daun-penh": {"nameKm": "ដូនពេញ", "nameEn": "Daun Penh"},
    "chamkar-mon": {"nameKm": "ចំការមន", "nameEn": "Chamkar Mon"},
    "prampir-meakkakra": {"nameKm": "៧មករា", "nameEn": "7 Makara"},
    "tuol-kouk": {"nameKm": "ទួលគោក", "nameEn": "Tuol Kouk"},
    "boeng-keng-kang": {"nameKm": "បឹងកេងកង", "nameEn": "Boeng Keng Kang"},
    "russey-keo": {"nameKm": "ឫស្សីកែវ", "nameEn": "Russey Keo"},
    "sen-sok": {"nameKm": "សែនសុខ", "nameEn": "Sen Sok"},
    "chroy-changvar": {"nameKm": "ជ្រោយចង្វារ", "nameEn": "Chroy Changvar"},
    "pur-senchey": {"nameKm": "ពោធិ៍សែនជ័យ", "nameEn": "Pur Senchey"},
    "mean-chey": {"nameKm": "មានជ័យ", "nameEn": "Mean Chey"},
    "dangkao": {"nameKm": "ដង្កោ", "nameEn": "Dangkao"},
    "chbar-ampov": {"nameKm": "ច្បារអំពៅ", "nameEn": "Chbar Ampov"},
    "prek-pnov": {"nameKm": "ព្រែកព្នៅ", "nameEn": "Prek Pnov"},
    "kamboul": {"nameKm": "កំបូល", "nameEn": "Kamboul"},
}

def get_centroid(coords):
    pts = []
    def extract(c):
        if isinstance(c[0], (int, float)):
            pts.append(c)
        else:
            for item in c: extract(item)
    extract(coords)
    avg_lng = sum(p[0] for p in pts) / len(pts)
    avg_lat = sum(p[1] for p in pts) / len(pts)
    return avg_lat, avg_lng

def run():
    input_file = "tmp/khm_adm2.geojson"
    with open(input_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    matched = {}
    for f in data["features"]:
        coords = f["geometry"]["coordinates"]
        lat, lng = get_centroid(coords)
        if not (11.35 <= lat <= 11.75 and 104.65 <= lng <= 105.05):
            continue

        name = f["properties"].get("shapeName", "").lower().strip()
        matched_id = None
        for k, vid in KHAN_NAME_MAP.items():
            if k in name:
                matched_id = vid
                break
        
        if matched_id:
            matched[matched_id] = f

    print("Initial matched:", list(matched.keys()))

    # Boeng Keng Kang is north part of Chamkar Mon (lat > 11.538)
    # Chamkar Mon remainder is south part (lat <= 11.538)
    # Kamboul is west part of Pur Senchey (lng < 104.79)
    # Pur Senchey remainder is east part (lng >= 104.79)
    out_features = []

    for kid, meta in KHAN_META.items():
        if kid in matched:
            feat = matched[kid]
            coords = feat["geometry"]["coordinates"]

            if kid == "chamkar-mon":
                # Create Boeng Keng Kang as northern slice (St. 274 / Sihanouk Blvd to Mao Tse Toung)
                # and Chamkar Mon as southern slice
                bkk_poly = [
                    [104.9113, 11.5557],
                    [104.9331, 11.5569],
                    [104.9352, 11.5412],
                    [104.9218, 11.5385],
                    [104.9138, 11.5435],
                    [104.9113, 11.5557]
                ]
                cm_poly = [
                    [104.9138, 11.5435],
                    [104.9218, 11.5385],
                    [104.9352, 11.5412],
                    [104.9440, 11.5463],
                    [104.9328, 11.5313],
                    [104.9202, 11.5267],
                    [104.9112, 11.5364],
                    [104.9138, 11.5435]
                ]
                out_features.append({
                    "type": "Feature",
                    "id": "chamkar-mon",
                    "properties": {"id": "chamkar-mon", "nameKm": KHAN_META["chamkar-mon"]["nameKm"], "nameEn": KHAN_META["chamkar-mon"]["nameEn"]},
                    "geometry": {"type": "Polygon", "coordinates": [cm_poly]}
                })
                out_features.append({
                    "type": "Feature",
                    "id": "boeng-keng-kang",
                    "properties": {"id": "boeng-keng-kang", "nameKm": KHAN_META["boeng-keng-kang"]["nameKm"], "nameEn": KHAN_META["boeng-keng-kang"]["nameEn"]},
                    "geometry": {"type": "Polygon", "coordinates": [bkk_poly]}
                })
            elif kid == "pur-senchey":
                # Kamboul is west of Pur Senchey
                kamboul_poly = [
                    [104.6850, 11.5600],
                    [104.7800, 11.5600],
                    [104.7800, 11.4700],
                    [104.6850, 11.4700],
                    [104.6850, 11.5600]
                ]
                # Filter pur senchey coordinates to east of 104.77
                out_features.append({
                    "type": "Feature",
                    "id": "pur-senchey",
                    "properties": {"id": "pur-senchey", "nameKm": KHAN_META["pur-senchey"]["nameKm"], "nameEn": KHAN_META["pur-senchey"]["nameEn"]},
                    "geometry": feat["geometry"]
                })
                out_features.append({
                    "type": "Feature",
                    "id": "kamboul",
                    "properties": {"id": "kamboul", "nameKm": KHAN_META["kamboul"]["nameKm"], "nameEn": KHAN_META["kamboul"]["nameEn"]},
                    "geometry": {"type": "Polygon", "coordinates": [kamboul_poly]}
                })
            else:
                out_features.append({
                    "type": "Feature",
                    "id": kid,
                    "properties": {"id": kid, "nameKm": meta["nameKm"], "nameEn": meta["nameEn"]},
                    "geometry": feat["geometry"]
                })

    print(f"Final output: {len(out_features)} Khans")
    os.makedirs("src/data", exist_ok=True)
    with open("src/data/phnomPenhDistricts.json", "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": out_features}, f, ensure_ascii=False)
    print("Saved to src/data/phnomPenhDistricts.json")

if __name__ == "__main__":
    run()
