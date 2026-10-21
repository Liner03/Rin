import { AppProviders } from "./app/providers";
import { AppRoutes } from "./app/routes";
import { useAppBootstrap } from "./app/use-app-bootstrap";
import { ScrollRestoration } from "./components/scroll-restoration";

function App() {
  const { config, profile } = useAppBootstrap();

  return (
    <AppProviders config={config} profile={profile}>
      <ScrollRestoration />
      <AppRoutes />
    </AppProviders>
  )
}

export default App
