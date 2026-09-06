import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import ArchivePage from "./ArchivePage";
import InsightsPage from "./InsightsPage";
import AdminPage from "./AdminPage";
import "./styles.css";

type Route = "scanner" | "archive" | "insights";

function currentRoute(): Route {
  if (window.location.hash.startsWith("#insights")) return "insights";
  if (window.location.hash.startsWith("#archive")) return "archive";
  return "scanner";
}

function Root() {
  if (window.location.pathname.replace(/\/$/, "").endsWith("/admin") || window.location.hash.startsWith("#admin")) {
    return <AdminPage />;
  }
  const [route, setRoute] = useState<Route>(currentRoute);
  useEffect(() => {
    const updateRoute = () => {
      const nextRoute = currentRoute();
      setRoute((prev) => {
        if (prev !== nextRoute) {
          window.scrollTo({ top: 0, left: 0 });
        }
        return nextRoute;
      });
    };
    window.addEventListener("hashchange", updateRoute);
    return () => window.removeEventListener("hashchange", updateRoute);
  }, []);
  return route === "archive" ? <ArchivePage /> : route === "insights" ? <InsightsPage /> : <App />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
