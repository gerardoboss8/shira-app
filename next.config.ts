import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Servidor autocontenido para Docker (imagen mínima).
  output: "standalone",
  // Fija la raíz del proyecto (hay otro package-lock.json en el home del usuario).
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
