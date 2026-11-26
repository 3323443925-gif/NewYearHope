import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { FestivalStage, LanternItem } from '@/types/lantern';
import { getFestivalStage, getLocalDayClock } from '@/lib/festival';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FireworkSystem } from './FireworkSystem';
import { LanternField } from './LanternField';
import { createFivePointStarGeometry } from './shapes';

export interface HoverPreviewPayload {
  lantern: LanternItem;
  screenX: number;
  screenY: number;
}

export interface StarlightSceneCallbacks {
  onSelectLantern: (lantern: LanternItem) => void;
  onHoverLantern: (preview: HoverPreviewPayload | null) => void;
  onClickCannon: () => void;
  onMidnightReached?: () => void;
  onLowPerformanceDetected?: () => void;
  onFireworkBurst?: (intensity: number) => void;
}

function createSoftGlowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.22, 'rgba(255,244,205,0.88)');
    grad.addColorStop(0.55, 'rgba(255,204,122,0.28)');
    grad.addColorStop(1, 'rgba(255,190,100,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Procedural fine snow sparkle bump/roughness texture so moonlight and warm tree glow
 * produce delicate crystalline micro-reflections across the snow slopes.
 */
function createSnowMicroTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 6500; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const v = Math.random() > 0.88 ? 245 : 105 + Math.floor(Math.random() * 55);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(x, y, 1.5, 1.5);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates a lightweight procedural starlight + warm-hearth PMREM environment map on GPU
 * (zero external .hdr download) so glossy baubles, brass cannons, golden star, gift ribbons,
 * and icy crystals catch realistic specular highlights and rim reflections.
 */
function createStarlightEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x091633);

  // Cool moonlight softbox panel above-left
  const moonPanel = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 18),
    new THREE.MeshBasicMaterial({ color: 0x9ec6ff, side: THREE.DoubleSide })
  );
  moonPanel.position.set(-14, 16, 12);
  moonPanel.lookAt(0, 0, 0);
  envScene.add(moonPanel);

  // Warm golden festive softbox panel center-top (creates warm gold glints on ornaments!)
  const warmPanel = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 14),
    new THREE.MeshBasicMaterial({ color: 0xffd180, side: THREE.DoubleSide })
  );
  warmPanel.position.set(6, 12, 10);
  warmPanel.lookAt(0, 0, 0);
  envScene.add(warmPanel);

  // Soft icy blue rim reflector on opposite side
  const rimPanel = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 10),
    new THREE.MeshBasicMaterial({ color: 0x4f7ad1, side: THREE.DoubleSide })
  );
  rimPanel.position.set(14, 4, -14);
  rimPanel.lookAt(0, 0, 0);
  envScene.add(rimPanel);

  // Warm amber bounce on right side matching reference glow
  const rightGlow = new THREE.Mesh(
    new THREE.SphereGeometry(3.2, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xffae52 })
  );
  rightGlow.position.set(10, -2, 6);
  envScene.add(rightGlow);

  const envRT = pmrem.fromScene(envScene, 0.04);
  pmrem.dispose();
  return envRT.texture;
}

/**
 * Rich midnight-blue gradient sky dome rendered inside WebGL (matches reference twilight hue
 * and guarantees zero black background under EffectComposer / UnrealBloomPass).
 */
function buildTwilightSkyDome(): THREE.Mesh {
  const geo = new THREE.SphereGeometry(185, 28, 20);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTopColor: { value: new THREE.Color(0x040b1e) },
      uMidColor: { value: new THREE.Color(0x0a1a42) },
      uHorizonColor: { value: new THREE.Color(0x132c66) },
      uBottomColor: { value: new THREE.Color(0x040919) },
      uTime: { value: 0 },
      uAurora: { value: 0 },
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform vec3 uTopColor;
      uniform vec3 uMidColor;
      uniform vec3 uHorizonColor;
      uniform vec3 uBottomColor;
      uniform float uTime;
      uniform float uAurora;
      varying vec3 vWorldPosition;

      float hash(vec3 p) {
        p = fract(p * 0.3183099 + 0.1);
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }
      float noise(vec3 x) {
        vec3 i = floor(x);
        vec3 f = fract(x);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
              mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
              mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
          f.z);
      }

      void main() {
        vec3 dir = normalize(vWorldPosition);
        float h = dir.y;
        vec3 col;
        if (h >= 0.0) {
          float t1 = smoothstep(0.0, 0.36, h);
          float t2 = smoothstep(0.30, 0.94, h);
          col = mix(uHorizonColor, uMidColor, t1);
          col = mix(col, uTopColor, t2);
        } else {
          float tb = smoothstep(0.0, -0.58, h);
          col = mix(uHorizonColor, uBottomColor, tb);
        }

        // Faint tilted Milky Way band with cloudy structure: gives the night sky real depth
        vec3 bandNormal = normalize(vec3(0.42, 0.5, 0.76));
        float d = dot(dir, bandNormal);
        float band = exp(-d * d * 30.0);
        float clouds = noise(dir * 5.5) * 0.6 + noise(dir * 14.0) * 0.4;
        float dust = smoothstep(0.35, 0.75, noise(dir * 9.0 + 3.0));
        col += vec3(0.15, 0.19, 0.34) * band * (0.3 + 0.7 * clouds) * (1.0 - dust * 0.45)
               * smoothstep(-0.08, 0.2, h);

        // Gentle warm-gold & teal aurora curtains during the year-end countdown
        if (uAurora > 0.001) {
          float curtain = smoothstep(0.03, 0.15, h) * (1.0 - smoothstep(0.2, 0.5, h));
          float az = atan(dir.z, dir.x);
          float wave = noise(vec3(az * 2.0 + uTime * 0.04, h * 4.0, uTime * 0.025));
          float ribbons = pow(max(0.0, sin(az * 4.0 + wave * 5.0 + uTime * 0.12)), 2.5);
          vec3 auroraCol = mix(vec3(0.22, 0.78, 0.6), vec3(1.0, 0.78, 0.42), smoothstep(0.08, 0.38, h));
          col += auroraCol * curtain * ribbons * (0.4 + 0.6 * wave) * 0.26 * uAurora;
        }

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  return new THREE.Mesh(geo, mat);
}

