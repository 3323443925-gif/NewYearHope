import * as THREE from 'three';
import type { LanternItem } from '@/types/lantern';
import { createFivePointStarGeometry, createSkyLanternGeometry } from './shapes';

interface LanternVisual {
  item: LanternItem;
  group: THREE.Group;
  body: THREE.Object3D;
  glow: THREE.Sprite;
  glowBase: number;
  hitMesh: THREE.Mesh;
  haloRing?: THREE.Mesh;
  orbitRadius: number;
  baseAngle: number;
  orbitSpeed: number;
  baseHeight: number;
  bobPhase: number;
  bobAmp: number;
  flickerSeed: number;
  riseProgress: number; // 0..1 smooth launch animation
  hovered: boolean;
}

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

/**
 * Orbiting field of user messages. Three visual families share one language:
 * - wish      → translucent paper sky lantern with a living flame
 * - unspoken  → pearlescent moonlight orb with a slow golden ring
 * - greeting  → small rose-gold star
 * All geometries and materials are shared, so 50 lanterns cost only a few programs.
 */
export class LanternField {
  public readonly group = new THREE.Group();
  private visuals = new Map<string, LanternVisual>();
  private lastBatchKey = 0;

  // Shared geometries
  private readonly lanternGeo = createSkyLanternGeometry();
  private readonly lanternRimGeo = new THREE.TorusGeometry(0.245, 0.024, 6, 18);
  private readonly flameGeo = new THREE.SphereGeometry(0.1, 10, 10);
  private readonly orbGeo = new THREE.SphereGeometry(0.33, 18, 18);
  private readonly orbRingGeo = new THREE.TorusGeometry(0.52, 0.018, 6, 40);
  private readonly starGeo = createFivePointStarGeometry(0.4, 0.18, 0.12);
  private readonly mineHaloGeo = new THREE.TorusGeometry(0.78, 0.028, 8, 40);
  private readonly hitSphereGeo = new THREE.SphereGeometry(1.15, 8, 8);

  // Shared materials
  private readonly paperMat = new THREE.MeshStandardMaterial({
    color: 0xffa862,
    emissive: 0xff7a2c,
    emissiveIntensity: 1.0,
    roughness: 0.62,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.93,
  });
  private readonly rimMat = new THREE.MeshStandardMaterial({
    color: 0x7a4322,
    roughness: 0.7,
  });
  private readonly flameMat = new THREE.MeshBasicMaterial({ color: 0xfff2c4 });
  private readonly orbMat = new THREE.MeshPhysicalMaterial({
    color: 0xeef4ff,
    emissive: 0xb9d2ff,
    emissiveIntensity: 0.85,
    roughness: 0.18,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
  });
  private readonly orbRingMat = new THREE.MeshBasicMaterial({
    color: 0xffe2a0,
    transparent: true,
    opacity: 0.7,
  });
  private readonly starMat = new THREE.MeshStandardMaterial({
    color: 0xffcdb0,
    emissive: 0xff9c78,
    emissiveIntensity: 1.0,
    metalness: 0.45,
    roughness: 0.3,
  });
  private readonly mineHaloMat = new THREE.MeshBasicMaterial({
    color: 0xffe296,
    transparent: true,
    opacity: 0.8,
  });
  private readonly hitMat = new THREE.MeshBasicMaterial({ visible: false });

  private readonly glowMatWish: THREE.SpriteMaterial;
  private readonly glowMatUnspoken: THREE.SpriteMaterial;
  private readonly glowMatGreeting: THREE.SpriteMaterial;

