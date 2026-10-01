import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthGate } from "./components/AuthGate";
import { Layout } from "./components/Layout";
import { BulkUploadPage } from "./pages/BulkUpload";
import { DashboardPage } from "./pages/Dashboard";
import { EventsPage } from "./pages/Events";
import { ExpiringPage } from "./pages/Expiring";
import { LogsPage } from "./pages/Logs";
import { ServerDetailPage } from "./pages/ServerDetail";
import { ServersPage } from "./pages/Servers";
import { SettingsPage } from "./pages/Settings";

export function App() {
  return (
    <AuthGate>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/servers" element={<ServersPage />} />
            <Route path="/servers/:id" element={<ServerDetailPage />} />
            <Route path="/expiring" element={<ExpiringPage />} />
            <Route path="/bulk-upload" element={<BulkUploadPage />} />
            <Route path="/events" element={<EventsPage />} />
            <Route path="/logs" element={<LogsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthGate>
  );
}
