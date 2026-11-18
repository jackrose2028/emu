// Super Eagle: a 2x pixel-art upscaler, run per frame on the emulator canvas.
// Rules use the Eagle corner test: a 2x2 output corner takes the neighbour
// colour when the two neighbours beside it and the corner pixel agree.
(function () {
  function superEagle(src, sw, sh, out) {
    const ow = sw * 2;
    for (let y = 0; y < sh; y++) {
      const yu = y > 0 ? y - 1 : 0, yd = y < sh - 1 ? y + 1 : y;
      for (let x = 0; x < sw; x++) {
        const xl = x > 0 ? x - 1 : 0, xr = x < sw - 1 ? x + 1 : x;
        const A = src[yu * sw + xl], B = src[yu * sw + x], C = src[yu * sw + xr];
        const D = src[y * sw + xl], E = src[y * sw + x], F = src[y * sw + xr];
        const G = src[yd * sw + xl], H = src[yd * sw + x], I = src[yd * sw + xr];
        let tl = E, tr = E, bl = E, br = E;
        if (A === B && B === D) tl = A;
        if (B === C && C === F) tr = C;
        if (D === G && G === H) bl = G;
        if (F === H && H === I) br = I;
        const o = y * 2 * ow + x * 2;
        out[o] = tl; out[o + 1] = tr;
        out[o + ow] = bl; out[o + ow + 1] = br;
      }
    }
  }

  // Shows the filtered picture over the emulator canvas once it exists.
  function attach(host) {
    let want = false, emu = null, overlay = null, octx = null, raf = 0;
    const small = document.createElement("canvas");
    const sctx = small.getContext("2d", { willReadFrequently: true });
    let W = 0, H = 0, out = null;

    // Positions the overlay over the emulator canvas. Runs on resize only.
    function place() {
      if (!emu || !overlay) return;
      const r = emu.getBoundingClientRect(), hr = host.getBoundingClientRect();
      overlay.style.left = r.left - hr.left + "px";
      overlay.style.top = r.top - hr.top + "px";
      overlay.style.width = r.width + "px";
      overlay.style.height = r.height + "px";
    }

    function tick() {
      raf = requestAnimationFrame(tick);
      const w = emu.width, h = emu.height;
      if (!w || !h) return;
      if (w !== W || h !== H) {
        W = w; H = h;
        small.width = w; small.height = h;
        overlay.width = 2 * w; overlay.height = 2 * h;
        out = new ImageData(2 * w, 2 * h);
      }
      sctx.drawImage(emu, 0, 0, w, h);
      const px = sctx.getImageData(0, 0, w, h).data;
      superEagle(new Uint32Array(px.buffer, px.byteOffset, w * h), w, h,
                 new Uint32Array(out.data.buffer));
      octx.putImageData(out, 0, 0);
    }

    function apply() {
      if (!emu) return;
      if (want) {
        emu.style.opacity = "0";
        overlay.hidden = false;
        if (!raf) raf = requestAnimationFrame(tick);
      } else {
        emu.style.opacity = "";
        overlay.hidden = true;
        cancelAnimationFrame(raf);
        raf = 0;
      }
    }

    const poll = setInterval(() => {
      const c = host.querySelector("canvas");
      if (!c) return;
      clearInterval(poll);
      clearTimeout(giveUp);
      emu = c;
      overlay = document.createElement("canvas");
      overlay.id = "filter-canvas";
      overlay.hidden = true;
      host.appendChild(overlay);
      octx = overlay.getContext("2d");
      new ResizeObserver(place).observe(host);
      new ResizeObserver(place).observe(emu);
      place();
      apply();
    }, 250);
    // The emulator canvas never showed up: stop polling.
    const giveUp = setTimeout(() => clearInterval(poll), 20000);

    return {
      set(v) { want = !!v; apply(); },
    };
  }

  window.SuperEagle = { attach };
})();