  constructor(glowTexture: THREE.Texture) {
    this.lanternRimGeo.rotateX(Math.PI / 2);

    const makeGlow = (color: number, opacity: number) =>
      new THREE.SpriteMaterial({
        map: glowTexture,
        color,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
    this.glowMatWish = makeGlow(0xffa652, 0.55);
    this.glowMatUnspoken = makeGlow(0xd6e6ff, 0.45);
    this.glowMatGreeting = makeGlow(0xffb38f, 0.5);
  }

  public syncLanterns(
    items: LanternItem[],
    maxCount: number,
    freshlyLaunchedId?: string,
    batchKey = 0
  ): void {
    const sliced = items.slice(0, maxCount);
    const batchChanged = batchKey !== this.lastBatchKey;
    if (batchChanged) {
      // Clear & re-constellate smoothly when the user clicks "Refresh Sky / 换一批夜空"
      for (const vis of this.visuals.values()) {
        this.group.remove(vis.group);
      }
      this.visuals.clear();
      this.lastBatchKey = batchKey;
    } else {
      const nextIds = new Set(sliced.map((it) => it.id));
      for (const [id, vis] of this.visuals.entries()) {
        if (!nextIds.has(id)) {
          this.group.remove(vis.group);
          this.visuals.delete(id);
        }
      }
    }

    const batchSalt = batchKey > 0 ? `:b${batchKey}` : '';

    sliced.forEach((item, index) => {
      const existing = this.visuals.get(item.id);
      if (existing) {
        existing.item = item;
        return;
      }

      const seed1 = hashId(item.id + batchSalt);
      const seed2 = hashId(item.id + ':h' + batchSalt);
      const seed3 = hashId(item.id + ':s' + batchSalt);

      const node = new THREE.Group();
      const body = new THREE.Group();
      node.add(body);

      let glow: THREE.Sprite;
      let glowBase: number;

      if (item.type === 'wish') {
        body.add(new THREE.Mesh(this.lanternGeo, this.paperMat));
        const rim = new THREE.Mesh(this.lanternRimGeo, this.rimMat);
        rim.position.y = -0.44;
        body.add(rim);
        const flame = new THREE.Mesh(this.flameGeo, this.flameMat);
        flame.position.y = -0.3;
        body.add(flame);
        glow = new THREE.Sprite(this.glowMatWish);
        glowBase = 2.5;
      } else if (item.type === 'unspoken') {
        body.add(new THREE.Mesh(this.orbGeo, this.orbMat));
        const ring = new THREE.Mesh(this.orbRingGeo, this.orbRingMat);
        ring.rotation.x = Math.PI * 0.38;
        ring.rotation.y = seed1 * Math.PI;
        body.add(ring);
        glow = new THREE.Sprite(this.glowMatUnspoken);
        glowBase = 2.2;
      } else {
        body.add(new THREE.Mesh(this.starGeo, this.starMat));
        glow = new THREE.Sprite(this.glowMatGreeting);
        glowBase = 2.1;
      }
      glow.scale.setScalar(glowBase);
      node.add(glow);

      let haloRing: THREE.Mesh | undefined;
      if (item.isMine) {
        haloRing = new THREE.Mesh(this.mineHaloGeo, this.mineHaloMat);
        haloRing.rotation.x = Math.PI / 2;
        node.add(haloRing);
      }

      const hitMesh = new THREE.Mesh(this.hitSphereGeo, this.hitMat);
      hitMesh.userData = { kind: 'lantern', lanternId: item.id };
      node.add(hitMesh);

      const orbitRadius = item.isMine ? 10.6 + seed1 * 3.2 : 12.2 + seed1 * 11.5;
      const baseAngle =
        (index / Math.max(1, sliced.length)) * Math.PI * 2 +
        batchKey * 1.15 +
        (seed2 - 0.5) * 0.55;
      const baseHeight = item.isMine ? 3.5 + seed2 * 6.5 : 1.0 + seed2 * 13.5;

      const shouldAnimateRise = freshlyLaunchedId === item.id || batchChanged;

      this.group.add(node);
      this.visuals.set(item.id, {
        item,
        group: node,
        body,
        glow,
        glowBase,
        hitMesh,
        haloRing,
        orbitRadius,
        baseAngle,
        orbitSpeed: (0.025 + seed3 * 0.032) * (seed1 > 0.5 ? 1 : -1),
        baseHeight,
        bobPhase: seed2 * Math.PI * 2,
        bobAmp: 0.45 + seed3 * 0.45,
        flickerSeed: seed3 * 10,
        riseProgress: shouldAnimateRise ? 0 : 1,
        hovered: false,
      });
    });
  }

  public getHitTargets(): THREE.Object3D[] {
    const targets: THREE.Object3D[] = [];
    for (const vis of this.visuals.values()) {
      targets.push(vis.hitMesh);
    }
    return targets;
  }

  public getLanternById(id: string): LanternItem | undefined {
    return this.visuals.get(id)?.item;
  }

  public getWorldPosition(id: string): THREE.Vector3 | null {
    const vis = this.visuals.get(id);
    if (!vis) return null;
    return vis.group.getWorldPosition(new THREE.Vector3());
  }

  public setHovered(id: string | null): void {
    for (const [key, vis] of this.visuals.entries()) {
      vis.hovered = key === id;
    }
  }

  public update(dt: number, elapsed: number): void {
    for (const vis of this.visuals.values()) {
      if (vis.riseProgress < 1) {
        vis.riseProgress = Math.min(1, vis.riseProgress + dt * 0.58);
      }
      const easeOut = 1 - Math.pow(1 - vis.riseProgress, 3);

      const angle = vis.baseAngle + elapsed * vis.orbitSpeed;
      const targetX = Math.cos(angle) * vis.orbitRadius;
      const targetZ = Math.sin(angle) * vis.orbitRadius;
      const targetY = vis.baseHeight + Math.sin(elapsed * 0.85 + vis.bobPhase) * vis.bobAmp;

      const x = THREE.MathUtils.lerp(targetX * 0.35, targetX, easeOut);
      const y = THREE.MathUtils.lerp(1.5, targetY, easeOut);
      const z = THREE.MathUtils.lerp(targetZ * 0.35, targetZ, easeOut);
      vis.group.position.set(x, y, z);

      const t = elapsed + vis.flickerSeed;
      if (vis.item.type === 'wish') {
        // Paper lanterns sway gently in the wind; flame breathes irregularly
        vis.body.rotation.z = Math.sin(t * 0.9) * 0.07;
        vis.body.rotation.x = Math.cos(t * 0.7) * 0.05;
        const flicker = 1 + Math.sin(t * 9.0) * 0.06 + Math.sin(t * 13.7) * 0.045;
        vis.glow.scale.setScalar(vis.glowBase * flicker);
      } else if (vis.item.type === 'unspoken') {
        vis.body.rotation.y = elapsed * 0.25 + vis.bobPhase;
        vis.glow.scale.setScalar(vis.glowBase * (1 + Math.sin(t * 1.4) * 0.06));
      } else {
        vis.body.rotation.y = elapsed * 0.6 + vis.bobPhase;
        vis.glow.scale.setScalar(vis.glowBase * (1 + Math.sin(t * 2.6) * 0.09));
      }

      const baseScale = vis.hovered ? 1.32 : vis.item.isMine ? 1.12 : 1.0;
      const targetScale = baseScale * (0.25 + 0.75 * easeOut);
      const nextScale = THREE.MathUtils.lerp(vis.group.scale.x, targetScale, Math.min(1, dt * 8));
      vis.group.scale.setScalar(nextScale);

      if (vis.haloRing) {
        vis.haloRing.rotation.z = elapsed * 0.8;
      }
    }
  }

  public dispose(): void {
    [
      this.lanternGeo,
      this.lanternRimGeo,
      this.flameGeo,
      this.orbGeo,
      this.orbRingGeo,
      this.starGeo,
      this.mineHaloGeo,
      this.hitSphereGeo,
    ].forEach((g) => g.dispose());
    [
      this.paperMat,
      this.rimMat,
      this.flameMat,
      this.orbMat,
      this.orbRingMat,
      this.starMat,
      this.mineHaloMat,
      this.hitMat,
      this.glowMatWish,
      this.glowMatUnspoken,
      this.glowMatGreeting,
    ].forEach((m) => m.dispose());
  }
}
