import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "de.openfront.replaycoach",
  appName: "OpenFront Replay Coach",
  webDir: "dist",
  bundledWebRuntime: false,
  plugins: {
    // Uses Android's native HTTP stack for OpenFront's public API and assets.
    // This avoids browser CORS rules and eliminates the need for Cloudflare.
    CapacitorHttp: {
      enabled: true,
    },
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