/**
 * Collapses every static mesh sharing one of the given materials into a single merged mesh.
 * Each sculpted pine is built from ~100 bough/snow-cap meshes; merging takes the whole
 * island from ~400 draw calls (x2 with shadows) down to ~25 with identical visuals.
 */
function mergeStaticMeshes(root: THREE.Object3D, materials: THREE.Material[]): void {
  root.updateMatrixWorld(true);
  const inverseRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const relative = new THREE.Matrix4();

  for (const mat of materials) {
    const geos: THREE.BufferGeometry[] = [];
    const victims: THREE.Mesh[] = [];
    root.traverse((obj) => {
      if (
        obj instanceof THREE.Mesh &&
        !(obj instanceof THREE.InstancedMesh) &&
        obj.material === mat
      ) {
        const g = obj.geometry.clone();
        relative.multiplyMatrices(inverseRoot, obj.matrixWorld);
        g.applyMatrix4(relative);
        geos.push(g);
        victims.push(obj);
      }
    });

    if (geos.length < 2) {
      geos.forEach((g) => g.dispose());
      continue;
    }

    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;

    victims.forEach((v) => v.parent?.remove(v));
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  }
}

/**
 * Handcrafted sculpted evergreen pine with layered drooping bough fronds,
 * organic snow-dusted tips, glossy reflective metallic ornaments (InstancedMesh),
 * spiraling warm fairy light garland, and a radiant 5-pointed star topper.
 */
