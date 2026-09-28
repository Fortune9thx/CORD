import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useEffect } from "react";

import { Banner, Footer, HealthProvider, Nav } from "./components/Chrome";
import { Blobs } from "./components/ui";
import Activity from "./pages/Activity";
import Checks from "./pages/Checks";
import Delegate from "./pages/Delegate";
import GrantDetail from "./pages/GrantDetail";
import Grants from "./pages/Grants";
import Home from "./pages/Home";
import NewGrant from "./pages/NewGrant";
import Prove from "./pages/Prove";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => window.scrollTo(0, 0), [pathname]);
  return null;
}

export default function App() {
  return (
    <HealthProvider>
      <Blobs />
      <ScrollToTop />
      <Nav />
      <Banner />
      <main className="min-h-[70vh]">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/app" element={<Grants />} />
          <Route path="/app/grants/new" element={<NewGrant />} />
          <Route path="/app/grants/:id" element={<GrantDetail />} />
          <Route path="/app/delegate/:id" element={<Delegate />} />
          <Route path="/app/prove/:id" element={<Prove />} />
          <Route path="/app/checks" element={<Checks />} />
          <Route path="/app/activity" element={<Activity />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Footer />
    </HealthProvider>
  );
}
