import * as THREE from 'three';

export function measureSkinned(root) {
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  const meshes = [];
  root.updateWorldMatrix(true, true);
  root.traverse((o) => {
    if (o.isMesh) meshes.push(o);
  });
  for (const m of meshes) {
    const pos = m.geometry?.attributes?.position;
    if (!pos) continue;
    const step = Math.max(1, Math.floor(pos.count / 5000));
    for (let i = 0; i < pos.count; i += step) {
      try {
        m.getVertexPosition(i, v);
      } catch {
        v.fromBufferAttribute(pos, i);
      }
      m.localToWorld(v);
      box.expandByPoint(v);
    }
  }
  if (box.isEmpty()) box.setFromObject(root);
  return box;
}

