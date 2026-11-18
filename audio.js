// Audio: the SNES runs at 32 kHz. The emulator's audio context is opened at
// 48 kHz, so the browser's resampler does the upscale, and every sound then
// passes a light EQ and a limiter for clearer highs and no clipping.
(function () {
  const Native = window.AudioContext;
  if (!Native || Native.__snesAudio) return;
  const origConnect = AudioNode.prototype.connect;
  const chains = new WeakMap();

  function build(ctx) {
    const filter = (type, freq, gain, q) => {
      const f = ctx.createBiquadFilter();
      f.type = type; f.frequency.value = freq; f.gain.value = gain;
      if (q) f.Q.value = q;
      return f;
    };
    const low = filter("lowshelf", 120, 1.5);
    const presence = filter("peaking", 3000, 2, 1.1);
    const air = filter("highshelf", 9000, 3);
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -12; limiter.knee.value = 8; limiter.ratio.value = 4;
    limiter.attack.value = 0.003; limiter.release.value = 0.15;
    const out = ctx.createGain();
    out.gain.value = 0.9;
    // Internal links use the original connect, so they don't loop back in.
    origConnect.call(low, presence);
    origConnect.call(presence, air);
    origConnect.call(air, limiter);
    origConnect.call(limiter, out);
    origConnect.call(out, ctx.destination);
    return low;
  }

  // Anything that plays to the speakers goes through the chain instead.
  AudioNode.prototype.connect = function (dest, ...rest) {
    if (dest instanceof AudioDestinationNode) {
      let input = chains.get(dest.context);
      if (!input) { input = build(dest.context); chains.set(dest.context, input); }
      origConnect.call(this, input, ...rest);
      return dest;
    }
    return origConnect.call(this, dest, ...rest);
  };

  // Open at 48 kHz; fall back to the device rate if the browser refuses.
  function Patched(options) {
    try { return new Native(Object.assign({ sampleRate: 48000 }, options)); }
    catch (e) { return new Native(options); }
  }
  Patched.prototype = Native.prototype;
  Patched.__snesAudio = true;
  window.AudioContext = Patched;
})();
