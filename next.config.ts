import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Verhindert, dass Next.js die Workspace-Root falsch erkennt, wenn
  // ausserhalb des Repos (z. B. im Home-Verzeichnis) ein weiteres
  // package-lock.json liegt.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
