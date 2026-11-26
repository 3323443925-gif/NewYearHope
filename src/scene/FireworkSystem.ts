import * as THREE from 'three';

type ShellStyle = 'chrysanthemum' | 'willow' | 'double_peony' | 'strobe';

interface Rocket {
  position: THREE.Vector3;
  prevPosition: THREE.Vector3;
  velocity: THREE.Vector3;
  targetY: number;
  palette: number[];
  style: ShellStyle;
  mesh: THREE.Mesh;
  tailTimer: number;
}

interface BurstParticle {
  position: THREE.Vector3;
  prevPosition: THREE.Vector3;
  velocity: THREE.Vector3;
  color: THREE.Color;
  age: number;
  life: number;
  drag: number;
  gravity: number;
  strobe: boolean;
}

interface BurstFlash {
  sprite: THREE.Sprite;
  ring: THREE.Mesh;
  age: number;
  life: number;
  maxScale: number;
}

interface SecondaryPop {
  origin: THREE.Vector3;
  palette: number[];
  delay: number;
}

interface FuseSpark {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  color: THREE.Color;
  age: number;
  life: number;
}

const FIREWORK_PALETTES: number[][] = [
  [0xffe49c, 0xffae52, 0xfff8dc], // Imperial Gold & Champagne
  [0x8cd8ff, 0xe8f7ff, 0xffdf8c], // Sapphire Ice & Starlight
  [0xff8cb8, 0xffd0a8, 0xfff0f7], // Sakura Rose & Peach Gold
  [0xc8a8ff, 0x7fd4ff, 0xffe69b], // Aurora Violet & Sky Cyan
  [0x7ff5cf, 0x9be2ff, 0xfff4c2], // Jade Mint & Diamond
  [0xff7575, 0xffc86b, 0xfff5d6], // Festive Crimson & Gold
];

const MAX_BURST_PARTICLES = 2400;
const MAX_FUSE_SPARKS = 95;

export class FireworkSystem {
  public readonly group = new THREE.Group();
  public readonly hitTarget: THREE.Mesh;

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

  private readonly fuseSparks: FuseSpark[] = [];
  private readonly fuseSparkPositions: Float32Array;
  private readonly fuseSparkColors: Float32Array;
  private readonly fuseSparkGeo: THREE.BufferGeometry;

  private readonly rockets: Rocket[] = [];
  private readonly burstParticles: BurstParticle[] = [];
  private readonly burstPositions: Float32Array;
  private readonly burstColors: Float32Array;
  private readonly burstGeo: THREE.BufferGeometry;

  // Glowing streaks (real fireworks comet tails!)
  private readonly trailPositions: Float32Array;
  private readonly trailColors: Float32Array;
  private readonly trailGeo: THREE.BufferGeometry;

  private readonly rocketGeo = new THREE.SphereGeometry(0.22, 8, 8);
  private readonly ringGeo = new THREE.RingGeometry(0.75, 1.0, 28);
  private readonly glowTexture: THREE.Texture;
  private readonly onBurst?: (intensity: number) => void;

  private readonly burstFlashes: BurstFlash[] = [];
  private readonly secondaryPops: SecondaryPop[] = [];
  private scheduledLaunches: { delay: number; style: ShellStyle; grand: boolean }[] = [];
  private sparkSpawnAccum = 0;

  constructor(glowTexture: THREE.Texture, onBurst?: (intensity: number) => void) {
    this.glowTexture = glowTexture;
    this.onBurst = onBurst;
    // 1. Ornate Imperial Starlight Firework Altar on front-right snowy terrace
    const altarGroup = new THREE.Group();
    altarGroup.position.set(4.15, 1.85, 5.15);
    altarGroup.rotation.y = -0.46;
    // Kept deliberately smaller so the Christmas tree remains the undisputed hero of the island
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

    // Stepped octagonal pedestal
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

    // 4 miniature golden corner finials around the pedestal
    const finialGeo = new THREE.OctahedronGeometry(0.14, 0);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const finial = new THREE.Mesh(finialGeo, goldMat);
      finial.position.set(Math.cos(a) * 1.06, 0.58, Math.sin(a) * 1.06);
      altarGroup.add(finial);
    }

