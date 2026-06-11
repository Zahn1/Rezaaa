"use client";
import { useEffect, useRef, useState } from "react";
import { HoloScene } from "../three/HoloScene";
import { controller } from "../lib/controller";
// HoloScene type is re-exported for HUD consumers
export type { HoloScene };
import { useRezaa } from "../lib/state";

export default function RezaaCore() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fps, setFps] = useState(0);
  const [ripple, setRipple] = useState(0);
  const coreState = useRezaa((s) => s.coreState);
  const shockwaveAt = useRezaa((s) => s.shockwaveAt);

  const [webglFailed, setWebglFailed] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    let scene: HoloScene;
    try {
      scene = new HoloScene(canvasRef.current);
    } catch {
      setWebglFailed(true); // no WebGL (headless/VM) — HUD still works
      return;
    }
    scene.onFps = setFps;
    controller.attachScene(scene);
    return () => {
      controller.detachScene();
      scene.dispose();
    };
  }, []);

  // forward state machine changes into the 3D core
  useEffect(() => {
    controller.setCoreVisualState(coreState);
  }, [coreState]);

  // screen-wide ripple on clap shockwaves
  useEffect(() => {
    if (!shockwaveAt) return;
    setRipple((r) => r + 1);
  }, [shockwaveAt]);

  return (
    <div className="absolute inset-0">
      <canvas ref={canvasRef} className="h-full w-full" />
      {webglFailed && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center font-hud text-sm text-arc/60">
          HOLOGRAPHIC CORE OFFLINE — WebGL unavailable in this environment
        </div>
      )}
      {ripple > 0 && (
        <div
          key={ripple}
          className="pointer-events-none absolute inset-0 animate-[ripple_0.9s_ease-out_forwards] rounded-full border border-arc/60"
          style={{ margin: "auto", width: "10vmin", height: "10vmin" }}
        />
      )}
      <div className="pointer-events-none absolute bottom-3 right-4 font-hud text-xs text-arc/50">
        {fps} FPS
      </div>
    </div>
  );
}
