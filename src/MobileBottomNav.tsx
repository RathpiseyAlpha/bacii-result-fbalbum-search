import { Search, Archive, BarChart3 } from "lucide-react";

type MobileBottomNavProps = {
  currentRoute: "scanner" | "archive" | "insights";
  language: "en" | "km";
};

export function MobileBottomNav({ currentRoute, language }: MobileBottomNavProps) {
  const isKm = language === "km";

  const handleItemClick = (target: "scanner" | "archive" | "insights", e: React.MouseEvent<HTMLAnchorElement>) => {
    if (currentRoute === target) {
      if (target === "scanner") {
        window.location.hash = "#search";
      } else {
        window.location.hash = `#${target}`;
      }
      window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
    }
  };

  return (
    <nav className="mobile-bottom-nav" aria-label={isKm ? "ការរុករកចម្បងលើទូរស័ព្ទ" : "Mobile primary navigation"}>
      <a
        href="#top"
        onClick={(e) => handleItemClick("scanner", e)}
        className={`mobile-nav-item ${currentRoute === "scanner" ? "active" : ""}`}
        aria-current={currentRoute === "scanner" ? "page" : undefined}
      >
        <span className="mobile-nav-icon-wrap">
          <Search size={19} strokeWidth={currentRoute === "scanner" ? 2.5 : 2} />
        </span>
        <span className="mobile-nav-label">{isKm ? "ស្វែងរក" : "Search"}</span>
      </a>

      <a
        href="#archive"
        onClick={(e) => handleItemClick("archive", e)}
        className={`mobile-nav-item ${currentRoute === "archive" ? "active" : ""}`}
        aria-current={currentRoute === "archive" ? "page" : undefined}
      >
        <span className="mobile-nav-icon-wrap">
          <Archive size={19} strokeWidth={currentRoute === "archive" ? 2.5 : 2} />
        </span>
        <span className="mobile-nav-label">{isKm ? "បណ្ណសារ" : "Archive"}</span>
      </a>

      <a
        href="#insights"
        onClick={(e) => handleItemClick("insights", e)}
        className={`mobile-nav-item ${currentRoute === "insights" ? "active" : ""}`}
        aria-current={currentRoute === "insights" ? "page" : undefined}
      >
        <span className="mobile-nav-icon-wrap">
          <BarChart3 size={19} strokeWidth={currentRoute === "insights" ? 2.5 : 2} />
        </span>
        <span className="mobile-nav-label">{isKm ? "វិភាគ" : "Insights"}</span>
      </a>
    </nav>
  );
}

export default MobileBottomNav;