    // Central Grand Royal Mortar Barrel
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

      // Ornate filigree gold rings + flared crown
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

      // Warm golden inner ember glow inside barrel mouth
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

    // Hero center tube + 4 angled celebratory golden-crimson side mortars
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

    // Generous click hit-sphere around cannon + fuse area
    this.hitTarget = new THREE.Mesh(
      new THREE.SphereGeometry(2.6, 10, 10),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    this.hitTarget.position.set(4.1, 2.5, 4.9);
    this.hitTarget.userData = { kind: 'firework-cannon' };
    this.group.add(this.hitTarget);

    // 2. Clearly visible 3D TubeGeometry 24-hour burning fuse meandering across the front snow
    // Tuned smoothly to sit cleanly atop the pillowy sculpted snow dome
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

    // Blazing ember core + warm halo sprite + point light
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
      size: 0.62,
      map: glowTexture,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.group.add(new THREE.Points(this.fuseSparkGeo, fuseSparkMat));

    // 3. Full-sky firework particles + glowing comet trail streaks
    this.burstPositions = new Float32Array(MAX_BURST_PARTICLES * 3);
    this.burstColors = new Float32Array(MAX_BURST_PARTICLES * 3);
    this.burstGeo = new THREE.BufferGeometry();
    this.burstGeo.setAttribute('position', new THREE.BufferAttribute(this.burstPositions, 3));
    this.burstGeo.setAttribute('color', new THREE.BufferAttribute(this.burstColors, 3));
    const burstMat = new THREE.PointsMaterial({
      size: 1.15,
      map: glowTexture,
      vertexColors: true,
      transparent: true,
      opacity: 0.98,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.group.add(new THREE.Points(this.burstGeo, burstMat));

    this.trailPositions = new Float32Array(MAX_BURST_PARTICLES * 2 * 3);
    this.trailColors = new Float32Array(MAX_BURST_PARTICLES * 2 * 3);
    this.trailGeo = new THREE.BufferGeometry();
    this.trailGeo.setAttribute('position', new THREE.BufferAttribute(this.trailPositions, 3));
    this.trailGeo.setAttribute('color', new THREE.BufferAttribute(this.trailColors, 3));
    const trailMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.78,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.group.add(new THREE.LineSegments(this.trailGeo, trailMat));

    // Dynamic sky flash light that softly illuminates the snow island when fireworks burst!
    this.skyFlashLight = new THREE.PointLight(0xffd78a, 0, 58, 1.2);
    this.skyFlashLight.position.set(0, 20, 4);
    this.group.add(this.skyFlashLight);

    this.rebuildFuseGeometry(0.5);
  }

  private rebuildFuseGeometry(progress: number): void {
    const clamped = Math.max(0.02, Math.min(0.98, progress));

    // Only rebuild tube meshes when progress changes visibly (saves GC/CPU every frame)
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
    const styles: ShellStyle[] = ['chrysanthemum', 'willow', 'double_peony', 'strobe'];
    const waveCount = grand ? 12 : 7;

    // Opening solo salute -> panoramic multi-shell waves -> breathtaking golden willow finale
    let t = 0.05;
    for (let w = 0; w < waveCount; w++) {
      const shellsInWave = w === 0 ? 2 : w === waveCount - 1 ? 5 : 3;
      for (let s = 0; s < shellsInWave; s++) {
        const style =
          w === waveCount - 1
            ? s % 2 === 0
              ? 'willow'
              : 'chrysanthemum'
            : styles[(w + s) % styles.length];
        this.scheduledLaunches.push({
          delay: t + s * 0.22 + Math.random() * 0.14,
          style,
          grand: grand || w === waveCount - 1,
        });
      }
      t += grand ? 1.35 : 1.5;
    }
  }

  /**
   * Joyful celebratory trio when user clicks preview or lights a new lantern.
   */
  public triggerMiniSpark(): void {
    this.scheduledLaunches.push({ delay: 0.04, style: 'double_peony', grand: false });
    this.scheduledLaunches.push({ delay: 0.42, style: 'chrysanthemum', grand: false });
    this.scheduledLaunches.push({ delay: 0.85, style: 'willow', grand: false });
  }

  private launchRocket(style: ShellStyle, grand: boolean): void {
    const muzzle = this.muzzles[Math.floor(Math.random() * this.muzzles.length)];
    muzzle.getWorldPosition(this.muzzleWorld);

    const palette =
      FIREWORK_PALETTES[Math.floor(Math.random() * FIREWORK_PALETTES.length)];
    const mesh = new THREE.Mesh(
      this.rocketGeo,
      new THREE.MeshBasicMaterial({ color: 0xfff4cc })
    );
    mesh.position.copy(this.muzzleWorld);
    this.group.add(mesh);

    // Panoramic spread framed cleanly in the visible upper sky
    const spreadX = (Math.random() - 0.5) * (grand ? 22 : 16);
    const spreadZ = (Math.random() - 0.5) * (grand ? 14 : 10);

    this.rockets.push({
      position: this.muzzleWorld.clone(),
      prevPosition: this.muzzleWorld.clone(),
      velocity: new THREE.Vector3(
        spreadX * 0.58,
        16.5 + Math.random() * 5.5,
        spreadZ * 0.58
      ),
      targetY: (grand ? 14.5 : 13.0) + Math.random() * 8.5,
      palette,
      style,
      mesh,
      tailTimer: 0,
    });
  }

  private spawnDetonationEffect(origin: THREE.Vector3, colorHex: number, maxScale = 9.5): void {
    // 1. Blazing radial detonation flash core at burst origin
    const flashSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTexture,
        color: colorHex,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    flashSprite.position.copy(origin);
    flashSprite.scale.setScalar(0.8);
    this.group.add(flashSprite);

    // 2. Expanding luminous blast shockwave ring
    const ringMesh = new THREE.Mesh(
      this.ringGeo,
      new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    ringMesh.position.copy(origin);
    ringMesh.rotation.set(
      (Math.random() - 0.5) * 0.6,
      Math.random() * Math.PI,
      0
    );
    ringMesh.scale.setScalar(0.4);
    this.group.add(ringMesh);

    this.burstFlashes.push({
      sprite: flashSprite,
      ring: ringMesh,
      age: 0,
      life: 0.42,
      maxScale,
    });
  }

  private pushParticle(p: BurstParticle): void {
    if (this.burstParticles.length >= MAX_BURST_PARTICLES) {
      this.burstParticles.shift();
    }
    this.burstParticles.push(p);
  }

  private explode(origin: THREE.Vector3, palette: number[], style: ShellStyle): void {
    this.onBurst?.(style === 'willow' ? 1 : 0.85);

    // Mid-air detonation flash + expanding shockwave ring!
    this.spawnDetonationEffect(origin, palette[0], style === 'willow' ? 10.5 : 8.8);

    // Brief warm sky illumination reflecting off the snow island
    this.skyFlashLight.position.copy(origin);
    this.skyFlashLight.color.setHex(palette[0]);
    this.skyFlashLight.intensity = 12.0;

    // Schedule secondary crackling sub-bursts around the outer bloom (real sky crossette pop!)
    if (style === 'chrysanthemum' || style === 'double_peony') {
      const subCount = 5;
      for (let s = 0; s < subCount; s++) {
        const a = (s / subCount) * Math.PI * 2 + Math.random() * 0.4;
        const r = 3.2 + Math.random() * 2.2;
        this.secondaryPops.push({
          origin: new THREE.Vector3(
            origin.x + Math.cos(a) * r,
            origin.y + (Math.random() - 0.3) * 2.5,
            origin.z + Math.sin(a) * r
          ),
          palette,
          delay: 0.52 + Math.random() * 0.28,
        });
      }
    }

    if (style === 'willow') {
      // Majestic weeping golden willow with snappy initial pop & long drooping trails
      const count = 145;
      const willowGold = [0xffe7a3, 0xffbe5c, 0xfff4d4];
      for (let i = 0; i < count; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const speed = 8.2 + Math.random() * 5.8;
        this.pushParticle({
          position: origin.clone(),
          prevPosition: origin.clone(),
          velocity: new THREE.Vector3(
            Math.sin(phi) * Math.cos(theta) * speed,
            Math.cos(phi) * speed + 1.5,
            Math.sin(phi) * Math.sin(theta) * speed
          ),
          color: new THREE.Color(willowGold[i % willowGold.length]),
          age: 0,
          life: 2.35 + Math.random() * 1.15,
          drag: 0.22,
          gravity: 3.1,
          strobe: i % 5 === 0,
        });
      }
      return;
    }

    if (style === 'double_peony') {
      // Concentric dual-layer peony: bright inner core + vibrant outer shell
      const innerCount = 60;
      const outerCount = 125;
      for (let i = 0; i < innerCount; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const speed = 4.6 + Math.random() * 2.4;
        this.pushParticle({
          position: origin.clone(),
          prevPosition: origin.clone(),
          velocity: new THREE.Vector3(
            Math.sin(phi) * Math.cos(theta) * speed,
            Math.cos(phi) * speed + 0.6,
            Math.sin(phi) * Math.sin(theta) * speed
          ),
          color: new THREE.Color(palette[2]),
          age: 0,
          life: 1.5 + Math.random() * 0.5,
          drag: 0.16,
          gravity: 1.8,
          strobe: false,
        });
      }
      for (let i = 0; i < outerCount; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const speed = 10.2 + Math.random() * 4.4;
        this.pushParticle({
          position: origin.clone(),
          prevPosition: origin.clone(),
          velocity: new THREE.Vector3(
            Math.sin(phi) * Math.cos(theta) * speed,
            Math.cos(phi) * speed + 1.0,
            Math.sin(phi) * Math.sin(theta) * speed
          ),
          color: new THREE.Color(palette[i % 2]),
          age: 0,
          life: 1.85 + Math.random() * 0.75,
          drag: 0.16,
          gravity: 2.1,
          strobe: i % 4 === 0,
        });
      }
      return;
    }

    // Chrysanthemum & Strobe Glitter shells: explosive snappy bloom
    const count = style === 'strobe' ? 145 : 170;
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = 8.4 + Math.random() * 7.2;
      this.pushParticle({
        position: origin.clone(),
        prevPosition: origin.clone(),
        velocity: new THREE.Vector3(
          Math.sin(phi) * Math.cos(theta) * speed,
          Math.cos(phi) * speed + 1.0,
          Math.sin(phi) * Math.sin(theta) * speed
        ),
        color: new THREE.Color(palette[i % palette.length]),
        age: 0,
        life: 1.7 + Math.random() * 0.95,
        drag: 0.16,
        gravity: 2.2,
        strobe: style === 'strobe' || i % 6 === 0,
      });
    }
  }

  public update(dt: number, elapsed: number, dayProgress: number): void {
    this.rebuildFuseGeometry(dayProgress);


    // Blazing ember flicker
    const pulse = 1 + Math.sin(elapsed * 20) * 0.24 + Math.cos(elapsed * 33) * 0.16;
    this.emberCore.scale.setScalar(0.88 + pulse * 0.28);
    this.emberHalo.scale.setScalar(1.9 + pulse * 0.65);
    this.emberLight.intensity = 2.8 + pulse * 1.2;

    // Decay sky flash light smoothly
    if (this.skyFlashLight.intensity > 0.02) {
      this.skyFlashLight.intensity *= Math.pow(0.08, dt);
    } else {
      this.skyFlashLight.intensity = 0;
    }

    // Emit crackling golden spark fountain from moving fuse burn point
    this.sparkSpawnAccum += dt;
    while (this.sparkSpawnAccum > 0.018) {
      this.sparkSpawnAccum -= 0.018;
      if (this.fuseSparks.length < MAX_FUSE_SPARKS) {
        const isWhiteHot = Math.random() > 0.65;
        this.fuseSparks.push({
          position: this.emberGroup.position.clone(),
          velocity: new THREE.Vector3(
            (Math.random() - 0.5) * 2.4,
            1.6 + Math.random() * 2.4,
            (Math.random() - 0.5) * 2.4
          ),
          color: new THREE.Color(isWhiteHot ? 0xfff7d1 : 0xffa63d),
          age: 0,
          life: 0.32 + Math.random() * 0.42,
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
      s.velocity.y -= 5.2 * dt;
      s.position.addScaledVector(s.velocity, dt);
    }

    for (let i = 0; i < MAX_FUSE_SPARKS; i++) {
      const s = this.fuseSparks[i];
      if (s) {
        const fade = Math.max(0, 1 - s.age / s.life);
        this.fuseSparkPositions[i * 3] = s.position.x;
        this.fuseSparkPositions[i * 3 + 1] = s.position.y;
        this.fuseSparkPositions[i * 3 + 2] = s.position.z;
        this.fuseSparkColors[i * 3] = s.color.r * fade;
        this.fuseSparkColors[i * 3 + 1] = s.color.g * fade;
        this.fuseSparkColors[i * 3 + 2] = s.color.b * fade;
      } else {
        this.fuseSparkPositions[i * 3] = 0;
        this.fuseSparkPositions[i * 3 + 1] = -999;
        this.fuseSparkPositions[i * 3 + 2] = 0;
      }
    }
    this.fuseSparkGeo.attributes.position.needsUpdate = true;
    this.fuseSparkGeo.attributes.color.needsUpdate = true;

    // Launch scheduled firework shells
    for (let i = this.scheduledLaunches.length - 1; i >= 0; i--) {
      this.scheduledLaunches[i].delay -= dt;
      if (this.scheduledLaunches[i].delay <= 0) {
        const item = this.scheduledLaunches.splice(i, 1)[0];
        this.launchRocket(item.style, item.grand);
      }
    }

    // Update ascending comet rockets with glowing golden exhaust sparks
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.prevPosition.copy(r.position);
      r.velocity.y -= 3.2 * dt;
      r.position.addScaledVector(r.velocity, dt);
      r.mesh.position.copy(r.position);

      r.tailTimer += dt;
      if (r.tailTimer > 0.025) {
        r.tailTimer = 0;
        this.pushParticle({
          position: r.position.clone(),
          prevPosition: r.prevPosition.clone(),
          velocity: new THREE.Vector3(
            (Math.random() - 0.5) * 0.9,
            -1.2 - Math.random() * 0.8,
            (Math.random() - 0.5) * 0.9
          ),
          color: new THREE.Color(0xffdca0),
          age: 0,
          life: 0.42,
          drag: 0.5,
          gravity: 1.5,
          strobe: false,
        });
      }

      if (r.position.y >= r.targetY || r.velocity.y <= 1.2) {
        this.explode(r.position, r.palette, r.style);
        this.group.remove(r.mesh);
        (r.mesh.material as THREE.Material).dispose();
        this.rockets.splice(i, 1);
      }
    }

    // Animate mid-air detonation flashes & expanding shockwave rings
    for (let i = this.burstFlashes.length - 1; i >= 0; i--) {
      const bf = this.burstFlashes[i];
      bf.age += dt;
      if (bf.age >= bf.life) {
        this.group.remove(bf.sprite);
        this.group.remove(bf.ring);
        bf.sprite.material.dispose();
        (bf.ring.material as THREE.Material).dispose();
        this.burstFlashes.splice(i, 1);
        continue;
      }
      const p = bf.age / bf.life;
      const easeOut = 1 - Math.pow(1 - p, 3);
      bf.sprite.scale.setScalar(1.2 + easeOut * bf.maxScale);
      bf.sprite.material.opacity = Math.max(0, 1 - Math.pow(p, 0.85));

      bf.ring.scale.setScalar(0.5 + easeOut * (bf.maxScale * 0.72));
      (bf.ring.material as THREE.MeshBasicMaterial).opacity = Math.max(
        0,
        0.85 * (1 - p)
      );
    }

    // Trigger secondary sparkling crackle sub-bursts in mid-air
    for (let i = this.secondaryPops.length - 1; i >= 0; i--) {
      const sp = this.secondaryPops[i];
      sp.delay -= dt;
      if (sp.delay <= 0) {
        this.secondaryPops.splice(i, 1);
        this.spawnDetonationEffect(sp.origin, sp.palette[2], 3.8);
        this.onBurst?.(0.3);
        for (let k = 0; k < 24; k++) {
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.acos(2 * Math.random() - 1);
          const speed = 3.2 + Math.random() * 2.8;
          this.pushParticle({
            position: sp.origin.clone(),
            prevPosition: sp.origin.clone(),
            velocity: new THREE.Vector3(
              Math.sin(phi) * Math.cos(theta) * speed,
              Math.cos(phi) * speed + 0.4,
              Math.sin(phi) * Math.sin(theta) * speed
            ),
            color: new THREE.Color(sp.palette[k % sp.palette.length]),
            age: 0,
            life: 0.75 + Math.random() * 0.45,
            drag: 0.22,
            gravity: 1.9,
            strobe: true,
          });
        }
      }
    }

    // Update burst stars + real comet streaks
    for (let i = this.burstParticles.length - 1; i >= 0; i--) {
      const p = this.burstParticles[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.burstParticles.splice(i, 1);
        continue;
      }
      p.prevPosition.copy(p.position);
      p.velocity.multiplyScalar(Math.pow(p.drag, dt));
      p.velocity.y -= p.gravity * dt;
      p.position.addScaledVector(p.velocity, dt);
    }

    for (let i = 0; i < MAX_BURST_PARTICLES; i++) {
      const p = this.burstParticles[i];
      if (p) {
        const progress = p.age / p.life;
        const fade = Math.max(0, Math.pow(1 - progress, 1.25));
        const twinkle = p.strobe
          ? Math.sin(elapsed * 38 + i * 1.7) > -0.15
            ? 1.15
            : 0.12
          : 0.82 + 0.18 * Math.sin(elapsed * 18 + i);
        const lum = fade * twinkle;

        this.burstPositions[i * 3] = p.position.x;
        this.burstPositions[i * 3 + 1] = p.position.y;
        this.burstPositions[i * 3 + 2] = p.position.z;
        this.burstColors[i * 3] = p.color.r * lum;
        this.burstColors[i * 3 + 1] = p.color.g * lum;
        this.burstColors[i * 3 + 2] = p.color.b * lum;

        // Stretched glowing comet tail trailing behind each star
        const tailScale = 4.2;
        const tailX = p.position.x - (p.position.x - p.prevPosition.x) * tailScale;
        const tailY = p.position.y - (p.position.y - p.prevPosition.y) * tailScale;
        const tailZ = p.position.z - (p.position.z - p.prevPosition.z) * tailScale;

        const base = i * 6;
        this.trailPositions[base] = p.position.x;
        this.trailPositions[base + 1] = p.position.y;
        this.trailPositions[base + 2] = p.position.z;
        this.trailPositions[base + 3] = tailX;
        this.trailPositions[base + 4] = tailY;
        this.trailPositions[base + 5] = tailZ;

        this.trailColors[base] = p.color.r * lum;
        this.trailColors[base + 1] = p.color.g * lum;
        this.trailColors[base + 2] = p.color.b * lum;
        this.trailColors[base + 3] = p.color.r * lum * 0.18;
        this.trailColors[base + 4] = p.color.g * lum * 0.18;
        this.trailColors[base + 5] = p.color.b * lum * 0.18;
      } else {
        this.burstPositions[i * 3] = 0;
        this.burstPositions[i * 3 + 1] = -999;
        this.burstPositions[i * 3 + 2] = 0;
        const base = i * 6;
        this.trailPositions[base] = 0;
        this.trailPositions[base + 1] = -999;
        this.trailPositions[base + 2] = 0;
        this.trailPositions[base + 3] = 0;
        this.trailPositions[base + 4] = -999;
        this.trailPositions[base + 5] = 0;
      }
    }
    this.burstGeo.attributes.position.needsUpdate = true;
    this.burstGeo.attributes.color.needsUpdate = true;
    this.trailGeo.attributes.position.needsUpdate = true;
    this.trailGeo.attributes.color.needsUpdate = true;
  }

  public dispose(): void {
    if (this.unburnedTube) this.unburnedTube.geometry.dispose();
    if (this.burnedTube) this.burnedTube.geometry.dispose();
    this.unburnedMat.dispose();
    this.burnedMat.dispose();
    this.fuseSparkGeo.dispose();
    this.burstGeo.dispose();
    this.trailGeo.dispose();
    this.rocketGeo.dispose();
    this.ringGeo.dispose();
    for (const bf of this.burstFlashes) {
      bf.sprite.material.dispose();
      (bf.ring.material as THREE.Material).dispose();
    }
  }
}
