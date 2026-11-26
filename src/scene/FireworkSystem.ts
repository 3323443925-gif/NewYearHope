import * as THREE from 'three';

type ShellStyle = 'chrysanthemum' | 'willow' | 'double_peony' | 'strobe' | 'palm';

interface Rocket {
  position: THREE.Vector3;
  history: THREE.Vector3[];
  velocity: THREE.Vector3;
  age: number;
  fuseTime: number;
  palette: number[];
  style: ShellStyle;
  grand: boolean;
  tailAccum: number;
  wobblePhase: number;
}

interface BurstFlash {
  coreSprite: THREE.Sprite;
  smokeSprite: THREE.Sprite;
  age: number;
  coreLife: number;
  smokeLife: number;
  coreMaxScale: number;
  smokeMaxScale: number;
}

interface CracklePop {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  color: number;
  delay: number;
  intensity: number;
}

interface FuseSpark {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  color: THREE.Color;
  age: number;
  life: number;
}

// Authentic pyrotechnic chemical color palettes (primary star, secondary/pistil, titanium highlight)
const FIREWORK_PALETTES: number[][] = [
  [0xffd27d, 0xff9d3b, 0xfff7dc], // Imperial Gold & Warm Amber (Charcoal/Sodium)
  [0x6ecbff, 0x9ce3ff, 0xfff3d1], // Sapphire Copper Blue & Champagne
  [0xff6f9c, 0xffb88c, 0xfff0f5], // Sakura Strontium Rose & Peach Gold
  [0xc094ff, 0x6fd0ff, 0xfff1c9], // Aurora Violet & Ice Silver
  [0x66f0c2, 0x8fdcff, 0xfff7d6], // Barium Jade Mint & Titanium White
  [0xff5c5c, 0xffbf57, 0xfff5d6], // Festive Strontium Crimson & Gold
];

const WILLOW_GOLD = [0xffe49e, 0xffb84d, 0xffd275, 0xfff4d6];
const EMBER_COOL_R = 1.0;
const EMBER_COOL_G = 0.42;
const EMBER_COOL_B = 0.12;

const TRAIL_LEN = 5; // 4 connected segments per primary star for smooth curved glowing arcs
const TRAIL_SEGMENTS = TRAIL_LEN - 1;
const MAX_FUSE_SPARKS = 110;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

// Custom GPU Spark Shader: renders razor-sharp white-hot incandescent cores,
// saturated colored coronas, and subtle diffraction glints that trigger bloom naturally.
const SPARK_VERTEX_SHADER = /* glsl */ `
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aAlpha;
  attribute float aCore;

  uniform float uViewportScale;

  varying vec3 vColor;
  varying float vAlpha;
  varying float vCore;

  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    vCore = aCore;

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float dist = max(-mvPosition.z, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = clamp(aSize * (uViewportScale / dist), 1.4, 58.0);
  }
`;

const SPARK_FRAGMENT_SHADER = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  varying float vCore;

  void main() {
    if (vAlpha <= 0.004) discard;

    vec2 uv = gl_PointCoord - vec2(0.5);
    float r2 = dot(uv, uv) * 4.0;
    if (r2 > 1.0) discard;

    // Sharp pinpoint incandescent core + smooth atmospheric spark halo
    float core = exp(-r2 * 18.0);
    float halo = exp(-r2 * 4.5);

    // Subtle 4-way optical diffraction glint on blazing hot sparks
    float ax = abs(uv.x);
    float ay = abs(uv.y);
    float rayH = exp(-ay * ay * 260.0) * exp(-ax * ax * 14.0);
    float rayV = exp(-ax * ax * 260.0) * exp(-ay * ay * 14.0);
    float glint = (rayH + rayV) * 0.32 * vCore;

    vec3 hotWhite = vec3(1.0, 0.98, 0.92);
    vec3 color = vColor * (halo * 0.85 + core * 1.15)
               + hotWhite * (core * vCore * 1.25 + glint);

    float edgeFade = 1.0 - smoothstep(0.68, 1.0, r2);
    gl_FragColor = vec4(color * vAlpha * edgeFade, vAlpha * edgeFade);
  }
