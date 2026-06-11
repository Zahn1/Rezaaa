"use client";
/**
 * HoloScene — the REZAA holographic AI core.
 *
 * Central energy sphere (custom shaders) + three orbital data rings +
 * audio-reactive particle field, rendered with UnrealBloom, FXAA and a
 * custom hologram-distortion pass. Visual behavior is driven by the core
 * state machine (idle/listening/thinking/speaking/executing/alert).
 */
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { FXAAShader } from "three/examples/jsm/shaders/FXAAShader.js";

import type { CoreState } from "../lib/state";
import {
  CORE_VERTEX,
  CORE_FRAGMENT,
  PARTICLE_VERTEX,
  PARTICLE_FRAGMENT,
  HOLOGRAM_PASS,
} from "./shaders";

interface StateParams {
  glow: number;
  turbulence: number;
  pulse: number;
  rotation: number;
  ringSpeed: number;
  attract: number;
  expand: number;
  color: THREE.Color;
  bloom: number;
}

const ARC = new THREE.Color("#00E5FF");
const CYAN = new THREE.Color("#00FFFF");
const DEEP = new THREE.Color("#0A84FF");
const ALERT = new THREE.Color("#FF2D4D");

const STATE_PARAMS: Record<CoreState, StateParams> = {
  idle: { glow: 0.9, turbulence: 0.25, pulse: 1.4, rotation: 0.15, ringSpeed: 1, attract: 0, expand: 0, color: ARC, bloom: 1.1 },
  listening: { glow: 1.3, turbulence: 0.35, pulse: 3.2, rotation: 0.25, ringSpeed: 1.6, attract: 0.2, expand: 0, color: CYAN, bloom: 1.4 },
  thinking: { glow: 1.1, turbulence: 1.0, pulse: 2.2, rotation: 1.1, ringSpeed: 2.6, attract: 1, expand: 0, color: DEEP, bloom: 1.3 },
  speaking: { glow: 1.6, turbulence: 0.5, pulse: 6.0, rotation: 0.45, ringSpeed: 1.8, attract: 0, expand: 1, color: ARC, bloom: 1.7 },
  executing: { glow: 1.2, turbulence: 0.6, pulse: 4.0, rotation: 0.8, ringSpeed: 3.2, attract: 0.6, expand: 0.3, color: CYAN, bloom: 1.4 },
  alert: { glow: 1.5, turbulence: 1.4, pulse: 9.0, rotation: 0.6, ringSpeed: 2.0, attract: 0, expand: 0.4, color: ALERT, bloom: 1.8 },
};

