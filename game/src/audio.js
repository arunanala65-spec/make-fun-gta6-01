// Procedural WebAudio: no audio files, every sound is synthesized. The context
// is created on the first user gesture (the Start press), so browsers allow it.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineNodes = null;
  let sirenNodes = null;
  let muted = false;
  let noiseBuffer = null;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      const len = ctx.sampleRate * 1;
      noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    } catch {
      return false;
    }
    return true;
  }

  function tone(freq, dur, type, gain, when = 0, slideTo = 0) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noise(dur, gain, filterFreq, when = 0) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(g).connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  return {
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = value ? 0 : 0.5;
      if (value) this.engine(0, 0);
      return muted;
    },
    isMuted() {
      return muted;
    },
    click() {
      tone(660, 0.07, 'square', 0.12);
    },
    pickup() {
      tone(880, 0.09, 'sine', 0.2);
      tone(1318, 0.14, 'sine', 0.2, 0.08);
    },
    crash(strength) {
      noise(0.25 + strength * 0.2, Math.min(0.5, 0.2 + strength * 0.3), 900);
      tone(90, 0.2, 'sawtooth', 0.25, 0, 45);
    },
    steal() {
      tone(220, 0.12, 'square', 0.15, 0, 440);
    },
    missionDone() {
      [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 'triangle', 0.22, i * 0.11));
    },
    missionFail() {
      [392, 330, 262].forEach((f, i) => tone(f, 0.25, 'triangle', 0.2, i * 0.14));
    },
    busted() {
      [440, 415, 392, 370].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.14, i * 0.16));
    },
    /** Continuous engine hum: speed 0..1, throttle 0..1. Call every frame. */
    engine(speed, throttle) {
      if (!ctx || muted) {
        if (engineNodes) { try { engineNodes.stop(); } catch {} engineNodes = null; }
        return;
      }
      if (!engineNodes) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        const osc2 = ctx.createOscillator();
        osc2.type = 'square';
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 600;
        const g = ctx.createGain();
        g.gain.value = 0;
        osc.connect(filter);
        osc2.connect(filter);
        filter.connect(g).connect(master);
        osc.start();
        osc2.start();
        engineNodes = {
          osc, osc2, g,
          stop() {
            try { osc.stop(); osc2.stop(); } catch {}
            try { g.disconnect(); } catch {}
          },
        };
      }
      const rpm = 55 + speed * 165 + throttle * 22;
      engineNodes.osc.frequency.setTargetAtTime(rpm, ctx.currentTime, 0.06);
      engineNodes.osc2.frequency.setTargetAtTime(rpm * 0.5 + 3, ctx.currentTime, 0.06);
      engineNodes.g.gain.setTargetAtTime(throttle > 0.02 || speed > 0.03 ? 0.05 + throttle * 0.05 + speed * 0.03 : 0, ctx.currentTime, 0.08);
    },
    /** Two-tone police siren while wanted > 0. Call every frame. */
    siren(on) {
      if (!ctx || muted || !on) {
        if (sirenNodes) { try { sirenNodes.stop(); } catch {} sirenNodes = null; }
        return;
      }
      if (!sirenNodes) {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        const g = ctx.createGain();
        g.gain.value = 0.045;
        const lfo = ctx.createOscillator();
        lfo.type = 'square';
        lfo.frequency.value = 0.55;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 140;
        lfo.connect(lfoGain).connect(osc.frequency);
        osc.frequency.value = 820;
        osc.connect(g).connect(master);
        osc.start();
        lfo.start();
        sirenNodes = {
          stop() {
            try { osc.stop(); lfo.stop(); } catch {}
            try { g.disconnect(); } catch {}
          },
        };
      }
    },
  };
}
