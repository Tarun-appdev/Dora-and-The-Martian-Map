import * as THREE from './vendor/three.module.js';

export async function createTerrainRenderer() {
  const metaResponse = await fetch('./terrain/meta.json');
  if (!metaResponse.ok) throw new Error('Could not load terrain metadata');
  const meta = await metaResponse.json();

  const dataResponse = await fetch('./terrain/elevation.f32');
  if (!dataResponse.ok) throw new Error('Could not load elevation data');

  const buffer = await dataResponse.arrayBuffer();
  const { width, height, x0_east_m, y0_north_m,
          dx_m, dy_m, origin_elevation_m,
          vertical_exaggeration } = meta;

  if (buffer.byteLength !== width * height * 4) {
    throw new Error('Elevation file size does not match metadata');
  }

  const elevation = new Float32Array(buffer);
  const stride = 4;

  const cols = Math.ceil((width - 1) / stride) + 1;
  const rows = Math.ceil((height - 1) / stride) + 1;

  const positions = new Float32Array(rows * cols * 3);
  const colours = new Float32Array(rows * cols * 3);
  const indices = [];

  let min = Infinity;
  let max = -Infinity;

  function sample(r, c) {
    const value = elevation[r * width + c];
    return Number.isFinite(value) ? value : origin_elevation_m;
  }

  for (let r = 0; r < rows; r++) {
    const sourceR = Math.min(r * stride, height - 1);

    for (let c = 0; c < cols; c++) {
      const sourceC = Math.min(c * stride, width - 1);
      const value = sample(sourceR, sourceC);
      min = Math.min(min, value);
      max = Math.max(max, value);

      const i = r * cols + c;
      positions[i * 3] = x0_east_m + sourceC * dx_m;
      positions[i * 3 + 1] =
        (value - origin_elevation_m) * vertical_exaggeration;
      positions[i * 3 + 2] =
        -(y0_north_m + sourceR * dy_m);
    }
  }

  const low = new THREE.Color(0x493027);
  const middle = new THREE.Color(0x986b49);
  const high = new THREE.Color(0xd6b58b);

  for (let i = 0; i < rows * cols; i++) {
    const h = positions[i * 3 + 1] / vertical_exaggeration
              + origin_elevation_m;
    const t = Math.max(0, Math.min(1, (h - min) / (max - min || 1)));

    const colour = t < 0.55
      ? low.clone().lerp(middle, t / 0.55)
      : middle.clone().lerp(high, (t - 0.55) / 0.45);

    colours.set([colour.r, colour.g, colour.b], i * 3);
  }

  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c;
      const b = a + 1;
      const d = (r + 1) * cols + c;
      const e = d + 1;

      indices.push(a, d, b, b, d, e);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position', new THREE.BufferAttribute(positions, 3)
  );
  geometry.setAttribute(
    'color', new THREE.BufferAttribute(colours, 3)
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 0,
    side: THREE.DoubleSide
  });

  const terrain = new THREE.Mesh(geometry, material);

  const scene = new THREE.Scene();
  scene.background = null;
  scene.add(terrain);

  scene.add(new THREE.HemisphereLight(0xffd9b0, 0x38251c, 2));

  const sunlight = new THREE.DirectionalLight(0xffe0bd, 2.5);
  sunlight.position.set(-20000, 30000, 15000);
  scene.add(sunlight);

  const camera = new THREE.PerspectiveCamera(
    55, window.innerWidth / window.innerHeight, 0.1, 150000
  );

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  function heightAt(east, north) {
    const c = (east - x0_east_m) / dx_m;
    const r = (north - y0_north_m) / dy_m;

    if (r < 0 || c < 0 || r > height - 1 || c > width - 1) {
      return null;
    }

    const r0 = Math.floor(r);
    const c0 = Math.floor(c);
    const r1 = Math.min(r0 + 1, height - 1);
    const c1 = Math.min(c0 + 1, width - 1);
    const fr = r - r0;
    const fc = c - c0;

    const z00 = sample(r0, c0);
    const z01 = sample(r0, c1);
    const z10 = sample(r1, c0);
    const z11 = sample(r1, c1);

    const z = z00 * (1 - fr) * (1 - fc)
            + z01 * (1 - fr) * fc
            + z10 * fr * (1 - fc)
            + z11 * fr * fc;

    return (z - origin_elevation_m) * vertical_exaggeration;
  }

  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  window.addEventListener('resize', resize);

  return {
    scene,
    camera,
    renderer,
    terrain,
    heightAt,
    meta,
    dispose() {
      window.removeEventListener('resize', resize);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    }
  };
}
