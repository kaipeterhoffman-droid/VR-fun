// Real-room collision: Quest scene understanding gives us planes (walls, floor, ceiling, tables)
// and meshes (the full room scan plus boxes for furniture). Everything becomes a sphere-vs-surface
// contact with a world-space normal; what happens next is up to each law.
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { XRPlane, XRMesh } from '@iwsdk/core';

export const roomStats = { planes: 0, meshes: 0, tris: 0, custom: 0, source: 'none' };
let customProvider = null; // () => array of { kind: 'plane'|'box', obj, poly | min/max }
export function setCustomRoom(fn) { customProvider = fn; }
const surfaces = [];

const _local = new THREE.Vector3();
const _n = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _hit = { point: new THREE.Vector3(), distance: 0, faceIndex: 0 };
const _tri = new THREE.Triangle();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();

function pointInPoly(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, zi = poly[i].z, xj = poly[j].x, zj = poly[j].z;
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}

function prep(obj, kind) {
  obj.updateWorldMatrix(true, false);
  let s = obj.userData.__surf;
  if (!s) s = obj.userData.__surf = { kind, inv: new THREE.Matrix4(), quat: new THREE.Quaternion(), box: new THREE.Box3() };
  s.inv.copy(obj.matrixWorld).invert();
  obj.getWorldQuaternion(s.quat);
  return s;
}

