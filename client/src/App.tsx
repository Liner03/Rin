import { AppProviders } from "./app/providers";
import { BootstrapStatus } from "./app/bootstrap-status";
import { AppRoutes } from "./app/routes";
import { useAppBootstrap } from "./app/use-app-bootstrap";
import { ScrollRestoration } from "./components/scroll-restoration";

function App() {
  const { config, configStatus, profile } = useAppBootstrap();

  // Wait for the real layout on first visits so route changes cannot duplicate requests.
  if (configStatus !== "ready") {
    return <BootstrapStatus failed={configStatus === "error"} />;
  }

  return (
    <AppProviders config={config} profile={profile}>
      <ScrollRestoration />
      <AppRoutes />
    </AppProviders>
  )
}

export default App
