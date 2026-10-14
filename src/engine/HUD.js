// HUD: top-right menu (mute / fullscreen / restart), top-left timer, Back button for focus views, toasts, dev fps.
import { store } from './storage.js';

const ICON = {
  sound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" fill-opacity=".2"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8.5 8.5 0 0 1 0 12"/></svg>',
  muted: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" fill-opacity=".2"/><path d="M17 9l5 6M22 9l-5 6"/></svg>',
  full: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  unfull: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>',
  restart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>',
  bell: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z" fill="currentColor" fill-opacity=".18"/><path d="M10 20a2 2 0 0 0 4 0"/><path d="M12 3v2"/></svg>',
  back: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
};

function fmtTime(s) {
  s = Math.max(0, Math.floor(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0'), ss = String(sec).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export class HUD {
  constructor(ctx) {
    this.ctx = ctx;
    const ui = ctx.ui;

    this.menu = document.createElement('div');
    this.menu.className = 'oc-menu';
    this.muteBtn = this._btn(ICON.sound, 'Mute', () => this.toggleMute());
    this.fullBtn = this._btn(ICON.full, 'Fullscreen', () => this.toggleFullscreen());
    this.restartBtn = this._btn(ICON.restart, 'Restart', () => this.confirmRestart());
    this.menu.append(this.muteBtn, this.fullBtn, this.restartBtn);
    ui.appendChild(this.menu);

    this.timer = document.createElement('div');
    this.timer.className = 'oc-timer';
    this.timer.textContent = '0:00';
    ui.appendChild(this.timer);

    this.back = document.createElement('button');
    this.back.className = 'oc-back oc-hidden';
    this.back.type = 'button';
    this.back.innerHTML = `${ICON.back}<span>Back</span><kbd>Esc</kbd>`;
    // a line that is up when Back is clicked (one that started under the pointer, below) closes with it, as Esc does
    this.back.addEventListener('click', () => {
      const d = this.ctx.dialogue;
      if (d?.choosing) return;
      if (!d?.isOpen) { this.ctx.game.back(); return; }
      d.dismiss();
      // the room's onBack waits for the line to finish settling (dialogue.busy); a further line in the queue keeps it
      setTimeout(() => { if (!d.isOpen) this.ctx.game.back(); }, 30);
    });
    ui.appendChild(this.back);

    this.toastEl = document.createElement('div');
    this.toastEl.className = 'oc-toast oc-hidden';
    ui.appendChild(this.toastEl);

    // the key panel: the yellow key with its remaining teeth, and the favour count; click opens the ledger
    this.keyPanel = document.createElement('button');
    this.keyPanel.className = 'oc-key';
    this.keyPanel.type = 'button';
    this.keyPanel.title = 'Open the ledger';
    this.keyPanel.innerHTML = '<canvas width="128" height="128"></canvas><div class="oc-key-text"><span class="oc-key-teeth"></span><span class="oc-key-fav"></span><span class="oc-key-door"></span></div>';
    this.keyPanel.addEventListener('click', (e) => { e.stopPropagation(); this.ctx.audio?.play('page', { gain: 0.5 }); this.ctx.papers.show('ledger'); });
    ui.appendChild(this.keyPanel);
    this._keyTeeth = -1; this._keyFav = -1;

    // the bell: ring for Mrs. Tallow, shown only inside a lock's focus view
    this.ring = document.createElement('button');
    this.ring.className = 'oc-ring oc-hidden';
    this.ring.type = 'button';
    this.ring.innerHTML = `${ICON.bell}<span>Ring for Mrs. Tallow</span>`;
    this.ring.addEventListener('click', (e) => { e.stopPropagation(); this.ctx.house.ring(); });
    ui.appendChild(this.ring);

    this.fpsEl = null;
    this._fps = { frames: 0, t: 0 };
    this._lastTimerText = '';

    document.addEventListener('fullscreenchange', () => {
      this.fullBtn.innerHTML = document.fullscreenElement ? ICON.unfull : ICON.full;
    });
    this.setVisible(false);
  }

  _btn(svg, title, fn) {
    const b = document.createElement('button');
    b.className = 'oc-iconbtn';
    b.type = 'button';
    b.title = title;
    b.setAttribute('aria-label', title);
    b.innerHTML = svg;
    b.addEventListener('click', (e) => { e.stopPropagation(); this.ctx.audio?.play('click', { gain: 0.5 }); fn(); });
    return b;
  }

  setVisible(b) {
    this.visible = b;
    this.menu.classList.toggle('oc-hud-hidden', !b);
    this.timer.classList.toggle('oc-hud-hidden', !b);
    this.keyPanel.classList.toggle('oc-hud-hidden', !b);
    if (!b) this.showRing(false);
    if (!b) this.showBack(false);
  }

  /**
   * The Back button. `showBack(true)` (a close-up, or a room that wants it) shows "Back". With no close-up open, a room
   * that defines `backLabel` (a string, or a function returning one or null) and `onBack()` keeps it on screen with that
   * label, so a wing room always shows its way out ("The hall"). Re-checked every frame (`update`).
   */
  showBack(b) { this._backWanted = !!b; this._renderBack(); }
  _roomBackLabel() {
    const game = this.ctx.game, room = game?.currentRoom;
    if (!this.visible || !room || game._titleMode || game._transitioning || this.ctx.camera?.inFocus) return null;
    if (typeof room.onBack !== 'function' || room.backLabel == null) return null;
    const d = this.ctx.dialogue;
    if (d?.isOpen || this.ctx.papers?.isOpen) {
      // like the Ring: not while a line or choice is up. Except a line that starts while the pointer is already on the
      // button: hiding it then turns the player's click into "next line" (playtest: Finch's late line ate a Back);
      // the button stays for that line, and its click closes the line and goes back
      const hovered = this._backShown && this.back.matches(':hover');
      if (!d?.isOpen || d.choosing || this.ctx.papers?.isOpen || !(this._backHeld || hovered)) { this._backHeld = false; return null; }
      this._backHeld = true;
    } else this._backHeld = false;
    let label = room.backLabel;
    if (typeof label === 'function') { try { label = label.call(room); } catch (e) { console.error(e); label = null; } }
    return label ? String(label) : null;
  }
  _renderBack() {
    const roomLabel = this._backWanted ? null : this._roomBackLabel();
    const show = this._backWanted || !!roomLabel;
    const text = roomLabel || 'Back';
    if (show !== this._backShown) { this.back.classList.toggle('oc-hidden', !show); this._backShown = show; }
    if (text !== this._backText) { this.back.querySelector('span').textContent = text; this._backText = text; }
  }
  showRing(b) { this.ring.classList.toggle('oc-hidden', !b); }

  /**
   * Redraw the key panel: remaining teeth, favours owed, and the door's rule (four teeth), all night.
   * `owed` is src/logic/house.js `owed(state)`: `pocket` > 0 while Miss Pell's torn page is in your pocket.
   */
  setKey(teeth, favours, owed = null) {
    const pocket = owed?.pocket || 0;
    const clock = owed?.clock || '';
    const need = owed?.doorTeeth ?? 4;
    const bump = this._keyTeeth >= 0 && (teeth !== this._keyTeeth || favours !== this._keyFav || pocket !== this._keyPocket);
    if (teeth === this._keyTeeth && favours === this._keyFav && pocket === this._keyPocket && clock === this._keyClock) return;
    this._keyTeeth = teeth; this._keyFav = favours; this._keyPocket = pocket; this._keyClock = clock;
    const cv = this.keyPanel.querySelector('canvas');
    const c = cv.getContext('2d');
    c.clearRect(0, 0, 128, 128);
    this.ctx.items?.bonekey?.drawIcon?.(c, 128);
    // a small mark under the fourth tooth: the door wants four (same frame as items.js bonekey.drawIcon)
    c.save(); c.scale(128 / 100, 128 / 100); c.translate(50, 50); c.rotate(-0.55);
    c.fillStyle = teeth < need ? '#e05a3a' : '#f3c64a'; c.strokeStyle = '#1b120c'; c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(12, 15); c.lineTo(8.5, 21); c.lineTo(15.5, 21); c.closePath(); c.fill(); c.stroke();
    c.restore();
    // plain words: "11:43 · 9 teeth · nothing owed", then the door's rule
    const fav = favours === 0 ? (pocket ? 'nothing owed yet' : 'nothing owed') : `${favours} ${favours === 1 ? 'favour' : 'favours'} owed`;
    this.keyPanel.querySelector('.oc-key-teeth').textContent = `${clock ? `${clock} · ` : ''}${teeth} ${teeth === 1 ? 'tooth' : 'teeth'} · ${fav}`;
    const favEl = this.keyPanel.querySelector('.oc-key-fav');
    favEl.textContent = pocket ? `${pocket} of Miss Pell's lines in your pocket` : '';
    favEl.hidden = !pocket;
    const door = this.keyPanel.querySelector('.oc-key-door');
    door.textContent = teeth < need ? `the door needs ${need} teeth left; you have ${teeth}` : `the door needs ${need} teeth left`;
    door.classList.toggle('oc-key-short', teeth < need);
    this.keyPanel.title = 'Open the ledger';
    if (bump) this.keyPanel.animate([{ transform: 'scale(1.08)' }, { transform: 'scale(1)' }], { duration: 320, easing: 'ease-out' });
  }

  toggleMute() {
    const a = this.ctx.audio;
    a.setMuted(!a.muted);
    store.set('skeleton-key.muted', a.muted ? '1' : '0');
    this.syncMute();
  }
  syncMute() { this.muteBtn.innerHTML = this.ctx.audio?.muted ? ICON.muted : ICON.sound; }

  toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => this.toast('Fullscreen unavailable'));
  }

  /** Parchment confirm dialog. Resolves true/false. */
  confirm({ title = 'Are you sure?', text = '', ok = 'Yes', cancel = 'Cancel' } = {}) {
    return new Promise((resolve) => {
      const back = document.createElement('div');
      back.className = 'oc-modal-backdrop';
      back.innerHTML = `<div class="oc-confirm"><h3></h3><p></p><div class="oc-row">
        <button class="oc-btn oc-ghost" data-v="0" type="button"></button><button class="oc-btn" data-v="1" type="button"></button></div></div>`;
      back.querySelector('h3').textContent = title;
      back.querySelector('p').textContent = text;
      back.querySelector('[data-v="0"]').textContent = cancel;
      back.querySelector('[data-v="1"]').textContent = ok;
      const done = (v) => { back.classList.add('oc-closing'); setTimeout(() => back.remove(), 200); this._confirmClose = null; resolve(v); };
      this._confirmClose = () => done(false);
      back.addEventListener('click', (e) => {
        const b = e.target.closest('[data-v]');
        if (b) done(b.dataset.v === '1');
        else if (e.target === back) done(false);
      });
      this.ctx.ui.appendChild(back);
    });
  }

  async confirmRestart() {
    const ok = await this.confirm({ title: 'Start over?', text: 'The night starts over. The house will pretend it never happened.', ok: 'Restart', cancel: 'Keep playing' });
    if (ok) this.ctx.game.restart();
  }

  /** @param {{ variant?: string }} [opts]  variant 'nudge' = quieter serif styling (onboarding hint) */
  toast(text, ms = 2200, { variant } = {}) {
    this.toastEl.textContent = text;
    this.toastEl.classList.toggle('oc-nudge', variant === 'nudge');
    this.toastEl.classList.remove('oc-hidden');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => this.toastEl.classList.add('oc-hidden'), ms);
  }

  enableFps() {
    if (this.fpsEl) return;
    this.fpsEl = document.createElement('div');
    this.fpsEl.className = 'oc-fps';
    this.fpsEl.textContent = '-- fps';
    this.ctx.ui.appendChild(this.fpsEl);
  }

  update(dt) {
    this._renderBack();
    const txt = fmtTime(this.ctx.state.elapsed);
    if (txt !== this._lastTimerText) { this.timer.textContent = txt; this._lastTimerText = txt; }
    if (this.fpsEl) {
      const f = this._fps;
      f.frames++; f.t += dt;
      if (f.t >= 0.5) {
        const info = this.ctx.game.lastFrameInfo || { calls: 0, triangles: 0 };
        this.fpsEl.textContent = `${Math.round(f.frames / f.t)} fps · ${info.calls} calls · ${(info.triangles / 1000).toFixed(0)}k tris`;
        f.frames = 0; f.t = 0;
      }
    }
  }
}

export { fmtTime };
