import * as THREE from './vendor/three.module.js';
import { createTerrainRenderer } from './terrain-renderer.js';

const EYE_HEIGHT = 1.7;
const ROUTE_WIDTH = 0.85;
const SURFACE_OFFSET = 0.22;

export async function startHudTerrain() {
  const app = await createTerrainRenderer();

  const canvas = app.renderer.domElement;
  canvas.id = 'mars-terrain-layer';
  canvas.style.position = 'fixed';
  canvas.style.inset = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.zIndex = '0';
  canvas.style.pointerEvents = 'none';
  document.body.prepend(canvas);

  const camera = app.camera;
  const renderer = app.renderer;
  const heightAt = app.heightAt;

  const missionGroup = new THREE.Group();
  app.scene.add(missionGroup);

  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  const back = new THREE.Vector3();
  const orientation = new THREE.Matrix4();

  let lastMission = null;
  let lastPointer = -1;
  let activeMaterial = null;
  let inactiveMaterial = null;
  const labels = [];

  function clearMission() {
    while (missionGroup.children.length) {
      const object = missionGroup.children[0];
      missionGroup.remove(object);
      object.traverse(child => {
        if (child.geometry) child.geometry.dispose();
      });
    }
    activeMaterial = null;
    inactiveMaterial = null;
    labels.length = 0;
  }

  function groundPoint(east, north, offset = SURFACE_OFFSET) {
    const y = heightAt(east, north);
    if (y === null) return null;
    return new THREE.Vector3(east, y + offset, -north);
  }

  function makeLabel(name, east, north, height, index = null, kind = null) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;

    const ctx = canvas.getContext('2d');
    const texture = new THREE.CanvasTexture(canvas);

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: true,
      depthWrite: false
    });

    const sprite = new THREE.Sprite(material);
    sprite.scale.set(7.5, 1.875, 1);

    const anchor = groundPoint(east, north, height);
    if (!anchor) {
      texture.dispose();
      material.dispose();
      return;
    }

    sprite.position.copy(anchor);
    missionGroup.add(sprite);

    labels.push({
      name, east, north, index, kind,
      canvas, ctx, texture, sprite,
      lastDistance: null,
      lastActive: null
    });
  }

  function drawLabel(label, distance, active) {
    const ctx = label.ctx;
    const color = label.index === null
      ? (label.kind === 'caution' ? '#ffb020' : '#ff5a36')
      : active ? '#3df2c8' : '#ffe9d0';

    ctx.clearRect(0, 0, 512, 128);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 8;

    ctx.font = 'bold 43px Arial, sans-serif';
    ctx.fillStyle = color;
    ctx.fillText(
      label.index === null ? (label.kind === 'caution' ? 'Caution: ' : '! ') + label.name : label.name,
      256, 43, 490
    );

    ctx.font = '30px Arial, sans-serif';
    ctx.fillStyle = '#b87a5a';
    ctx.fillText(Math.round(distance) + ' m', 256, 94);

    label.texture.needsUpdate = true;
    label.lastDistance = Math.round(distance);
    label.lastActive = active;
  }

  function makeRibbon(path) {
    if (!path || path.length < 2) return;

    const positions = [];
    const indices = [];

    for (let i = 0; i < path.length; i++) {
      const p = path[i];
      const before = path[Math.max(0, i - 1)];
      const after = path[Math.min(path.length - 1, i + 1)];

      const dx = after.x - before.x;
      const dz = -(after.y - before.y);
      const length = Math.hypot(dx, dz) || 1;

      const sideX = -dz / length * ROUTE_WIDTH / 2;
      const sideZ = dx / length * ROUTE_WIDTH / 2;

      const h = heightAt(p.x, p.y);
      if (h === null) continue;

      const y = h + SURFACE_OFFSET;

      positions.push(
        p.x + sideX, y, -p.y + sideZ,
        p.x - sideX, y, -p.y - sideZ
      );

      if (i > 0) {
        const a = (i - 1) * 2;
        const b = a + 1;
        const c = i * 2;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    if (positions.length < 12) return;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3)
    );
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const material = new THREE.MeshBasicMaterial({
      color: 0x3df2c8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
      depthWrite: false
    });

    missionGroup.add(new THREE.Mesh(geometry, material));
  }

  function makeHazard(hazard) {
    const segments = 48;
    const positions = [];
    const indices = [];

    const center = groundPoint(hazard.x, hazard.y);
    if (!center) return;

    positions.push(center.x, center.y, center.z);

    for (let i = 0; i < segments; i++) {
      const angle = i / segments * Math.PI * 2;
      const x = hazard.x + Math.cos(angle) * hazard.r;
      const north = hazard.y + Math.sin(angle) * hazard.r;
      const point = groundPoint(x, north);

      if (!point) return;
      positions.push(point.x, point.y, point.z);
    }

    for (let i = 0; i < segments; i++) {
      const a = i + 1;
      const b = (i + 1) % segments + 1;
      indices.push(0, a, b);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3)
    );
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const material = new THREE.MeshBasicMaterial({
      color: hazard.kind === 'caution' ? 0xffb020 : 0xff5a36,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.3,
      depthWrite: false
    });

    missionGroup.add(new THREE.Mesh(geometry, material));
    makeLabel(hazard.name, hazard.x, hazard.y, 3.8, null, hazard.kind || null);
  }

  function makeWaypoint(waypoint, index) {
    if (index === 0) return;

    const ground = groundPoint(waypoint.x, waypoint.y, 0);
    if (!ground) return;

    const group = new THREE.Group();
    group.position.copy(ground);

    const gateHeight = 5;
    const gateWidth = 2;

    const postGeometry = new THREE.BoxGeometry(0.18, gateHeight, 0.18);
    const beamGeometry = new THREE.BoxGeometry(
      gateWidth, 0.18, 0.18
    );

    const material = new THREE.MeshBasicMaterial({
      color: 0xffe9d0
    });

    const leftPost = new THREE.Mesh(postGeometry, material);
    leftPost.position.set(-gateWidth / 2, gateHeight / 2, 0);

    const rightPost = new THREE.Mesh(postGeometry, material);
    rightPost.position.set(gateWidth / 2, gateHeight / 2, 0);

    const topBeam = new THREE.Mesh(beamGeometry, material);
    topBeam.position.set(0, gateHeight, 0);

    group.add(leftPost, rightPost, topBeam);
    group.userData.waypointIndex = index;
    group.userData.material = material;

    missionGroup.add(group);
    makeLabel(waypoint.name, waypoint.x, waypoint.y, 7.2, index);
    if (index === 1) activeMaterial = material;
    else if (!inactiveMaterial) inactiveMaterial = material;
  }

  function updateMission(mission, activeIndex) {
    if (!mission) {
      if (lastMission !== null) clearMission();
      lastMission = null;
      lastPointer = -1;
      return;
    }

    if (mission !== lastMission) {
      clearMission();

      makeRibbon(window.hudMissionPath || []);

      (mission.hazards || []).forEach(makeHazard);
      (mission.waypoints || []).forEach(makeWaypoint);

      lastMission = mission;
      lastPointer = -1;
    }

    if (activeIndex !== lastPointer) {
      missionGroup.children.forEach(object => {
        if (object.userData.waypointIndex !== undefined) {
          object.userData.material.color.set(
            object.userData.waypointIndex === activeIndex
              ? 0x3df2c8
              : 0xffe9d0
          );
        }
      });
      lastPointer = activeIndex;
    }
  }

  function render(position, basis, eyeShift = 0, view = null) {
    const groundHeight = heightAt(position.x, position.y);
    if (groundHeight === null) return;

    right.set(
      basis.r[0], basis.r[2], -basis.r[1]
    ).normalize();

    up.set(
      basis.u[0], basis.u[2], -basis.u[1]
    ).normalize();

    back.set(
      -basis.f[0], -basis.f[2], basis.f[1]
    ).normalize();

    orientation.makeBasis(right, up, back);

    camera.position.set(
      position.x - basis.r[0] * eyeShift,
      groundHeight + EYE_HEIGHT * (app.meta.vertical_exaggeration || 1) - basis.r[2] * eyeShift,
      -position.y + basis.r[1] * eyeShift
    );

    camera.quaternion.setFromRotationMatrix(orientation);
    camera.updateMatrixWorld();

    // viewport: the whole screen, or one half of it for goggle mode
    const vx = view ? view.x : 0, vw = view ? view.w : window.innerWidth, vh = view ? view.h : window.innerHeight;
    renderer.setScissorTest(vw < window.innerWidth - 1);
    renderer.setViewport(vx, 0, vw, vh);
    renderer.setScissor(vx, 0, vw, vh);
    camera.aspect = vw / vh;
    camera.fov = view && view.foc ? 2 * Math.atan(vh / 2 / view.foc) * 180 / Math.PI : 55;
    camera.updateProjectionMatrix();

    labels.forEach(label => {
      const distance = Math.hypot(
        label.east - position.x,
        label.north - position.y
      );

      const active = label.index === lastPointer;

      if (
        Math.round(distance) !== label.lastDistance ||
        active !== label.lastActive
      ) {
        drawLabel(label, distance, active);
      }
    });

    renderer.render(app.scene, camera);
  }

  function resize(width, height) {
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }

  return {
    canvas,
    render,
    resize,
    updateMission,
    heightAt,
    meta: app.meta,
    dispose() {
      clearMission();
      canvas.remove();
      app.dispose();
    }
  };
}
