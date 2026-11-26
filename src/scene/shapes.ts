import * as THREE from 'three';

/**
 * Extruded, bevelled 5-pointed star. Shared by the tree topper and greeting lanterns.
 */
export function createFivePointStarGeometry(
  outerR: number,
  innerR: number,
  depth: number
): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  const points = 5;
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (i * Math.PI) / points + Math.PI / 2;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: depth * 0.45,
    bevelSize: outerR * 0.09,
    bevelSegments: 2,
  });
  geo.center();
  return geo;
}

/**
 * Silhouette of a traditional paper sky lantern (Kongming lantern):
 * narrow open mouth at the bottom, gently swelling belly, softly domed top.
 */
export function createSkyLanternGeometry(): THREE.LatheGeometry {
  const profile = [
    new THREE.Vector2(0.24, -0.44),
    new THREE.Vector2(0.3, -0.3),
    new THREE.Vector2(0.39, -0.08),
    new THREE.Vector2(0.44, 0.14),
    new THREE.Vector2(0.43, 0.3),
    new THREE.Vector2(0.36, 0.42),
    new THREE.Vector2(0.2, 0.49),
    new THREE.Vector2(0.0, 0.51),
  ];
  return new THREE.LatheGeometry(profile, 16);
}
