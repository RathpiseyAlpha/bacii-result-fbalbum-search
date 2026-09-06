import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { maskStudentFirstName } from "../utils/privacy";

const apiBase = import.meta.env.VITE_API_BASE || "";
function apiUrl(path: string) {
  return `${apiBase}${path}`;
}

export type StudentNameDisplayProps = {
  cropUrl?: string;
  nameFallback?: string;
  tableNumber?: number | string;
  height?: number;
  compact?: boolean;
  language?: "km" | "en";
  initiallyMasked?: boolean;
  className?: string;
};

export function StudentNameDisplay({
  cropUrl,
  nameFallback,
  tableNumber,
  height = 32,
  compact = false,
  language = "km",
  initiallyMasked = true,
  className = "",
}: StudentNameDisplayProps) {
  const [isMasked, setIsMasked] = useState(initiallyMasked);
  const [imageFailed, setImageFailed] = useState(false);

  const fullUrl = cropUrl ? (cropUrl.startsWith("http") ? cropUrl : apiUrl(cropUrl)) : "";
  const isKm = language === "km";

  const toggleText = isMasked
    ? isKm
      ? "បង្ហាញឈ្មោះពេញ"
      : "Reveal full name"
    : isKm
      ? "បិទបាំងត្រកូល"
      : "Mask first half";

  const renderTextFallback = () => {
    const rawName = nameFallback || (tableNumber ? `#${tableNumber}` : "");
    const displayName = isMasked && nameFallback ? maskStudentFirstName(rawName) : rawName;

    return (
      <span
        className={`official-name-text-fallback ${isMasked ? "name-masked-text" : ""}`}
        title={rawName}
      >
        {displayName}
      </span>
    );
  };

  return (
    <div
      className={`student-privacy-wrapper ${compact ? "compact" : ""} ${
        isMasked ? "status-masked" : "status-revealed"
      } ${className}`}
    >
      <div className="student-name-shield-container">
        {imageFailed || !fullUrl ? (
          renderTextFallback()
        ) : (
          <div className="official-student-name-crop">
            <img
              src={fullUrl}
              alt={nameFallback || `Student #${tableNumber}`}
              style={{ height: `${height}px`, maxHeight: `${height}px` }}
              onError={() => setImageFailed(true)}
              loading="lazy"
            />
            {isMasked && (
              <div
                className="name-first-half-mask"
                aria-hidden="true"
                title={isKm ? "បិទបាំងត្រកូល (ពាក់កណ្ដាលដើម) ដើម្បីឯកជនភាព" : "First half masked for privacy"}
              >
                <span className="mask-dots">••••</span>
              </div>
            )}
          </div>
        )}
      </div>

      <button
        type="button"
        className="name-privacy-toggle-btn"
        onClick={(e) => {
          e.stopPropagation();
          setIsMasked((prev) => !prev);
        }}
        aria-label={toggleText}
        title={toggleText}
      >
        {isMasked ? <Eye size={compact ? 12 : 14} /> : <EyeOff size={compact ? 12 : 14} />}
        {!compact && (
          <span className="toggle-btn-label">
            {isMasked ? (isKm ? "បង្ហាញ" : "Reveal") : isKm ? "បិទបាំង" : "Mask"}
          </span>
        )}
      </button>
    </div>
  );
}

export default StudentNameDisplay;