`;

export class FireworkSystem {
  public readonly group = new THREE.Group();
  public readonly hitTarget: THREE.Mesh;

  private readonly maxStars: number;
  private readonly maxMicroSparks: number;
  private readonly maxTotalPoints: number;

  private readonly fuseCurve: THREE.CatmullRomCurve3;
  private unburnedTube: THREE.Mesh | null = null;
  private burnedTube: THREE.Mesh | null = null;
  private readonly unburnedMat: THREE.MeshStandardMaterial;
  private readonly burnedMat: THREE.MeshStandardMaterial;
  private lastBuiltProgress = -1;

  private readonly emberGroup = new THREE.Group();
  private readonly emberCore: THREE.Mesh;
  private readonly emberHalo: THREE.Sprite;
  private readonly emberLight: THREE.PointLight;
  private readonly skyFlashLight: THREE.PointLight;

  private readonly muzzles: THREE.Object3D[] = [];
  private readonly muzzleWorld = new THREE.Vector3();
  private readonly tmpColor = new THREE.Color();
  private readonly tmpQuat = new THREE.Quaternion();
  private readonly tmpEuler = new THREE.Euler();
  private readonly tmpVec = new THREE.Vector3();

  // Live crackling fuse sparks
  private readonly fuseSparks: FuseSpark[] = [];
  private readonly fuseSparkPositions: Float32Array;
  private readonly fuseSparkColors: Float32Array;
  private readonly fuseSparkGeo: THREE.BufferGeometry;

  // Primary burning firework stars (Structure-of-Arrays for zero-GC 60fps simulation)
  private starCount = 0;
  private readonly sX: Float32Array;
  private readonly sY: Float32Array;
  private readonly sZ: Float32Array;
  private readonly sVx: Float32Array;
  private readonly sVy: Float32Array;
  private readonly sVz: Float32Array;
  private readonly sR: Float32Array;
  private readonly sG: Float32Array;
  private readonly sB: Float32Array;
  private readonly sTrailR: Float32Array;
  private readonly sTrailG: Float32Array;
  private readonly sTrailB: Float32Array;
  private readonly sAge: Float32Array;
  private readonly sLife: Float32Array;
  private readonly sDrag: Float32Array;
  private readonly sGravity: Float32Array;
  private readonly sSize: Float32Array;
  private readonly sShedRate: Float32Array;
  private readonly sShedAccum: Float32Array;
  private readonly sPhase: Float32Array;
  private readonly sFlags: Uint8Array; // bit 0: strobe, bit 1: crackleTip, bit 2: heavyWillow
  private readonly sHist: Float32Array; // TRAIL_LEN * 3 floats per star

  // Micro-sparks pool (shed charcoal/glitter trails, flash-powder core, crackle pops, exhaust)
  private sparkCount = 0;
  private sparkEvictCursor = 0;
  private readonly pX: Float32Array;
  private readonly pY: Float32Array;
  private readonly pZ: Float32Array;
  private readonly pVx: Float32Array;
  private readonly pVy: Float32Array;
  private readonly pVz: Float32Array;
  private readonly pR: Float32Array;
  private readonly pG: Float32Array;
  private readonly pB: Float32Array;
  private readonly pAge: Float32Array;
  private readonly pLife: Float32Array;
  private readonly pDrag: Float32Array;
  private readonly pGravity: Float32Array;
  private readonly pSize: Float32Array;
  private readonly pPhase: Float32Array;
  private readonly pFlags: Uint8Array; // bit 0: twinkle, bit 1: coolToAmber, bit 2: hotFlash

  // Unified GPU buffers for all firework points (stars + micro-sparks + ascending rocket heads)
  private readonly ptPositions: Float32Array;
  private readonly ptColors: Float32Array;
  private readonly ptSizes: Float32Array;
  private readonly ptAlphas: Float32Array;
  private readonly ptCores: Float32Array;
  private readonly pointsGeo: THREE.BufferGeometry;
  private readonly pointsMat: THREE.ShaderMaterial;

  // Multi-segment curved luminous streaks behind primary stars & rockets
  private readonly trailPositions: Float32Array;
  private readonly trailColors: Float32Array;
  private readonly trailGeo: THREE.BufferGeometry;
  private readonly trailMat: THREE.LineBasicMaterial;

  private readonly glowTexture: THREE.Texture;
  private readonly onBurst?: (intensity: number) => void;

  private readonly rockets: Rocket[] = [];
  private readonly burstFlashes: BurstFlash[] = [];
  private readonly cracklePops: CracklePop[] = [];
  private scheduledLaunches: { delay: number; style: ShellStyle; grand: boolean }[] = [];
  private sparkSpawnAccum = 0;

  constructor(glowTexture: THREE.Texture, onBurst?: (intensity: number) => void) {
    this.glowTexture = glowTexture;
    this.onBurst = onBurst;

    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    this.maxStars = isMobile ? 650 : 1200;
    this.maxMicroSparks = isMobile ? 3400 : 6800;
    this.maxTotalPoints = this.maxStars + this.maxMicroSparks + 48;

    // Allocate SoA primary star buffers
    this.sX = new Float32Array(this.maxStars);
    this.sY = new Float32Array(this.maxStars);
    this.sZ = new Float32Array(this.maxStars);
    this.sVx = new Float32Array(this.maxStars);
    this.sVy = new Float32Array(this.maxStars);
    this.sVz = new Float32Array(this.maxStars);
    this.sR = new Float32Array(this.maxStars);
    this.sG = new Float32Array(this.maxStars);
    this.sB = new Float32Array(this.maxStars);
    this.sTrailR = new Float32Array(this.maxStars);
    this.sTrailG = new Float32Array(this.maxStars);
    this.sTrailB = new Float32Array(this.maxStars);
    this.sAge = new Float32Array(this.maxStars);
    this.sLife = new Float32Array(this.maxStars);
    this.sDrag = new Float32Array(this.maxStars);
    this.sGravity = new Float32Array(this.maxStars);
    this.sSize = new Float32Array(this.maxStars);
    this.sShedRate = new Float32Array(this.maxStars);
    this.sShedAccum = new Float32Array(this.maxStars);
    this.sPhase = new Float32Array(this.maxStars);
    this.sFlags = new Uint8Array(this.maxStars);
    this.sHist = new Float32Array(this.maxStars * TRAIL_LEN * 3);

    // Allocate SoA micro-spark buffers
    this.pX = new Float32Array(this.maxMicroSparks);
    this.pY = new Float32Array(this.maxMicroSparks);
    this.pZ = new Float32Array(this.maxMicroSparks);
    this.pVx = new Float32Array(this.maxMicroSparks);
    this.pVy = new Float32Array(this.maxMicroSparks);
    this.pVz = new Float32Array(this.maxMicroSparks);
    this.pR = new Float32Array(this.maxMicroSparks);
    this.pG = new Float32Array(this.maxMicroSparks);
    this.pB = new Float32Array(this.maxMicroSparks);
    this.pAge = new Float32Array(this.maxMicroSparks);
    this.pLife = new Float32Array(this.maxMicroSparks);
    this.pDrag = new Float32Array(this.maxMicroSparks);
    this.pGravity = new Float32Array(this.maxMicroSparks);
    this.pSize = new Float32Array(this.maxMicroSparks);
    this.pPhase = new Float32Array(this.maxMicroSparks);
    this.pFlags = new Uint8Array(this.maxMicroSparks);

    // 1. Ornate Imperial Starlight Firework Altar on front-right snowy terrace
    const altarGroup = new THREE.Group();
    altarGroup.position.set(4.15, 1.85, 5.15);
    altarGroup.rotation.y = -0.46;
    altarGroup.scale.setScalar(0.86);

    const lacquerMat = new THREE.MeshPhysicalMaterial({
      color: 0x8f1d32,
      emissive: 0x3b0813,
      emissiveIntensity: 0.42,
      roughness: 0.22,
      metalness: 0.28,
      clearcoat: 0.9,
      clearcoatRoughness: 0.12,
      envMapIntensity: 1.6,
    });
    const deepWoodMat = new THREE.MeshStandardMaterial({
      color: 0x3a2022,
      roughness: 0.52,
      metalness: 0.24,
      envMapIntensity: 1.2,
    });
    const goldMat = new THREE.MeshPhysicalMaterial({
      color: 0xffd580,
      emissive: 0xb8751c,
      emissiveIntensity: 0.55,
      roughness: 0.14,
      metalness: 0.92,
      clearcoat: 0.75,
      clearcoatRoughness: 0.1,
      envMapIntensity: 2.1,
    });
    const innerGlowMat = new THREE.MeshBasicMaterial({ color: 0xffe9a6 });

    const baseLower = new THREE.Mesh(
      new THREE.CylinderGeometry(1.18, 1.38, 0.32, 8),
      deepWoodMat
    );
    baseLower.position.y = 0.16;
    altarGroup.add(baseLower);

    const baseTrim = new THREE.Mesh(
      new THREE.TorusGeometry(1.18, 0.055, 8, 16),
      goldMat
    );
    baseTrim.rotation.x = Math.PI / 2;
    baseTrim.position.y = 0.34;
    altarGroup.add(baseTrim);

    const baseUpper = new THREE.Mesh(
      new THREE.CylinderGeometry(0.92, 1.08, 0.28, 8),
      lacquerMat
    );
    baseUpper.position.y = 0.46;
    altarGroup.add(baseUpper);

    const finialGeo = new THREE.OctahedronGeometry(0.14, 0);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const finial = new THREE.Mesh(finialGeo, goldMat);
      finial.position.set(Math.cos(a) * 1.06, 0.58, Math.sin(a) * 1.06);
      altarGroup.add(finial);
    }

    const buildBarrel = (
      topR: number,
      botR: number,
      len: number,
      tiltX: number,
      tiltZ: number,
      offsetX: number,
      offsetZ: number
    ) => {
      const pivot = new THREE.Group();
      pivot.position.set(offsetX, 0.58, offsetZ);
      pivot.rotation.set(tiltX, 0, tiltZ);

      const tube = new THREE.Mesh(new THREE.CylinderGeometry(topR, botR, len, 12), lacquerMat);
      tube.position.y = len / 2;
      pivot.add(tube);

      for (const frac of [0.16, 0.52, 0.88]) {
        const ringR = THREE.MathUtils.lerp(botR, topR, frac) + 0.035;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(ringR, 0.05, 8, 18), goldMat);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = len * frac;
        pivot.add(ring);
      }

      const crown = new THREE.Mesh(
        new THREE.CylinderGeometry(topR * 1.24, topR * 0.98, 0.22, 12, 1, true),
        goldMat
      );
      crown.position.y = len + 0.08;
      pivot.add(crown);

      const coreDisk = new THREE.Mesh(new THREE.CircleGeometry(topR * 0.78, 12), innerGlowMat);
      coreDisk.rotation.x = -Math.PI / 2;
      coreDisk.position.y = len + 0.02;
      pivot.add(coreDisk);

      const mouth = new THREE.Object3D();
      mouth.position.set(0, len + 0.25, 0);
      pivot.add(mouth);
      this.muzzles.push(mouth);

      altarGroup.add(pivot);
    };

    buildBarrel(0.38, 0.48, 2.05, 0, -0.05, 0, 0);
    buildBarrel(0.22, 0.27, 1.42, 0.22, -0.22, 0.52, 0.34);
    buildBarrel(0.22, 0.27, 1.42, -0.22, -0.22, 0.52, -0.34);
    buildBarrel(0.22, 0.27, 1.42, 0.22, 0.22, -0.52, 0.34);
    buildBarrel(0.22, 0.27, 1.42, -0.22, 0.22, -0.52, -0.34);

    const altarGlow = new THREE.PointLight(0xffb85c, 2.4, 8, 1.7);
    altarGlow.position.set(0, 2.3, 0.4);
    altarGroup.add(altarGlow);

    altarGroup.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    this.group.add(altarGroup);

    this.hitTarget = new THREE.Mesh(
      new THREE.SphereGeometry(2.6, 10, 10),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    this.hitTarget.position.set(4.1, 2.5, 4.9);
    this.hitTarget.userData = { kind: 'firework-cannon' };
    this.group.add(this.hitTarget);

    // 2. 24-hour burning fuse meandering across the front snow
    this.fuseCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1.35, 1.98, 6.75),
      new THREE.Vector3(-0.15, 2.08, 7.12),
      new THREE.Vector3(1.15, 2.12, 6.65),
      new THREE.Vector3(2.25, 2.06, 6.95),
      new THREE.Vector3(3.32, 2.05, 6.45),
      new THREE.Vector3(3.92, 2.14, 5.75),
      new THREE.Vector3(4.12, 2.38, 5.22),
    ]);

    this.unburnedMat = new THREE.MeshStandardMaterial({
      color: 0xffd782,
      emissive: 0xd98026,
      emissiveIntensity: 0.72,
      roughness: 0.4,
      metalness: 0.25,
    });
    this.burnedMat = new THREE.MeshStandardMaterial({
      color: 0x26314f,
      emissive: 0x0b1224,
      emissiveIntensity: 0.2,
      roughness: 0.9,
    });

    this.emberCore = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xfff7d6 })
    );
    this.emberGroup.add(this.emberCore);

    this.emberHalo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture,
        color: 0xffa03b,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.emberHalo.scale.set(2.2, 2.2, 1);
    this.emberGroup.add(this.emberHalo);

    this.emberLight = new THREE.PointLight(0xff9b38, 3.6, 8.5, 1.8);
    this.emberLight.position.set(0, 0.35, 0);
    this.emberGroup.add(this.emberLight);
    this.group.add(this.emberGroup);

    // Live crackling fuse spark fountain
    this.fuseSparkPositions = new Float32Array(MAX_FUSE_SPARKS * 3);
    this.fuseSparkColors = new Float32Array(MAX_FUSE_SPARKS * 3);
    this.fuseSparkGeo = new THREE.BufferGeometry();
    this.fuseSparkGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(this.fuseSparkPositions, 3)
    );
    this.fuseSparkGeo.setAttribute(
      'color',
      new THREE.BufferAttribute(this.fuseSparkColors, 3)
    );
    const fuseSparkMat = new THREE.PointsMaterial({
      size: 0.56,
      map: glowTexture,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const fuseSparkPoints = new THREE.Points(this.fuseSparkGeo, fuseSparkMat);
    fuseSparkPoints.frustumCulled = false;
    this.group.add(fuseSparkPoints);

    // 3. Realistic GPU Spark Particle System (Primary Stars + Shed Micro-Sparks + Rocket Heads)
    this.ptPositions = new Float32Array(this.maxTotalPoints * 3);
    this.ptColors = new Float32Array(this.maxTotalPoints * 3);
    this.ptSizes = new Float32Array(this.maxTotalPoints);
    this.ptAlphas = new Float32Array(this.maxTotalPoints);
    this.ptCores = new Float32Array(this.maxTotalPoints);

    this.pointsGeo = new THREE.BufferGeometry();
    this.pointsGeo.setAttribute('position', new THREE.BufferAttribute(this.ptPositions, 3));
    this.pointsGeo.setAttribute('aColor', new THREE.BufferAttribute(this.ptColors, 3));
    this.pointsGeo.setAttribute('aSize', new THREE.BufferAttribute(this.ptSizes, 1));
    this.pointsGeo.setAttribute('aAlpha', new THREE.BufferAttribute(this.ptAlphas, 1));
    this.pointsGeo.setAttribute('aCore', new THREE.BufferAttribute(this.ptCores, 1));
    this.pointsGeo.setDrawRange(0, 0);

    this.pointsMat = new THREE.ShaderMaterial({
      uniforms: {
        uViewportScale: { value: this.computeViewportScale() },
      },
      vertexShader: SPARK_VERTEX_SHADER,
      fragmentShader: SPARK_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const sparkCloud = new THREE.Points(this.pointsGeo, this.pointsMat);
    sparkCloud.frustumCulled = false;
    this.group.add(sparkCloud);

    // 4. Curved multi-segment ember filament streaks behind primary burning stars
    const maxTrailSegments = (this.maxStars + 32) * TRAIL_SEGMENTS;
    this.trailPositions = new Float32Array(maxTrailSegments * 2 * 3);
    this.trailColors = new Float32Array(maxTrailSegments * 2 * 3);
    this.trailGeo = new THREE.BufferGeometry();
    this.trailGeo.setAttribute('position', new THREE.BufferAttribute(this.trailPositions, 3));
    this.trailGeo.setAttribute('color', new THREE.BufferAttribute(this.trailColors, 3));
    this.trailGeo.setDrawRange(0, 0);

    this.trailMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const trailLines = new THREE.LineSegments(this.trailGeo, this.trailMat);
    trailLines.frustumCulled = false;
    this.group.add(trailLines);

    // Dynamic sky flash light that casts realistic burst illumination onto the snowy island
    this.skyFlashLight = new THREE.PointLight(0xffd78a, 0, 62, 1.25);
    this.skyFlashLight.position.set(0, 20, 4);
    this.group.add(this.skyFlashLight);

    this.rebuildFuseGeometry(0.5);
  }

  private computeViewportScale(): number {
    if (typeof window === 'undefined') return 540;
    const isMobile = window.innerWidth < 768;
    const dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2);
    return Math.max(300, window.innerHeight * dpr * 0.52);
  }

  private rebuildFuseGeometry(progress: number): void {
    const clamped = Math.max(0.02, Math.min(0.98, progress));

    if (Math.abs(clamped - this.lastBuiltProgress) >= 0.004) {
      this.lastBuiltProgress = clamped;

      if (this.unburnedTube) {
        this.group.remove(this.unburnedTube);
        this.unburnedTube.geometry.dispose();
        this.unburnedTube = null;
      }
      if (this.burnedTube) {
        this.group.remove(this.burnedTube);
        this.burnedTube.geometry.dispose();
        this.burnedTube = null;
      }

      const samples = 56;
      const allPts = this.fuseCurve.getPoints(samples);
      const splitIdx = Math.max(1, Math.min(allPts.length - 2, Math.round(clamped * samples)));

      const burnedPts = allPts.slice(0, splitIdx + 1);
      if (burnedPts.length >= 2) {
        const burnedCurve = new THREE.CatmullRomCurve3(burnedPts);
        this.burnedTube = new THREE.Mesh(
          new THREE.TubeGeometry(burnedCurve, Math.max(8, burnedPts.length), 0.055, 6, false),
          this.burnedMat
        );
        this.group.add(this.burnedTube);
      }

      const unburnedPts = allPts.slice(splitIdx);
      if (unburnedPts.length >= 2) {
        const unburnedCurve = new THREE.CatmullRomCurve3(unburnedPts);
        this.unburnedTube = new THREE.Mesh(
          new THREE.TubeGeometry(unburnedCurve, Math.max(10, unburnedPts.length), 0.095, 8, false),
          this.unburnedMat
        );
        this.group.add(this.unburnedTube);
      }
    }

    const emberPos = this.fuseCurve.getPoint(clamped);
    this.emberGroup.position.copy(emberPos);
  }

  /**
   * Full-sky grand pyrotechnic choreography (midnight rollover or demo show).
   */
  public triggerShow(grand = false): void {
    const styles: ShellStyle[] = ['chrysanthemum', 'willow', 'double_peony', 'strobe', 'palm'];
    const waveCount = grand ? 11 : 6;

    let t = 0.06;
    for (let w = 0; w < waveCount; w++) {
      const shellsInWave = w === 0 ? 2 : w === waveCount - 1 ? 5 : 3;
      for (let s = 0; s < shellsInWave; s++) {
        const style: ShellStyle =
          w === waveCount - 1
            ? s % 2 === 0
              ? 'willow'
              : 'chrysanthemum'
            : styles[(w * 2 + s) % styles.length];
        this.scheduledLaunches.push({
          delay: t + s * 0.24 + Math.random() * 0.14,
          style,
          grand: grand || w === waveCount - 1,
        });
      }
      t += grand ? 1.55 : 1.7;
    }
  }

  /**
   * Joyful celebratory trio when user clicks preview or lights a new lantern.
   */
  public triggerMiniSpark(): void {
    this.scheduledLaunches.push({ delay: 0.04, style: 'chrysanthemum', grand: false });
    this.scheduledLaunches.push({ delay: 0.48, style: 'double_peony', grand: false });
    this.scheduledLaunches.push({ delay: 0.96, style: 'willow', grand: false });
  }

  private addStar(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    r: number,
    g: number,
    b: number,
    trailR: number,
    trailG: number,
    trailB: number,
    life: number,
    drag: number,
    gravity: number,
    size: number,
    shedRate: number,
    flags: number
  ): void {
    let idx: number;
    if (this.starCount < this.maxStars) {
      idx = this.starCount++;
    } else {
      // Recycle oldest star (index 0)
      idx = 0;
    }
    this.sX[idx] = x;
    this.sY[idx] = y;
    this.sZ[idx] = z;
    this.sVx[idx] = vx;
    this.sVy[idx] = vy;
    this.sVz[idx] = vz;
    this.sR[idx] = r;
    this.sG[idx] = g;
    this.sB[idx] = b;
    this.sTrailR[idx] = trailR;
    this.sTrailG[idx] = trailG;
    this.sTrailB[idx] = trailB;
    this.sAge[idx] = 0;
    this.sLife[idx] = life;
    this.sDrag[idx] = drag;
    this.sGravity[idx] = gravity;
    this.sSize[idx] = size;
    this.sShedRate[idx] = shedRate;
    this.sShedAccum[idx] = Math.random();
    this.sPhase[idx] = Math.random() * Math.PI * 2;
    this.sFlags[idx] = flags;

    const hBase = idx * TRAIL_LEN * 3;
    for (let k = 0; k < TRAIL_LEN; k++) {
      this.sHist[hBase + k * 3] = x;
      this.sHist[hBase + k * 3 + 1] = y;
      this.sHist[hBase + k * 3 + 2] = z;
    }
  }

  private removeStar(idx: number): void {
    const last = --this.starCount;
    if (idx === last) return;
    this.sX[idx] = this.sX[last];
    this.sY[idx] = this.sY[last];
    this.sZ[idx] = this.sZ[last];
    this.sVx[idx] = this.sVx[last];
    this.sVy[idx] = this.sVy[last];
    this.sVz[idx] = this.sVz[last];
    this.sR[idx] = this.sR[last];
    this.sG[idx] = this.sG[last];
    this.sB[idx] = this.sB[last];
    this.sTrailR[idx] = this.sTrailR[last];
    this.sTrailG[idx] = this.sTrailG[last];
    this.sTrailB[idx] = this.sTrailB[last];
    this.sAge[idx] = this.sAge[last];
    this.sLife[idx] = this.sLife[last];
    this.sDrag[idx] = this.sDrag[last];
    this.sGravity[idx] = this.sGravity[last];
    this.sSize[idx] = this.sSize[last];
    this.sShedRate[idx] = this.sShedRate[last];
    this.sShedAccum[idx] = this.sShedAccum[last];
    this.sPhase[idx] = this.sPhase[last];
    this.sFlags[idx] = this.sFlags[last];

    const dst = idx * TRAIL_LEN * 3;
    const src = last * TRAIL_LEN * 3;
    for (let k = 0; k < TRAIL_LEN * 3; k++) {
      this.sHist[dst + k] = this.sHist[src + k];
    }
  }

  private addMicroSpark(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    r: number,
    g: number,
    b: number,
    life: number,
    drag: number,
    gravity: number,
    size: number,
    flags: number
  ): void {
    let idx: number;
    if (this.sparkCount < this.maxMicroSparks) {
      idx = this.sparkCount++;
    } else {
      idx = this.sparkEvictCursor;
      this.sparkEvictCursor = (this.sparkEvictCursor + 1) % this.maxMicroSparks;
    }
    this.pX[idx] = x;
    this.pY[idx] = y;
    this.pZ[idx] = z;
    this.pVx[idx] = vx;
    this.pVy[idx] = vy;
    this.pVz[idx] = vz;
    this.pR[idx] = r;
    this.pG[idx] = g;
    this.pB[idx] = b;
    this.pAge[idx] = 0;
    this.pLife[idx] = life;
    this.pDrag[idx] = drag;
    this.pGravity[idx] = gravity;
    this.pSize[idx] = size;
    this.pPhase[idx] = Math.random() * Math.PI * 2;
    this.pFlags[idx] = flags;
  }

  private removeMicroSpark(idx: number): void {
    const last = --this.sparkCount;
    if (idx === last) return;
    this.pX[idx] = this.pX[last];
    this.pY[idx] = this.pY[last];
    this.pZ[idx] = this.pZ[last];
    this.pVx[idx] = this.pVx[last];
    this.pVy[idx] = this.pVy[last];
    this.pVz[idx] = this.pVz[last];
    this.pR[idx] = this.pR[last];
    this.pG[idx] = this.pG[last];
    this.pB[idx] = this.pB[last];
    this.pAge[idx] = this.pAge[last];
    this.pLife[idx] = this.pLife[last];
    this.pDrag[idx] = this.pDrag[last];
    this.pGravity[idx] = this.pGravity[last];
    this.pSize[idx] = this.pSize[last];
    this.pPhase[idx] = this.pPhase[last];
    this.pFlags[idx] = this.pFlags[last];
  }

  private launchRocket(style: ShellStyle, grand: boolean): void {
    const muzzle = this.muzzles[Math.floor(Math.random() * this.muzzles.length)];
    muzzle.getWorldPosition(this.muzzleWorld);
    // Convert world muzzle position into FireworkSystem local space (in case island bobs)
    const startPos = this.group.worldToLocal(this.muzzleWorld.clone());

    const palette =
      FIREWORK_PALETTES[Math.floor(Math.random() * FIREWORK_PALETTES.length)];

    // Aim cleanly into the visible upper sky framed above the island & hero tree
    const targetX = (Math.random() - 0.5) * (grand ? 21 : 15);
    const targetY = (grand ? 14.5 : 13.5) + Math.random() * 8.0;
    const targetZ = (Math.random() - 0.5) * (grand ? 12 : 9) - 1.5;

    const fuseTime = 1.05 + Math.random() * 0.36;
    const gAscent = 5.4;
    const vx = (targetX - startPos.x) / fuseTime;
    const vz = (targetZ - startPos.z) / fuseTime;
    const vy = (targetY - startPos.y + 0.5 * gAscent * fuseTime * fuseTime) / fuseTime;

    const history: THREE.Vector3[] = [];
    for (let k = 0; k < TRAIL_LEN; k++) {
      history.push(startPos.clone());
    }

    this.rockets.push({
      position: startPos,
      history,
      velocity: new THREE.Vector3(vx, vy, vz),
      age: 0,
      fuseTime,
      palette,
      style,
      grand,
      tailAccum: 0,
      wobblePhase: Math.random() * Math.PI * 2,
    });

    // Mortar muzzle ignition spark spray!
    for (let i = 0; i < 22; i++) {
      const spread = 0.25 + Math.random() * 0.55;
      const a = Math.random() * Math.PI * 2;
      const spd = 2.6 + Math.random() * 5.2;
      this.addMicroSpark(
        startPos.x,
        startPos.y,
        startPos.z,
        Math.cos(a) * spd * spread + vx * 0.2,
        2.5 + Math.random() * 5.8,
        Math.sin(a) * spd * spread + vz * 0.2,
        1.0,
        0.78 + Math.random() * 0.18,
        0.38,
        0.22 + Math.random() * 0.28,
        3.2,
        5.8,
        0.48 + Math.random() * 0.42,
        0b111
      );
    }
  }

  /**
   * Brief incandescent detonation core flash + subtle warm-lit smoke wisp
   * (zero artificial geometric shockwave rings).
   */
  private spawnDetonationGlow(origin: THREE.Vector3, colorHex: number, grand: boolean): void {
    const coreSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTexture,
        color: 0xfff8e6,
        transparent: true,
        opacity: 0.92,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    coreSprite.position.copy(origin);
    coreSprite.scale.setScalar(1.0);
    this.group.add(coreSprite);

    // Subtle illuminated gunpowder smoke puff tinted by the shell color
    const smokeColor = new THREE.Color(colorHex).lerp(new THREE.Color(0x9ab0d4), 0.45);
    const smokeSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTexture,
        color: smokeColor,
        transparent: true,
        opacity: 0.16,
        blending: THREE.NormalBlending,
        depthWrite: false,
      })
    );
    smokeSprite.position.copy(origin);
    smokeSprite.scale.setScalar(2.2);
    this.group.add(smokeSprite);

    this.burstFlashes.push({
      coreSprite,
      smokeSprite,
      age: 0,
      coreLife: 0.16,
      smokeLife: 1.15,
      coreMaxScale: grand ? 7.8 : 6.2,
      smokeMaxScale: grand ? 15.5 : 12.0,
    });
  }

  /**
   * High-velocity white-hot flash-powder spark storm right at the detonation core,
   * so the explosion visibly erupts from real incandescent sparks from frame 0.
   */
  private spawnFlashPowderSparks(
    origin: THREE.Vector3,
    tintHex: number,
    count: number,
    speedScale: number
  ): void {
    this.tmpColor.setHex(tintHex);
    const tr = this.tmpColor.r;
    const tg = this.tmpColor.g;
    const tb = this.tmpColor.b;

    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const sinPhi = Math.sin(phi);
      const spd = (5.5 + Math.random() * 14.5) * speedScale;
      const whiteMix = 0.55 + Math.random() * 0.45;
      this.addMicroSpark(
        origin.x + (Math.random() - 0.5) * 0.25,
        origin.y + (Math.random() - 0.5) * 0.25,
        origin.z + (Math.random() - 0.5) * 0.25,
        sinPhi * Math.cos(theta) * spd,
        Math.cos(phi) * spd,
        sinPhi * Math.sin(theta) * spd,
        THREE.MathUtils.lerp(tr, 1.0, whiteMix),
        THREE.MathUtils.lerp(tg, 0.96, whiteMix),
        THREE.MathUtils.lerp(tb, 0.84, whiteMix),
        0.16 + Math.random() * 0.34,
        4.4 + Math.random() * 2.0,
        1.6,
        0.42 + Math.random() * 0.55,
        0b111 // twinkle + coolToAmber + hotFlash
      );
    }
  }

  /**
   * Real pyrotechnic crackle ("dragon egg") micro-burst: a tiny cluster of crisp white-gold
   * sparks snapping outward sharply and fizzling out.
   */
  private spawnCrackleCluster(
    x: number,
    y: number,
    z: number,
    baseVx: number,
    baseVy: number,
    baseVz: number,
    colorHex: number,
    sparkCount: number
  ): void {
    this.tmpColor.setHex(colorHex);
    const cr = THREE.MathUtils.lerp(this.tmpColor.r, 1.0, 0.55);
    const cg = THREE.MathUtils.lerp(this.tmpColor.g, 0.92, 0.55);
    const cb = THREE.MathUtils.lerp(this.tmpColor.b, 0.72, 0.55);

    for (let i = 0; i < sparkCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const sinPhi = Math.sin(phi);
      const spd = 2.8 + Math.random() * 5.6;
      this.addMicroSpark(
        x,
        y,
        z,
        baseVx * 0.25 + sinPhi * Math.cos(theta) * spd,
        baseVy * 0.25 + Math.cos(phi) * spd,
        baseVz * 0.25 + sinPhi * Math.sin(theta) * spd,
        cr,
        cg,
        cb,
        0.18 + Math.random() * 0.28,
        4.6 + Math.random() * 1.8,
        2.1,
        0.46 + Math.random() * 0.42,
        0b111
      );
    }
  }

  /**
   * Emits a stratified Fibonacci-sphere shell of primary burning pyrotechnic stars
   * with organic 3D orientation and natural speed clustering.
   */
  private emitSphericalShell(opts: {
    origin: THREE.Vector3;
    count: number;
    baseSpeed: number;
    speedSpread: number;
    colors: number[];
    trailHex: number;
    lifeMin: number;
    lifeMax: number;
    drag: number;
    gravity: number;
    sizeMin: number;
    sizeMax: number;
    shedRate: number;
    strobeChance: number;
    crackleChance: number;
    heavyWillow?: boolean;
  }): void {
    const {
      origin,
      count,
      baseSpeed,
      speedSpread,
      colors,
      trailHex,
      lifeMin,
      lifeMax,
      drag,
      gravity,
      sizeMin,
      sizeMax,
      shedRate,
      strobeChance,
      crackleChance,
      heavyWillow = false,
    } = opts;

    // Random 3D rotation so every burst sphere has an organic, unique orientation
    this.tmpEuler.set(
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2
    );
    this.tmpQuat.setFromEuler(this.tmpEuler);

    const trailCol = new THREE.Color(trailHex);
    const phaseOffset = Math.random() * Math.PI * 2;

    for (let i = 0; i < count; i++) {
      const yNorm = 1 - ((i + 0.5) / count) * 2;
      const rad = Math.sqrt(Math.max(0, 1 - yNorm * yNorm));
      const theta = GOLDEN_ANGLE * i + phaseOffset + (Math.random() - 0.5) * 0.14;

      this.tmpVec
        .set(
          Math.cos(theta) * rad + (Math.random() - 0.5) * 0.08,
          yNorm + (Math.random() - 0.5) * 0.08,
          Math.sin(theta) * rad + (Math.random() - 0.5) * 0.08
        )
        .normalize()
        .applyQuaternion(this.tmpQuat);

      const speed = baseSpeed * (1 - speedSpread * 0.5 + Math.random() * speedSpread);
      const colHex = colors[i % colors.length];
      this.tmpColor.setHex(colHex);
      // Slight natural chemical brightness/hue variance per star
      const shade = 0.92 + Math.random() * 0.16;

      let flags = 0;
      if (Math.random() < strobeChance) flags |= 1;
      if (Math.random() < crackleChance) flags |= 2;
      if (heavyWillow) flags |= 4;

      this.addStar(
        origin.x,
        origin.y,
        origin.z,
        this.tmpVec.x * speed,
        this.tmpVec.y * speed + 0.9,
        this.tmpVec.z * speed,
        Math.min(1, this.tmpColor.r * shade),
        Math.min(1, this.tmpColor.g * shade),
        Math.min(1, this.tmpColor.b * shade),
        trailCol.r,
        trailCol.g,
        trailCol.b,
        lifeMin + Math.random() * (lifeMax - lifeMin),
        drag + (Math.random() - 0.5) * 0.22,
        gravity,
        sizeMin + Math.random() * (sizeMax - sizeMin),
        shedRate * (0.85 + Math.random() * 0.3),
        flags
      );
    }
  }

  private explode(origin: THREE.Vector3, palette: number[], style: ShellStyle, grand: boolean): void {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    const density = isMobile ? 0.68 : 1.0;
    const scaleBoost = grand ? 1.15 : 1.0;

    this.onBurst?.(style === 'willow' || grand ? 1.0 : 0.85);

    // Core incandescent flash + subtle warm-lit smoke + blazing flash-powder micro-sparks
    this.spawnDetonationGlow(origin, palette[0], grand);
    this.spawnFlashPowderSparks(
      origin,
      style === 'willow' ? 0xffe099 : palette[0],
      Math.round((grand ? 68 : 50) * density),
      scaleBoost
    );

    // Real-time burst illumination reflecting off the snow-covered island below
    this.skyFlashLight.position.copy(origin);
    this.skyFlashLight.color.setHex(style === 'willow' ? 0xffd584 : palette[0]);
    this.skyFlashLight.intensity = grand ? 14.5 : 11.5;

    if (style === 'willow') {
      // Majestic Golden Kamuro Willow: dense long-burning gold stars shedding cascading curtains of sparks
      this.emitSphericalShell({
        origin,
        count: Math.round(145 * density * (grand ? 1.15 : 1.0)),
        baseSpeed: 17.5 * scaleBoost,
        speedSpread: 0.24,
        colors: WILLOW_GOLD,
        trailHex: 0xffb347,
        lifeMin: 2.5,
        lifeMax: 3.7,
        drag: 2.15,
        gravity: 3.35,
        sizeMin: 1.35,
        sizeMax: 1.95,
        shedRate: 44, // Heavy shimmering charcoal spark veil!
        strobeChance: 0.18,
        crackleChance: 0.08,
        heavyWillow: true,
      });
      return;
    }

    if (style === 'double_peony') {
      // Concentric double-layer shell: luminous inner pistil + wide vivid outer bloom
      this.emitSphericalShell({
        origin,
        count: Math.round(62 * density),
        baseSpeed: 9.8 * scaleBoost,
        speedSpread: 0.16,
        colors: [palette[2], palette[1]],
        trailHex: 0xffd896,
        lifeMin: 1.35,
        lifeMax: 1.95,
        drag: 2.35,
        gravity: 2.0,
        sizeMin: 1.25,
        sizeMax: 1.75,
        shedRate: 24,
        strobeChance: 0.25,
        crackleChance: 0.0,
      });
      this.emitSphericalShell({
        origin,
        count: Math.round(135 * density * (grand ? 1.12 : 1.0)),
        baseSpeed: 20.5 * scaleBoost,
        speedSpread: 0.16,
        colors: [palette[0], palette[1]],
        trailHex: 0xffc66e,
        lifeMin: 1.8,
        lifeMax: 2.55,
        drag: 2.25,
        gravity: 2.35,
        sizeMin: 1.5,
        sizeMax: 2.15,
        shedRate: 30,
        strobeChance: 0.22,
        crackleChance: 0.26,
      });
      return;
    }

    if (style === 'palm') {
      // Bold Silver-Gold Palm Fronds (thick sparkling comet arms) + colorful inner glitter core
      this.emitSphericalShell({
        origin,
        count: Math.round(24 * (grand ? 1.2 : 1.0)),
        baseSpeed: 21.5 * scaleBoost,
        speedSpread: 0.18,
        colors: [0xfff3cf, 0xffd178],
        trailHex: 0xffae42,
        lifeMin: 1.9,
        lifeMax: 2.6,
        drag: 1.95,
        gravity: 3.1,
        sizeMin: 2.1,
        sizeMax: 2.7,
        shedRate: 68, // Thick blazing palm-frond spark ribbons!
        strobeChance: 0.15,
        crackleChance: 0.35,
        heavyWillow: true,
      });
      this.emitSphericalShell({
        origin,
        count: Math.round(75 * density),
        baseSpeed: 12.2 * scaleBoost,
        speedSpread: 0.22,
        colors: palette,
        trailHex: palette[0],
        lifeMin: 1.25,
        lifeMax: 1.85,
        drag: 2.5,
        gravity: 1.9,
        sizeMin: 1.1,
        sizeMax: 1.55,
        shedRate: 18,
        strobeChance: 0.45,
        crackleChance: 0.12,
      });
      return;
    }

    if (style === 'strobe') {
      // Titanium Glitter / Crackle Cloud: rapidly flickering silver-gold & jewel stars popping into crackle sparks
      this.emitSphericalShell({
        origin,
        count: Math.round(145 * density * (grand ? 1.15 : 1.0)),
        baseSpeed: 19.2 * scaleBoost,
        speedSpread: 0.26,
        colors: [palette[0], 0xfff8e6, palette[1]],
        trailHex: 0xffe4ad,
        lifeMin: 1.65,
        lifeMax: 2.55,
        drag: 2.4,
        gravity: 2.25,
        sizeMin: 1.35,
        sizeMax: 2.0,
        shedRate: 26,
        strobeChance: 0.85,
        crackleChance: 0.48,
      });
      return;
    }

    // Classic Chrysanthemum: crisp spherical shell with long luminous spark tails & occasional crackle tips
    this.emitSphericalShell({
      origin,
      count: Math.round(160 * density * (grand ? 1.15 : 1.0)),
      baseSpeed: 21.0 * scaleBoost,
      speedSpread: 0.14,
      colors: [palette[0], palette[0], palette[1], palette[2]],
      trailHex: 0xffcb74,
      lifeMin: 1.75,
      lifeMax: 2.45,
      drag: 2.28,
      gravity: 2.35,
      sizeMin: 1.45,
      sizeMax: 2.1,
      shedRate: 34,
      strobeChance: 0.16,
      crackleChance: 0.24,
    });
  }

  public update(dt: number, elapsed: number, dayProgress: number): void {
    this.rebuildFuseGeometry(dayProgress);
    this.pointsMat.uniforms.uViewportScale.value = this.computeViewportScale();

    // Gentle high-altitude winter breeze affecting light sparks & smoke
    const windX = 0.55 + Math.sin(elapsed * 0.42) * 0.28;
    const windZ = 0.18 + Math.cos(elapsed * 0.31) * 0.16;

    // 1. Blazing fuse ember flicker
    const pulse = 1 + Math.sin(elapsed * 20) * 0.24 + Math.cos(elapsed * 33) * 0.16;
    this.emberCore.scale.setScalar(0.88 + pulse * 0.28);
    this.emberHalo.scale.setScalar(1.9 + pulse * 0.65);
    this.emberLight.intensity = 2.8 + pulse * 1.2;

    // Decay sky flash light smoothly
    if (this.skyFlashLight.intensity > 0.02) {
      this.skyFlashLight.intensity *= Math.pow(0.035, dt);
    } else {
      this.skyFlashLight.intensity = 0;
    }

    // 2. Crackling golden spark fountain from moving fuse burn point
    this.sparkSpawnAccum += dt;
    while (this.sparkSpawnAccum > 0.016) {
      this.sparkSpawnAccum -= 0.016;
      if (this.fuseSparks.length < MAX_FUSE_SPARKS) {
        const isWhiteHot = Math.random() > 0.62;
        this.fuseSparks.push({
          position: this.emberGroup.position.clone(),
          velocity: new THREE.Vector3(
            (Math.random() - 0.5) * 2.5,
            1.7 + Math.random() * 2.6,
            (Math.random() - 0.5) * 2.5
          ),
          color: new THREE.Color(isWhiteHot ? 0xfff7d1 : 0xff9f38),
          age: 0,
          life: 0.3 + Math.random() * 0.42,
        });
      }
    }

    for (let i = this.fuseSparks.length - 1; i >= 0; i--) {
      const s = this.fuseSparks[i];
      s.age += dt;
      if (s.age >= s.life) {
        this.fuseSparks.splice(i, 1);
        continue;
      }
      s.velocity.y -= 5.6 * dt;
      s.position.addScaledVector(s.velocity, dt);
    }

    for (let i = 0; i < MAX_FUSE_SPARKS; i++) {
      const s = this.fuseSparks[i];
      if (s) {
        const p = s.age / s.life;
        const fade = Math.max(0, 1 - p);
        this.fuseSparkPositions[i * 3] = s.position.x;
        this.fuseSparkPositions[i * 3 + 1] = s.position.y;
        this.fuseSparkPositions[i * 3 + 2] = s.position.z;
        // Cool toward deep amber-orange as fuse sparks fall
        this.fuseSparkColors[i * 3] = THREE.MathUtils.lerp(s.color.r, 1.0, p * 0.4) * fade;
        this.fuseSparkColors[i * 3 + 1] = THREE.MathUtils.lerp(s.color.g, 0.38, p * 0.6) * fade;
        this.fuseSparkColors[i * 3 + 2] = THREE.MathUtils.lerp(s.color.b, 0.08, p * 0.7) * fade;
      } else {
        this.fuseSparkPositions[i * 3] = 0;
        this.fuseSparkPositions[i * 3 + 1] = -999;
        this.fuseSparkPositions[i * 3 + 2] = 0;
      }
    }
    this.fuseSparkGeo.attributes.position.needsUpdate = true;
    this.fuseSparkGeo.attributes.color.needsUpdate = true;

    // 3. Launch scheduled firework shells
    for (let i = this.scheduledLaunches.length - 1; i >= 0; i--) {
      this.scheduledLaunches[i].delay -= dt;
      if (this.scheduledLaunches[i].delay <= 0) {
        const item = this.scheduledLaunches.splice(i, 1)[0];
        this.launchRocket(item.style, item.grand);
      }
    }

    // 4. Update ascending shells with dense crackling golden charcoal exhaust sparks
    const gAscent = 5.4;
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.age += dt;
      // Shift history buffer
      for (let h = TRAIL_LEN - 1; h > 0; h--) {
        r.history[h].copy(r.history[h - 1]);
      }
      r.history[0].copy(r.position);

      r.velocity.y -= gAscent * dt;
      // Subtle aerodynamic spiral wobble on ascending shell
      const wobble = Math.sin(r.age * 13 + r.wobblePhase) * 0.35;
      r.position.x += (r.velocity.x + wobble) * dt;
      r.position.y += r.velocity.y * dt;
      r.position.z += (r.velocity.z + Math.cos(r.age * 11 + r.wobblePhase) * 0.25) * dt;

      // Shed dense golden-orange exhaust sparks along ascent path
      r.tailAccum += dt * 115;
      while (r.tailAccum >= 1) {
        r.tailAccum -= 1;
        const frac = Math.random();
        const sx = THREE.MathUtils.lerp(r.history[0].x, r.position.x, frac);
        const sy = THREE.MathUtils.lerp(r.history[0].y, r.position.y, frac);
        const sz = THREE.MathUtils.lerp(r.history[0].z, r.position.z, frac);
        this.addMicroSpark(
          sx,
          sy,
          sz,
          r.velocity.x * 0.08 + (Math.random() - 0.5) * 2.1,
          -1.6 - Math.random() * 2.2,
          r.velocity.z * 0.08 + (Math.random() - 0.5) * 2.1,
          1.0,
          0.82 + Math.random() * 0.14,
          0.42 + Math.random() * 0.2,
          0.28 + Math.random() * 0.38,
          3.4,
          2.8,
          0.42 + Math.random() * 0.38,
          0b011 // twinkle + coolToAmber
        );
      }

      if (r.age >= r.fuseTime || r.velocity.y <= 0.4) {
        this.explode(r.position, r.palette, r.style, r.grand);
        this.rockets.splice(i, 1);
      }
    }

    // 5. Animate brief detonation core flash + subtle rising smoke glow
    for (let i = this.burstFlashes.length - 1; i >= 0; i--) {
      const bf = this.burstFlashes[i];
      bf.age += dt;
      if (bf.age >= bf.smokeLife) {
        this.group.remove(bf.coreSprite);
        this.group.remove(bf.smokeSprite);
        bf.coreSprite.material.dispose();
        bf.smokeSprite.material.dispose();
        this.burstFlashes.splice(i, 1);
        continue;
      }

      if (bf.age < bf.coreLife) {
        const cp = bf.age / bf.coreLife;
        const ease = 1 - Math.pow(1 - cp, 3);
        bf.coreSprite.scale.setScalar(0.9 + ease * bf.coreMaxScale);
        bf.coreSprite.material.opacity = Math.max(0, 0.92 * Math.pow(1 - cp, 1.5));
      } else {
        bf.coreSprite.material.opacity = 0;
      }

      const sp = bf.age / bf.smokeLife;
      const sEase = 1 - Math.pow(1 - sp, 2.2);
      bf.smokeSprite.scale.setScalar(2.4 + sEase * bf.smokeMaxScale);
      bf.smokeSprite.position.x += windX * 0.35 * dt;
      bf.smokeSprite.position.y += 0.55 * dt;
      bf.smokeSprite.position.z += windZ * 0.35 * dt;
      bf.smokeSprite.material.opacity = Math.max(0, 0.16 * Math.sin(Math.min(1, sp * 2.5) * Math.PI * 0.5) * Math.pow(1 - sp, 1.6));
    }

    // 6. Trigger delayed dragon-egg crackle micro-pops
    for (let i = this.cracklePops.length - 1; i >= 0; i--) {
      const cp = this.cracklePops[i];
      cp.delay -= dt;
      if (cp.delay <= 0) {
        this.cracklePops.splice(i, 1);
        this.spawnCrackleCluster(cp.x, cp.y, cp.z, cp.vx, cp.vy, cp.vz, cp.color, 9);
        if (Math.random() < 0.25) {
          this.onBurst?.(cp.intensity);
        }
      }
    }

    // 7. Update Primary Burning Stars + Continuously Shed Micro-Sparks along their arcs
    for (let i = this.starCount - 1; i >= 0; i--) {
      const age = this.sAge[i] + dt;
      const life = this.sLife[i];
      if (age >= life) {
        // If star has crackleTip flag, pop into crisp crackling micro-sparks on burnout!
        if ((this.sFlags[i] & 2) !== 0) {
          this.cracklePops.push({
            x: this.sX[i],
            y: this.sY[i],
            z: this.sZ[i],
            vx: this.sVx[i],
            vy: this.sVy[i],
            vz: this.sVz[i],
            color:
              ((Math.round(this.sR[i] * 255) & 255) << 16) |
              ((Math.round(this.sG[i] * 255) & 255) << 8) |
              (Math.round(this.sB[i] * 255) & 255),
            delay: Math.random() * 0.08,
            intensity: 0.22,
          });
        }
        this.removeStar(i);
        continue;
      }
      this.sAge[i] = age;

      // Shift trail history
      const hBase = i * TRAIL_LEN * 3;
      for (let h = TRAIL_LEN - 1; h > 0; h--) {
        const dst = hBase + h * 3;
        const src = hBase + (h - 1) * 3;
        this.sHist[dst] = this.sHist[src];
        this.sHist[dst + 1] = this.sHist[src + 1];
        this.sHist[dst + 2] = this.sHist[src + 2];
      }
      const prevX = this.sX[i];
      const prevY = this.sY[i];
      const prevZ = this.sZ[i];
      this.sHist[hBase] = prevX;
      this.sHist[hBase + 1] = prevY;
      this.sHist[hBase + 2] = prevZ;

      // Exponential aerodynamic drag + gravity + gentle high-altitude wind
      const dragFactor = Math.exp(-this.sDrag[i] * dt);
      const vx = this.sVx[i] * dragFactor + windX * 0.16 * dt;
      const vy = this.sVy[i] * dragFactor - this.sGravity[i] * dt;
      const vz = this.sVz[i] * dragFactor + windZ * 0.16 * dt;

      const nx = prevX + vx * dt;
      const ny = prevY + vy * dt;
      const nz = prevZ + vz * dt;

      this.sVx[i] = vx;
      this.sVy[i] = vy;
      this.sVz[i] = vz;
      this.sX[i] = nx;
      this.sY[i] = ny;
      this.sZ[i] = nz;

      // Shed real glittering micro-spark particles behind each flying star!
      const p = age / life;
      const shedRate = this.sShedRate[i];
      if (shedRate > 0 && p < 0.94) {
        const isWillow = (this.sFlags[i] & 4) !== 0;
        const speedSq = vx * vx + vy * vy + vz * vz;
        const speedMod = Math.min(1.6, 0.45 + Math.sqrt(speedSq) * 0.085);
        this.sShedAccum[i] += dt * shedRate * speedMod * (1 - p * 0.45);

        while (this.sShedAccum[i] >= 1) {
          this.sShedAccum[i] -= 1;
          const frac = Math.random();
          const ex = prevX + (nx - prevX) * frac;
          const ey = prevY + (ny - prevY) * frac;
          const ez = prevZ + (nz - prevZ) * frac;

          // Blend trail spark between star color and warm burning charcoal gold
          const mixGold = isWillow ? 0.85 : 0.58;
          const sr = THREE.MathUtils.lerp(this.sR[i], this.sTrailR[i], mixGold);
          const sg = THREE.MathUtils.lerp(this.sG[i], this.sTrailG[i], mixGold);
          const sb = THREE.MathUtils.lerp(this.sB[i], this.sTrailB[i], mixGold);

          const scatter = isWillow ? 0.95 : 1.35;
          this.addMicroSpark(
            ex,
            ey,
            ez,
            vx * 0.18 + (Math.random() - 0.5) * scatter,
            vy * 0.18 + (Math.random() - 0.5) * scatter,
            vz * 0.18 + (Math.random() - 0.5) * scatter,
            sr,
            sg,
            sb,
            (isWillow ? 0.52 : 0.34) + Math.random() * (isWillow ? 0.58 : 0.42),
            isWillow ? 3.1 : 4.1,
            isWillow ? 1.85 : 1.35,
            (isWillow ? 0.46 : 0.36) + Math.random() * 0.42,
            0b011 // twinkle + coolToAmber
          );
        }
      }
    }

    // 8. Update Micro-Sparks Pool (high-drag air-hanging sparks drifting & cooling)
    for (let i = this.sparkCount - 1; i >= 0; i--) {
      const age = this.pAge[i] + dt;
      if (age >= this.pLife[i]) {
        this.removeMicroSpark(i);
        continue;
      }
      this.pAge[i] = age;

      const dragFactor = Math.exp(-this.pDrag[i] * dt);
      const ph = this.pPhase[i];
      // Delicate organic air shimmer / micro-turbulence on tiny weightless sparks
      const turbX = Math.sin(elapsed * 5.2 + ph) * 0.42;
      const turbZ = Math.cos(elapsed * 4.7 + ph * 1.3) * 0.42;

      const vx = this.pVx[i] * dragFactor + (windX + turbX) * 0.45 * dt;
      const vy = this.pVy[i] * dragFactor - this.pGravity[i] * dt;
      const vz = this.pVz[i] * dragFactor + (windZ + turbZ) * 0.45 * dt;

      this.pVx[i] = vx;
      this.pVy[i] = vy;
      this.pVz[i] = vz;
      this.pX[i] += vx * dt;
      this.pY[i] += vy * dt;
      this.pZ[i] += vz * dt;
    }

    // 9. Pack unified GPU Buffers for Points + Curved Filament Trails
    let ptIdx = 0;
    let trailVertIdx = 0;
    const maxTrailVerts = this.trailPositions.length / 3;

    // 9a. Ascending Rocket Heads + Comet Streaks
    for (let i = 0; i < this.rockets.length && ptIdx < this.maxTotalPoints; i++) {
      const r = this.rockets[i];
      const flick = 0.85 + 0.15 * Math.sin(elapsed * 55 + i * 3.1);
      this.ptPositions[ptIdx * 3] = r.position.x;
      this.ptPositions[ptIdx * 3 + 1] = r.position.y;
      this.ptPositions[ptIdx * 3 + 2] = r.position.z;
      this.ptColors[ptIdx * 3] = 1.0;
      this.ptColors[ptIdx * 3 + 1] = 0.88;
      this.ptColors[ptIdx * 3 + 2] = 0.58;
      this.ptSizes[ptIdx] = 2.1 * flick;
      this.ptAlphas[ptIdx] = 1.0;
      this.ptCores[ptIdx] = 1.0;
      ptIdx++;

      // Rocket comet streak
      let prevX = r.position.x;
      let prevY = r.position.y;
      let prevZ = r.position.z;
      for (let h = 0; h < TRAIL_SEGMENTS && trailVertIdx + 1 < maxTrailVerts; h++) {
        const hp = r.history[h];
        const a0 = (1 - h / TRAIL_SEGMENTS) * 0.9;
        const a1 = (1 - (h + 1) / TRAIL_SEGMENTS) * 0.9;
        const b = trailVertIdx * 3;
        this.trailPositions[b] = prevX;
        this.trailPositions[b + 1] = prevY;
        this.trailPositions[b + 2] = prevZ;
        this.trailPositions[b + 3] = hp.x;
        this.trailPositions[b + 4] = hp.y;
        this.trailPositions[b + 5] = hp.z;

        this.trailColors[b] = 1.0 * a0;
        this.trailColors[b + 1] = 0.84 * a0;
        this.trailColors[b + 2] = 0.45 * a0;
        this.trailColors[b + 3] = 1.0 * a1;
        this.trailColors[b + 4] = 0.62 * a1;
        this.trailColors[b + 5] = 0.22 * a1;

        trailVertIdx += 2;
        prevX = hp.x;
        prevY = hp.y;
        prevZ = hp.z;
      }
    }

    // 9b. Primary Burning Stars + Smooth Curved Multi-Segment Trails
    for (let i = 0; i < this.starCount && ptIdx < this.maxTotalPoints; i++) {
      const p = this.sAge[i] / this.sLife[i];
      const flags = this.sFlags[i];
      const isStrobe = (flags & 1) !== 0;
      const isWillow = (flags & 4) !== 0;

      // Realistic incandescent lifecycle:
      // 0..0.12 white-hot flash -> 0.12..0.75 rich chemical burn -> 0.75..1.0 cooling amber ember
      const flashHeat = Math.max(0, 1 - p / 0.14);
      const coolT = Math.max(0, (p - 0.68) / 0.32);

      let cr = THREE.MathUtils.lerp(this.sR[i], 1.0, flashHeat * 0.85);
      let cg = THREE.MathUtils.lerp(this.sG[i], 0.97, flashHeat * 0.85);
      let cb = THREE.MathUtils.lerp(this.sB[i], 0.9, flashHeat * 0.85);

      if (coolT > 0) {
        const coolAmt = isWillow ? coolT * 0.82 : coolT * 0.45;
        cr = THREE.MathUtils.lerp(cr, EMBER_COOL_R, coolAmt);
        cg = THREE.MathUtils.lerp(cg, EMBER_COOL_G, coolAmt);
        cb = THREE.MathUtils.lerp(cb, EMBER_COOL_B, coolAmt);
      }

      const fade = Math.pow(Math.max(0, 1 - p), isWillow ? 1.15 : 1.35);
      const ph = this.sPhase[i];
      const twinkle = isStrobe
        ? Math.sin(elapsed * 42 + ph * 7.0) > -0.1
          ? 1.25
          : 0.1
        : 0.86 + 0.14 * Math.sin(elapsed * 22 + ph * 5.0);

      const alpha = Math.min(1.25, fade * twinkle);
      const hotCore = Math.max(0.12, (1 - p * 0.85) * (isStrobe && twinkle < 0.2 ? 0.1 : 1.0));

      const x = this.sX[i];
      const y = this.sY[i];
      const z = this.sZ[i];

      this.ptPositions[ptIdx * 3] = x;
      this.ptPositions[ptIdx * 3 + 1] = y;
      this.ptPositions[ptIdx * 3 + 2] = z;
      this.ptColors[ptIdx * 3] = cr;
      this.ptColors[ptIdx * 3 + 1] = cg;
      this.ptColors[ptIdx * 3 + 2] = cb;
      this.ptSizes[ptIdx] = this.sSize[i] * (0.55 + 0.55 * (1 - p * 0.65) + flashHeat * 0.45);
      this.ptAlphas[ptIdx] = alpha;
      this.ptCores[ptIdx] = hotCore;
      ptIdx++;

      // Write curved multi-segment glowing filament behind each primary star
      const hBase = i * TRAIL_LEN * 3;
      const trailLum = fade * (isWillow ? 0.82 : 0.68);
      let prevX = x;
      let prevY = y;
      let prevZ = z;
      for (let h = 0; h < TRAIL_SEGMENTS && trailVertIdx + 1 < maxTrailVerts; h++) {
        const hx = this.sHist[hBase + h * 3];
        const hy = this.sHist[hBase + h * 3 + 1];
        const hz = this.sHist[hBase + h * 3 + 2];

        const w0 = (1 - h / TRAIL_SEGMENTS) * trailLum;
        const w1 = (1 - (h + 1) / TRAIL_SEGMENTS) * trailLum * 0.72;
        const tColMix = (h / TRAIL_SEGMENTS) * 0.55;
        const tr = THREE.MathUtils.lerp(cr, EMBER_COOL_R, tColMix);
        const tg = THREE.MathUtils.lerp(cg, EMBER_COOL_G + 0.2, tColMix);
        const tb = THREE.MathUtils.lerp(cb, EMBER_COOL_B + 0.08, tColMix);

        const b = trailVertIdx * 3;
        this.trailPositions[b] = prevX;
        this.trailPositions[b + 1] = prevY;
        this.trailPositions[b + 2] = prevZ;
        this.trailPositions[b + 3] = hx;
        this.trailPositions[b + 4] = hy;
        this.trailPositions[b + 5] = hz;

        this.trailColors[b] = tr * w0;
        this.trailColors[b + 1] = tg * w0;
        this.trailColors[b + 2] = tb * w0;
        this.trailColors[b + 3] = tr * w1;
        this.trailColors[b + 4] = tg * w1;
        this.trailColors[b + 5] = tb * w1;

        trailVertIdx += 2;
        prevX = hx;
        prevY = hy;
        prevZ = hz;
      }
    }

    // 9c. Shed Micro-Sparks, Flash-Powder Sparks & Crackle Dust
    for (let i = 0; i < this.sparkCount && ptIdx < this.maxTotalPoints; i++) {
      const p = this.pAge[i] / this.pLife[i];
      const flags = this.pFlags[i];
      const doTwinkle = (flags & 1) !== 0;
      const coolAmber = (flags & 2) !== 0;
      const hotFlash = (flags & 4) !== 0;

      let cr = this.pR[i];
      let cg = this.pG[i];
      let cb = this.pB[i];
      if (coolAmber) {
        const cool = Math.pow(p, 0.85) * 0.78;
        cr = THREE.MathUtils.lerp(cr, EMBER_COOL_R, cool);
        cg = THREE.MathUtils.lerp(cg, EMBER_COOL_G, cool);
        cb = THREE.MathUtils.lerp(cb, EMBER_COOL_B, cool);
      }

      const fade = Math.pow(Math.max(0, 1 - p), 1.45);
      const ph = this.pPhase[i];
      const shimmer = doTwinkle
        ? 0.55 + 0.45 * Math.sin(elapsed * 48 + ph * 11.0)
        : 1.0;

      this.ptPositions[ptIdx * 3] = this.pX[i];
      this.ptPositions[ptIdx * 3 + 1] = this.pY[i];
      this.ptPositions[ptIdx * 3 + 2] = this.pZ[i];
      this.ptColors[ptIdx * 3] = cr;
      this.ptColors[ptIdx * 3 + 1] = cg;
      this.ptColors[ptIdx * 3 + 2] = cb;
      this.ptSizes[ptIdx] = this.pSize[i] * (1 - p * 0.55);
      this.ptAlphas[ptIdx] = fade * shimmer * (hotFlash ? 1.1 : 0.88);
      this.ptCores[ptIdx] = hotFlash ? Math.max(0.2, 1 - p) : Math.max(0.05, (1 - p) * 0.55);
      ptIdx++;
    }

    this.pointsGeo.setDrawRange(0, ptIdx);
    this.pointsGeo.attributes.position.needsUpdate = true;
    this.pointsGeo.attributes.aColor.needsUpdate = true;
    this.pointsGeo.attributes.aSize.needsUpdate = true;
    this.pointsGeo.attributes.aAlpha.needsUpdate = true;
    this.pointsGeo.attributes.aCore.needsUpdate = true;

    this.trailGeo.setDrawRange(0, trailVertIdx);
    this.trailGeo.attributes.position.needsUpdate = true;
    this.trailGeo.attributes.color.needsUpdate = true;
  }

  public dispose(): void {
    if (this.unburnedTube) this.unburnedTube.geometry.dispose();
    if (this.burnedTube) this.burnedTube.geometry.dispose();
    this.unburnedMat.dispose();
    this.burnedMat.dispose();
    this.fuseSparkGeo.dispose();
    this.pointsGeo.dispose();
    this.pointsMat.dispose();
    this.trailGeo.dispose();
    this.trailMat.dispose();
    for (const bf of this.burstFlashes) {
      bf.coreSprite.material.dispose();
      bf.smokeSprite.material.dispose();
    }
  }
}
