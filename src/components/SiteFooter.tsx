import { ArrowUp, BarChart3, BookOpen, ExternalLink, GraduationCap, Search } from "lucide-react";

export type SiteFooterProps = {
  language: "km" | "en";
};

export default function SiteFooter({ language }: SiteFooterProps) {
  const isKm = language === "km";

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleNavClick = (hash: string) => {
    const current = window.location.hash || "#search";
    if (current.startsWith(hash)) {
      scrollToTop();
    }
  };

  return (
    <footer className="site-footer">
      <div className="shell">
        <div className="footer-content-grid">
          {/* Brand & Mission */}
          <div className="footer-brand-col">
            <a
              className="footer-brand"
              href="#search"
              onClick={(e) => {
                const current = window.location.hash || "#search";
                if (current.startsWith("#search")) {
                  e.preventDefault();
                  scrollToTop();
                }
              }}
            >
              <span className="footer-brand-mark">
                <GraduationCap size={18} strokeWidth={2.2} />
              </span>
              <span className="footer-brand-text">
                <span className="footer-brand-title">{isKm ? "បណ្ណសារលទ្ធផល" : "BacII Results Archive"}</span>
                <span className="footer-brand-subtitle">{isKm ? "ប្រឡងសញ្ញាបត្រមធ្យមសិក្សាទុតិយភូមិ" : "National Examination Archive"}</span>
              </span>
            </a>
            <p className="footer-tagline">
              {isKm
                ? "បណ្ណសារលទ្ធផលផ្លូវការនៃការប្រឡងសញ្ញាបត្រមធ្យមសិក្សាទុតិយភូមិ (បាក់ឌុប) និងផ្ទាំងវិភាគទិន្នន័យអប់រំកម្ពុជា។"
                : "Official Upper Secondary Education Diploma Examination archive and academic analytics."}
            </p>
            <p className="footer-copy">
              {isKm
                ? "© 2026 បណ្ណសារលទ្ធផល ប្រឡងសញ្ញាបត្រមធ្យមសិក្សាទុតិយភូមិ។ រក្សាសិទ្ធិគ្រប់យ៉ាង។"
                : "© 2026 BacII Results Archive. All rights reserved."}
            </p>
          </div>

          {/* Quick Navigation */}
          <div className="footer-nav-col">
            <h4 className="footer-col-heading">{isKm ? "រុករកទំព័រ" : "Navigation"}</h4>
            <ul>
              <li>
                <a href="#search" onClick={() => handleNavClick("#search")}>
                  <Search size={14} />
                  <span>{isKm ? "ស្វែងរកលទ្ធផល" : "Result Search"}</span>
                </a>
              </li>
              <li>
                <a href="#archive" onClick={() => handleNavClick("#archive")}>
                  <BookOpen size={14} />
                  <span>{isKm ? "បណ្ណសារផ្លូវការ" : "Official Archive"}</span>
                </a>
              </li>
              <li>
                <a href="#insights" onClick={() => handleNavClick("#insights")}>
                  <BarChart3 size={14} />
                  <span>{isKm ? "ទិន្នន័យវិភាគ" : "Data Insights"}</span>
                </a>
              </li>
            </ul>
          </div>

          {/* Data Sources & Attribution */}
          <div className="footer-source-col">
            <h4 className="footer-col-heading">{isKm ? "ប្រភពទិន្នន័យ" : "Data Sources"}</h4>
            <p>
              {isKm
                ? "ទិន្នន័យផ្លូវការប្រមូលពីសេចក្ដីប្រកាសលទ្ធផលរបស់ក្រសួងអប់រំ យុវជន និងកីឡា (MoEYS)។"
                : "Official results compiled from published records of the Ministry of Education, Youth and Sport (MoEYS)."}
            </p>
            <a
              className="footer-map-link"
              href="https://github.com/VictorCazanave/svg-maps/tree/master/packages/cambodia"
              target="_blank"
              rel="noreferrer"
            >
              <span>{isKm ? "ទិន្នន័យផែនទីកម្ពុជា" : "Cambodia Map SVG"} · CC BY 4.0</span>
              <ExternalLink size={12} />
            </a>
            <button type="button" className="footer-back-to-top" onClick={scrollToTop}>
              <ArrowUp size={13} />
              <span>{isKm ? "ត្រឡប់ទៅខាងលើ" : "Back to top"}</span>
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}

