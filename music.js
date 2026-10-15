/* Música contextual del cumpleaños de Cande.
   Los seis archivos de audio ya están guardados en assets/music/.
   Cambia automáticamente con cada nivel; I Gotta Feeling comienza
   al entrar a la sección de la carta, aun antes de desbloquearla. */
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
  audio.preload = "metadata";
  let index = 0;
  let enabled = false;
  let userPaused = false;
  let pausedForMedia = false;
  let resumeAfterMedia = false;
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
    '  <p class="cande-music-help">La música acompaña cada parte. Tocá Escuchar si tu navegador bloquea el inicio automático.</p>',
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
    return "assets/music/" + tracks[trackIndex].file;
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
        } else {
          message("No se pudo reproducir esta canción. Tocá Escuchar para volver a intentar.");
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
  function setSurpriseScene(scene) {
    // La sección «Hay algo que quiero decirte» es la escena 6 (índice cero).
    // I Gotta Feeling debe sonar desde que se entra a esta pantalla,
    // incluso antes de introducir la contraseña de «Nuestra canción».
    const enteringLetter = Number(scene) === 6;
    setTrack(enteringLetter ? 5 : 4);
    if (enteringLetter) {
      // Al pasar desde videos o cintas, puede quedar una pausa temporal.
      // Esa pausa no debe impedir la música de la carta.
      const mediaStillPlaying = [...document.querySelectorAll("#invitation-reveal audio, #invitation-reveal video")]
        .some(player => !player.paused && !player.ended);
      if (!mediaStillPlaying) {
        pausedForMedia = false;
        resumeAfterMedia = false;
        // La navegación fue iniciada por la persona: es un gesto válido
        // para activar el audio también en navegadores móviles.
        enable();
      }
    }
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
    if (open && !enabled) {
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
  audio.addEventListener("play", paint);
  audio.addEventListener("pause", paint);
  audio.addEventListener("ended", paint);
  audio.addEventListener("error", () => {
    message("No se pudo cargar la canción. Volvé a intentarlo con Escuchar.");
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

  // Los navegadores móviles no permiten audio sin un gesto. Se activa al
  // primer toque/tecla; no hay cargas manuales ni formularios.
  let firstGestureHandled = false;
  function startAtFirstGesture(event) {
    if (firstGestureHandled || enabled) return;
    if (event.type === "keydown" && (event.key === "Tab" || event.key === "Shift")) return;
    firstGestureHandled = true;
    enable();
    document.removeEventListener("pointerdown", startAtFirstGesture, true);
    document.removeEventListener("keydown", startAtFirstGesture, true);
  }
  document.addEventListener("pointerdown", startAtFirstGesture, true);
  document.addEventListener("keydown", startAtFirstGesture, true);

  prepareSource();
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
      pausedForMedia
    })
  });
})();