function buildSculptedPineTree(options: {
  scale: number;
  hero: boolean;
  glowTexture: THREE.Texture;
  snowBump: THREE.Texture;
}): { group: THREE.Group; starGroup?: THREE.Group; fairyMesh?: THREE.InstancedMesh } {
  const { scale, hero, glowTexture, snowBump } = options;
  const tree = new THREE.Group();

  // Sturdy bark trunk
  const trunkMat = new THREE.MeshStandardMaterial({
    color: 0x3b2417,
    roughness: 0.92,
    metalness: 0.04,
  });
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.26 * scale, 0.52 * scale, 1.7 * scale, 10),
    trunkMat
  );
  trunk.position.y = 0.82 * scale;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  tree.add(trunk);

  // Rich spruce foliage material (smooth shaded with subtle sheen for volumetric depth)
  const foliageMat = new THREE.MeshStandardMaterial({
    color: hero ? 0x1e4338 : 0x16322f,
    roughness: 0.68,
    metalness: 0.06,
    envMapIntensity: 0.9,
  });

  // Fluffy snow resting on top of drooping boughs
  const snowDustedMat = new THREE.MeshPhysicalMaterial({
    color: 0xe6f0ff,
    roughness: 0.46,
    metalness: 0.02,
    clearcoat: 0.22,
    clearcoatRoughness: 0.45,
    bumpMap: snowBump,
    bumpScale: 0.035,
    envMapIntensity: 1.15,
  });

  // Reusable sculpted bough frond geometry (drooping tapered evergreen cluster)
  const boughGeo = new THREE.ConeGeometry(0.95, 2.55, 7, 3);
  boughGeo.rotateX(Math.PI / 2); // point outward along +Z
  const bPos = boughGeo.attributes.position;
  for (let i = 0; i < bPos.count; i++) {
    const x = bPos.getX(i);
    const y = bPos.getY(i);
    const z = bPos.getZ(i);
    // Flatten slightly & curve downward toward tip like real heavy snow-laden pine branches
    const normZ = (z + 1.275) / 2.55; // 0 at base, 1 at tip
    const droop = -Math.pow(normZ, 1.7) * 0.48 + Math.sin(normZ * Math.PI) * 0.14;
    bPos.setX(i, x * (1.08 - normZ * 0.12));
    bPos.setY(i, y * 0.62 + droop);
  }
  boughGeo.computeVertexNormals();

  // Matching snow blanket cap hugging the upper surface of each bough
  const snowCapGeo = new THREE.SphereGeometry(0.62, 7, 5, 0, Math.PI * 2, 0, Math.PI * 0.55);
  snowCapGeo.scale(1.05, 0.36, 1.85);

  const tierCount = hero ? 8 : 5;
  const baubleMatrices: { matrix: THREE.Matrix4; color: THREE.Color }[] = [];
  const bulbMatrices: { matrix: THREE.Matrix4; color: THREE.Color }[] = [];
  const dummy = new THREE.Object3D();

  const baublePalette = [
    new THREE.Color(0xd93848), // Ruby Red
    new THREE.Color(0xf7c96e), // Champagne Gold
    new THREE.Color(0x6bb5ff), // Ice Sapphire
    new THREE.Color(0xf2f6ff), // Mirror Silver
    new THREE.Color(0xff9454), // Warm Copper
  ];
  const bulbPalette = [
    new THREE.Color(0xffe7a1),
    new THREE.Color(0xffbd66),
    new THREE.Color(0xff8e99),
    new THREE.Color(0x9ed8ff),
    new THREE.Color(0xfff6d4),
  ];

  // Unified shorter, wider spruce silhouette matching the stout cozy tree in the reference image
  const foliageBaseY = 1.15 * scale;
  const foliageHeight = (hero ? 6.15 : 3.95) * scale;
  const maxOuterRadius = (hero ? 4.85 : 2.55) * scale;
  const getEnvelopeRadius = (t: number) =>
    THREE.MathUtils.lerp(maxOuterRadius, (hero ? 0.42 : 0.28) * scale, Math.pow(t, 0.88));

  // Inner solid core cone matching the wider, shorter envelope so zero gaps appear
  const innerCore = new THREE.Mesh(
    new THREE.ConeGeometry(maxOuterRadius * 0.82, foliageHeight * 1.02, 16),
    foliageMat
  );
  innerCore.position.y = foliageBaseY + foliageHeight * 0.5;
  innerCore.castShadow = true;
  innerCore.receiveShadow = true;
  tree.add(innerCore);

  for (let tier = 0; tier < tierCount; tier++) {
    const t = tier / (tierCount - 1); // 0 bottom -> 1 top
    const tierY = foliageBaseY + t * (foliageHeight * 0.88) + 0.25 * scale;
    const targetOuterR = getEnvelopeRadius(t);
    const boughCount = hero
      ? Math.max(7, Math.round(THREE.MathUtils.lerp(15, 7, t)))
      : Math.max(5, Math.round(THREE.MathUtils.lerp(9, 5, t)));

    for (let b = 0; b < boughCount; b++) {
      const angle =
        (b / boughCount) * Math.PI * 2 + tier * 0.62 + Math.sin(b * 3.1 + tier) * 0.08;
      const bScale = THREE.MathUtils.lerp(hero ? 1.55 : 0.96, hero ? 0.44 : 0.34, t) * scale;
      // Anchor boughs so their outer tips align cleanly with targetOuterR
      const anchorR = Math.max(0.15 * scale, targetOuterR - bScale * 1.52);

      const boughHolder = new THREE.Group();
      boughHolder.position.set(
        Math.cos(angle) * anchorR,
        tierY,
        Math.sin(angle) * anchorR
      );
      boughHolder.rotation.y = -angle + Math.PI / 2;
      boughHolder.rotation.x = 0.26 + (b % 3) * 0.04;

      const bough = new THREE.Mesh(boughGeo, foliageMat);
      bough.scale.set(bScale * 0.88, bScale * 0.72, bScale * 0.98);
      bough.position.z = bScale * 0.72;
      bough.castShadow = true;
      bough.receiveShadow = true;
      boughHolder.add(bough);

      if (hero || b % 2 === 0 || tier >= tierCount - 2) {
        const snowCap = new THREE.Mesh(snowCapGeo, snowDustedMat);
        snowCap.scale.setScalar(bScale * 0.72);
        snowCap.position.set(0, bScale * 0.22, bScale * 0.86);
        snowCap.receiveShadow = true;
        boughHolder.add(snowCap);
      }

      tree.add(boughHolder);

      // Hero tree: snugly nestle glossy metallic baubles along outer boughs
      if (hero && tier < tierCount - 1) {
        const surfaceR = targetOuterR * 0.92;
        if ((b + tier) % 2 === 0) {
          const bx = Math.cos(angle) * surfaceR;
          const bz = Math.sin(angle) * surfaceR;
          const by = tierY - bScale * 0.24;
          dummy.position.set(bx, by, bz);
          const orbSize = (0.16 + ((b + tier) % 3) * 0.04) * scale;
          dummy.scale.setScalar(orbSize);
          dummy.rotation.set(0, 0, 0);
          dummy.updateMatrix();
          baubleMatrices.push({
            matrix: dummy.matrix.clone(),
            color: baublePalette[(b * 3 + tier) % baublePalette.length],
          });
        }
      }
    }
  }

  let fairyMesh: THREE.InstancedMesh | undefined;
  let starGroup: THREE.Group | undefined;

  if (hero) {
    // 1. Form-fitting spiraling fairy-light garland hugging the exact sculpted bough surface!
    const garlandPts: THREE.Vector3[] = [];
    const turns = 5.2;
    const steps = 130;
    for (let i = 0; i <= steps; i++) {
      const f = i / steps; // 0 bottom -> 1 near tip
      const angle = f * Math.PI * 2 * turns;
      // Gentle natural swag drape between boughs while staying tightly hugged to foliage
      const drape = Math.sin(angle * 7) * 0.065 * scale * (1 - f * 0.6);
      const y = foliageBaseY + 0.35 * scale + f * (foliageHeight * 0.88) + drape;
      const r = getEnvelopeRadius(f) * 0.93 + Math.cos(angle * 7) * 0.05 * scale;
      const pt = new THREE.Vector3(Math.cos(angle) * r, y, Math.sin(angle) * r);
      garlandPts.push(pt);

      // Place warm fairy bulbs directly ON the garland wire so lights & wire are 100% unified!
      if (i % 1 === 0 && i > 1 && i < steps - 1) {
        dummy.position.copy(pt);
        dummy.scale.setScalar((0.075 + (i % 3) * 0.015) * scale);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        bulbMatrices.push({
          matrix: dummy.matrix.clone(),
          color: bulbPalette[i % bulbPalette.length],
        });
      }
    }
    const garlandCurve = new THREE.CatmullRomCurve3(garlandPts);
    const garlandMesh = new THREE.Mesh(
      new THREE.TubeGeometry(garlandCurve, 140, 0.032 * scale, 6, false),
      new THREE.MeshStandardMaterial({
        color: 0xe6be70,
        emissive: 0x8f5d1a,
        emissiveIntensity: 0.45,
        metalness: 0.78,
        roughness: 0.3,
      })
    );
    tree.add(garlandMesh);

    // 2. Instanced mirror-gloss metallic ornaments
    const baubleGeo = new THREE.SphereGeometry(1, 14, 12);
    const baubleMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0.9,
      roughness: 0.12,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
      envMapIntensity: 1.9,
    });
    const baubleInst = new THREE.InstancedMesh(baubleGeo, baubleMat, baubleMatrices.length);
    baubleMatrices.forEach((b, idx) => {
      baubleInst.setMatrixAt(idx, b.matrix);
      baubleInst.setColorAt(idx, b.color);
    });
    baubleInst.instanceMatrix.needsUpdate = true;
    if (baubleInst.instanceColor) baubleInst.instanceColor.needsUpdate = true;
    tree.add(baubleInst);

    // 3. Instanced warm glowing fairy light bulbs hugging the garland
    const bulbGeo = new THREE.SphereGeometry(1, 8, 8);
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    fairyMesh = new THREE.InstancedMesh(bulbGeo, bulbMat, bulbMatrices.length);
    bulbMatrices.forEach((b, idx) => {
      fairyMesh!.setMatrixAt(idx, b.matrix);
      fairyMesh!.setColorAt(idx, b.color);
    });
    fairyMesh.instanceMatrix.needsUpdate = true;
    if (fairyMesh.instanceColor) fairyMesh.instanceColor.needsUpdate = true;
    tree.add(fairyMesh);

    // 4. Refined Golden 5-Pointed Top Star (soft warm glow, crisp star shape — not blown out!)
    const topY = foliageBaseY + foliageHeight + 0.35 * scale;
    starGroup = new THREE.Group();
    starGroup.position.y = topY;

    const starGeo = createFivePointStarGeometry(0.84 * scale, 0.38 * scale, 0.2 * scale);
    const starMat = new THREE.MeshStandardMaterial({
      color: 0xffe49e,
      emissive: 0xffb845,
      emissiveIntensity: 1.08,
      metalness: 0.65,
      roughness: 0.22,
    });
    const starMesh = new THREE.Mesh(starGeo, starMat);
    starGroup.add(starMesh);

    // Gentle warm aura (balanced so the 5-pointed silhouette stays crisp and clear)
    const haloInner = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture,
        color: 0xffe096,
        transparent: true,
        opacity: 0.42,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    haloInner.scale.set(3.2 * scale, 3.2 * scale, 1);
    starGroup.add(haloInner);

    const haloOuter = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture,
        color: 0xffa63d,
        transparent: true,
        opacity: 0.19,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    haloOuter.scale.set(6.0 * scale, 6.0 * scale, 1);
    starGroup.add(haloOuter);

    // Soft warm light streaming down from the star onto the upper snow branches
    const starLight = new THREE.PointLight(0xffcf70, 4.4, 22, 1.6);
    starLight.position.set(0, 0.15, 0);
    starGroup.add(starLight);

    tree.add(starGroup);
  }

  // Collapse boughs, snow caps and trunk into a handful of draw calls
  mergeStaticMeshes(tree, [foliageMat, snowDustedMat, trunkMat]);

  return { group: tree, starGroup, fairyMesh };
}

