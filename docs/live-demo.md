# Live class demo

A real video call between laptops on the same network: the guest, the helper and the Yai's kitchen join one class, see and hear each other, and follow the recipe together. Nothing goes to the internet. One laptop (the host) runs everything, and the others only need a browser.

## What you need

- The host: Docker running, and the project set up (`npm install` and `npm run setup`, see the main README).
- Every laptop on the same Wi-Fi. University Wi-Fi often stops devices reaching each other, so a phone hotspot is the safe choice.
- Chrome, Edge or Safari, with a camera and microphone.

## Start it

On the host:

```bash
npm run demo
```

It starts everything (the first time builds booking and live-class, which takes a few minutes), makes a demo class and keeps the web app running. Leave that terminal open. It prints something like:

```
Demo class: Green Curry with Yai Lamduan, 14:05 to 15:35 Thailand time. Joining is open now.

On each laptop, open https://192.168.1.20:5173, accept the certificate warning once, and
sign in. Codes arrive in Mailpit on this laptop: http://localhost:8025

  Guest          guest@example.com    https://192.168.1.20:5173/my-classes/…/live
  Helper         helper@example.com   https://192.168.1.20:5173/helper/classes/…/live
  Yai's kitchen  yai@example.com      https://192.168.1.20:5173/family/classes/…/live
```

If macOS asks whether to accept incoming connections, allow them.

## Join

On each laptop:

1. Open the address it printed. The browser warns that the certificate isn't trusted, because the host made it itself. Choose **Advanced**, then **Proceed** (Chrome) or **Show details**, then **visit this website** (Safari).
2. Sign in with that laptop's email. The code arrives in Mailpit on the host, at http://localhost:8025, so read it out from there.
3. Open the link for that person, and allow the camera and microphone.

What each person sees:

- **Guest**: the Yai's kitchen big, themselves top right, the helper below. They can also get there from My classes, then Get ready, then Join the live class.
- **Helper**: the same call, plus Next step, Back a step and End class. Moving a step moves it for everyone.
- **Yai's kitchen**: the Yai's family runs the camera that points at the stove. They can also get there from the Yai's bookings page, with Open the kitchen camera.

The kitchen fills the big picture when it joins. Until then, the helper does. Mute, Stop video and Leave work for real.

## Another class

Each class lasts 90 minutes from 5 minutes after it is made, and End class closes it for good. For a fresh one, in a second terminal on the host:

```bash
npm run demo:class
```

## Stop it

Press Ctrl+C in the demo terminal, then:

```bash
npm run demo:down
```

## If something is wrong

| What you see                                             | What to do                                                                                                                                   |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| "We couldn't use your camera or microphone"              | Allow them for the site in the browser (the icon at the left of the address bar), then press Mute or Stop video to turn them back on.        |
| "Joining is not available now" or "This class has ended" | The class is over. Run `npm run demo:class` for a new one.                                                                                   |
| The others never appear, or video freezes                | Check every laptop is on the same network. If the host changed networks, stop and run `npm run demo` again, so LiveKit gets the new address. |
| The page doesn't open on another laptop                  | Use the host's address, not `localhost`, and allow incoming connections on the host.                                                         |
| "Your browser paused the sound"                          | Press Turn on sound.                                                                                                                         |

## How it works

- `infra/live.compose.yml` adds LiveKit's open-source media server in development mode, plus the real booking and live-class services. Payment stays on the mock server, so `infra/demo-class.js` pays for the demo booking by sending booking the same `payment.succeeded` event payment would.
- `npm run dev:lan` serves the web app over HTTPS on the host's network address, because browsers only allow the camera on HTTPS or `localhost`. The certificate is self-signed (`@vitejs/plugin-basic-ssl`).
- The API (`/api`) and LiveKit's signalling (`/rtc`) go through that same address, so nothing is blocked as mixed content. Audio and video go straight to LiveKit on ports 7881 (TCP) and 7882 (UDP) of the host.
- live-class checks who may join, as in production: the class's helper, the Yai's family, admins, and guests with a paid booking. Each person shows to the others by first name only.
- For real classes, LiveKit Cloud or a hosted LiveKit server takes the place of the container, with `LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` set for live-class.
