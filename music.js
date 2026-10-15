/* Música contextual del cumpleaños.
   Los archivos comerciales no se publican aquí. El reproductor reconoce
   audios autorizados en assets/music/ o seis grabaciones seleccionadas
   LOCALMENTE en el navegador (sin subir nada a GitHub). */
(() => {
  "use strict";

  const tracks = [
    { title: "Oh Ana", stage: "Bienvenida", file: "01-oh-ana.m4a" },
    { title: "Why Can't I Win", stage: "Cubo Rubik", file: "02-why-cant-i-win.m4a" },
    { title: "Big Shot", stage: "Tetris", file: "03-big-shot.m4a" },
    { title: "Grover Washington Jr.", stage: "Patitos", file: "04-grover-washington-jr.m4a" },
    { title: "Hopes and Dreams", stage: "Torta y recuerdos", file: "05-hopes-and-dreams.m4a" },
    { title: "I Gotta Feeling", stage: "Solo tu carta", file: "06-i-gotta-feeling.m4a" }
  ];

  const audio = new Audio();
  audio.loop = true;             // La canción no cambia de etapa por sí sola.
  audio.volume = 0.56;
  audio.preload = "none";
  let index = 0;
  let enabled = false;
  let userPaused = false;
  let pausedForMedia = false;
  let resumeAfterMedia = false;
  let imported = [];
  let currentSource = "";
  let lastPlayRequest = 0;
  let shownMessage = "";

  const dock = document.createElement("aside");
  dock.className = "cande-music-dock";
  dock.setAttribute("aria-label", "Música del cumpleaños");
  dock.innerHTML = [
    '<button type="button" class="cande-music-chip" aria-expanded="false" aria-controls="cande-music-panel">',
    '  <span aria-hidden="true">♫</span><span class="cande-music-chip-text">Música</span>',
    '</button>',
    '<div id="cande-music-panel" class="cande-music-panel" hidden>',
    '  <span class="cande-music-eyebrow">BANDA SONORA ♡</span>',
    '  <strong class="cande-music-title">Oh Ana</strong>',
    '  <span class="cande-music-stage">Bienvenida</span>',
    '  <div class="cande-music-actions">',
    '    <button type="button" class="cande-music-play" aria-label="Activar música">▶ Escuchar</button>',
    '    <label class="cande-music-volume-label">Volumen',
    '      <input class="cande-music-volume" type="range" min="0" max="100" value="56" aria-label="Volumen de música">',
    '    </label>',
    '  </div>',
    '  <label class="cande-music-import">',
    '    <span>♫ Cargar mis 6 audios</span>',
    '    <input class="cande-music-files" type="file" accept="audio/*,.m4a,.mp3,.ogg,.wav,.aac" multiple>',
    '  </label>',
    '  <p class="cande-music-help">Seleccioná las 6 canciones juntas, en archivos individuales. Solo se cargan en este dispositivo, no en GitHub.</p>',
    '  <p class="cande-music-status" role="status" aria-live="polite"></p>',
    '</div>'
  ].join("");
  document.body.appendChild(dock);

  const chip = dock.querySelector(".cande-music-chip");
  const chipText = dock.querySelector(".cande-music-chip-text");
  const panel = dock.querySelector(".cande-music-panel");
  const playButton = dock.querySelector(".cande-music-play");
  const titleNode = dock.querySelector(".cande-music-title");
  const stageNode = dock.querySelector(".cande-music-stage");
  const input = dock.querySelector(".cande-music-files");
  const status = dock.querySelector(".cande-music-status");
  const volume = dock.querySelector(".cande-music-volume");

  function message(text) {
    shownMessage = text || "";
    status.textContent = shownMessage;
  }
  function paint() {
    const isPlaying = !audio.paused && !audio.ended;
    titleNode.textContent = tracks[index].title;
    stageNode.textContent = tracks[index].stage;
    chipText.textContent = isPlaying ? tracks[index].title : "Música";
    dock.classList.toggle("is-playing", isPlaying);
    playButton.textContent = isPlaying ? "❚❚ Pausar" : "▶ Escuchar";
    playButton.setAttribute("aria-label", isPlaying ? "Pausar música" : "Reproducir música");
    chip.setAttribute("aria-label", "Música: " + tracks[index].title + (isPlaying ? ", sonando" : ", pausada"));
  }
  function urlFor(trackIndex) {
    return imported[trackIndex] || "assets/music/" + tracks[trackIndex].file;
  }
  function prepareSource() {
    const target = urlFor(index);
    if (currentSource !== target) {
      audio.pause();
      audio.src = target;
      currentSource = target;
      audio.load();
    }
    paint();
  }
  function attemptPlay() {
    if (!enabled || userPaused || pausedForMedia) return;
    prepareSource();
    const ticket = ++lastPlayRequest;
    const result = audio.play();
    if (result && typeof result.catch === "function") {
      result.catch(err => {
        if (ticket !== lastPlayRequest) return;
        if (err && err.name === "AbortError") return; // Etapa cambió a mitad de carga.
        if (err && err.name === "NotAllowedError") {
          message("Tocá «Escuchar» para permitir el audio en este navegador.");
        } else if (!imported[index]) {
          message("Para escuchar las canciones, cargá las seis grabaciones desde tu dispositivo.");
        } else {
          message("No se pudo reproducir esta grabación. Probá con el botón Escuchar.");
        }
        paint();
      });
    }
  }
  function setTrack(nextIndex) {
    const target = Math.max(0, Math.min(tracks.length - 1, Number(nextIndex) || 0));
    if (target !== index) {
      index = target;
      ++lastPlayRequest;
      prepareSource();
      message("");
      if (enabled && !userPaused) attemptPlay();
    } else {
      paint();
    }
  }

  function setStage(level) {
    setTrack(Math.max(0, Math.min(4, Number(level) || 0)));
  }
  function setSurpriseScene(scene, isLetterUnlocked) {
    // La sexta canción está totalmente separada de la lista general:
    // sólo comienza al abrir correctamente la carta.
    setTrack(Number(scene) === 6 && isLetterUnlocked === true ? 5 : 4);
  }
  function enable() {
    enabled = true;
    userPaused = false;
    message("");
    attemptPlay();
  }
  function pause() {
    ++lastPlayRequest;
    audio.pause();
    userPaused = true;
    resumeAfterMedia = false;
    paint();
  }
  function pauseForMedia() {
    if (audio.paused) return;
    resumeAfterMedia = true;
    pausedForMedia = true;
    ++lastPlayRequest;
    audio.pause();
  }
  function resumeFromMedia() {
    if (!pausedForMedia) return;
    const playingElsewhere = [...document.querySelectorAll("#invitation-reveal audio, #invitation-reveal video")]
      .some(player => !player.paused && !player.ended);
    if (playingElsewhere) return;
    pausedForMedia = false;
    if (resumeAfterMedia && enabled && !userPaused) attemptPlay();
    resumeAfterMedia = false;
  }

  chip.addEventListener("click", () => {
    const open = panel.hidden;
    panel.hidden = !open;
    chip.setAttribute("aria-expanded", String(open));
    if (open && !enabled && imported.length === 6) {
      // Abrir el panel no activa música a escondidas.
      message("Todo listo: tocá Escuchar para comenzar.");
    }
  });
  playButton.addEventListener("click", () => {
    if (!audio.paused) pause();
    else enable();
  });
  volume.addEventListener("input", () => {
    audio.volume = Math.max(0, Math.min(1, Number(volume.value) / 100));
  });
  input.addEventListener("change", () => {
    const selected = Array.from(input.files || []).filter(f =>
      /\.(?:m4a|mp3|aac|ogg|oga|wav|flac)$/i.test(f.name) ||
      /^audio\//i.test(f.type)
    );
    if (selected.length !== 6) {
      message("Elegí exactamente 6 audios juntos para respetar el orden.");
      input.value = "";
      return;
    }
    // Los archivos 01 a 06 del paquete privado se ordenan automáticamente.
    // Las grabaciones originales 22.01 ... 22.30 también quedan en ese orden.
    selected.sort((a,b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    for (const oldUrl of imported) URL.revokeObjectURL(oldUrl);
    imported = selected.map(file => URL.createObjectURL(file));
    const selectedTrack = index;
    ++lastPlayRequest;
    audio.pause();
    audio.removeAttribute("src");
    currentSource = "";
    index = selectedTrack;
    enabled = true;
    userPaused = false;
    prepareSource();
    message("¡6 canciones cargadas! Se reproducen en este navegador, sin subirlas al sitio.");
    attemptPlay();
    input.value = "";
  });
  audio.addEventListener("play", paint);
  audio.addEventListener("pause", paint);
  audio.addEventListener("ended", paint);
  audio.addEventListener("error", () => {
    if (!imported[index]) {
      message("Todavía no están publicadas las canciones. Podés cargarlas acá para escucharlas.");
    }
    paint();
  });

  const reveal = document.getElementById("invitation-reveal");
  if (reveal) {
    reveal.addEventListener("play", event => {
      if (event.target instanceof HTMLMediaElement && event.target !== audio) pauseForMedia();
    }, true);
    for (const eventName of ["pause","ended"]) {
      reveal.addEventListener(eventName, event => {
        if (!(event.target instanceof HTMLMediaElement)) return;
        setTimeout(resumeFromMedia, 0);
      }, true);
    }
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (!audio.paused) {
        resumeAfterMedia = true;
        pausedForMedia = true;
        audio.pause();
      }
    } else if (pausedForMedia) {
      pausedForMedia = false;
      if (resumeAfterMedia && !userPaused) attemptPlay();
      resumeAfterMedia = false;
    }
  });

  paint();
  window.CandeMusic = Object.freeze({
    setStage,
    setSurpriseScene,
    enable,
    pause,
    getState: () => ({
      track: index,
      title: tracks[index].title,
      enabled,
      playing: !audio.paused,
      imported: imported.length,
      pausedForMedia
    })
  });
})();