/**
 * Smoothly sculpted pillowy floating snow island matching reference diorama:
 * - Soft organic billowing snow drifts with subtle micro-sparkle clearcoat reflection
 * - Overhanging snowy cliff rim with dark deep-blue shadowed floating underside
 * - Translucent reflective crystalline icicles hanging underneath
 * - Hero sculpted tree + 6 surrounding pines + warm glowing gift corner illuminating right pine
 */
function buildFloatingIsland(
  stage: FestivalStage,
  glowTexture: THREE.Texture,
  snowBump: THREE.Texture
): { island: THREE.Group; starGroup?: THREE.Group } {
  const island = new THREE.Group();

  // 1. Pillowy smooth-shaded snow top mound with soft overhanging organic silhouette
  const snowGeo = new THREE.SphereGeometry(9.6, 44, 24, 0, Math.PI * 2, 0, Math.PI * 0.54);
  const sPos = snowGeo.attributes.position;
  for (let i = 0; i < sPos.count; i++) {
    const x = sPos.getX(i);
    const y = sPos.getY(i);
    const z = sPos.getZ(i);
    const angle = Math.atan2(z, x);
    const radial = Math.hypot(x, z) / 9.6;
    // Soft organic pillowy perimeter lobes (matches reference rounded irregular snow island!)
    const lobe =
      1 +
      Math.sin(angle * 3 + 0.4) * 0.085 +
      Math.cos(angle * 5 - 0.8) * 0.055 +
      Math.sin(angle * 7 + 1.2) * 0.025;
    // Gentle sculpted snow drifts on top
    const drift =
      (Math.sin(x * 0.45) * Math.cos(z * 0.42) * 0.35 + Math.cos((x + z) * 0.35) * 0.2) *
      (1 - radial * 0.45);
    // Flatten crown gently into a walkable snowy meadow, keep rounded snowy lip at rim
    const sculptedY = y * 0.28 + drift * (y > 0.3 ? 1 : 0.2);
    sPos.setXYZ(i, x * lobe, sculptedY, z * lobe);
  }
  snowGeo.computeVertexNormals();

  const snowMat = new THREE.MeshPhysicalMaterial({
    color: 0xdceaff,
    roughness: 0.48,
    metalness: 0.02,
    clearcoat: 0.26,
    clearcoatRoughness: 0.42,
    bumpMap: snowBump,
    bumpScale: 0.045,
    envMapIntensity: 1.2,
  });
  const snowTop = new THREE.Mesh(snowGeo, snowMat);
  snowTop.position.y = 0.05;
  snowTop.receiveShadow = true;
  snowTop.castShadow = true;
  island.add(snowTop);

  // Soft snow lip ring tucking under the top edge
  const rimGeo = new THREE.TorusGeometry(8.95, 0.82, 14, 48);
  rimGeo.rotateX(Math.PI / 2);
  const rPos = rimGeo.attributes.position;
  for (let i = 0; i < rPos.count; i++) {
    const x = rPos.getX(i);
    const y = rPos.getY(i);
    const z = rPos.getZ(i);
    const angle = Math.atan2(z, x);
    const lobe =
      1 +
      Math.sin(angle * 3 + 0.4) * 0.085 +
      Math.cos(angle * 5 - 0.8) * 0.055 +
      Math.sin(angle * 7 + 1.2) * 0.025;
    rPos.setXYZ(i, x * lobe, y * 0.72 - 0.22 + Math.sin(angle * 4) * 0.14, z * lobe);
  }
  rimGeo.computeVertexNormals();
  const snowRim = new THREE.Mesh(rimGeo, snowMat);
  snowRim.receiveShadow = true;
  island.add(snowRim);

  // 2. Deep shadowed sculpted rocky/icy floating belly (matches dark silhouette under island in reference!)
  const bellyGeo = new THREE.SphereGeometry(9.05, 36, 18, 0, Math.PI * 2, Math.PI * 0.48, Math.PI * 0.52);
  const uPos = bellyGeo.attributes.position;
  for (let i = 0; i < uPos.count; i++) {
    const x = uPos.getX(i);
    const y = uPos.getY(i);
    const z = uPos.getZ(i);
    const angle = Math.atan2(z, x);
    const lobe =
      1 +
      Math.sin(angle * 3 + 0.4) * 0.08 +
      Math.cos(angle * 5 - 0.8) * 0.05 +
      Math.sin(y * 0.9 + angle * 6) * 0.035;
    uPos.setXYZ(i, x * lobe, y * 0.72, z * lobe);
  }
  bellyGeo.computeVertexNormals();

  const bellyMat = new THREE.MeshStandardMaterial({
    color: 0x0b1736,
    roughness: 0.88,
    metalness: 0.1,
    envMapIntensity: 0.45,
  });
  const belly = new THREE.Mesh(bellyGeo, bellyMat);
  belly.position.y = -0.35;
  belly.receiveShadow = true;
  island.add(belly);

  // 3. Crystalline translucent reflective icicles hanging around the snowy lip (InstancedMesh!)
  const icicleGeo = new THREE.ConeGeometry(0.11, 1.55, 7);
  icicleGeo.rotateX(Math.PI);
  const icicleMat = new THREE.MeshPhysicalMaterial({
    color: 0xc2e0ff,
    emissive: 0x3b69b5,
    emissiveIntensity: 0.35,
    roughness: 0.1,
    metalness: 0.15,
    transmission: 0.45,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
    transparent: true,
    opacity: 0.88,
    envMapIntensity: 2.0,
  });
  const icicleCount = 18;
  const icicleInst = new THREE.InstancedMesh(icicleGeo, icicleMat, icicleCount);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < icicleCount; i++) {
    const angle = (i / icicleCount) * Math.PI * 2 + 0.18;
    const lobe =
      1 +
      Math.sin(angle * 3 + 0.4) * 0.085 +
      Math.cos(angle * 5 - 0.8) * 0.055;
    const r = (8.1 + (i % 3) * 0.42) * lobe;
    const scaleY = 0.55 + ((i * 7) % 5) * 0.28;
    dummy.position.set(
      Math.cos(angle) * r,
      -0.85 - scaleY * 0.52,
      Math.sin(angle) * r
    );
    dummy.scale.set(0.85 + (i % 2) * 0.3, scaleY, 0.85 + (i % 2) * 0.3);
    dummy.rotation.set(0, angle, 0);
    dummy.updateMatrix();
    icicleInst.setMatrixAt(i, dummy.matrix);
  }
  icicleInst.instanceMatrix.needsUpdate = true;
  island.add(icicleInst);

  // 4. Central Hero Sculpted Christmas Tree
  const hero = buildSculptedPineTree({
    scale: 1.18,
    hero: true,
    glowTexture,
    snowBump,
  });
  hero.group.position.set(0, 1.75, -0.45);
  island.add(hero.group);

  // 5. Surrounding Mini Snow-Dusted Pines (placed faithfully to the reference diorama!)
  const smallTrees: [number, number, number, number][] = [
    [-5.8, 1.38, 1.55, 0.62],
    [-4.35, 1.45, -3.55, 0.58],
    [-1.45, 1.52, 4.95, 0.68],
    [2.65, 1.48, 3.85, 0.52],
    [5.85, 1.38, 0.75, 0.74], // Right hero side pine bathed in warm amber glow!
    [4.45, 1.42, -3.65, 0.54],
  ];
  for (const [x, y, z, s] of smallTrees) {
    const mini = buildSculptedPineTree({
      scale: s,
      hero: false,
      glowTexture,
      snowBump,
    });
    mini.group.position.set(x, y, z);
    island.add(mini.group);
  }

  // 6. Glossy festive wrapped gifts with reflective gold ribbons + warm corner glow
  //    (mirrors the warm golden bounce light on the right pine in the reference!)
  const giftScale =
    stage === 'christmas_week' || stage === 'countdown' || stage === 'new_year_finale'
      ? 1.18
      : 1.0;
  const ribbonMat = new THREE.MeshStandardMaterial({
    color: 0xffd778,
    emissive: 0xa66a14,
    emissiveIntensity: 0.35,
    metalness: 0.88,
    roughness: 0.18,
  });

  const gifts: [number, number, number, number, number][] = [
    [4.35, 2.02, 0.25, 0xd63649, 0.78], // Crimson gift beside right glowing pine
    [3.55, 1.98, 1.05, 0xf2b950, 0.62], // Golden gift beside right pine
    [-2.45, 2.05, 2.35, 0x3b84d6, 0.68],
    [1.65, 2.08, 1.95, 0xe85a6f, 0.58],
  ];
  for (const [x, y, z, color, size] of gifts) {
    const gGroup = new THREE.Group();
    const s = size * giftScale;
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(s, s * 0.88, s),
      new THREE.MeshPhysicalMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.22,
        roughness: 0.28,
        clearcoat: 0.65,
        clearcoatRoughness: 0.2,
      })
    );
    box.castShadow = true;
    box.receiveShadow = true;
    gGroup.add(box);

    // Crossed metallic gold ribbons
    const ribA = new THREE.Mesh(new THREE.BoxGeometry(s * 1.04, s * 0.92, s * 0.16), ribbonMat);
    const ribB = new THREE.Mesh(new THREE.BoxGeometry(s * 0.16, s * 0.92, s * 1.04), ribbonMat);
    gGroup.add(ribA, ribB);

    gGroup.position.set(x, y, z);
    gGroup.rotation.y = x * 0.55;
    island.add(gGroup);
  }

  // Warm golden accent lights replicating the rich warm-vs-cool depth of the reference image:
  // 1) Cozy amber glow bathing the lower central tree & surrounding snow
  const treeWarmCore = new THREE.PointLight(0xffb55e, 5.2, 18, 1.55);
  treeWarmCore.position.set(0.2, 4.6, 1.5);
  island.add(treeWarmCore);

  // 2) Signature golden hearth glow beside the right-hand pine tree & gifts (exact reference detail!)
  const rightPineGlow = new THREE.PointLight(0xffb44c, 6.8, 12.5, 1.65);
  rightPineGlow.position.set(4.95, 2.95, 1.45);
  island.add(rightPineGlow);

  return { island, starGroup: hero.starGroup };
}

