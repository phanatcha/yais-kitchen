// npm run demo: a live class video call between laptops on one network, for
// showing the product. See docs/live-demo.md.
//   1. Starts the stack with LiveKit, booking and live-class.
//   2. Makes a demo class starting in 5 minutes, with a helper, the Yai's
//      family and a guest who has paid (infra/demo-class.js).
//   3. Serves the web app over HTTPS on this laptop's network address, so the
//      other laptops may use their camera and microphone.
import { spawn, spawnSync } from "node:child_process";
import { lanAddress } from "./lan.js";

const host = lanAddress();
if (!host) {
  console.error(
    "This laptop has no network address. Join the Wi-Fi or hotspot first, or set DEMO_HOST.",
  );
  process.exit(1);
}
console.log(`This laptop is ${host} on the network.\n`);

function run(command, args, env = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(
  "docker",
  [
    "compose",
    "-f",
    "infra/docker-compose.yml",
    "-f",
    "infra/live.compose.yml",
    "up",
    "-d",
    "--build",
    "--wait",
  ],
  { LIVEKIT_NODE_IP: host },
);
run(process.execPath, ["infra/demo-class.js"], { DEMO_HOST: host });

const web = spawn("npm", ["run", "dev:lan", "-w", "@yais-kitchen/web"], {
  stdio: "inherit",
});
web.on("exit", (code) => process.exit(code ?? 0));