export function rebuildSurfaces(planeEntities, meshEntities) {
  surfaces.length = 0;
  roomStats.planes = 0;
  roomStats.meshes = 0;
  roomStats.tris = 0;
  roomStats.custom = 0;
  // a traced room beats the headset's scan: exact, flat, and yours
  const custom = customProvider?.();
  if (custom && custom.length) {
    for (const c of custom) {
      const s = prep(c.obj, c.kind);
      if (c.kind === 'plane') {
        if (s.polySrc !== c.poly) {
          s.polySrc = c.poly;
          s.poly = c.poly;
          s.minX = Math.min(...c.poly.map((p) => p.x)); s.maxX = Math.max(...c.poly.map((p) => p.x));
          s.minZ = Math.min(...c.poly.map((p) => p.z)); s.maxZ = Math.max(...c.poly.map((p) => p.z));
        }
      } else {
        s.min = c.min;
        s.max = c.max;
      }
      s.label = c.label;
      surfaces.push(s);
      roomStats.custom++;
    }
    roomStats.source = 'traced';
    return;
  }
  for (const ent of planeEntities) {
    const obj = ent.object3D;
    const plane = ent.getValue(XRPlane, '_plane');
    if (!obj || !plane?.polygon?.length) continue;
    const s = prep(obj, 'plane');
    if (s.polySrc !== plane.polygon) {
      s.polySrc = plane.polygon;
      s.poly = plane.polygon.map((p) => ({ x: p.x, z: p.z }));
      s.minX = Math.min(...s.poly.map((p) => p.x)); s.maxX = Math.max(...s.poly.map((p) => p.x));
      s.minZ = Math.min(...s.poly.map((p) => p.z)); s.maxZ = Math.max(...s.poly.map((p) => p.z));
    }
    s.label = plane.semanticLabel || plane.orientation || 'plane';
    surfaces.push(s);
    roomStats.planes++;
  }
  for (const ent of meshEntities) {
    const obj = ent.object3D;
    const geo = obj?.geometry;
    if (!geo?.attributes?.position) continue;
    const s = prep(obj, 'mesh');
    if (s.geo !== geo) {
      s.geo = geo;
      try {
        s.bvh = new MeshBVH(geo, { maxLeafTris: 8 });
      } catch (e) {
        s.bvh = null;
      }
      geo.computeBoundingBox();
    }
    if (!s.bvh) continue;
    s.box.copy(geo.boundingBox).applyMatrix4(obj.matrixWorld);
    s.label = ent.getValue(XRMesh, 'semanticLabel') || 'mesh';
    surfaces.push(s);
    roomStats.meshes++;
    roomStats.tris += (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
  }
  roomStats.source = surfaces.length ? 'scan' : 'none';
}

// Calls contact(normal, penetration, label) for every surface the sphere touches.
const SHELL = new Set(['wall', 'floor', 'ceiling', 'door', 'window', 'wall art', 'horizontal', 'vertical']);
// shellOnly: just the room's walls/floor/ceiling planes (used alongside the live depth map)
export function collideRoom(pos, r, contact, shellOnly = false) {
  for (const s of surfaces) {
    if (shellOnly && (s.kind !== 'plane' || (s.label && s.label !== 'plane' && !SHELL.has(s.label)))) continue;
    if (s.kind === 'plane') {
      _local.copy(pos).applyMatrix4(s.inv);
      if (Math.abs(_local.y) >= r) continue;
      if (_local.x < s.minX || _local.x > s.maxX || _local.z < s.minZ || _local.z > s.maxZ) continue;
      if (!pointInPoly(s.poly, _local.x, _local.z)) continue;
      const side = _local.y >= 0 ? 1 : -1;
      _n.set(0, side, 0).applyQuaternion(s.quat);
      contact(_n, r - Math.abs(_local.y), s.label);
    } else if (s.kind === 'box') {
      _local.copy(pos).applyMatrix4(s.inv);
      const { min, max } = s;
      const qx = Math.min(Math.max(_local.x, min.x), max.x);
      const qy = Math.min(Math.max(_local.y, min.y), max.y);
      const qz = Math.min(Math.max(_local.z, min.z), max.z);
      let dx = _local.x - qx, dy = _local.y - qy, dz = _local.z - qz;
      const d = Math.hypot(dx, dy, dz);
      let pen;
      if (d > 1e-6) {
        if (d >= r) continue;
        pen = r - d; dx /= d; dy /= d; dz /= d;
      } else {
        // centre inside: leave through the nearest face
        const faces = [
          [_local.x - min.x, -1, 0, 0], [max.x - _local.x, 1, 0, 0],
          [_local.y - min.y, 0, -1, 0], [max.y - _local.y, 0, 1, 0],
          [_local.z - min.z, 0, 0, -1], [max.z - _local.z, 0, 0, 1],
        ];
        let best = faces[0];
        for (const f of faces) if (f[0] < best[0]) best = f;
        pen = best[0] + r; dx = best[1]; dy = best[2]; dz = best[3];
      }
      _n.set(dx, dy, dz).applyQuaternion(s.quat);
      contact(_n, pen, s.label);
    } else {
      // cheap reject with the world-space bounds
      if (pos.x < s.box.min.x - r || pos.x > s.box.max.x + r ||
          pos.y < s.box.min.y - r || pos.y > s.box.max.y + r ||
          pos.z < s.box.min.z - r || pos.z > s.box.max.z + r) continue;
      _local.copy(pos).applyMatrix4(s.inv);
      const hit = s.bvh.closestPointToPoint(_local, _hit, 0, r);
      if (!hit || hit.distance >= r) continue;
      if (hit.distance > 1e-5) {
        _n.subVectors(_local, hit.point).divideScalar(hit.distance);
      } else {
        // dead on the surface: use the triangle's normal
        const idx = s.geo.index;
        const posA = s.geo.attributes.position;
        const f = hit.faceIndex * 3;
        const i0 = idx ? idx.getX(f) : f, i1 = idx ? idx.getX(f + 1) : f + 1, i2 = idx ? idx.getX(f + 2) : f + 2;
        _tri.set(_a.fromBufferAttribute(posA, i0), _b.fromBufferAttribute(posA, i1), _c.fromBufferAttribute(posA, i2));
        _tri.getNormal(_n);
      }
      _n.applyQuaternion(s.quat);
      contact(_n, r - hit.distance, s.label);
    }
  }
}

export { pointInPoly };
export function hasRoom() {
  return surfaces.length > 0;
}
