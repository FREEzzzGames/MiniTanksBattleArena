/* MTBA 3D asset runtime.
 * Uses Three.js + GLTFLoader for production GLB/glTF assets. Kept isolated from
 * the existing combat simulation so the battle logic remains deterministic.
 * Assets are loaded only from same-origin paths; failures are reported visibly.
 */
(() => {
  'use strict';
  const MODEL_CATALOG = {
    f22: { url: './assets/models/f22.glb', scale: 1 },
    hoverTruck: { url: './assets/models/hover-truck.glb', scale: 1 },
    urbanTower: { url: './assets/models/urban-tower.glb', scale: 1 },
    undergroundPassage: { url: './assets/models/underground-passage.glb', scale: 1 },
    yeti: { url: './assets/models/yeti.glb', scale: 1 },
    felguard: { url: './assets/models/felguard.glb', scale: 1 },
    goblin: { url: './assets/models/goblin-sapper.glb', scale: 1 },
    monster: { url: './assets/models/monster.glb', scale: 1 },
    darkKnight: { url: './assets/models/dark-knight.glb', scale: 1 },
    spaceFighter: { url: './assets/models/space-fighter.glb', scale: 1 },
    spaceStation: { url: './assets/models/space-station.glb', scale: 1 },
    barrack: { url: './assets/models/barrack.glb', scale: 1 },
    landingDock: { url: './assets/models/landing-dock.glb', scale: 1 },
    gravingDock: { url: './assets/models/graving-dock.glb', scale: 1 }
  };
  const state = { ready: false, failed: [], loaded: new Map(), renderer: null, scene: null, camera: null, root: null, frame: 0 };
  const api = {
    catalog: MODEL_CATALOG,
    status() { return { ready: state.ready, loaded: [...state.loaded.keys()], failed: state.failed.slice() }; },
    get(key) { return state.loaded.get(key) || null; },
    async init(canvas) {
      if (state.renderer) return state;
      if (!window.THREE || !window.THREE.GLTFLoader) throw new Error('Three.js/GLTFLoader is not available');
      const THREE = window.THREE;
      const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      state.renderer = renderer;
      state.scene = new THREE.Scene();
      state.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 5000);
      state.camera.position.set(0, 7, 14);
      state.camera.lookAt(0, 0, 0);
      state.root = new THREE.Group();
      state.scene.add(state.root);
      state.scene.add(new THREE.HemisphereLight(0xdbeaff, 0x30372d, 2.0));
      const key = new THREE.DirectionalLight(0xffe4c0, 2.5);
      key.position.set(-5, 9, 7);
      state.scene.add(key);
      const loader = new THREE.GLTFLoader();
      const entries = Object.entries(MODEL_CATALOG);
      await Promise.all(entries.map(([name, spec]) => new Promise(resolve => {
        loader.load(spec.url, gltf => {
          const model = gltf.scene;
          model.scale.setScalar(spec.scale);
          model.traverse(node => {
            if (!node.isMesh) return;
            node.castShadow = true;
            node.receiveShadow = true;
            if (node.material) {
              node.material.side = THREE.DoubleSide;
              if ('roughness' in node.material) node.material.roughness = Math.max(0.45, node.material.roughness || 0.7);
            }
          });
          model.visible = false;
          model.userData.animations = gltf.animations || [];
          state.loaded.set(name, model);
          state.root.add(model);
          resolve();
        }, undefined, error => {
          state.failed.push({ name, url: spec.url, message: String(error && error.message || error) });
          resolve();
        });
      })));
      state.ready = true;
      return state;
    },
    place(key, x, y, z, rotationY = 0, scale = 1) {
      const model = state.loaded.get(key);
      if (!model) return false;
      model.position.set(x, y, z);
      model.rotation.y = rotationY;
      model.scale.setScalar((MODEL_CATALOG[key] || {}).scale * scale || scale);
      model.visible = true;
      return true;
    },
    hideAll() { for (const model of state.loaded.values()) model.visible = false; },
    resize(width, height) {
      if (!state.renderer || width < 1 || height < 1) return;
      state.renderer.setSize(width, height, false);
      state.camera.aspect = width / height;
      state.camera.updateProjectionMatrix();
    },
    render() { if (state.renderer) state.renderer.render(state.scene, state.camera); }
  };
  window.MTBAModelRuntime = api;
})();