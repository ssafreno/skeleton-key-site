import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/**
 * WebGLRenderer + EffectComposer (RenderPass → UnrealBloomPass → OutputPass).
 *   renderer.three      — THREE.WebGLRenderer
 *   renderer.composer   — EffectComposer
 *   renderer.bloomPass  — UnrealBloomPass (null with ?nobloom)
 *   renderer.setBloom(strength, { threshold, radius })
 *   renderer.pulseBloom(peak, seconds)  — spike then return to base (needs ctx.tween; Game wires it)
 */
export class Renderer {
  constructor(canvas, { bloom = true, lowQuality = false } = {}) {
    this.canvas = canvas;
    this.bloomEnabled = bloom;
    this.maxPixelRatio = lowQuality ? 1 : 2;

    const r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.maxPixelRatio));
    this.three = r;

    this.scene = null;
    this.camera = null;
    this.baseBloom = { strength: 0.35, threshold: 0.85, radius: 0.45 };

    const size = this._size();
    const pr = r.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(size.w * pr, size.h * pr, {
      type: THREE.HalfFloatType,
      samples: pr >= 2 ? 2 : 4,
    });
    this.composer = new EffectComposer(r, rt);
    this.renderPass = new RenderPass(null, null);
    this.composer.addPass(this.renderPass);
    this.bloomPass = null;
    if (bloom) {
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(size.w, size.h), this.baseBloom.strength, this.baseBloom.radius, this.baseBloom.threshold);
      this.composer.addPass(this.bloomPass);
    }
    this.composer.addPass(new OutputPass());

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    this.resize();
  }

  _size() {
    return { w: Math.max(1, window.innerWidth), h: Math.max(1, window.innerHeight) };
  }

  setScene(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    this.resize();
  }

  /** Set bloom strength (and optionally threshold/radius). No-op with ?nobloom. */
  setBloom(strength = this.baseBloom.strength, { threshold, radius } = {}) {
    if (!this.bloomPass) return;
    this.bloomPass.strength = strength;
    if (threshold != null) this.bloomPass.threshold = threshold;
    if (radius != null) this.bloomPass.radius = radius;
  }

  resetBloom() {
    this.setBloom(this.baseBloom.strength, this.baseBloom);
  }

  setExposure(v) {
    this.three.toneMappingExposure = v;
  }

  resize() {
    const { w, h } = this._size();
    const pr = Math.min(window.devicePixelRatio || 1, this.maxPixelRatio);
    this.three.setPixelRatio(pr);
    this.three.setSize(w, h, false);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    if (this.camera) {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
  }

  render(dt) {
    if (!this.scene || !this.camera) return;
    this.composer.render(dt);
  }
}
