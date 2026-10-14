import * as THREE from 'three';

const DEG = Math.PI / 180;
const tmpV = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler(0, 0, 0, 'YXZ');

function yawPitchFromDir(dir) {
  const d = dir.clone().normalize();
  return { yaw: Math.atan2(-d.x, -d.z), pitch: Math.asin(THREE.MathUtils.clamp(d.y, -1, 1)) };
}
function toV3(a) {
  return a instanceof THREE.Vector3 ? a.clone() : new THREE.Vector3(a[0], a[1], a[2]);
}
function wrapPi(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * Fixed-vantage look-around camera with damping, focus tweens and shake.
 * Drag handling: Interaction forwards drags here via `dragBy(dxPx, dyPx)` when the drag didn't start on a draggable hotspot.
 */
export class CameraRig {
  constructor(ctx) {
    this.ctx = ctx;
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.03, 200);
    this.camera.rotation.order = 'YXZ';
    this.baseFov = 60;

    this.vantage = { position: new THREE.Vector3(0, 1.6, 3), yaw: 0, pitch: 0, yawLimit: 70 * DEG, pitchLimit: 25 * DEG, fov: 60 };
    this.yaw = 0; this.pitch = 0;            // offsets from vantage base (radians), current (damped)
    this.targetYaw = 0; this.targetPitch = 0; // offsets, target
    this.damping = 9;                         // higher = snappier
    this.dragSensitivity = 1.0;

    this.mode = 'vantage';                    // 'vantage' | 'tween' | 'focus'
    this.inFocus = false;
    this.scope = 'room';
    this._focusStack = [];
    this._focusPose = null;                   // { position: V3, quaternion: Q, fov }
    this._shake = 0;
    this._shakeT = 0;
    this._tweenJob = null;
    this.enabled = true;                      // false = ignore drag (cutscenes / title)
    this.autoPan = null;                      // { speed, amp } title-screen slow pan
  }

  /** Instant: place camera at a room vantage. Angles in degrees. yawLimit >= 180 means unlimited. */
  setVantage({ position = [0, 1.6, 3], lookAt = [0, 1.6, 0], yawLimit = 70, pitchLimit = 25, fov = 60 } = {}) {
    const pos = toV3(position);
    const { yaw, pitch } = yawPitchFromDir(toV3(lookAt).sub(pos));
    this.vantage = { position: pos, yaw, pitch, yawLimit: yawLimit * DEG, pitchLimit: pitchLimit * DEG, fov };
    this.yaw = this.targetYaw = 0;
    this.pitch = this.targetPitch = 0;
    this._cancelTween();
    this._focusStack = [];
    this._focusPose = null;
    this.mode = 'vantage';
    this.inFocus = false;
    this._setScope('room');
    this.ctx.hud?.showBack(false);
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
    this._applyVantage();
  }

  _clampTargets() {
    const v = this.vantage;
    if (v.yawLimit < Math.PI) this.targetYaw = THREE.MathUtils.clamp(this.targetYaw, -v.yawLimit, v.yawLimit);
    this.targetPitch = THREE.MathUtils.clamp(this.targetPitch, -v.pitchLimit, v.pitchLimit);
    // keep absolute pitch sane
    const absPitch = v.pitch + this.targetPitch;
    if (absPitch > 80 * DEG) this.targetPitch = 80 * DEG - v.pitch;
    if (absPitch < -80 * DEG) this.targetPitch = -80 * DEG - v.pitch;
  }

  /** Drag-look by a pixel delta (grab-the-world feel). */
  dragBy(dx, dy) {
    // also while tweening back to the room's vantage (just after Esc / Back): the drag lands on the vantage targets
    if (!this.enabled || !(this.mode === 'vantage' || (this.mode === 'tween' && !this.inFocus))) return;
    const h = window.innerHeight || 800;
    const k = (this.camera.fov * DEG / h) * this.dragSensitivity;
    this.targetYaw += dx * k;
    this.targetPitch += dy * k;
    this._clampTargets();
  }

  /** Gently turn the vantage toward a world point (clamped to the limits). */
  lookAtPoint(point) {
    const p = toV3(point);
    const { yaw, pitch } = yawPitchFromDir(p.sub(this.vantage.position));
    this.targetYaw = wrapPi(yaw - this.vantage.yaw);
    this.targetPitch = pitch - this.vantage.pitch;
    this._clampTargets();
  }

  /** Turn back to the room's default view (yaw and pitch offsets to zero), damped. */
  resetLook() { this.targetYaw = 0; this.targetPitch = 0; }
  /** True when the vantage is turned well away from its default view (more than `deg`). */
  lookingAway(deg = 25) { return Math.abs(wrapPi(this.targetYaw)) > deg * DEG || Math.abs(this.targetPitch) > deg * DEG; }

  /** Small screen shake. amount ~0.02 subtle, 0.06 strong. */
  shake(amount = 0.03, duration = 0.45) {
    this._shake = Math.max(this._shake, amount);
    this._shakeDur = duration;
    this._shakeT = duration;
  }

  _vantageQuat(out) {
    tmpE.set(this.vantage.pitch + this.pitch, this.vantage.yaw + this.yaw, 0, 'YXZ');
    return out.setFromEuler(tmpE);
  }

  _applyVantage() {
    this.camera.position.copy(this.vantage.position);
    this._vantageQuat(this.camera.quaternion);
  }

  _setScope(scope) {
    this.scope = scope;
    if (this.ctx.hotspots) this.ctx.hotspots.scope = scope;
  }

  _cancelTween() {
    if (this._tweenJob) { this._tweenJob.cancel(); this._tweenJob = null; }
  }

  _tweenPose(toPos, toQuat, toFov, duration) {
    this._cancelTween();
    const fromPos = this.camera.position.clone();
    const fromQuat = this.camera.quaternion.clone();
    const fromFov = this.camera.fov;
    this.mode = 'tween';
    const job = this.ctx.tween.run(duration, (k) => {
      this.camera.position.lerpVectors(fromPos, typeof toPos === 'function' ? toPos() : toPos, k);
      this.camera.quaternion.slerpQuaternions(fromQuat, typeof toQuat === 'function' ? toQuat() : toQuat, k);
      this.camera.fov = fromFov + (toFov - fromFov) * k;
      this.camera.updateProjectionMatrix();
    }, { ease: 'inOutCubic' });
    this._tweenJob = job;
    return job;
  }

  /**
   * Tween in to a close-up. Sets Interaction scope to `scope`, shows the HUD Back button.
   * Calling focus() while already focused pushes a nested focus (Back returns to the previous one).
   * @param {{position:number[]|THREE.Vector3, lookAt:number[]|THREE.Vector3, scope:string, duration?:number, fov?:number, onExit?:Function}} opts
   */
  async focus({ position, lookAt, scope = 'focus', duration = 0.7, fov, onExit } = {}) {
    const pos = toV3(position);
    const m = new THREE.Matrix4().lookAt(pos, toV3(lookAt), new THREE.Vector3(0, 1, 0));
    const quat = new THREE.Quaternion().setFromRotationMatrix(m);
    const pose = { position: pos, quaternion: quat, fov: fov ?? this.vantage.fov, scope, onExit };
    if (this.inFocus && this._focusPose) this._focusStack.push(this._focusPose);
    this._focusPose = pose;
    this.inFocus = true;
    this._setScope(scope);
    this.ctx.hud?.showBack(true);
    this.ctx.audio?.play('click', { gain: 0.4 });
    await this._tweenPose(pos, quat, pose.fov, duration);
    if (this._focusPose === pose) this.mode = 'focus';
  }

  /** Move the current close-up to a new pose without nesting (e.g. a container that has just opened). */
  async refocus({ position, lookAt, fov, duration = 0.8 } = {}) {
    if (!this.inFocus || !this._focusPose) return;
    const pos = toV3(position);
    const m = new THREE.Matrix4().lookAt(pos, toV3(lookAt), new THREE.Vector3(0, 1, 0));
    const pose = this._focusPose;
    pose.position = pos; pose.quaternion = new THREE.Quaternion().setFromRotationMatrix(m); pose.fov = fov ?? pose.fov;
    await this._tweenPose(pos, pose.quaternion, pose.fov, duration);
    if (this._focusPose === pose) this.mode = 'focus';
  }

  /** Tween back (to the previous focus if nested, else the room vantage). Scope → previous / 'room'. */
  async exitFocus({ duration = 0.6, all = false } = {}) {
    if (!this.inFocus) return;
    const leaving = this._focusPose;
    try { leaving?.onExit?.(); } catch (e) { console.error(e); }
    if (!all && this._focusStack.length) {
      const prev = this._focusStack.pop();
      this._focusPose = prev;
      this._setScope(prev.scope);
      await this._tweenPose(prev.position, prev.quaternion, prev.fov, duration);
      if (this._focusPose === prev) this.mode = 'focus';
      return;
    }
    if (all) for (const p of this._focusStack.reverse()) { try { p.onExit?.(); } catch (e) { console.error(e); } }
    this._focusStack = [];
    this._focusPose = null;
    this.inFocus = false;
    this._setScope('room');
    this.ctx.hud?.showBack(false);
    await this._tweenPose(this.vantage.position, () => this._vantageQuat(tmpQ), this.vantage.fov, duration);
    if (!this.inFocus) this.mode = 'vantage';
  }

  /** Instantly drop all focus (used by room transitions). */
  resetFocus() {
    if (this.inFocus) {
      for (const p of [...this._focusStack, this._focusPose]) { try { p?.onExit?.(); } catch (e) { console.error(e); } }
    }
    this._cancelTween();
    this._focusStack = [];
    this._focusPose = null;
    this.inFocus = false;
    this.mode = 'vantage';
    this._setScope('room');
    this.ctx.hud?.showBack(false);
    this.camera.fov = this.vantage.fov;
    this.camera.updateProjectionMatrix();
    this._applyVantage();
  }

  update(dt, t) {
    if (this.mode === 'vantage') {
      if (this.autoPan) {
        const lim = Math.min(this.vantage.yawLimit, 40 * DEG);
        this.targetYaw = Math.sin(t * this.autoPan.speed) * lim * this.autoPan.amp;
        this.targetPitch = Math.sin(t * this.autoPan.speed * 0.7) * 0.04;
      }
      const a = 1 - Math.exp(-dt * this.damping);
      this.yaw += (this.targetYaw - this.yaw) * a;
      this.pitch += (this.targetPitch - this.pitch) * a;
      this._applyVantage();
    } else if (this.mode === 'focus' && this._focusPose) {
      this.camera.position.copy(this._focusPose.position);
      this.camera.quaternion.copy(this._focusPose.quaternion);
    }
    if (this._shakeT > 0) {
      this._shakeT -= dt;
      const k = Math.max(0, this._shakeT / this._shakeDur);
      const s = this._shake * k * k;
      tmpV.set((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 0).multiplyScalar(s);
      tmpV.applyQuaternion(this.camera.quaternion);
      this.camera.position.add(tmpV);
      this.camera.rotateZ((Math.random() - 0.5) * s * 0.6);
      if (this._shakeT <= 0) this._shake = 0;
    }
  }
}