export class StarlightScene {
  private readonly container: HTMLElement;
  private readonly callbacks: StarlightSceneCallbacks;
  private readonly getClockDate: () => Date;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly composer: EffectComposer;
  private readonly bloomPass: UnrealBloomPass;

  private readonly glowTexture: THREE.CanvasTexture;
  private readonly snowBump: THREE.CanvasTexture;
  private readonly envTexture: THREE.Texture;
  private readonly skyDome: THREE.Mesh;
  private readonly islandGroup: THREE.Group;
  private readonly topStarGroup?: THREE.Group;
  private readonly fireworkSystem: FireworkSystem;
  private readonly lanternField: LanternField;
  private readonly snowGeo: THREE.BufferGeometry;
  private readonly snowPositions: Float32Array;
  private readonly snowCount: number;
  private readonly starsMesh: THREE.Points;

  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private pointerDownPos = { x: 0, y: 0 };

  private rafId: number | null = null;
  private lastTime = performance.now();
  private elapsed = 0;
  private paused = false;
  private useBloom = true;
  private lowFpsDuration = 0;
  private lastDayKey: string;
  private disposed = false;

  // Cinematic opening: camera glides in from afar toward the island
  private introT = 0;
  private readonly introFrom = new THREE.Vector3();
  private readonly introTo = new THREE.Vector3();