export class HoloScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private composer: EffectComposer;
  private bloomPass: UnrealBloomPass;
  private holoPass: ShaderPass;
  private fxaaPass: ShaderPass;
  private clock = new THREE.Clock();

  private core: THREE.Mesh;
  private coreMat: THREE.ShaderMaterial;
  private rings: THREE.Mesh[] = [];
  private particles: THREE.Points;
  private particleMat: THREE.ShaderMaterial;

  private target: StateParams = STATE_PARAMS.idle;
  private current = { ...STATE_PARAMS.idle, color: STATE_PARAMS.idle.color.clone() };
  private audioLevel = 0;
  private shockStart = -1;
  private raf = 0;
  private frames = 0;
  private lastFpsAt = performance.now();
  onFps?: (fps: number) => void;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(new THREE.Color("#050B1F"), 1);

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    this.camera.position.set(0, 0.6, 8.5);
    this.camera.lookAt(0, 0, 0);

    // --- central energy sphere ---
    this.coreMat = new THREE.ShaderMaterial({
      vertexShader: CORE_VERTEX,
      fragmentShader: CORE_FRAGMENT,
      uniforms: {
        uTime: { value: 0 },
        uGlow: { value: 1 },
        uPulse: { value: 1.4 },
        uTurbulence: { value: 0.25 },
        uAudio: { value: 0 },
        uColor: { value: ARC.clone() },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.45, 64), this.coreMat);
    this.scene.add(this.core);

    // inner solid heart for depth
    const heart = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.85, 32),
      new THREE.MeshBasicMaterial({ color: 0x031018 }),
    );
    this.scene.add(heart);

    // --- orbital data rings (memory / processing / monitoring) ---
    const ringDefs = [
      { radius: 2.3, tube: 0.012, tiltX: Math.PI / 2.2, tiltZ: 0.0, opacity: 0.65 },
      { radius: 3.1, tube: 0.01, tiltX: Math.PI / 1.8, tiltZ: 0.5, opacity: 0.45 },
      { radius: 4.0, tube: 0.008, tiltX: Math.PI / 2.6, tiltZ: -0.7, opacity: 0.3 },
    ];
    for (const def of ringDefs) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(def.radius, def.tube, 8, 220),
        new THREE.MeshBasicMaterial({
          color: ARC,
          transparent: true,
          opacity: def.opacity,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      ring.rotation.set(def.tiltX, 0, def.tiltZ);
      this.scene.add(ring);
      this.rings.push(ring);
    }

    // --- particle field ---
    const COUNT = 4500;
    const geo = new THREE.BufferGeometry();
    const seeds = new Float32Array(COUNT * 3);
    const sizes = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      seeds[i * 3] = Math.random();
      seeds[i * 3 + 1] = Math.random();
      seeds[i * 3 + 2] = Math.random();
      sizes[i] = 0.4 + Math.random() * 1.4;
    }
    // position attribute is required by three even though the shader ignores it
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 50);

    this.particleMat = new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VERTEX,
      fragmentShader: PARTICLE_FRAGMENT,
      uniforms: {
        uTime: { value: 0 },
        uAttract: { value: 0 },
        uExpand: { value: 0 },
        uAudio: { value: 0 },
        uShockAge: { value: -1 },
        uColor: { value: ARC.clone() },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.particles = new THREE.Points(geo, this.particleMat);
    this.scene.add(this.particles);

    // --- post-processing: bloom + hologram distortion + FXAA ---
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.6, 0.4, 0.32);
    this.composer.addPass(this.bloomPass);
    this.holoPass = new ShaderPass(HOLOGRAM_PASS as never);
    this.composer.addPass(this.holoPass);
    this.fxaaPass = new ShaderPass(FXAAShader);
    this.composer.addPass(this.fxaaPass);

    this.resize();
    window.addEventListener("resize", this.resize);
    this.animate();
  }

  setState(state: CoreState) {
    this.target = STATE_PARAMS[state];
  }

  setAudioLevel(level: number) {
    this.audioLevel = level;
  }

  shockwave() {
    this.shockStart = this.clock.getElapsedTime();
  }

  private resize = () => {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const pr = this.renderer.getPixelRatio();
    (this.fxaaPass.material.uniforms.resolution.value as THREE.Vector2).set(
      1 / (w * pr),
      1 / (h * pr),
    );
  };

  private animate = () => {
    this.raf = requestAnimationFrame(this.animate);
    const t = this.clock.getElapsedTime();
    const dt = Math.min(this.clock.getDelta() + 0.0001, 0.05);
    const k = 1 - Math.exp(-dt * 4.5); // smooth state transitions

    const c = this.current;
    const g = this.target;
    c.glow += (g.glow - c.glow) * k;
    c.turbulence += (g.turbulence - c.turbulence) * k;
    c.pulse += (g.pulse - c.pulse) * k;
    c.rotation += (g.rotation - c.rotation) * k;
    c.ringSpeed += (g.ringSpeed - c.ringSpeed) * k;
    c.attract += (g.attract - c.attract) * k;
    c.expand += (g.expand - c.expand) * k;
    c.bloom += (g.bloom - c.bloom) * k;
    c.color.lerp(g.color, k);

    const audio = this.audioLevel;

    // core
    this.core.rotation.y += dt * c.rotation;
    this.core.rotation.x = Math.sin(t * 0.2) * 0.12;
    const cu = this.coreMat.uniforms;
    cu.uTime.value = t;
    cu.uGlow.value = c.glow;
    cu.uPulse.value = c.pulse;
    cu.uTurbulence.value = c.turbulence;
    cu.uAudio.value = audio;
    (cu.uColor.value as THREE.Color).copy(c.color);

    // rings rotate independently and react to system state
    this.rings.forEach((ring, i) => {
      const dir = i % 2 === 0 ? 1 : -1;
      ring.rotation.z += dt * c.ringSpeed * 0.25 * dir * (1 + i * 0.4);
      (ring.material as THREE.MeshBasicMaterial).color.copy(c.color);
    });

    // particles
    const pu = this.particleMat.uniforms;
    pu.uTime.value = t;
    pu.uAttract.value = c.attract;
    pu.uExpand.value = c.expand;
    pu.uAudio.value = audio;
    (pu.uColor.value as THREE.Color).copy(c.color);
    pu.uShockAge.value =
      this.shockStart >= 0 && t - this.shockStart < 1.6 ? t - this.shockStart : -1;

    // post fx
    this.bloomPass.strength = c.bloom * 0.45 + audio * 0.35;
    this.holoPass.uniforms.uTime.value = t;

    // slow cinematic camera drift
    this.camera.position.x = Math.sin(t * 0.07) * 0.5;
    this.camera.position.y = 0.6 + Math.sin(t * 0.11) * 0.2;
    this.camera.lookAt(0, 0, 0);

    this.composer.render();

    this.frames++;
    const now = performance.now();
    if (now - this.lastFpsAt >= 1000) {
      this.onFps?.(this.frames);
      this.frames = 0;
      this.lastFpsAt = now;
    }
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.resize);
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
        obj.geometry.dispose();
        const mat = obj.material as THREE.Material | THREE.Material[];
        (Array.isArray(mat) ? mat : [mat]).forEach((m) => m.dispose());
      }
    });
    this.composer.dispose();
    this.renderer.dispose();
  }
}
