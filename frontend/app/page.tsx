"use client";
import dynamic from "next/dynamic";
import HUD from "../components/HUD";

// Three.js requires the browser — never render the core on the server.
const RezaaCore = dynamic(() => import("../components/RezaaCore"), { ssr: false });

export default function Home() {
  return (
    <main className="relative h-screen w-screen overflow-hidden bg-void">
      <RezaaCore />
      <HUD />
      {/* ambient scanline sweep over the whole HUD */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-24 animate-scanline bg-gradient-to-b from-transparent via-arc/5 to-transparent" />
    </main>
  );
}