  constructor(
    container: HTMLElement,
    callbacks: StarlightSceneCallbacks,
    getClockDate: () => Date
  ) {
    this.container = container;
    this.callbacks = callbacks;
    this.getClockDate = getClockDate;

    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    const isMobile = width < 768;

    this.renderer = new THREE.WebGLRenderer({
      antialias: !isMobile,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(0x061028, 1);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2));
    this.renderer.setSize(width, height);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x061028);
    this.scene.fog = new THREE.FogExp2(0x081533, 0.0078);

    // Procedural PMREM environment map for crisp metallic & snow specular reflections
    this.envTexture = createStarlightEnvironment(this.renderer);
    this.scene.environment = this.envTexture;

    this.skyDome = buildTwilightSkyDome();
    this.scene.add(this.skyDome);

    this.camera = new THREE.PerspectiveCamera(42, width / height, 0.5, 280);
    this.applyResponsiveCamera(width, height);
    this.introFrom.copy(this.introTo).multiplyScalar(1.42).add(new THREE.Vector3(-6, 7, 0));
    this.camera.position.copy(this.introFrom);

    // Reference OrbitControls setup (controls.target = 0, 3.6, 0; autoRotateSpeed = 0.26)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 3.8, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.enablePan = false;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.26;
    this.controls.minDistance = 16;
    this.controls.maxDistance = 95; // widened during the opening glide, restored afterwards
    this.controls.minPolarAngle = 0.35;
    this.controls.maxPolarAngle = Math.PI * 0.54;

