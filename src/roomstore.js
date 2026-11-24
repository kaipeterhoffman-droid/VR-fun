// Keeps your baked room between sessions. The model is stored in the frame of a persistent
// WebXR anchor (Quest remembers where that is in your real room), so next time the room
// is back in place without walking around again.
import * as THREE from 'three';

const DB = 'weird-physics-room', STORE = 'rooms', KEY = 'last';

function db() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function put(v) {
  const d = await db();
  await new Promise((res, rej) => {
    const t = d.transaction(STORE, 'readwrite');
    v === null ? t.objectStore(STORE).delete(KEY) : t.objectStore(STORE).put(v, KEY);
    t.oncomplete = res;
    t.onerror = () => rej(t.error);
  });
}
async function get() {
  const d = await db();
  return new Promise((res, rej) => {
    const r = d.transaction(STORE).objectStore(STORE).get(KEY);
    r.onsuccess = () => res(r.result || null);
    r.onerror = () => rej(r.error);
  });
}

export class RoomStore {
  constructor(renderer) {
    this.renderer = renderer;
    this.status = 'idle'; // idle | looking | found | none | saving | saved | failed
    this.anchor = null;
    this.record = null;
    this.lookUntil = 0;
    this._m = new THREE.Matrix4();
  }

  // call when the session starts: look for a saved room
  async begin(now) {
    this.status = 'looking';
    this.lookUntil = now + 12;
    try {
      this.record = await get();
      const session = this.renderer.xr.getSession();
      if (!this.record || !session?.restorePersistentAnchor) { this.status = 'none'; return; }
      this.anchor = await session.restorePersistentAnchor(this.record.uuid);
    } catch (e) {
      console.warn('saved room unavailable', e);
      this.status = 'none';
    }
  }

  // each frame while looking: returns { data, matrix } once the anchor is located in the room
  poll(now) {
    if (this.status !== 'looking') return null;
    if (now > this.lookUntil) { this.status = 'none'; return null; }
    if (!this.anchor) return null;
    const frame = this.renderer.xr.getFrame?.();
    const ref = this.renderer.xr.getReferenceSpace?.();
    const pose = frame && ref && frame.getPose(this.anchor.anchorSpace, ref);
    if (!pose) return null;
    this.status = 'found';
    return { data: this.record.data, matrix: this._m.fromArray(pose.transform.matrix) };
  }

  // anchors can only be created inside an XR frame: queue it for the next update
  requestSave(data) { this.pending = data; this.status = 'saving'; }
  tick() {
    if (!this.pending) return;
    const d = this.pending;
    this.pending = null;
    this.save(d);
  }

  async save(data) {
    this.status = 'saving';
    try {
      const xr = this.renderer.xr;
      const frame = xr.getFrame(), ref = xr.getReferenceSpace(), session = xr.getSession();
      if (!frame?.createAnchor) throw new Error('anchors unsupported');
      // the room was baked in reference-space coordinates, so pin it with an anchor at the origin
      const anchor = await frame.createAnchor(new XRRigidTransform(), ref);
      const uuid = await anchor.requestPersistentHandle();
      const old = this.record?.uuid;
      await put({ uuid, data, savedAt: Date.now() });
      if (old && old !== uuid) session.deletePersistentAnchor?.(old).catch(() => {});
      this.record = { uuid, data };
      this.status = 'saved';
    } catch (e) {
      console.warn('could not save room', e);
      this.status = 'failed';
    }
  }

  async forget() {
    const old = this.record?.uuid;
    this.record = null;
    this.anchor = null;
    this.status = 'none';
    try {
      await put(null);
      if (old) await this.renderer.xr.getSession()?.deletePersistentAnchor?.(old);
    } catch {}
  }
}
