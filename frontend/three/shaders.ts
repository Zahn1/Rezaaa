/**
 * GLSL shader library for the REZAA holographic core.
 * - Arc reactor core: noise-displaced sphere with fresnel emission + flicker
 * - Particle field: orbital data points with core attraction, audio
 *   displacement and clap shockwaves
 * - Hologram pass: full-screen scanlines, flicker and digital interference
 */

export const SIMPLEX_NOISE = /* glsl */ `
// Ashima simplex noise 3D (public domain)
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);
  const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;
  vec4 s1=floor(b1)*2.0+1.0;
  vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);
  vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);
  vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
  m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
`;

export const CORE_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uTurbulence;
uniform float uAudio;
varying vec3 vNormal;
varying vec3 vView;
varying float vNoise;
${SIMPLEX_NOISE}
void main(){
  float n = snoise(normal * 2.2 + uTime * 0.45);
  float n2 = snoise(normal * 5.5 - uTime * 0.9);
  float displacement = n * uTurbulence * 0.22 + n2 * uAudio * 0.18;
  vec3 displaced = position + normal * displacement;
  vNoise = n;
  vNormal = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(displaced, 1.0);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

export const CORE_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uGlow;
uniform float uPulse;
uniform float uAudio;
uniform vec3 uColor;
varying vec3 vNormal;
varying vec3 vView;
varying float vNoise;
void main(){
  float fresnel = pow(1.0 - clamp(dot(vNormal, vView), 0.0, 1.0), 2.2);
  // pulsating radial energy
  float pulse = 0.65 + 0.35 * sin(uTime * uPulse);
  // noise-based flicker
  float flicker = 0.92 + 0.08 * sin(uTime * 31.0 + vNoise * 14.0);
  vec3 color = uColor * (fresnel * 2.4 + 0.25) * pulse * flicker * uGlow;
  color += uColor * uAudio * fresnel * 1.6; // audio-reactive emission
  gl_FragColor = vec4(color, clamp(fresnel * 1.4 + 0.18, 0.0, 1.0));
}
`;

export const PARTICLE_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uAttract;   // 1 = pulled toward core (thinking)
uniform float uExpand;    // 1 = pushed outward (speaking)
uniform float uAudio;
uniform float uShockAge;  // seconds since clap shockwave; <0 = none
attribute vec3 aSeed;
attribute float aSize;
varying float vAlpha;
${SIMPLEX_NOISE}
void main(){
  // base orbital position derived from per-particle seed
  float radius = 2.2 + aSeed.x * 4.5;
  float speed = 0.05 + aSeed.y * 0.18;
  float angle = aSeed.z * 6.28318 + uTime * speed;
  float y = (aSeed.y - 0.5) * 5.0 + snoise(aSeed * 3.0 + uTime * 0.1) * 0.6;
  vec3 pos = vec3(cos(angle) * radius, y, sin(angle) * radius);

  // flow toward the core while processing, outward while responding
  float pull = uAttract * 0.55 - uExpand * 0.5;
  pos *= 1.0 - pull * (0.4 + 0.6 * sin(uTime * 1.4 + aSeed.x * 9.0));

  // audio-reactive displacement
  pos += normalize(pos) * uAudio * 0.7 * snoise(aSeed * 7.0 + uTime);

  // clap shockwave: expanding spherical band
  if (uShockAge >= 0.0) {
    float wave = uShockAge * 9.0;
    float band = exp(-pow(length(pos) - wave, 2.0) * 2.5);
    pos += normalize(pos) * band * 1.6;
  }

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_PointSize = aSize * (52.0 / -mv.z) * (1.0 + uAudio * 0.8);
  vAlpha = 0.10 + 0.30 * aSeed.y;
  gl_Position = projectionMatrix * mv;
}
`;

export const PARTICLE_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;
void main(){
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  float glow = exp(-d * d * 18.0);
  if (glow < 0.03) discard;
  gl_FragColor = vec4(uColor * glow * 0.7, glow * vAlpha);
}
`;

export const HOLOGRAM_PASS = {
  uniforms: {
    tDiffuse: { value: null as unknown },
    uTime: { value: 0 },
    uIntensity: { value: 1.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uIntensity;
    varying vec2 vUv;
    float rand(vec2 co){return fract(sin(dot(co, vec2(12.9898,78.233))) * 43758.5453);}
    void main(){
      vec2 uv = vUv;
      // occasional digital interference: horizontal slice offset
      float interference = step(0.985, rand(vec2(floor(uTime * 6.0), floor(uv.y * 40.0))));
      uv.x += interference * (rand(vec2(uTime, uv.y)) - 0.5) * 0.02 * uIntensity;
      // subtle chromatic shift
      float shift = 0.0015 * uIntensity;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + vec2(shift, 0.0)).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - vec2(shift, 0.0)).b;
      // scanlines
      float scan = 0.94 + 0.06 * sin(uv.y * 900.0 + uTime * 8.0);
      // global flicker
      float flicker = 0.985 + 0.015 * sin(uTime * 47.0);
      // vignette into deep space
      float vig = smoothstep(1.25, 0.45, length(uv - 0.5) * 1.6);
      gl_FragColor = vec4(col * scan * flicker * vig, 1.0);
    }
  `,
};
