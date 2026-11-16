import { networkInterfaces } from "node:os";

// Docker, VPN and Apple's own links are never the address other laptops use.
const SKIP =
  /^(lo|docker|br-|veth|utun|awdl|llw|bridge|vboxnet|vmnet|tailscale|zt|anpi|ap)/;
const rank = (name) => (/^(en|eth|wl)/.test(name) ? 0 : 1);

/**
 * This laptop's IPv4 address on the Wi-Fi or hotspot, or `DEMO_HOST` when it
 * is set (for a laptop with more than one network). Null without a network.
 */
export function lanAddress() {
  if (process.env.DEMO_HOST) return process.env.DEMO_HOST;
  const found = [];
  for (const [name, addresses] of Object.entries(networkInterfaces())) {
    if (SKIP.test(name)) continue;
    for (const address of addresses ?? []) {
      if (address.family === "IPv4" && !address.internal) {
        found.push({ name, address: address.address });
      }
    }
  }
  found.sort((a, b) => rank(a.name) - rank(b.name));
  return found[0]?.address ?? null;
}
