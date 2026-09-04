import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import phnomPenhGeoJson from "./data/phnomPenhDistricts.json";

export type HeatMetric = "gradeA" | "candidates" | "scienceRatio" | "schools";

export type DistrictStatItem = {
  id: string;
  nameKm: string;
  nameEn: string;
  schoolsCount: number;
  candidateCount: number;
  gradeA: number;
  gradeAPercent: number;
  femaleCount: number;
  femalePercent: number;
  scienceCount: number;
  socialCount: number;
  publicCount: number;
  privateCount: number;
};

interface RealCapitalMapProps {
  districts: DistrictStatItem[];
  selectedKhan: string | null;
  onSelectKhan: (khanId: string | null) => void;
  heatMetric: HeatMetric;
  language: "en" | "km";
  theme: "light" | "dark";
}

const TILE_PROVIDERS = {
  voyager: {
    nameKm: "ផែនទីផ្លូវ",
    nameEn: "Street Map",
    icon: "🗺️",
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    options: {
      subdomains: "abcd",
      maxZoom: 19,
      attribution: '&copy; <a href="https://carto.com/">CARTO</a>, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    },
  },
  satellite: {
    nameKm: "ផ្កាយរណប",
    nameEn: "Satellite",
    icon: "🛰️",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    options: {
      maxZoom: 19,
      attribution: "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community",
    },
  },
  dark: {
    nameKm: "ផែនទីងងឹត",
    nameEn: "Dark Mode",
    icon: "🌙",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    options: {
      subdomains: "abcd",
      maxZoom: 19,
      attribution: '&copy; <a href="https://carto.com/">CARTO</a>, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    },
  },
};

function getMetricValue(d: DistrictStatItem | undefined, metric: HeatMetric): number {
  if (!d) return 0;
  if (metric === "gradeA") return d.gradeA;
  if (metric === "candidates") return d.candidateCount;
  if (metric === "scienceRatio") {
    const total = d.scienceCount + d.socialCount;
    return total > 0 ? (d.scienceCount / total) * 100 : 0;
  }
  if (metric === "schools") return d.publicCount + d.privateCount;
  return 0;
}

function getMetricColor(
  val: number,
  min: number,
  max: number,
  metric: HeatMetric,
  isSelected: boolean
): { fill: string; stroke: string } {
  if (isSelected) {
    return { fill: "#f59e0b", stroke: "#d97706" };
  }
  const ratio = max > min ? Math.max(0, Math.min(1, (val - min) / (max - min))) : 0.35;

  if (metric === "gradeA") {
    return {
      fill: `rgba(245, 158, 11, ${0.28 + ratio * 0.55})`,
      stroke: "#d97706",
    };
  } else if (metric === "candidates") {
    return {
      fill: `rgba(16, 185, 129, ${0.28 + ratio * 0.55})`,
      stroke: "#059669",
    };
  } else if (metric === "scienceRatio") {
    return {
      fill: `rgba(6, 182, 212, ${0.28 + ratio * 0.55})`,
      stroke: "#0891b2",
    };
  } else {
    return {
      fill: `rgba(139, 92, 246, ${0.28 + ratio * 0.55})`,
      stroke: "#7c3aed",
    };
  }
}

export default function RealCapitalMap({
  districts,
  selectedKhan,
  onSelectKhan,
  heatMetric,
  language,
  theme,
}: RealCapitalMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const geoJsonLayerRef = useRef<L.GeoJSON | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markersGroupRef = useRef<L.LayerGroup | null>(null);

  const [activeTileType, setActiveTileType] = useState<"voyager" | "satellite" | "dark">(
    theme === "dark" ? "dark" : "voyager"
  );

  // Compute min and max for active metric
  const { minVal, maxVal } = React.useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    for (const d of districts) {
      const v = getMetricValue(d, heatMetric);
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (min === Infinity) min = 0;
    if (max === -Infinity || max === min) max = min + 1;
    return { minVal: min, maxVal: max };
  }, [districts, heatMetric]);

  // Sync theme with initial tile type
  useEffect(() => {
    if (theme === "dark" && activeTileType === "voyager") {
      setActiveTileType("dark");
    } else if (theme === "light" && activeTileType === "dark") {
      setActiveTileType("voyager");
    }
  }, [theme]);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    // Centered at heart of Phnom Penh
    const map = L.map(mapContainerRef.current, {
      center: [11.562, 104.908],
      zoom: 12,
      zoomControl: false,
      attributionControl: false,
      minZoom: 10,
      maxZoom: 18,
    });

    const tileInfo = TILE_PROVIDERS[activeTileType];
    const tileLayer = L.tileLayer(tileInfo.url, tileInfo.options).addTo(map);
    tileLayerRef.current = tileLayer;

    const markersGroup = L.layerGroup().addTo(map);
    markersGroupRef.current = markersGroup;

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update tile provider when activeTileType changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }
    const tileInfo = TILE_PROVIDERS[activeTileType];
    const newTile = L.tileLayer(tileInfo.url, tileInfo.options).addTo(map);
    newTile.bringToBack();
    tileLayerRef.current = newTile;
  }, [activeTileType]);

  // Update GeoJSON Layer & Centroid Badges
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (geoJsonLayerRef.current) {
      map.removeLayer(geoJsonLayerRef.current);
      geoJsonLayerRef.current = null;
    }
    if (markersGroupRef.current) {
      markersGroupRef.current.clearLayers();
    }

    const formatNum = new Intl.NumberFormat();

    // Style function for real polygons
    const geoLayer = L.geoJSON(phnomPenhGeoJson as any, {
      style: (feature) => {
        const kid = feature?.properties?.id;
        const d = districts.find((item) => item.id === kid);
        const val = getMetricValue(d, heatMetric);
        const isSelected = selectedKhan === kid;
        const colors = getMetricColor(val, minVal, maxVal, heatMetric, isSelected);

        return {
          fillColor: colors.fill,
          fillOpacity: isSelected ? 0.75 : 0.55,
          color: colors.stroke,
          weight: isSelected ? 3.5 : 1.8,
          opacity: isSelected ? 1 : 0.85,
          dashArray: isSelected ? undefined : "3, 2",
        };
      },
      onEachFeature: (feature, layer) => {
        const kid = feature?.properties?.id;
        const d = districts.find((item) => item.id === kid);
        const nameKm = feature?.properties?.nameKm || d?.nameKm || kid;
        const nameEn = feature?.properties?.nameEn || d?.nameEn || kid;
        const val = getMetricValue(d, heatMetric);

        const metricLabel =
          heatMetric === "gradeA"
            ? `${formatNum.format(val)} A`
            : heatMetric === "candidates"
            ? `${formatNum.format(val)} ${language === "km" ? "បេក្ខជន" : "candidates"}`
            : heatMetric === "scienceRatio"
            ? `${val.toFixed(1)}% ${language === "km" ? "វិទ្យាសាស្ត្រ" : "Science"}`
            : `${formatNum.format(val)} ${language === "km" ? "អាគតដ្ឋាន" : "Schools"}`;

        // Tooltip
        layer.bindTooltip(
          `<div class="leaflet-khan-tooltip">
            <strong>${language === "km" ? nameKm : nameEn}</strong>
            <span>${metricLabel}</span>
          </div>`,
          { sticky: true, direction: "top", className: "custom-khan-tooltip" }
        );

        // Interaction
        layer.on({
          click: () => {
            onSelectKhan(selectedKhan === kid ? null : kid);
          },
          mouseover: (e) => {
            const target = e.target;
            target.setStyle({
              weight: 3,
              fillOpacity: 0.8,
              dashArray: undefined,
            });
            target.bringToFront();
          },
          mouseout: (e) => {
            const isSelected = selectedKhan === kid;
            const target = e.target;
            const dItem = districts.find((item) => item.id === kid);
            const v = getMetricValue(dItem, heatMetric);
            const c = getMetricColor(v, minVal, maxVal, heatMetric, isSelected);
            target.setStyle({
              fillColor: c.fill,
              fillOpacity: isSelected ? 0.75 : 0.55,
              weight: isSelected ? 3.5 : 1.8,
              dashArray: isSelected ? undefined : "3, 2",
            });
          },
        });

        // Compute centroid for HTML Badge Marker
        try {
          // @ts-ignore
          const bounds = layer.getBounds();
          const center = bounds.getCenter();

          const badgeHtml = `
            <div class="khan-center-badge ${selectedKhan === kid ? "selected" : ""}">
              <span class="badge-title">${language === "km" ? nameKm : nameEn}</span>
              <span class="badge-val">${
                heatMetric === "gradeA"
                  ? `${val} A`
                  : heatMetric === "scienceRatio"
                  ? `${val.toFixed(0)}%`
                  : formatNum.format(val)
              }</span>
            </div>
          `;

          const divIcon = L.divIcon({
            html: badgeHtml,
            className: "khan-custom-div-icon",
            iconSize: [80, 32],
            iconAnchor: [40, 16],
          });

          const marker = L.marker(center, { icon: divIcon, interactive: false });
          if (markersGroupRef.current) {
            markersGroupRef.current.addLayer(marker);
          }
        } catch {
          // Ignore centroid calculation errors for degenerate geometries
        }
      },
    }).addTo(map);

    geoJsonLayerRef.current = geoLayer;
  }, [districts, selectedKhan, heatMetric, minVal, maxVal, language]);

  function handleResetView() {
    if (!mapInstanceRef.current) return;
    mapInstanceRef.current.setView([11.562, 104.908], 12);
  }

  function handleZoomIn() {
    if (!mapInstanceRef.current) return;
    mapInstanceRef.current.zoomIn();
  }

  function handleZoomOut() {
    if (!mapInstanceRef.current) return;
    mapInstanceRef.current.zoomOut();
  }

  return (
    <div className="real-map-wrapper">
      <div ref={mapContainerRef} className="leaflet-map-canvas" />

      {/* Floating Controls Overlay */}
      <div className="map-floating-bar">
        {/* Layer Switcher */}
        <div className="map-layer-selector">
          {(["voyager", "satellite", "dark"] as const).map((type) => {
            const info = TILE_PROVIDERS[type];
            return (
              <button
                key={type}
                type="button"
                className={`layer-chip-btn ${activeTileType === type ? "active" : ""}`}
                onClick={() => setActiveTileType(type)}
                title={language === "km" ? info.nameKm : info.nameEn}
              >
                <span>{info.icon}</span>
                <span className="layer-chip-name">{language === "km" ? info.nameKm : info.nameEn}</span>
              </button>
            );
          })}
        </div>

        {/* Zoom & Center Tools */}
        <div className="map-zoom-tools">
          <button type="button" className="map-tool-btn" onClick={handleZoomIn} title="Zoom In">
            +
          </button>
          <button type="button" className="map-tool-btn" onClick={handleZoomOut} title="Zoom Out">
            &minus;
          </button>
          <button type="button" className="map-tool-btn reset" onClick={handleResetView} title="Reset View">
            ↺
          </button>
        </div>
      </div>
    </div>
  );
}