    // Refined Bloom tuning: keeps star shape crisp while letting fireworks & fairy lights shimmer
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      0.62,
      0.78,
      0.72
    );
    this.composer.addPass(this.bloomPass);
    this.useBloom = !isMobile || (window.devicePixelRatio || 1) <= 2;

    // Cinematic 3-point moonlight + soft PCF shadows for genuine 3D relief
    const hemiLight = new THREE.HemisphereLight(0x7ca7f7, 0x0b1633, 0.92);
    this.scene.add(hemiLight);

    const moonLight = new THREE.DirectionalLight(0xcbe0ff, 1.55);
    moonLight.position.set(-18, 28, 16);
    moonLight.castShadow = true;
    moonLight.shadow.mapSize.set(isMobile ? 512 : 1024, isMobile ? 512 : 1024);
    moonLight.shadow.camera.near = 6;
    moonLight.shadow.camera.far = 65;
    const d = 14;
    moonLight.shadow.camera.left = -d;
    moonLight.shadow.camera.right = d;
    moonLight.shadow.camera.top = d;
    moonLight.shadow.camera.bottom = -d;
    moonLight.shadow.bias = -0.0008;
    moonLight.shadow.radius = 3.2;
    this.scene.add(moonLight);

    const rimLight = new THREE.DirectionalLight(0x6e9eff, 0.72);
    rimLight.position.set(16, 10, -20);
    this.scene.add(rimLight);

    this.glowTexture = createSoftGlowTexture();
    this.snowBump = createSnowMicroTexture();

    const now = this.getClockDate();
    const stage = getFestivalStage(now);
    (this.skyDome.material as THREE.ShaderMaterial).uniforms.uAurora.value =
      stage === 'countdown' ? 1 : stage === 'new_year_finale' ? 0.8 : stage === 'christmas_week' ? 0.3 : 0;
    const built = buildFloatingIsland(stage, this.glowTexture, this.snowBump);
    this.islandGroup = built.island;
    this.topStarGroup = built.starGroup;
    this.scene.add(this.islandGroup);

    this.fireworkSystem = new FireworkSystem(this.glowTexture, (intensity) =>
      this.callbacks.onFireworkBurst?.(intensity)
    );
    this.islandGroup.add(this.fireworkSystem.group);

    this.lanternField = new LanternField(this.glowTexture);
    this.scene.add(this.lanternField.group);

    // Distant starry night sky
    const starCount = isMobile ? 750 : 1450;
    const starPos = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);
    const palette = [
      new THREE.Color(0xffffff),
      new THREE.Color(0xbad6ff),
      new THREE.Color(0xffe5ad),
    ];
    for (let i = 0; i < starCount; i++) {
      const radius = 64 + Math.random() * 92;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      starPos[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      starPos[i * 3 + 1] = radius * Math.cos(phi);
      starPos[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
      const col = palette[i % palette.length];
      starColors[i * 3] = col.r;
      starColors[i * 3 + 1] = col.g;
      starColors[i * 3 + 2] = col.b;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
    this.starsMesh = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({
        size: 1.25,
        map: this.glowTexture,
        vertexColors: true,
        transparent: true,
        opacity: 0.92,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.scene.add(this.starsMesh);

    // Gentle falling winter snow
    this.snowCount = isMobile ? 240 : 460;
    this.snowPositions = new Float32Array(this.snowCount * 3);
    for (let i = 0; i < this.snowCount; i++) {
      this.snowPositions[i * 3] = (Math.random() - 0.5) * 56;
      this.snowPositions[i * 3 + 1] = Math.random() * 34 - 4;
      this.snowPositions[i * 3 + 2] = (Math.random() - 0.5) * 56;
    }
    this.snowGeo = new THREE.BufferGeometry();
    this.snowGeo.setAttribute('position', new THREE.BufferAttribute(this.snowPositions, 3));
    const snowPoints = new THREE.Points(
      this.snowGeo,
      new THREE.PointsMaterial({
        size: 0.48,
        map: this.glowTexture,
        color: 0xeaf2ff,
        transparent: true,
        opacity: 0.76,
        depthWrite: false,
      })
    );
    this.scene.add(snowPoints);

    this.lastDayKey = getLocalDayClock(now).dayKey;

    // Anyone visiting on New Year's Day is greeted with a grand show shortly after arriving
    if (stage === 'new_year_finale') {
      window.setTimeout(() => {
        if (!this.disposed) this.fireworkSystem.triggerShow(true);
      }, 3400);
    }

    window.addEventListener('resize', this.handleResize);
    document.addEventListener('visibilitychange', this.handleVisibility);
    this.renderer.domElement.addEventListener('pointermove', this.handlePointerMove);
    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.addEventListener('pointerup', this.handlePointerUp);

    this.animate();
  }

  private applyResponsiveCamera(width: number, height: number): void {
    const aspect = width / Math.max(1, height);
    if (aspect < 0.85) {
      this.introTo.set(22, 18.5, 42);
    } else {
      // Matches reference framing while keeping firework altar & burning fuse clearly visible
      this.introTo.set(17, 15.5, 33.5);
    }
    if (this.introT >= 1) {
      this.camera.position.copy(this.introTo);
    }
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  private finishIntro(): void {
    this.introT = 1;
    this.controls.maxDistance = 58;
  }

  public syncLanterns(
    items: LanternItem[],
    freshlyLaunchedId?: string,
    batchKey = 0
  ): void {
    const maxCount = this.container.clientWidth < 768 ? 30 : 50;
    this.lanternField.syncLanterns(items, maxCount, freshlyLaunchedId, batchKey);
  }

  public triggerFireworkShow(grand = false): void {
    this.fireworkSystem.triggerShow(grand);
  }

  public triggerMiniSpark(): void {
    this.fireworkSystem.triggerMiniSpark();
  }

  private getNDC(clientX: number, clientY: number): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  }

  private handlePointerMove = (ev: PointerEvent): void => {
    if (ev.pointerType === 'touch') return;
    this.getNDC(ev.clientX, ev.clientY);
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const hits = this.raycaster.intersectObjects(
      [...this.lanternField.getHitTargets(), this.fireworkSystem.hitTarget],
      false
    );

    if (hits.length > 0) {
      const data = hits[0].object.userData;
      this.renderer.domElement.style.cursor = 'pointer';
      if (data.kind === 'lantern' && data.lanternId) {
        this.lanternField.setHovered(data.lanternId);
        const lantern = this.lanternField.getLanternById(data.lanternId);
        const worldPos = this.lanternField.getWorldPosition(data.lanternId);
        if (lantern && worldPos) {
          const projected = worldPos.project(this.camera);
          const rect = this.renderer.domElement.getBoundingClientRect();
          this.callbacks.onHoverLantern({
            lantern,
            screenX: rect.left + ((projected.x + 1) / 2) * rect.width,
            screenY: rect.top + ((-projected.y + 1) / 2) * rect.height,
          });
          return;
        }
      } else if (data.kind === 'firework-cannon') {
        this.lanternField.setHovered(null);
        this.callbacks.onHoverLantern(null);
        return;
      }
    }

    this.renderer.domElement.style.cursor = 'grab';
    this.lanternField.setHovered(null);
    this.callbacks.onHoverLantern(null);
  };

  private handlePointerDown = (ev: PointerEvent): void => {
    this.pointerDownPos = { x: ev.clientX, y: ev.clientY };
    // Hand control to the visitor the moment they touch the scene
    if (this.introT < 1) this.finishIntro();
  };

  private handlePointerUp = (ev: PointerEvent): void => {
    const moveDist = Math.hypot(
      ev.clientX - this.pointerDownPos.x,
      ev.clientY - this.pointerDownPos.y
    );
    if (moveDist > 8) return;

    this.getNDC(ev.clientX, ev.clientY);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(
      [...this.lanternField.getHitTargets(), this.fireworkSystem.hitTarget],
      false
    );
    if (hits.length === 0) return;

    const data = hits[0].object.userData;
    if (data.kind === 'lantern' && data.lanternId) {
      const lantern = this.lanternField.getLanternById(data.lanternId);
      if (lantern) {
        this.callbacks.onSelectLantern(lantern);
      }
    } else if (data.kind === 'firework-cannon') {
      this.callbacks.onClickCannon();
    }
  };

  private handleResize = (): void => {
    if (this.disposed) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.applyResponsiveCamera(width, height);
    this.renderer.setSize(width, height);
    this.composer.setSize(width, height);
    this.bloomPass.setSize(width, height);
  };

  private handleVisibility = (): void => {
    this.paused = document.hidden;
    if (!this.paused) {
      this.lastTime = performance.now();
    }
  };

  private animate = (): void => {
    if (this.disposed) return;
    this.rafId = window.requestAnimationFrame(this.animate);
    if (this.paused) return;

    const nowMs = performance.now();
    const rawDt = (nowMs - this.lastTime) / 1000;
    const dt = Math.min(rawDt, 0.05);
    this.lastTime = nowMs;
    this.elapsed += dt;

    (this.skyDome.material as THREE.ShaderMaterial).uniforms.uTime.value = this.elapsed;

    if (this.introT < 1) {
      this.introT = Math.min(1, this.introT + dt / 3.6);
      const e = 1 - Math.pow(1 - this.introT, 3);
      this.camera.position.lerpVectors(this.introFrom, this.introTo, e);
      if (this.introT >= 1) this.finishIntro();
    }

    if (rawDt > 0.055) {
      this.lowFpsDuration += rawDt;
      if (this.lowFpsDuration > 2.5 && this.useBloom) {
        this.useBloom = false;
        this.renderer.setPixelRatio(1);
        this.lowFpsDuration = 0;
      } else if (this.lowFpsDuration > 6 && !this.useBloom) {
        this.renderer.shadowMap.enabled = false;
        this.callbacks.onLowPerformanceDetected?.();
        this.lowFpsDuration = 0;
      }
    } else {
      this.lowFpsDuration = Math.max(0, this.lowFpsDuration - rawDt * 0.5);
    }

    // Gentle floating breath + subtle star shimmer
    this.islandGroup.position.y = Math.sin(this.elapsed * 0.62) * 0.24;
    if (this.topStarGroup) {
      this.topStarGroup.rotation.y = Math.sin(this.elapsed * 0.55) * 0.22;
      const starPulse = 1 + Math.sin(this.elapsed * 2.4) * 0.045;
      this.topStarGroup.scale.setScalar(starPulse);
    }

    for (let i = 0; i < this.snowCount; i++) {
      let y = this.snowPositions[i * 3 + 1] - (0.85 + (i % 5) * 0.16) * dt;
      let x = this.snowPositions[i * 3] + Math.sin(this.elapsed * 0.5 + i) * 0.22 * dt;
      if (y < -6) {
        y = 28;
        x = (Math.random() - 0.5) * 56;
      }
      this.snowPositions[i * 3] = x;
      this.snowPositions[i * 3 + 1] = y;
    }
    this.snowGeo.attributes.position.needsUpdate = true;

    this.starsMesh.rotation.y = this.elapsed * 0.008;

    const clockDate = this.getClockDate();
    const dayClock = getLocalDayClock(clockDate);
    if (dayClock.dayKey !== this.lastDayKey) {
      this.lastDayKey = dayClock.dayKey;
      const isNewYear = clockDate.getMonth() === 0 && clockDate.getDate() === 1;
      this.fireworkSystem.triggerShow(isNewYear);
      this.callbacks.onMidnightReached?.();
    }

    this.fireworkSystem.update(dt, this.elapsed, dayClock.progress);
    this.lanternField.update(dt, this.elapsed);
    this.controls.update();

    if (this.useBloom) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  };

  public dispose(): void {
    this.disposed = true;
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId);
    }
    window.removeEventListener('resize', this.handleResize);
    document.removeEventListener('visibilitychange', this.handleVisibility);
    this.renderer.domElement.removeEventListener('pointermove', this.handlePointerMove);
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.removeEventListener('pointerup', this.handlePointerUp);

    this.controls.dispose();
    this.fireworkSystem.dispose();
    this.lanternField.dispose();
    this.skyDome.geometry.dispose();
    (this.skyDome.material as THREE.Material).dispose();
    this.snowGeo.dispose();
    this.starsMesh.geometry.dispose();
    this.glowTexture.dispose();
    this.snowBump.dispose();
    this.envTexture.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
