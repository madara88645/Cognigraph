import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { LOBES } from "./constants.js";

/**
 * Loads and normalizes brain.glb (centered, scaled to ~3 unit radius).
 * @returns {Promise<object>}
 */
export function loadBrainGLB() {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(
      "/static/assets/brain.glb",
      (gltf) => {
        try {
          const brainScene = gltf.scene;

          const meshes = [];
          brainScene.traverse((child) => {
            if (child.isMesh) {
              const raw = (child.name || "").trim().toLowerCase().replace(/\s+/g, "_");
              if (LOBES.includes(raw)) {
                child.userData.lobeFromAsset = raw;
              }
              meshes.push(child);
            }
          });

          if (meshes.length === 0) {
            reject(new Error("No mesh found in brain.glb"));
            return;
          }

          const bbox = new THREE.Box3().setFromObject(brainScene);
          const center = new THREE.Vector3();
          const size = new THREE.Vector3();
          bbox.getCenter(center);
          bbox.getSize(size);

          const maxDim = Math.max(size.x, size.y, size.z);
          const scaleFactor = 3.0 / maxDim;
          brainScene.position.sub(center).multiplyScalar(scaleFactor);
          brainScene.scale.multiplyScalar(scaleFactor);
          brainScene.updateMatrixWorld(true);

          const normBbox = new THREE.Box3().setFromObject(brainScene);
          const normCenter = new THREE.Vector3();
          const normSize = new THREE.Vector3();
          normBbox.getCenter(normCenter);
          normBbox.getSize(normSize);

          const namedCount = meshes.filter((m) => m.userData.lobeFromAsset).length;
          resolve({
            brainScene,
            meshes,
            bbox: normBbox,
            center: normCenter,
            size: normSize,
            scaleFactor,
            meshCount: meshes.length,
            namedMeshCount: namedCount,
          });
        } catch (e) {
          reject(e);
        }
      },
      undefined,
      (err) => reject(new Error("GLB load failed: " + (err?.message || err)))
    );
  });
}
