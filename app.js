// Library + player. Selecting a game reloads the page with #<id> so the
// emulator boots cleanly on that ROM.
(function () {
  const games = window.GAMES || [];
  const library = document.getElementById("library");
  const player = document.getElementById("player");
  const byId = Object.fromEntries(games.map((g) => [g.id, g]));
  const current = byId[decodeURIComponent(location.hash.slice(1))];

  // Box covers from the libretro thumbnail set (No-Intro names). A miss keeps
  // the colour tile, so the title still shows.
  const BOX = "https://thumbnails.libretro.com/Nintendo%20-%20Super%20Nintendo%20Entertainment%20System/Named_Boxarts/";
  function boxNames(title, id) {
    const t = title.replace(/[&*\/:<>?\\|"]/g, "_");
    const names = [];
    const alt = window.COVER_ALT && window.COVER_ALT[id];
    if (alt) names.push(alt);
    names.push(t + " (USA)");
    const m = /^The (.+)$/.exec(t);
    if (m) names.push(m[1] + ", The (USA)");
    names.push(t);
    return names;
  }
  // Which cover name matched each game is remembered, so a return visit goes
  // straight to the right image, and games with no cover send no request.
  const BOX_KEY = "snes-box-v2";
  let boxCache = {};
  try { boxCache = JSON.parse(localStorage.getItem(BOX_KEY)) || {}; } catch (e) {}
  let boxSaveTimer = 0;
  function rememberBox(id, idx) {
    boxCache[id] = idx;
    clearTimeout(boxSaveTimer);
    boxSaveTimer = setTimeout(() => {
      try { localStorage.setItem(BOX_KEY, JSON.stringify(boxCache)); } catch (e) {}
    }, 500);
  }
  function addCover(btn, g) {
    const names = boxNames(g.title, g.id);
    const known = boxCache[g.id];
    if (known === -1) return;
    let i = typeof known === "number" && known < names.length ? known : 0;
    const url = (k) => BOX + encodeURIComponent(names[k]) + ".png";
    const img = new Image();
    img.className = "cover";
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    img.onload = () => { if (boxCache[g.id] !== i) rememberBox(g.id, i); };
    img.onerror = () => {
      if (++i < names.length) img.src = url(i);
      else { rememberBox(g.id, -1); img.remove(); }
    };
    img.src = url(i);
    btn.prepend(img);
  }

  const gameUrlOf = (g) => (g.file ? encodeURI(g.file) : "roms/" + encodeURIComponent(g.id) + ".sfc");

  function open(id) {
    history.replaceState(null, "", "#" + encodeURIComponent(id));
    location.reload();
  }

  // Writes the battery save (SRAM) to storage, so leaving never loses progress.
  async function saveProgress() {
    const emu = window.EJS_emulator;
    if (!emu || !emu.started || !emu.gameManager) return;
    try { await emu.gameManager.saveSaveFiles(); } catch (e) { console.warn("Save failed", e); }
  }

  let leaving = false;
  async function closeGame() {
    if (leaving) return;
    leaving = true;
    await saveProgress();
    await new Promise((r) => setTimeout(r, 300)); // let the save flush
    location.replace(location.pathname + location.search);
  }

  if (!current) {
    library.hidden = false;
    const META = window.META || {};
    const UNKNOWN = "Unknown";
    const info = (g) => META[g.id] || ["", "", "", "", 0, 0, 0];
    const sortKey = (g) => g.title.replace(/^The /i, "");
    const natural = (x, y) => x.localeCompare(y, undefined, { numeric: true, sensitivity: "base" });

    // Variants: each family shows one tile (its first game); the rest are
    // reached from the version menu while playing.
    const byFam = new Map();
    const famOf = new Map();
    for (const fam of window.VARIANTS || []) {
      const ms = fam.map((id) => byId[id]).filter(Boolean);
      if (ms.length < 2) continue;
      for (const m of ms) famOf.set(m.id, ms);
    }
    const members = (g) => famOf.get(g.id) || [g];
    const hidden = new Set();
    for (const ms of new Set(famOf.values())) for (const m of ms.slice(1)) hidden.add(m.id);
    const primaries = games.filter((g) => !hidden.has(g.id));

    const keyers = {
      letter: (g) => letterOf(g),
      genre: (g) => info(g)[2] || UNKNOWN,
      developer: (g) => info(g)[0] || UNKNOWN,
      publisher: (g) => info(g)[1] || UNKNOWN,
      year: (g) => (info(g)[4] ? String(info(g)[4]) : UNKNOWN),
      players: (g) => { const n = info(g)[5]; return n ? (n === 1 ? "1 player" : n + " players") : UNKNOWN; },
      series: (g) => info(g)[3] || UNKNOWN,
    };
    function letterOf(g) {
      const c = sortKey(g).charAt(0).toUpperCase();
      return /[A-Z]/.test(c) ? c : "#";
    }
    function groupsFor(mode) {
      if (mode === "snes") return [["SNES", primaries]];
      const map = new Map();
      for (const g of primaries) {
        const k = keyers[mode](g);
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(g);
      }
      return [...map.entries()].sort(([x], [y]) => (x === UNKNOWN ? 1 : y === UNKNOWN ? -1 : natural(x, y)));
    }

    const groupsEl = document.getElementById("groups");
    const select = document.getElementById("group");
    function tile(g) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.style.setProperty("--c", g.color);
      const label = document.createElement("span");
      label.textContent = g.title;
      btn.appendChild(label);
      addCover(btn, g);
      btn.addEventListener("pointerenter", () => warm(g), { once: true });
      btn.addEventListener("click", () => open(g.id));
      li.appendChild(btn);
      return li;
    }

    // Predictive loading: hovering a tile fetches its ROM into the HTTP cache,
    // so the click starts the game from cache. Skipped on data-saver.
    const warmed = new Set();
    const saveData = navigator.connection && navigator.connection.saveData;
    function warm(g) {
      if (saveData || warmed.has(g.id)) return;
      warmed.add(g.id);
      fetch(gameUrlOf(g), { cache: "force-cache" }).then((r) => r.arrayBuffer()).catch(() => {});
    }
    // While idle on the library, fetch the emulator so the first launch is quick.
    const EMU = "https://cdn.emulatorjs.org/stable/data/";
    const warmEmulator = () => {
      if (saveData) return;
      for (const f of ["loader.js", "emulator.min.js", "emulator.min.css"]) {
        fetch(EMU + f, { cache: "force-cache" }).then((r) => r.arrayBuffer()).catch(() => {});
      }
    };
    if ("requestIdleCallback" in window) requestIdleCallback(warmEmulator, { timeout: 4000 });
    else setTimeout(warmEmulator, 2000);

    // A-Z index inside the SNES section: pick a letter to see its games.
    const LETTERS = ["#", ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i))];
    function azBar(list, ul) {
      const bar = document.createElement("div");
      bar.className = "az";
      bar.setAttribute("role", "group");
      bar.setAttribute("aria-label", "Filter by letter");
      const have = new Set(list.map(letterOf));
      let active = "";
      const show = (L) => {
        ul.textContent = "";
        for (const b of bar.children) b.setAttribute("aria-pressed", String(b.dataset.l === L));
        if (!L) return;
        const f = document.createDocumentFragment();
        for (const g of list) if (letterOf(g) === L) f.appendChild(tile(g));
        ul.appendChild(f);
      };
      for (const L of LETTERS) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = L;
        b.dataset.l = L;
        b.disabled = !have.has(L);
        b.setAttribute("aria-pressed", "false");
        b.addEventListener("click", () => { active = active === L ? "" : L; show(active); });
        bar.appendChild(b);
      }
      return bar;
    }

    // Sections start collapsed. Tiles (and their covers) are only built when a
    // section is opened or a letter is picked, so the closed library makes no
    // image requests.
    function render(mode) {
      groupsEl.textContent = "";
      const frag = document.createDocumentFragment();
      for (const [name, list] of groupsFor(mode)) {
        const d = document.createElement("details");
        d.className = "group";
        const s = document.createElement("summary");
        s.textContent = name;
        const count = document.createElement("span");
        count.className = "count";
        count.textContent = list.length;
        s.appendChild(count);
        const ul = document.createElement("ul");
        ul.className = "grid";
        if (mode === "snes") {
          d.append(s, azBar(list, ul), ul);
        } else {
          let filled = false;
          d.addEventListener("toggle", () => {
            if (!d.open || filled) return;
            filled = true;
            const f = document.createDocumentFragment();
            for (const g of list) f.appendChild(tile(g));
            ul.appendChild(f);
          });
          d.append(s, ul);
        }
        frag.appendChild(d);
      }
      groupsEl.appendChild(frag);
    }

    // Search matches a family by any member's title or metadata. Every typed
    // word must match.
    const search = document.getElementById("search");
    const textOf = (g) => {
      const [dev, pub, genre, series, year, max] = info(g);
      const players = max ? (max === 1 ? "1 player" : max + " players") : "";
      return [g.title, dev, pub, genre, series, year || "", players].join(" ").toLowerCase();
    };
    const hay = new Map(primaries.map((p) => [p.id, members(p).map(textOf).join(" | ")]));
    function showResults(q) {
      const words = q.toLowerCase().split(/\s+/).filter(Boolean);
      const list = primaries.filter((p) => words.every((w) => hay.get(p.id).includes(w)));
      groupsEl.textContent = "";
      if (!list.length) {
        const p = document.createElement("p");
        p.className = "empty";
        p.textContent = "No games match.";
        groupsEl.appendChild(p);
        return;
      }
      const ul = document.createElement("ul");
      ul.className = "grid";
      const f = document.createDocumentFragment();
      for (const g of list) f.appendChild(tile(g));
      ul.appendChild(f);
      groupsEl.appendChild(ul);
    }
    search.addEventListener("input", () => {
      const q = search.value.trim();
      if (q) showResults(q); else render(select.value);
    });
    select.addEventListener("change", () => { search.value = ""; render(select.value); });
    render(select.value);
  } else {
    player.hidden = false;
    document.title = current.title;
    document.getElementById("game-name").textContent = current.title;
    const host = document.getElementById("game");

    // The emulator's start-up text says "Download Game Core", "Download Game Data"
    // and so on, and it is rewritten on every progress update. Watch the game
    // area and show "Loading" instead, keeping the capitalisation.
    const relabel = (m) => (m[0] === m[0].toUpperCase() ? "Loading" : "loading");
    new MutationObserver(() => {
      const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
      for (let n; (n = walker.nextNode()); ) {
        if (/download/i.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace(/download(ing|ed)?/gi, relabel);
      }
    }).observe(host, { childList: true, subtree: true, characterData: true });

    // Back (Games chip, browser back, edge swipe) returns to the library
    // instead of leaving the site. The pushed entry is what Back pops.
    history.pushState({ game: current.id }, "", location.href);
    window.addEventListener("popstate", closeGame);
    window.addEventListener("pagehide", saveProgress);
    document.addEventListener("visibilitychange", () => { if (document.hidden) saveProgress(); });

    // Back needs a second tap, so one stray tap on the game can't drop you to the library.
    const back = document.getElementById("back");
    let armed = null;
    back.addEventListener("click", () => {
      if (!armed) {
        back.textContent = "Tap again";
        armed = setTimeout(() => { armed = null; back.textContent = "\u2190 Games"; }, 2000);
        return;
      }
      history.back();
    });

    // HUD fades out after 2.5 s without input, so it never sits over the picture.
    let idleTimer = 0;
    const wake = () => {
      player.classList.remove("idle");
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => player.classList.add("idle"), 2500);
    };
    player.addEventListener("pointermove", wake);
    player.addEventListener("pointerdown", wake);
    wake();

    // CRT scanlines: a CSS overlay, so it costs nothing per frame.
    const crtBtn = document.getElementById("crt");
    const crtLines = document.getElementById("crt-lines");
    let crtOn = localStorage.getItem("snes-crt") !== "off";
    const syncCrt = () => {
      crtBtn.setAttribute("aria-pressed", String(crtOn));
      crtLines.hidden = !crtOn;
    };
    crtBtn.addEventListener("click", () => {
      crtOn = !crtOn;
      localStorage.setItem("snes-crt", crtOn ? "on" : "off");
      syncCrt();
    });
    syncCrt();

    const filterBtn = document.getElementById("filter");
    const filter = window.SuperEagle.attach(host);
    let on = localStorage.getItem("snes-filter") === "super-eagle";
    const sync = () => {
      filterBtn.setAttribute("aria-pressed", String(on));
      filter.set(on);
    };
    filterBtn.addEventListener("click", () => {
      on = !on;
      localStorage.setItem("snes-filter", on ? "super-eagle" : "none");
      sync();
    });
    sync();

    // Audio: the core's RetroArch config asks for 64 ms of audio buffer,
    // which underruns on busy machines and crackles. Raise it before the
    // core starts; it is read once, when the core initialises.
    window.EJS_ready = () => {
      const proto = window.EJS_emulator && Object.getPrototypeOf(window.EJS_emulator);
      if (!proto || typeof proto.getRetroArchCfg !== "function" || proto.__audioPatched) return;
      const orig = proto.getRetroArchCfg;
      proto.getRetroArchCfg = function () {
        return orig.call(this).replace(/audio_latency = \d+/, "audio_latency = 160");
      };
      proto.__audioPatched = true;
    };

    // Version menu: other versions of this game, switched by reloading on them.
    const fam = (window.VARIANTS || []).map((f) => f.map((id) => byId[id])).find((f) => f.some((g) => g && g.id === current.id));
    const vsel = document.getElementById("variant");
    if (fam && fam.length > 1) {
      for (const v of fam) {
        if (!v) continue;
        const o = document.createElement("option");
        o.value = v.id;
        o.textContent = v.title;
        vsel.appendChild(o);
      }
      vsel.value = current.id;
      vsel.hidden = false;
      vsel.addEventListener("change", async () => { await saveProgress(); open(vsel.value); });
    }

    const gameUrl = gameUrlOf(current);
    window.EJS_player = "#game";
    window.EJS_core = "snes";
    window.EJS_gameUrl = gameUrl;
    window.EJS_gameName = current.title;
    window.EJS_pathtodata = "https://cdn.emulatorjs.org/stable/data/";
    window.EJS_startOnLoaded = true;

    const fail = (msg) => {
      const p = document.createElement("p");
      p.className = "err";
      p.textContent = msg;
      host.appendChild(p);
    };
    const loadEmulator = () => {
      const s = document.createElement("script");
      s.src = "https://cdn.emulatorjs.org/stable/data/loader.js";
      s.onerror = () => fail("Couldn't load the emulator. Check your connection.");
      document.body.appendChild(s);
    };
    // Check the game file first, so a moved or deleted upload shows a message
    // instead of a blank screen.
    fetch(gameUrl, { headers: { Range: "bytes=0-0" } })
      .then((r) => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        loadEmulator();
      })
      .catch((e) => {
        console.warn("Game file", gameUrl, e);
        fail("This game's file couldn't be found.");
      });
  }
})();
