/** Web Audio で作る効果音（素材ファイルなし） */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;

  constructor(private volume: number) {
    const resume = () => this.ensure()?.resume();
    window.addEventListener('keydown', resume);
    window.addEventListener('pointerdown', resume);
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, slide = 1, delay = 0) {
    const ctx = this.ensure();
    if (!ctx || !this.master || ctx.state !== 'running') return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  move() {
    this.tone(660, 0.04, 'square', 0.04);
  }
  rotate() {
    this.tone(880, 0.06, 'triangle', 0.08, 1.3);
  }
  lock() {
    this.tone(220, 0.09, 'sine', 0.2, 0.6);
  }
  /** 連鎖数が上がるほど音が高くなる */
  chain(n: number) {
    const base = 392 * Math.pow(2, (Math.min(n, 12) - 1) * (2 / 12));
    this.tone(base, 0.18, 'triangle', 0.22, 1.02);
    this.tone(base * 1.5, 0.22, 'sine', 0.12, 1.02, 0.03);
    this.tone(base * 2, 0.25, 'sine', 0.06, 1, 0.06);
  }
  allClear() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.18, 1, i * 0.08));
  }
  lose() {
    this.tone(330, 0.7, 'sawtooth', 0.08, 0.3);
  }
}
