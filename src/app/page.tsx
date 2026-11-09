// Owner: Hemanth (A) — task A7. Server component so the page can set its own
// metadata; the interactive UI lives in ./talkbridge-app.tsx.
import type { Metadata } from "next";
import { TalkBridgeApp } from "./talkbridge-app";

export const metadata: Metadata = {
  title: "TalkBridge — conference prep for everyone",
  description:
    "Find the right conference talk and get a preparation guide in your language and at your level.",
};

export default function Home() {
  return <TalkBridgeApp />;
}
