(() => {
  "use strict";

  const levels = {
    0: document.getElementById("level-welcome"),
    1: document.getElementById("level-rubik"),
    2: document.getElementById("level-tetris"),
    3: document.getElementById("level-ducks"),
    4: document.getElementById("win-screen")
  };
  const flash = document.getElementById("level-flash");
  const flashTitle = document.getElementById("flash-title");
  const flashSubtitle = document.getElementById("flash-subtitle");
  const flashIcon = document.getElementById("flash-icon");

  let currentLevel = 0;

  function setProgress(level) {
    document.querySelectorAll(".step").forEach((step) => {
      const n = Number(step.dataset.step);
      step.classList.toggle("done", n < level);
      step.classList.toggle("active", n === level);
    });
  }

  // Ubicaciones discretas alternativas; el corazón no ocupa siempre
  // la misma esquina. Sólo cambia al entrar de nuevo al nivel.
  const heartHidingPlaces = [
    {left:"clamp(17px,4vw,55px)",right:"auto",top:"28svh"},
    {left:"auto",right:"clamp(17px,4vw,55px)",top:"38svh"},
    {left:"clamp(17px,4vw,55px)",right:"auto",top:"69svh"},
    {left:"auto",right:"clamp(17px,4vw,55px)",top:"75svh"},
    {left:"clamp(22px,8vw,100px)",right:"auto",top:"50svh"},
    {left:"auto",right:"clamp(22px,8vw,100px)",top:"56svh"}
  ];
  function repositionHiddenHeart(id) {
    const heart=document.getElementById(id);
    if(!heart)return;
    const old=Number(heart.dataset.lastSpot);
    const candidates=heartHidingPlaces.map((_,i)=>i).filter(i=>i!==old);
    const spot=candidates[Math.floor(Math.random()*candidates.length)];
    heart.dataset.lastSpot=String(spot);
    Object.assign(heart.style,heartHidingPlaces[spot],{bottom:"auto"});
  }

  function showLevel(level) {
    currentLevel = level;
    Object.values(levels).forEach((el) => el.classList.remove("active"));
    levels[level].classList.add("active");
    setProgress(level);
    window.scrollTo({ top: 0, behavior: "smooth" });
    clearHorizontalHold(); // Evita que un botón quede "presionado" al cambiar de nivel.
    clearTetrisTouchGesture();
    if (level === 1 || level === 2) {
      repositionHiddenHeart(level === 1 ? "rubik-secret-heart" : "tetris-secret-heart");
    }
    if (level === 1) requestAnimationFrame(() => {
      // The Rubik viewport was hidden behind the welcome screen.
      resizeRubik();
      if (renderer) renderer.render(scene, camera);
    });
    if (level === 2) startTetris();
    if (level === 3) startDuckLevel(1);
    if (level === 4) { renderCakeDucks(); launchConfetti(); updateBirthdayCountdown(); }
  }

  document.getElementById("welcome-start").addEventListener("click", () => {
    if (currentLevel !== 0) return;
    showLevel(1);
  });

  function levelComplete(nextLevel, title, subtitle, icon = "✓") {
    flashIcon.textContent = icon;
    flashTitle.textContent = title;
    flashSubtitle.textContent = subtitle;
    flash.classList.add("show");
    setTimeout(() => {
      flash.classList.remove("show");
      showLevel(nextLevel);
    }, 1200);
  }

  // =========================================================
  // NIVEL 1 — CUBO RUBIK 3D
  // =========================================================
  const rubikStage = document.getElementById("rubik-stage");
  const rubikStatus = document.getElementById("rubik-status");
  const rubikMovesEl = document.getElementById("rubik-moves-count");

  let scene, camera, renderer, viewGroup, cubeGroup;
  let cubies = [];
  let rotating = false;
  let moveHistory = [];
  let scrambleMoves = [];
  let rubikSolvedLock = false;
  const DARK = 0x17141d;
  const FACE_COLORS = {
    px: 0xef3340, // derecha: rojo
    nx: 0xff8c2f, // izquierda: naranja
    py: 0xffffff, // arriba: blanco
    ny: 0xffdc3d, // abajo: amarillo
    pz: 0x3bc46d, // frente: verde
    nz: 0x3b77e3  // atrás: azul
  };

  const localNormals = [
    new THREE.Vector3(1,0,0), new THREE.Vector3(-1,0,0),
    new THREE.Vector3(0,1,0), new THREE.Vector3(0,-1,0),
    new THREE.Vector3(0,0,1), new THREE.Vector3(0,0,-1)
  ];

  const faceInfo = {
    U: { axis: "y", layer: 1, sign: -1 },
    D: { axis: "y", layer: -1, sign: 1 },
    L: { axis: "x", layer: -1, sign: 1 },
    R: { axis: "x", layer: 1, sign: -1 },
    F: { axis: "z", layer: 1, sign: -1 },
    B: { axis: "z", layer: -1, sign: 1 }
  };

  function materialFor(hex) {
    return new THREE.MeshStandardMaterial({
      color: hex,
      roughness: 0.36,
      metalness: 0.03
    });
  }


  function buildCube() {
    while (cubeGroup.children.length) cubeGroup.remove(cubeGroup.children[0]);
    cubies = [];
    const geometry = new THREE.BoxGeometry(0.92, 0.92, 0.92, 1, 1, 1);

    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          if (x === 0 && y === 0 && z === 0) continue;
          const colors = [
            x === 1 ? FACE_COLORS.px : DARK,
            x === -1 ? FACE_COLORS.nx : DARK,
            y === 1 ? FACE_COLORS.py : DARK,
            y === -1 ? FACE_COLORS.ny : DARK,
            z === 1 ? FACE_COLORS.pz : DARK,
            z === -1 ? FACE_COLORS.nz : DARK
          ];
          const mesh = new THREE.Mesh(geometry, colors.map(materialFor));
          mesh.position.set(x, y, z);
          mesh.userData.stickerColors = colors.slice();
          cubeGroup.add(mesh);
          cubies.push(mesh);
        }
      }
    }
  }

  function initRubik() {
    if (!window.THREE) {
      rubikStatus.textContent = "No se pudo cargar el motor 3D. Revisá la conexión e intentá nuevamente.";
      return;
    }

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(5.8, 5.0, 7.2);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    rubikStage.appendChild(renderer.domElement);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x675c78, 2.2);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 2.8);
    key.position.set(4, 7, 8);
    scene.add(key);

    viewGroup = new THREE.Group();
    cubeGroup = new THREE.Group();
    viewGroup.add(cubeGroup);
    scene.add(viewGroup);
    viewGroup.rotation.set(-0.42, 0.62, 0.06);

    buildCube();
    resizeRubik();
    newScramble();

    installRubikDragging();

    window.addEventListener("resize", resizeRubik);
    requestAnimationFrame(renderRubik);
  }

  // El gesto se inicia sobre una pieza concreta. Raycasting determina la
  // pegatina tocada y, según el deslizamiento, el eje de la capa que se gira.
  // Un arrastre comenzado FUERA del cubo rota únicamente la perspectiva.
  let rubikGesture = null;
  const rubikRaycaster = new THREE.Raycaster();

  function getRubikIntersection(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    const point = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    rubikRaycaster.setFromCamera(point, camera);
    return rubikRaycaster.intersectObjects(cubies, false)[0] || null;
  }

  function findRubikTurn(hit, dx, dy) {
    // Una cara visible tiene una normal que identifica su plano.
    // Hay dos ejes posibles de giro perpendiculares a esa normal.
    const normal = hit.face.normal.clone().applyQuaternion(hit.object.quaternion);
    const cell = hit.object.position;
    const viewQuaternion = viewGroup.getWorldQuaternion(new THREE.Quaternion());
    const rect = renderer.domElement.getBoundingClientRect();
    const origin = hit.point.clone().project(camera);
    let best = null;

    for (const axis of ["x", "y", "z"]) {
      if (Math.abs(normal[axis]) > 0.8) continue;
      // Producto vectorial: desplazamiento de una pegatina por un giro positivo.
      const tangent = new THREE.Vector3().crossVectors(axisVector(axis), normal);
      tangent.applyQuaternion(viewQuaternion).normalize();
      const screenPoint = hit.point.clone().addScaledVector(tangent, 0.7).project(camera);
      let screenX = (screenPoint.x - origin.x) * rect.width / 2;
      let screenY = (origin.y - screenPoint.y) * rect.height / 2;
      const screenLength = Math.hypot(screenX, screenY);
      if (screenLength < 0.001) continue;
      screenX /= screenLength;
      screenY /= screenLength;
      const alignment = Math.abs(dx * screenX + dy * screenY);
      if (!best || alignment > best.alignment) {
        best = {
          axis, layer: Math.round(cell[axis]),
          screenX, screenY, alignment
        };
      }
    }
    return best;
  }

  function installRubikDragging() {
    const canvas = renderer.domElement;
    canvas.style.touchAction = "none";
    canvas.addEventListener("contextmenu", event => event.preventDefault());

    canvas.addEventListener("pointerdown", event => {
      if (currentLevel !== 1 || rubikSolvedLock || rotating || rubikGesture) return;
      if (event.button !== 0 && event.button !== 2) return;
      const hit = event.button === 0 && !event.altKey && !event.shiftKey
        ? getRubikIntersection(event) : null;
      rubikGesture = {
        id: event.pointerId,
        type: hit ? "slice" : "orbit",
        hit,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        pivot: null,
        selected: null,
        choice: null
      };
      canvas.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });

    canvas.addEventListener("pointermove", event => {
      const gesture = rubikGesture;
      if (!gesture || gesture.id !== event.pointerId || currentLevel !== 1) return;
      const dx = event.clientX - gesture.startX;
      const dy = event.clientY - gesture.startY;

      if (gesture.type === "orbit") {
        viewGroup.rotation.y += (event.clientX - gesture.lastX) * 0.008;
        viewGroup.rotation.x += (event.clientY - gesture.lastY) * 0.008;
        viewGroup.rotation.x = Math.max(-1.45, Math.min(1.45, viewGroup.rotation.x));
        gesture.lastX = event.clientX;
        gesture.lastY = event.clientY;
        return;
      }

      if (!gesture.pivot) {
        if (Math.hypot(dx, dy) < 12) return;
        const choice = findRubikTurn(gesture.hit, dx, dy);
        if (!choice) return;
        gesture.choice = choice;
        gesture.selected = layerCubies(choice.axis, choice.layer);
            gesture.pivot = new THREE.Group();
        cubeGroup.add(gesture.pivot);
        gesture.selected.forEach(cubie => gesture.pivot.attach(cubie));
        rotating = true;
      }

      // Mientras el usuario arrastra, ve cómo se gira la capa de verdad.
      const { axis, screenX, screenY } = gesture.choice;
      const projectedPixels = dx * screenX + dy * screenY;
      gesture.pivot.rotation[axis] = Math.max(
        -Math.PI / 2, Math.min(Math.PI / 2, projectedPixels / 94 * (Math.PI / 2))
      );
      rubikStatus.textContent = "Soltá para completar el giro.";
    });

    function endGesture(event, cancelled = false) {
      const gesture = rubikGesture;
      if (!gesture || gesture.id !== event.pointerId) return;
      rubikGesture = null;
      if (!gesture.pivot) {
        rubikStatus.textContent = "Arrastrá una pieza para girar su capa. Fuera del cubo cambiás la vista.";
        return;
      }
      const axis = gesture.choice.axis;
      const fromAngle = gesture.pivot.rotation[axis];
      const turn = !cancelled && Math.abs(fromAngle) >= 0.26 ? Math.sign(fromAngle) : 0;
      finishRubikTurn(
        gesture.pivot, gesture.selected,
        axis, gesture.choice.layer,
        fromAngle, turn * (Math.PI / 2),
        { record: turn !== 0, check: turn !== 0, turn }
      );
    }

    canvas.addEventListener("pointerup", event => endGesture(event));
    canvas.addEventListener("pointercancel", event => endGesture(event, true));
  }

  function resizeRubik() {
    if (!renderer || !camera) return;
    const r = rubikStage.getBoundingClientRect();
    renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false);
    camera.aspect = r.width / Math.max(1, r.height);
    camera.updateProjectionMatrix();
  }

  function renderRubik() {
    if (renderer) renderer.render(scene, camera);
    requestAnimationFrame(renderRubik);
  }

  function parseMove(move) {
    const face = move[0];
    const prime = move.includes("'");
    const info = faceInfo[face];
    return { ...info, face, angle: info.sign * (prime ? -1 : 1) * Math.PI / 2 };
  }

  function axisVector(axis) {
    return axis === "x" ? new THREE.Vector3(1,0,0)
      : axis === "y" ? new THREE.Vector3(0,1,0)
      : new THREE.Vector3(0,0,1);
  }

  function layerCubies(axis, layer) {
    return cubies.filter(c => Math.round(c.position[axis]) === layer);
  }

  function snapCubie(c) {
    c.position.set(Math.round(c.position.x), Math.round(c.position.y), Math.round(c.position.z));
    c.quaternion.normalize();
    ["x","y","z","w"].forEach(k => {
      if (Math.abs(c.quaternion[k]) < 1e-8) c.quaternion[k] = 0;
    });
  }

  function applyMoveInstant(move) {
    const { axis, layer, angle } = parseMove(move);
    const selected = layerCubies(axis, layer);
    const av = axisVector(axis);
    const q = new THREE.Quaternion().setFromAxisAngle(av, angle);
    selected.forEach(c => {
      c.position.applyAxisAngle(av, angle);
      c.quaternion.premultiply(q);
      snapCubie(c);
    });
  }

  function finishRubikTurn(pivot, selected, axis, layer, fromAngle, toAngle, {
    record = true, check = true, turn = Math.sign(toAngle)
  } = {}) {
    const started = performance.now();
    const distance = Math.abs(toAngle - fromAngle);
    const duration = 85 + 120 * distance / (Math.PI / 2);
    function animate(now) {
      const t = Math.min(1, (now - started) / duration);
      const ease = 1 - Math.pow(1 - t, 3);
      pivot.rotation[axis] = fromAngle + (toAngle - fromAngle) * ease;
      if (t < 1) return requestAnimationFrame(animate);

      pivot.rotation[axis] = toAngle;
      pivot.updateMatrixWorld(true);
      selected.forEach(cubie => {
        cubeGroup.attach(cubie);
        snapCubie(cubie);
      });
      cubeGroup.remove(pivot);
      if (record && turn) moveHistory.push({ axis, layer, turn });
      rubikMovesEl.textContent = String(moveHistory.length);
      rotating = false;
      if (check && turn && isCubeSolved()) {
        rubikSolvedLock = true;
        rubikStatus.textContent = "✨ ¡Perfecto! Cubo armado.";
        levelComplete(2, "¡Cubo armado!", "Ahora viene Tetris a toda velocidad.", "🧩");
      } else {
        rubikStatus.textContent = "Arrastrá otra pieza para girar su capa.";
      }
    }
    requestAnimationFrame(animate);
  }

  function rotateSlice(axis, layer, turn, { record = true, check = true } = {}) {
    if (rotating || rubikSolvedLock || currentLevel !== 1) return;
    const selected = layerCubies(axis, layer);
    if (!selected.length) return;
    rotating = true;
    const pivot = new THREE.Group();
    cubeGroup.add(pivot);
    selected.forEach(cubie => pivot.attach(cubie));
    finishRubikTurn(pivot, selected, axis, layer, 0, turn * (Math.PI / 2), {
      record, check, turn
    });
  }

  function worldFaceKey(v) {
    const ax = Math.abs(v.x), ay = Math.abs(v.y), az = Math.abs(v.z);
    if (ax > ay && ax > az) return v.x > 0 ? "px" : "nx";
    if (ay > ax && ay > az) return v.y > 0 ? "py" : "ny";
    return v.z > 0 ? "pz" : "nz";
  }

  function isCubeSolved() {
    const faces = { px: [], nx: [], py: [], ny: [], pz: [], nz: [] };
    cubies.forEach(c => {
      c.userData.stickerColors.forEach((hex, idx) => {
        if (hex === DARK) return;
        const n = localNormals[idx].clone().applyQuaternion(c.quaternion);
        faces[worldFaceKey(n)].push(hex);
      });
    });
    return Object.values(faces).every(arr => arr.length === 9 && arr.every(v => v === arr[0]));
  }

  function inverseMove(move) {
    return move.includes("'") ? move[0] : move + "'";
  }

  function makeScramble() {
    const faces = ["U","D","L","R","F","B"];
    const out = [];
    let prev = "";
    while (out.length < 7) {
      const face = faces[Math.floor(Math.random() * faces.length)];
      if (face === prev) continue;
      prev = face;
      out.push(face + (Math.random() < 0.5 ? "'" : ""));
    }
    return out;
  }

  function newScramble() {
    if (rotating) return;
    document.getElementById("rubik-secret-heart").disabled = false;
    rubikSolvedLock = false;
    moveHistory = [];
    buildCube();
    scrambleMoves = makeScramble();
    scrambleMoves.forEach(applyMoveInstant);
    rubikMovesEl.textContent = "0";
    rubikStatus.textContent = "Arrastrá sobre una pieza para girar la capa. Fuera del cubo cambiás la vista.";
  }

  // El segundo corazón secreto permite pasar de Rubik a Tetris.
  // No resuelve el cubo ni afecta los récords: es solamente un atajo.
  const rubikSecretHeart = document.getElementById("rubik-secret-heart");
  rubikSecretHeart.addEventListener("click", () => {
    if (currentLevel !== 1 || rubikSecretHeart.disabled ||
        rubikSolvedLock || rotating) return;
    rubikSecretHeart.disabled = true;
    rubikSolvedLock = true;
    levelComplete(2, "♡ Atajo secreto", "¡Encontraste el atajo escondido a Tetris!", "♥");
  });

  document.getElementById("new-scramble").addEventListener("click", newScramble);
  document.getElementById("rubik-undo").addEventListener("click", () => {
    if (rotating || !moveHistory.length) return;
    const last = moveHistory.pop();
    rotateSlice(last.axis, last.layer, -last.turn, { record: false, check: true });
  });

  // =========================================================
  // NIVEL 2 — TETRIS RÁPIDO
  // =========================================================
  const tCanvas = document.getElementById("tetris");
  const tCtx = tCanvas.getContext("2d");
  const nextCanvas = document.getElementById("next-piece");
  const nextCtx = nextCanvas.getContext("2d");
  const scoreEl = document.getElementById("tetris-score");
  const linesEl = document.getElementById("tetris-lines");
  const scoreFill = document.getElementById("score-fill");
  const tetrisStatus = document.getElementById("tetris-status");

  const COLS = 10, ROWS = 20, BLOCK = 30;
  const TETRIS_TARGET = 3000;
  const TCOLORS = ["#0000", "#4fd6ff", "#ffd44d", "#b77bff", "#65d686", "#ff6579", "#5688ff", "#ff9a45"];
  const SHAPES = [
    [],
    [[1,1,1,1]],
    [[2,2],[2,2]],
    [[0,3,0],[3,3,3]],
    [[0,4,4],[4,4,0]],
    [[5,5,0],[0,5,5]],
    [[6,0,0],[6,6,6]],
    [[0,0,7],[7,7,7]]
  ];

  let board = [];
  let piece = null;
  let nextPiece = null;
  let tScore = 0, tLines = 0;
  let tetrisRunning = false, tetrisGoalUnlocked = false, tetrisGameOver = false;
  let lastDrop = 0;
  let tetrisLoopStarted = false;

  function freshBoard() {
    return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  }

  function cloneShape(type) {
    return SHAPES[type].map(r => r.slice());
  }

  function randomPiece() {
    const type = 1 + Math.floor(Math.random() * 7);
    return { type, matrix: cloneShape(type), x: 0, y: 0 };
  }

  // Marcadores permanentes estilo consola: clasificación local top 10.
  // Sólo localStorage del navegador (sin backend ni sincronización entre dispositivos).
  // Nueva temporada de la máquina: los récords anteriores se reinician una vez.
  // Se usa una clave nueva para no volver a importar la tabla anterior.
  const RECORD_STORAGE_KEY = "cande-tetris-records-v2";
  try { localStorage.removeItem("cande-tetris-records-v1"); } catch (error) {}
  const NICK_STORAGE_KEY = "cande-tetris-nickname-v1";
  const RECORD_MAX = 10;
  let currentTetrisRunId = "";
  let tetrisRecords = readTetrisRecords();

  function readTetrisRecords() {
    try {
      const raw = JSON.parse(localStorage.getItem(RECORD_STORAGE_KEY) || "[]");
      if (!Array.isArray(raw)) return [];
      return raw.filter(row => row && typeof row.id === "string" &&
        Number.isFinite(row.points) && row.points > 0)
        .sort((a,b) => b.points - a.points || a.timestamp.localeCompare(b.timestamp))
        .slice(0, RECORD_MAX);
    } catch (e) { return []; }
  }

  function readNickname() {
    try { return localStorage.getItem(NICK_STORAGE_KEY) || ""; }
    catch (e) { return ""; }
  }

  function saveNickname(value) {
    const nick = String(value || "").trim().slice(0, 18) || "Jugador";
    try { localStorage.setItem(NICK_STORAGE_KEY, nick); } catch (e) {}
    return nick;
  }

  function persistTetrisRecords() {
    try {
      localStorage.setItem(RECORD_STORAGE_KEY, JSON.stringify(tetrisRecords));
      return true;
    } catch (e) { return false; }
  }

  function prettyRecordDate(timestamp) {
    try {
      return new Intl.DateTimeFormat("es-UY", {
        day:"2-digit", month:"2-digit", year:"numeric",
        hour:"2-digit", minute:"2-digit", hour12:false
      }).format(new Date(timestamp));
    } catch (e) { return "—"; }
  }

  function redrawTetrisRecords() {
    const best = tetrisRecords[0];
    document.getElementById("best-record-score").textContent =
      best ? best.points.toLocaleString("es-UY") : "0";
    document.getElementById("mobile-tetris-best").textContent =
      best ? best.points.toLocaleString("es-UY") : "0";
    document.getElementById("best-record-name").textContent =
      best ? "de " + best.nickname : "Todavía sin récords";
    const host = document.getElementById("tetris-records-body");
    host.replaceChildren();
    if (!tetrisRecords.length) {
      const tr = document.createElement("tr"), td = document.createElement("td");
      td.colSpan = 4;
      td.textContent = "Todavía no hay récords. ¡Podés ser el primero!";
      tr.appendChild(td);
      host.appendChild(tr);
      return;
    }
    tetrisRecords.forEach((record, position) => {
      const tr = document.createElement("tr");
      if (record.id === currentTetrisRunId) tr.className = "record-current";
      [position + 1, record.nickname, record.points.toLocaleString("es-UY"),
        prettyRecordDate(record.timestamp)].forEach(value => {
        const td = document.createElement("td");
        td.textContent = String(value); // textContent evita inyección desde apodos.
        tr.appendChild(td);
      });
      host.appendChild(tr);
    });
  }

  function updateTetrisRecords(nicknameOverride) {
    if (tScore <= 0 || !currentTetrisRunId) return false;
    const previous = tetrisRecords.find(row => row.id === currentTetrisRunId);
    const nick = nicknameOverride !== undefined
      ? saveNickname(nicknameOverride)
      : (previous?.nickname || readNickname() || "Jugador");
    const record = {
      id:currentTetrisRunId, nickname:nick, points:tScore,
      timestamp:previous && previous.points === tScore ? previous.timestamp : new Date().toISOString()
    };
    // A cada partida le corresponde UNA fila; se actualiza al subir los puntos.
    const candidates = tetrisRecords.filter(row => row.id !== currentTetrisRunId);
    candidates.push(record);
    candidates.sort((a,b) => b.points-a.points || a.timestamp.localeCompare(b.timestamp));
    tetrisRecords = candidates.slice(0, RECORD_MAX);
    const ok = persistTetrisRecords();
    redrawTetrisRecords();
    return ok;
  }

  function endTetrisGame() {
    if (tetrisGameOver) return;
    tetrisRunning = false;
    tetrisGameOver = true;
    clearHorizontalHold();
    const stored = updateTetrisRecords();
    const eligible = tetrisGoalUnlocked || tScore >= TETRIS_TARGET;
    const panel = document.getElementById("tetris-end");
    document.getElementById("tetris-end-score").textContent = tScore.toLocaleString("es-UY");
    document.getElementById("tetris-end-summary").textContent = eligible
      ? "¡Superaste la meta! Podés seguir hacia los patitos o volver a jugar para mejorar el récord."
      : "Esta vez no llegaste a los 3.000. Podés intentarlo otra vez y mejorar tu récord.";
    document.getElementById("tetris-continue").hidden = !eligible;
    document.getElementById("record-nickname").value = readNickname() || "Jugador";
    document.getElementById("record-save-status").textContent = tScore <= 0
      ? "Completá alguna línea para conseguir un puntaje registrable."
      : stored ? "Puntaje guardado automáticamente. Personalizá tu apodo si querés."
      : "El navegador no permitió guardar permanentemente. Probá habilitar sus datos locales.";
    panel.hidden = false;
    document.getElementById("record-nickname").focus();
    tetrisStatus.textContent = "🏁 Fin de partida. Tu puntuación quedó registrada.";
  }

  function saveRecordFromForm() {
    const nick = document.getElementById("record-nickname").value;
    const ok = updateTetrisRecords(nick);
    document.getElementById("record-save-status").textContent = ok
      ? "✓ Récord guardado con el apodo " + saveNickname(nick) + "."
      : "No se pudo guardar en el navegador. Comprobá sus permisos de almacenamiento.";
  }

  document.getElementById("save-tetris-record").addEventListener("click", saveRecordFromForm);
  document.getElementById("record-nickname").addEventListener("keydown", event => {
    if (event.key === "Enter") { event.preventDefault(); saveRecordFromForm(); }
  });
  document.getElementById("tetris-play-again").addEventListener("click", () => {
    saveRecordFromForm();
    startTetris();
  });
  document.getElementById("tetris-continue").addEventListener("click", () => {
    if (!tetrisGoalUnlocked && tScore < TETRIS_TARGET) return;
    saveRecordFromForm();
    levelComplete(3, "¡3.000 puntos superados!", "¡Ahora buscá a los patitos!", "🏆");
  });

  function spawnPiece() {
    if (tetrisGameOver) return;
    piece = nextPiece || randomPiece();
    nextPiece = randomPiece();
    piece.x = Math.floor(COLS / 2 - piece.matrix[0].length / 2);
    piece.y = 0;
    drawNext();
    if (collides(piece.matrix, piece.x, piece.y)) {
      endTetrisGame();
    }
  }

  function startTetris() {
    document.getElementById("tetris-secret-heart").disabled = false;
    clearHorizontalHold();
    clearTetrisTouchGesture();
    document.getElementById("tetris-end").hidden = true;
    board = freshBoard();
    tScore = 0; tLines = 0; tetrisGoalUnlocked = false; tetrisGameOver = false;
    currentTetrisRunId = "run-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
    redrawTetrisRecords();
    nextPiece = randomPiece();
    scoreEl.textContent = "0";
    document.getElementById("mobile-tetris-score").textContent = "0";
    linesEl.textContent = "0";
    scoreFill.style.width = "0%";
    tetrisStatus.textContent = "⚡ Sumá 3.000 para desbloquear el siguiente nivel. ¡Después podés seguir batiendo récords! R = reiniciar.";
    tetrisRunning = true;
    lastDrop = performance.now();
    spawnPiece();
    drawTetris();
    if (!tetrisLoopStarted) {
      tetrisLoopStarted = true;
      requestAnimationFrame(tetrisLoop);
    }
  }

  function collides(matrix, ox, oy) {
    for (let y = 0; y < matrix.length; y++) {
      for (let x = 0; x < matrix[y].length; x++) {
        if (!matrix[y][x]) continue;
        const bx = ox + x, by = oy + y;
        if (bx < 0 || bx >= COLS || by >= ROWS) return true;
        if (by >= 0 && board[by][bx]) return true;
      }
    }
    return false;
  }

  function mergePiece() {
    piece.matrix.forEach((row, y) => row.forEach((v, x) => {
      if (v && piece.y + y >= 0) board[piece.y + y][piece.x + x] = piece.type;
    }));
  }

  function sweepLines() {
    let cleared = 0;
    for (let y = ROWS - 1; y >= 0; y--) {
      if (board[y].every(Boolean)) {
        board.splice(y, 1);
        board.unshift(Array(COLS).fill(0));
        cleared++;
        y++;
      }
    }
    if (cleared) {
      const scores = [0, 100, 250, 400, 600];
      tScore += scores[cleared];
      tLines += cleared;
      scoreEl.textContent = tScore;
      document.getElementById("mobile-tetris-score").textContent = tScore.toLocaleString("es-UY");
      linesEl.textContent = tLines;
      scoreFill.style.width = Math.min(100, (tScore / TETRIS_TARGET) * 100) + "%";
      tetrisStatus.textContent = (cleared === 4 ? "🔥 ¡TETRIS!" : "✨ Línea" + (cleared > 1 ? "s" : "") + " completada" + (cleared > 1 ? "s" : "") + ".") + " Velocidad: " + tetrisGravityInterval() + " ms/fila.";
      const previousBest = tetrisRecords[0] ? tetrisRecords[0].points : 0;
      const recordSaved = updateTetrisRecords();
      if (recordSaved && tScore > previousBest) {
        tetrisStatus.textContent = "🏆 ¡NUEVO RÉCORD! " + tScore.toLocaleString("es-UY") +
          " puntos guardados en la tabla.";
      }
      if (tScore >= TETRIS_TARGET && !tetrisGoalUnlocked) {
        tetrisGoalUnlocked = true;
        tetrisStatus.textContent = "🏆 ¡Superaste los 3.000! Seguí jugando para mejorar el récord. Al perder podés avanzar.";
        document.getElementById("tetris-continue").hidden = false;
      }
    }
  }

  function lockPiece() {
    mergePiece();
    sweepLines();
    if (!tetrisGameOver) spawnPiece();
  }

  function dropOne() {
    if (!tetrisRunning || !piece) return;
    if (!collides(piece.matrix, piece.x, piece.y + 1)) piece.y++;
    else lockPiece();
  }

  function hardDrop() {
    if (!tetrisRunning || !piece) return;
    while (!collides(piece.matrix, piece.x, piece.y + 1)) piece.y++;
    lockPiece();
  }

  function movePiece(dx) {
    if (!tetrisRunning || !piece) return;
    if (!collides(piece.matrix, piece.x + dx, piece.y)) piece.x += dx;
  }

  function rotated(matrix) {
    const h = matrix.length, w = matrix[0].length;
    const out = Array.from({ length: w }, () => Array(h).fill(0));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[x][h - 1 - y] = matrix[y][x];
    return out;
  }

  function rotatePiece() {
    if (!tetrisRunning || !piece) return;
    const r = rotated(piece.matrix);
    for (const kick of [0, -1, 1, -2, 2]) {
      if (!collides(r, piece.x + kick, piece.y)) {
        piece.matrix = r;
        piece.x += kick;
        return;
      }
    }
  }

  function ghostY() {
    let y = piece.y;
    while (!collides(piece.matrix, piece.x, y + 1)) y++;
    return y;
  }

  function drawBlock(ctx, x, y, color, size, alpha = 1) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
    ctx.fillStyle = "rgba(255,255,255,.18)";
    ctx.fillRect(x * size + 3, y * size + 3, size - 6, 4);
    ctx.globalAlpha = 1;
  }

  function drawTetris() {
    tCtx.clearRect(0, 0, tCanvas.width, tCanvas.height);
    tCtx.fillStyle = "#17131e";
    tCtx.fillRect(0, 0, tCanvas.width, tCanvas.height);

    tCtx.strokeStyle = "rgba(255,255,255,.035)";
    for (let x = 0; x <= COLS; x++) { tCtx.beginPath(); tCtx.moveTo(x*BLOCK,0); tCtx.lineTo(x*BLOCK,600); tCtx.stroke(); }
    for (let y = 0; y <= ROWS; y++) { tCtx.beginPath(); tCtx.moveTo(0,y*BLOCK); tCtx.lineTo(300,y*BLOCK); tCtx.stroke(); }

    board.forEach((row, y) => row.forEach((v, x) => v && drawBlock(tCtx, x, y, TCOLORS[v], BLOCK)));

    if (piece) {
      const gy = ghostY();
      piece.matrix.forEach((row, y) => row.forEach((v, x) => {
        if (v) drawBlock(tCtx, piece.x + x, gy + y, TCOLORS[piece.type], BLOCK, .18);
      }));
      piece.matrix.forEach((row, y) => row.forEach((v, x) => {
        if (v) drawBlock(tCtx, piece.x + x, piece.y + y, TCOLORS[piece.type], BLOCK);
      }));
    }
  }

  function drawNext() {
    nextCtx.clearRect(0,0,120,120);
    nextCtx.fillStyle = "#f4eff7";
    nextCtx.fillRect(0,0,120,120);
    if (!nextPiece) return;
    const size = 22;
    const m = nextPiece.matrix;
    const offX = (120 - m[0].length * size) / 2;
    const offY = (120 - m.length * size) / 2;
    m.forEach((row,y) => row.forEach((v,x) => {
      if (!v) return;
      nextCtx.fillStyle = TCOLORS[nextPiece.type];
      nextCtx.fillRect(offX+x*size+1, offY+y*size+1, size-2, size-2);
    }));
  }

  // La caída comienza a 120 ms por fila y acelera suavemente 2 ms
  // por línea hasta un mínimo de 80 ms. Reiniciar restaura 120 ms.
  function tetrisGravityInterval() {
    return Math.max(80, 120 - tLines * 2);
  }

  function tetrisLoop(now) {
    if (tetrisRunning && currentLevel === 2) {
      repeatHorizontalWhileHeld(now);
      const interval = tetrisGravityInterval();
      if (now - lastDrop > interval) {
        dropOne();
        lastDrop = now;
      }
      drawTetris();
    }
    requestAnimationFrame(tetrisLoop);
  }

  function tetrisAction(action) {
    if (currentLevel !== 2) return;
    if (action === "left") movePiece(-1);
    if (action === "right") movePiece(1);
    if (action === "rotate") rotatePiece();
    if (action === "down") dropOne();
    if (action === "drop") hardDrop();
    drawTetris();
  }

  // Movimiento horizontal continuo, independiente de la repetición
  // que configure el sistema operativo. Un toque mueve un casillero.
  // Mantener presionado: espera inicial breve, luego avanza de a uno
  // cada 42 ms, hasta que se suelta o se pierde el foco.
  const HORIZONTAL_HOLD_DELAY = 135; // ms
  const HORIZONTAL_HOLD_REPEAT = 42; // ms
  const horizontalPressed = { left: false, right: false };
  let horizontalActive = null;
  let horizontalNextStep = Infinity;

  function clearHorizontalHold() {
    horizontalPressed.left = false;
    horizontalPressed.right = false;
    horizontalActive = null;
    horizontalNextStep = Infinity;
  }

  function beginHorizontalHold(direction, now = performance.now()) {
    if (currentLevel !== 2 || !tetrisRunning) return;
    if (!Object.prototype.hasOwnProperty.call(horizontalPressed, direction)
      || horizontalPressed[direction]) return;
    horizontalPressed[direction] = true;
    horizontalActive = direction;
    horizontalNextStep = now + HORIZONTAL_HOLD_DELAY;
    tetrisAction(direction); // Movimiento inmediato al pulsar.
  }

  function endHorizontalHold(direction, now = performance.now()) {
    if (!Object.prototype.hasOwnProperty.call(horizontalPressed, direction)) return;
    horizontalPressed[direction] = false;
    if (horizontalActive !== direction) return;
    const opposite = direction === "left" ? "right" : "left";
    horizontalActive = horizontalPressed[opposite] ? opposite : null;
    horizontalNextStep = horizontalActive ? now + HORIZONTAL_HOLD_DELAY : Infinity;
    // Si mantenía la otra flecha también, retomarla sin esperar otro keydown.
    if (horizontalActive && currentLevel === 2 && tetrisRunning) tetrisAction(horizontalActive);
  }

  function repeatHorizontalWhileHeld(now) {
    if (!horizontalActive || !horizontalPressed[horizontalActive]) return;
    if (now < horizontalNextStep) return;
    // Evitar saltos demasiado bruscos si el navegador estuvo ralentizado.
    const amount = Math.min(3, 1 + Math.floor((now - horizontalNextStep) / HORIZONTAL_HOLD_REPEAT));
    for (let n = 0; n < amount; n++) {
      if (!horizontalActive || !tetrisRunning) break;
      movePiece(horizontalActive === "left" ? -1 : 1);
    }
    horizontalNextStep += amount * HORIZONTAL_HOLD_REPEAT;
    if (horizontalNextStep < now - HORIZONTAL_HOLD_REPEAT) {
      horizontalNextStep = now + HORIZONTAL_HOLD_REPEAT;
    }
  }

  document.addEventListener("keydown", e => {
    if (currentLevel !== 2) return;
    // Igual que pulsar el botón Reiniciar. No interferir con Ctrl+R del navegador.
    if ((e.key === "r" || e.key === "R") && !e.repeat &&
        !e.ctrlKey && !e.metaKey && !e.altKey &&
        !(e.target && e.target.closest && e.target.closest('input, textarea, [contenteditable="true"]'))) {
      e.preventDefault();
      startTetris();
      return;
    }
    if (!tetrisRunning) return;
    if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"," "].includes(e.key)) e.preventDefault();
    if (e.key === "ArrowLeft") return beginHorizontalHold("left");
    if (e.key === "ArrowRight") return beginHorizontalHold("right");
    if (e.repeat) return; // Una pulsación = un giro o caída, no muchos.
    if (e.key === "ArrowUp") tetrisAction("rotate");
    if (e.key === "ArrowDown") tetrisAction("down");
    if (e.key === " ") tetrisAction("drop");
  });

  // Soltar debe funcionar aun si otra interfaz recibió el foco.
  document.addEventListener("keyup", e => {
    if (e.key === "ArrowLeft") endHorizontalHold("left");
    if (e.key === "ArrowRight") endHorizontalHold("right");
  });
  window.addEventListener("blur", clearHorizontalHold);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) clearHorizontalHold();
  });

  // En celulares y pantallas táctiles, mantener el botón da el mismo
  // movimiento continuo. Usamos pointer events para poder detenerlo al soltar.
  document.querySelectorAll("[data-tetris]").forEach(btn => {
    const direction = btn.dataset.tetris;
    if (direction !== "left" && direction !== "right") {
      btn.addEventListener("click", () => tetrisAction(direction));
      return;
    }
    btn.addEventListener("pointerdown", e => {
      if (currentLevel !== 2 || !tetrisRunning) return;
      e.preventDefault();
      btn.setPointerCapture?.(e.pointerId);
      beginHorizontalHold(direction);
    });
    const release = () => endHorizontalHold(direction);
    btn.addEventListener("pointerup", release);
    btn.addEventListener("pointercancel", release);
    btn.addEventListener("lostpointercapture", release);
  });

  // CONTROLES TÁCTILES SIN BOTONES EXTRA:
  // - Toque breve en el tablero: rota la pieza.
  // - Deslizar horizontalmente: la mueve tantos cuadros como se desplace.
  // - Deslizar vertical hacia abajo: caída instantánea.
  // - Tres botones grandes (◀, caer, ▶) como alternativa con una mano.
  // Sólo procesamos puntero táctil o lápiz: en ordenador siguen las flechas.
  let tetrisTouchGesture = null;

  function clearTetrisTouchGesture() {
    tetrisTouchGesture = null;
  }

  function handleTetrisTouchStart(e) {
    if (currentLevel !== 2 || !tetrisRunning || tetrisGameOver) return;
    if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
    if (tetrisTouchGesture !== null || e.isPrimary === false) return;
    e.preventDefault();
    const id = e.pointerId;
    tetrisTouchGesture = {
      id, x:e.clientX, y:e.clientY, lastX:e.clientX,
      start:performance.now(), horizontal:false, down:false
    };
    try { tCanvas.setPointerCapture(id); } catch (error) {}
  }

  function handleTetrisTouchMove(e) {
    const state = tetrisTouchGesture;
    if (!state || e.pointerId !== state.id) return;
    e.preventDefault();
    if (currentLevel !== 2 || !tetrisRunning || tetrisGameOver) {
      clearTetrisTouchGesture();
      return;
    }
    const deltaX = e.clientX - state.x;
    const deltaY = e.clientY - state.y;
    const cellPixels = Math.max(15, tCanvas.getBoundingClientRect().width / COLS);
    if (!state.horizontal && deltaY > Math.max(30, cellPixels * 1.25)
        && deltaY > Math.abs(deltaX) * 1.25) {
      state.down = true;
    }
    if (state.down) return;
    if (Math.abs(deltaY) > Math.max(40, cellPixels * 1.5)
        && Math.abs(deltaY) > Math.abs(deltaX) * 1.5) return;
    // 75 % de una celda de pantalla = un cuadro, con límites para no
    // saltar accidentalmente hasta el borde en dispositivos pequeños.
    const stepPixels = Math.max(14, cellPixels * 0.75);
    const steps = Math.trunc((e.clientX - state.lastX) / stepPixels);
    if (!steps) return;
    state.horizontal = true;
    const direction = Math.sign(steps);
    for (let i = 0; i < Math.min(Math.abs(steps), COLS); i++) {
      movePiece(direction);
    }
    state.lastX += steps * stepPixels;
    drawTetris();
  }

  function handleTetrisTouchEnd(e, cancelled = false) {
    const state = tetrisTouchGesture;
    if (!state || state.id !== e.pointerId) return;
    clearTetrisTouchGesture();
    if (cancelled || currentLevel !== 2 || !tetrisRunning || tetrisGameOver) return;
    e.preventDefault();
    const dx = e.clientX - state.x;
    const dy = e.clientY - state.y;
    const size = Math.max(15, tCanvas.getBoundingClientRect().width / COLS);
    if (!state.horizontal && dy >= Math.max(42, size * 1.6)
        && dy > Math.abs(dx) * 1.3) {
      tetrisAction("drop");
    } else if (!state.horizontal && Math.hypot(dx, dy) <= 16
        && performance.now() - state.start < 500) {
      tetrisAction("rotate");
    }
  }

  tCanvas.addEventListener("pointerdown", handleTetrisTouchStart, { passive:false });
  tCanvas.addEventListener("pointermove", handleTetrisTouchMove, { passive:false });
  tCanvas.addEventListener("pointerup", e => handleTetrisTouchEnd(e));
  tCanvas.addEventListener("pointercancel", e => handleTetrisTouchEnd(e, true));
  tCanvas.addEventListener("lostpointercapture", () => clearTetrisTouchGesture());
  window.addEventListener("blur", clearTetrisTouchGesture);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) clearTetrisTouchGesture();
  });

  // Corazoncito secreto en el fondo del nivel. Permite pasar a patitos
  // sin llegar a 3.000 puntos; no inventa puntos ni falsifica récords.
  const tetrisSecretHeart = document.getElementById("tetris-secret-heart");
  tetrisSecretHeart.addEventListener("click", () => {
    if (currentLevel !== 2 || tetrisSecretHeart.disabled) return;
    tetrisSecretHeart.disabled = true;
    tetrisRunning = false;
    tetrisGameOver = true;
    clearHorizontalHold();
    clearTetrisTouchGesture();
    document.getElementById("tetris-end").hidden = true;
    levelComplete(3, "♡ Atajo secreto", "¡Encontraste el pasaje escondido a los patitos!", "♥");
  });

  document.getElementById("tetris-restart").addEventListener("click", startTetris);

  // =========================================================
  // NIVEL 3 — ENCONTRAR EL PATO DIFERENTE
  // =========================================================
  const duckGrid = document.getElementById("duck-grid");
  const duckLevelEl = document.getElementById("duck-level");
  const duckStatus = document.getElementById("duck-status");
  const duckDots = [...document.querySelectorAll("#duck-dots i")];
  let duckLevel = 1;
  let oddDuck = -1;
  let duckLocked = false;

  // Patitos de goma brillantes, como los juguetes de bañera.
  // Los detalles cambian en solo un pato por subnivel.
  let duckRenderSeq = 0;
  // Patito de goma de baño, estilo juguete 3D: cabeza redondita,
  // pico con volumen, plástico brillante, ala moldeada y ojos de vidrio.
  // El objeto es vectorial (nítido también en las cuadrículas pequeñas).
  // Patito clásico de hule: silhouette esculpida, material satinado,
  // sombras redondeadas, pico bicapa y brillo especular de plástico real.
  // SVG autocontenido y nítido incluso al reducirse en las rondas 4 y 5.
  // Silueta clásica de patito de goma de bañera: formas simples y suaves.
  // Cuerpo y cabeza redondos; las diferencias se conservan sin alterar el estilo.
  // Patito de goma estilo ilustración de referencia: formas simples,
  // sin brillos 3D, con contorno grueso naranja suave y ojos negros.
  // La diferencia de cada ronda es una expresión, no un color.
  // Todos conservan la misma silueta y la misma paleta.
  function duckSvg(level, odd) {
    const wink = odd && level === 1;
    const crookedBeak = odd && level === 2;
    const raisedEyebrow = odd && level === 3;
    const sideGlance = odd && level === 4;
    const crookedSmile = odd && level === 5;
    const golden = "#F2AF4D";
    const headColor = "#FFEB85";
    const bodyColor = "#FFE98A";
    const wingColor = "#FFE78A";
    const beak = "#EF9653";
    const beakDark = "#E58642";
    const cheekGlow = "#FFF0A4";
    const leftEye = wink
      ? '<path d="M66 63 Q80 75 94 62" fill="none" stroke="#0D1010" stroke-width="7" stroke-linecap="round"/>'
      : '<ellipse cx="' + (sideGlance ? 73 : 80) + '" cy="62" rx="11" ry="14" fill="#0D1010"/>';
    const rightEye = '<ellipse cx="' + (sideGlance ? 155 : 160) +
      '" cy="44" rx="6.9" ry="12.5" transform="rotate(-27 160 44)" fill="#0D1010"/>';
    const eyebrow = raisedEyebrow
      ? '<path d="M63 39 Q80 27 97 38" fill="none" stroke="#0D1010" stroke-width="5" stroke-linecap="round"/>'
      : '';
    const beakTransform = crookedBeak ? "rotate(-9 135 73)" : "translate(0 0)";
    const beakSmile = crookedSmile
      ? '<path d="M107 75 C128 65 149 68 165 66 C151 83 126 89 109 79Z" fill="#E58642" opacity=".72"/>'
      : '<path d="M106 71 C126 63 153 69 163 73 C153 83 129 84 109 79Z" fill="#E58642" opacity=".72"/>';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 230"
      role="img" aria-label="Patito de goma de aspecto tierno y redondito">
      <!-- Mismo cuerpo amarillo para todos. -->
      <path d="M48 112 C28 107 10 120 7 142 C3 161 13 179 32 182
        C53 189 69 170 67 144 C65 127 59 116 48 112Z"
        fill="${wingColor}" stroke="${golden}" stroke-width="7"
        stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M170 111 C190 112 207 126 208 148 C210 166 198 181 180 185
        C161 188 150 170 153 147 C156 127 161 115 170 111Z"
        fill="${bodyColor}" stroke="${golden}"
        stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M51 88 C47 51 66 15 106 11 C142 7 174 27 180 62
        C187 97 173 126 141 133 C102 144 59 122 51 88Z"
        fill="${headColor}" stroke="${golden}" stroke-width="7.5"
        stroke-linejoin="round"/>
      <path d="M48 109 C30 123 29 147 29 166 C25 186 35 206 61 214
        C85 223 137 224 164 216 C194 208 208 187 205 165
        C201 138 186 117 172 108 C163 121 148 128 126 128
        C91 128 67 116 48 109Z"
        fill="${bodyColor}" stroke="${golden}" stroke-width="7.5"
        stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M69 140 Q62 163 71 181 Q82 204 126 208 Q145 207 164 198"
        fill="none" stroke="${cheekGlow}" stroke-width="13"
        opacity=".25" stroke-linecap="round"/>
      <!-- Detalles mínimos de gestos: sin cambiar ni cuerpo ni colores. -->
      ${leftEye}
      ${rightEye}
      ${eyebrow}
      <!-- El pico puede estar un poquito torcido o tener otra sonrisa. -->
      <g transform="${beakTransform}">
      <!-- El pico conserva el naranja en las cinco rondas. -->
      <path d="M102 66 C111 52 136 50 150 54 C166 56 171 69 167 77
        C158 89 133 92 114 86 C96 82 93 75 102 66Z" fill="${beak}"/>
      ${beakSmile}
      <path d="M112 64 C122 60 141 59 151 62"
        stroke="#F8B277" stroke-width="5" fill="none"
        stroke-linecap="round" opacity=".65"/>
      </g>
    </svg>`;
  }
  function startDuckLevel(level) {
    duckLevel = level;
    duckLocked = false;
    duckLevelEl.textContent = level;
    const sizes = [3,5,7,8,10];
    const n = sizes[level - 1];
    document.getElementById("duck-size").textContent = "· " + n + "×" + n;
    duckDots.forEach((d, i) => {
      d.classList.toggle("done", i < level - 1);
      d.classList.toggle("active", i === level - 1);
    });

    const total = n * n;
    oddDuck = Math.floor(Math.random() * total);
    duckGrid.innerHTML = "";
    duckGrid.style.gridTemplateColumns = "repeat(" + n + ", 1fr)";
    duckGrid.dataset.columns = String(n);
    document.getElementById("duck-scroll").scrollLeft = 0;
    duckStatus.textContent = "🐥 Hay un patito diferente. Sin límite de tiempo, ¡a buscar!";

    for (let i = 0; i < total; i++) {
      const btn = document.createElement("button");
      btn.className = "duck-item";
      btn.setAttribute("aria-label", "Pato " + (i + 1));
      btn.innerHTML = duckSvg(level, i === oddDuck);
      btn.addEventListener("click", () => chooseDuck(i, btn));
      duckGrid.appendChild(btn);
    }
  }

  function chooseDuck(index, btn) {
    if (duckLocked || currentLevel !== 3) return;
    if (index !== oddDuck) {
      duckStatus.textContent = "Ese no era 😅 ¡Seguí intentando!";
      duckGrid.classList.remove("shake");
      void duckGrid.offsetWidth;
      duckGrid.classList.add("shake");
      btn.animate([{transform:"scale(1)"},{transform:"scale(.88)"},{transform:"scale(1)"}], {duration:240});
      return;
    }

    duckLocked = true;
    btn.style.outline = "4px solid #63d38b";
    btn.style.background = "#edfff4";
    duckStatus.textContent = "✅ ¡Ese era!";

    if (duckLevel < 5) {
      setTimeout(() => startDuckLevel(duckLevel + 1), 650);
    } else {
      duckDots.forEach(d => { d.classList.add("done"); d.classList.remove("active"); });
      setTimeout(() => levelComplete(4, "¡Los 5 encontrados!", "Desbloqueaste tu premio de cumpleaños.", "🦆"), 420);
    }
  }

  function renderCakeDucks() {
    const tray = document.getElementById("cake-ducks");
    if (!tray) return;
    tray.innerHTML = Array.from({ length: 3 }, () =>
      '<span class="cake-duck">' + duckSvg(0, false) + '</span>').join("");
  }

  // =========================================================
  // FINAL — TORTA + CONFETI
  // =========================================================
  function launchConfetti() {
    const host = document.getElementById("confetti");
    // Cada clic es una lluvia independiente: nunca borra las anteriores.
    const burst = [];
    const colors = ["#ff5f9f","#7d5cff","#ffd34e","#5ed28b","#58c8ef","#ff8b45"];
    let lastParticleEndsAt = 0;
    for (let i = 0; i < 120; i++) {
      const c = document.createElement("i");
      const duration = 2.8 + Math.random()*2.6;
      const delay = Math.random()*1.7;
      c.className = "confetto";
      c.style.left = Math.random() * 100 + "vw";
      c.style.background = colors[Math.floor(Math.random()*colors.length)];
      c.style.setProperty("--drift", (Math.random()*240-120) + "px");
      c.style.animationDuration = duration + "s";
      c.style.animationDelay = delay + "s";
      c.style.transform = "rotate(" + Math.random()*180 + "deg)";
      host.appendChild(c);
      burst.push(c);
      lastParticleEndsAt = Math.max(lastParticleEndsAt, duration + delay);
    }
    // Sólo retirar las partículas de ESTA tanda cuando hayan terminado.
    // Las lluvias nuevas siguen cayendo sin interrupción ni reinicio.
    setTimeout(() => burst.forEach(particle => particle.remove()),
      Math.ceil(lastParticleEndsAt * 1000) + 200);
  }


  // =========================================================
  // NIVEL SECRETO: invitación al cumpleaños de Cande
  // =========================================================
  // Cumpleaños confirmado: 15 de octubre de 2026, a medianoche (UTC-03).
  // El contenido no se revela antes, salvo con el modo de vista previa.
  const CANDE_BIRTHDAY_DATE = "2026-10-15";
  const invitationGate = document.getElementById("invitation-gate");
  const invitationReveal = document.getElementById("invitation-reveal");
  const invitationOpen = document.getElementById("invitation-open");
  const invitationSetup = document.getElementById("invitation-setup");
  const countdownStatus = document.getElementById("countdown-status");
  const countNodes = {
    days:document.getElementById("count-days"),
    hours:document.getElementById("count-hours"),
    minutes:document.getElementById("count-minutes"),
    seconds:document.getElementById("count-seconds")
  };
  let invitationCurrentlyUnlocked = false;
  let invitationOpened = false;
  // Nunca se persiste este estado: al recargar, la invitación se cierra.
  let invitationPreviewUnlocked = false;
  let previewKeyBuffer = "";
  let lastPreviewKeystroke = 0;
  const MAGIC_PREVIEW_KEY = "bibidi babidi bu";
  const previewInput = document.getElementById("invitation-preview-code");
  const previewBanner = document.getElementById("invitation-preview-banner");
  const previewAccess = document.getElementById("invitation-preview-access");

  function birthdayTimestamp() {
    if (typeof CANDE_BIRTHDAY_DATE !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(CANDE_BIRTHDAY_DATE)) return null;
    const parts = CANDE_BIRTHDAY_DATE.split("-").map(Number);
    const [year, month, day] = parts;
    const midnight = new Date(Date.UTC(year,month-1,day));
    if (midnight.getUTCFullYear() !== year ||
        midnight.getUTCMonth() !== month-1 || midnight.getUTCDate() !== day) return null;
    const timestamp = Date.parse(CANDE_BIRTHDAY_DATE + "T00:00:00-03:00");
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  function updateBirthdayCountdown(now = Date.now()) {
    const birthday = birthdayTimestamp();
    if (birthday === null) {
      invitationCurrentlyUnlocked = invitationPreviewUnlocked;
      invitationOpen.hidden = !invitationPreviewUnlocked;
      previewBanner.hidden = !invitationPreviewUnlocked;
      previewAccess.hidden = invitationPreviewUnlocked;
      invitationSetup.textContent = invitationPreviewUnlocked
        ? "Vista previa activada: podés revisar la sorpresa antes del cumpleaños."
        : "El sobre se abrirá cuando caigan las 12 de la noche.";
      countdownStatus.textContent = invitationPreviewUnlocked
        ? "✦ Vista previa privada. Para Cande sigue cerrada."
        : "Falta configurar la fecha exacta para activar la cuenta regresiva.";
      for (const node of Object.values(countNodes)) node.textContent = "--";
      document.getElementById("envelope-lock").classList.toggle("is-unlocked", invitationPreviewUnlocked);
      if (!invitationPreviewUnlocked) {
        invitationReveal.hidden = true;
        invitationReveal.replaceChildren();
        invitationOpened = false;
      }
      return;
    }
    const remaining = Math.max(0, birthday - now);
    const totalSeconds = Math.ceil(remaining/1000);
    const remainingTime = {
      days:Math.floor(totalSeconds/86400),
      hours:Math.floor(totalSeconds%86400/3600),
      minutes:Math.floor(totalSeconds%3600/60),
      seconds:totalSeconds%60
    };
    for(const [key,value] of Object.entries(remainingTime)) {
      countNodes[key].textContent = String(value).padStart(2,"0");
    }
    const birthdayReached = now >= birthday;
    invitationCurrentlyUnlocked = invitationPreviewUnlocked || birthdayReached;
    invitationOpen.hidden = !invitationCurrentlyUnlocked;
    previewBanner.hidden = !invitationPreviewUnlocked;
    previewAccess.hidden = invitationPreviewUnlocked || birthdayReached;
    document.getElementById("envelope-lock").classList.toggle("is-unlocked", invitationCurrentlyUnlocked);
    invitationSetup.textContent = birthdayReached
      ? "¡Llegó el día! Ya podés abrir la sorpresa."
      : invitationPreviewUnlocked
        ? "Vista previa activada: revisá la sorpresa antes del cumpleaños."
        : "El sobre se abrirá cuando caigan las 12 de la noche.";
    countdownStatus.textContent = birthdayReached
      ? "✦ ¡Feliz cumple, Cande! Ya podés abrir la sorpresa."
      : invitationPreviewUnlocked
        ? "✦ Vista previa privada. Para Cande sigue cerrada."
        : "Todavía no se puede abrir. Es parte de la sorpresa, shhh.";
    if (!invitationCurrentlyUnlocked) {
      invitationReveal.hidden = true;
      invitationReveal.replaceChildren();
      invitationOpened = false;
    }
  }

  const DEFAULT_INVITATION_TEXT = "Cande, feliz cumple, bella. No sé muy bien por dónde empezar sin ponerme cursi, pero bueno, vamos a fingir que sé JAJAJA.\n\nHay personas que se van volviendo importantes sin que una se dé cuenta de cuándo pasó. Un día son alguien con quien hablás, y al otro tenés ganas de contarles cualquier estupidez que te pasó porque sabés que la van a entender. Y vos sos una de esas personas para mí.\n\nMe encanta que con vos podamos decir las cosas más ridículas del universo y reírnos como dos boludas, pero que también esté ese otro lado tuyo, el que se preocupa, el que pregunta si llegué bien, el que te dice «vos podés» cuando hace falta. Son cosas que capaz para vos son normales, pero yo las valoro un montón.\n\nTenés algo muy lindo, Cande. Me encanta tu forma de ser, tu humor absolutamente cuestionable (lo digo con amor), lo mucho que te entusiasman las cosas que te gustan y esa manera tuya de hacer que hasta un mensaje cualquiera pueda mejorarme el día.\n\nNo quiero escribirte la típica cosa de «ojalá seamos amigas para siempre» como si fuera una promesa de película, pero sí quiero que sepas que espero seguir compartiendo muchísimas cosas con vos. Más charlas que empiezan con una pavada, más risas que no podemos explicar y más momentos de esos que después recordamos de la nada.\n\nOjalá este año te traiga cosas tan lindas como las que vos hacés sentir a la gente que te quiere. Y ojalá nunca dudes de lo importante que sos, aunque yo no esté diciéndotelo cada cinco minutos porque me da vergüenza ponerme así de sentimental.\n\nGracias por estar, por hacerme reír y por ser vos sin tener que hacer ningún esfuerzo por parecerte a nadie. De verdad me hace muy feliz tenerte en mi vida.\n\nTe quiero muchísimo, blda. En serio. Ahora sí, basta que me voy a poner a llorar yo también. Feliz cumple, Cande. ♡";
  let surpriseScene=0;
  const surpriseLines=["Cande cuando aparece un problema: diavlo","Cande cuando algo es buenísimo: Q GOD","Cande si la conversación se descarrila: spawneó blda","Capacidad de ser normales: error 404","Recomendación: reírnos de algo incomprensible","Vroderr. No tengo nada más que agregar."];

  let letterUnlocked=false;
  // Se agregan aquí las grabaciones reales cuando estén disponibles:
  // {title:"Audio 01", src:"audios/archivo-real.mp3"}
  // No simular ni inventar audios de conversaciones.
  const tapeRecordings=[];
  let tapeTrackIndex=0;

  function currentTapeAudio(){
    return invitationReveal.querySelector(".tape-audio");
  }
  function tapeFormatTime(seconds){
    if(!Number.isFinite(seconds)||seconds<0)return "00:00";
    const n=Math.floor(seconds);
    return String(Math.floor(n/60)).padStart(2,"0")+":"+String(n%60).padStart(2,"0");
  }
  function updateTapeVisuals(){
    const player=invitationReveal.querySelector(".memory-cassette-player");
    const audio=currentTapeAudio();
    if(!player||!audio)return;
    const playing=!audio.paused&&!audio.ended&&audio.readyState>0;
    player.classList.toggle("is-playing",playing);
    const play=player.querySelector("[data-tape-play]");
    if(play){
      play.innerHTML=playing?'❚❚ <small>PAUSA</small>':'▶ <small>PLAY</small>';
      play.setAttribute("aria-label",playing?"Pausar audio":"Reproducir audio");
    }
    const progress=player.querySelector(".tape-progress-bar");
    if(progress)progress.style.width=(audio.duration>0&&Number.isFinite(audio.duration)?(audio.currentTime/audio.duration)*100:0)+"%";
    const clock=player.querySelector(".tape-time");
    if(clock)clock.textContent=tapeFormatTime(audio.currentTime)+" / "+tapeFormatTime(audio.duration);
  }
  function updateTapeTrack(index){
    const audio=currentTapeAudio();
    const host=invitationReveal.querySelector(".memory-cassette-player");
    if(!audio||!host)return;
    audio.pause();
    const title=host.querySelector(".tape-track-title"),indicator=host.querySelector(".tape-now-playing");
    const message=host.querySelector(".tape-availability");
    const buttons=host.querySelectorAll("[data-tape-prev],[data-tape-play],[data-tape-next]");
    const available=tapeRecordings.length>0;
    buttons.forEach(btn=>btn.disabled=!available);
    if(!available){
      tapeTrackIndex=0;
      audio.removeAttribute("src");
      audio.load();
      if(title)title.textContent="Preparando nuestros recuerdos...";
      if(indicator)indicator.textContent="CINTA EN ESPERA";
      if(message)message.textContent="Esta cinta está esperando las grabaciones de nuestras conversaciones ♡";
      updateTapeVisuals();return;
    }
    tapeTrackIndex=(index+tapeRecordings.length)%tapeRecordings.length;
    const current=tapeRecordings[tapeTrackIndex];
    audio.src=current.src;
    audio.load();
    if(title)title.textContent=current.title;
    if(indicator)indicator.textContent="CINTA "+String(tapeTrackIndex+1).padStart(2,"0")+" / "+String(tapeRecordings.length).padStart(2,"0");
    if(message)message.textContent="Tocá Play para escuchar este recuerdo ♡";
    updateTapeVisuals();
  }
  function initTapePlayer(){
    const audio=currentTapeAudio();
    if(!audio)return;
    audio.addEventListener("timeupdate",updateTapeVisuals);
    audio.addEventListener("play",updateTapeVisuals);
    audio.addEventListener("pause",updateTapeVisuals);
    audio.addEventListener("loadedmetadata",updateTapeVisuals);
    audio.addEventListener("ended",()=>{
      if(tapeTrackIndex+1<tapeRecordings.length){
        updateTapeTrack(tapeTrackIndex+1);
        const newAudio=currentTapeAudio();
        if(newAudio)newAudio.play().catch(()=>updateTapeVisuals());
      } else updateTapeVisuals();
    });
    audio.addEventListener("error",()=>{
      const status=invitationReveal.querySelector(".tape-availability");
      if(status)status.textContent="Este audio no se pudo cargar. Probá otro.";
      updateTapeVisuals();
    });
    updateTapeTrack(0);
  }
  function handleTapeClick(action){
    const audio=currentTapeAudio();
    if(!audio||!tapeRecordings.length)return;
    if(action==="play"){
      if(audio.paused){
        audio.play().catch(()=>{
          const status=invitationReveal.querySelector(".tape-availability");
          if(status)status.textContent="No se pudo reproducir este audio.";
        });
      } else audio.pause();
    } else if(action==="prev"){
      if(audio.currentTime>3){audio.currentTime=0;updateTapeVisuals();}
      else updateTapeTrack(tapeTrackIndex-1);
    } else if(action==="next")updateTapeTrack(tapeTrackIndex+1);
  }

function renderSurpriseLetter(){
 const holder=invitationReveal.querySelector(".surprise-letter-copy");
 if(!holder)return;
 holder.replaceChildren();
 DEFAULT_INVITATION_TEXT.split(/\n\s*\n/).filter(Boolean).forEach(phrase=>{
  const p=document.createElement("p");p.textContent=phrase;holder.appendChild(p);
 });
}

  function showSurpriseScene(n){
 if(!invitationCurrentlyUnlocked)return;
 const pages=[...invitationReveal.querySelectorAll(".surprise-page")];
 if(!pages.length)return;
 const audio=currentTapeAudio();
 if(audio&&surpriseScene===3&&n!==3)audio.pause();
 surpriseScene=Math.max(0,Math.min(n,pages.length-1));
 pages.forEach((p,i)=>{p.hidden=i!==surpriseScene;});
 invitationReveal.querySelectorAll(".surprise-progress-dot").forEach((p,i)=>p.classList.toggle("selected",i===surpriseScene));
 const count=invitationReveal.querySelector(".surprise-progress-count");
 if(count)count.textContent=`${surpriseScene+1} / ${pages.length}`;
 invitationReveal.querySelector("[data-surprise-prev]").hidden=surpriseScene===0;
 invitationReveal.querySelector("[data-surprise-next]").hidden=surpriseScene===pages.length-1;
 invitationReveal.scrollIntoView({behavior:"smooth",block:"start"});
}

  function buildSurpriseExperience(){
 invitationReveal.innerHTML=`
 <div class="surprise-world">
  <header class="surprise-topline"><span>✦ 15 OCTUBRE 2026</span><span>ALGO SOLO PARA VOS ♡</span></header>
  <nav class="surprise-progress" aria-label="Progreso">${Array.from({length:7},()=>'<span class="surprise-progress-dot"></span>').join("")}<small class="surprise-progress-count">1 / 7</small></nav>
  <article class="surprise-page surprise-opening">
   <div class="surprise-magic">✦ ♡ ✦</div>
   <h3>CANDE.<br><em>feliz cumpleee</em> ♡</h3>
   <div class="surprise-opening-card surprise-bulletin">
    <div class="surprise-bulletin-label">✷ ÚLTIMO MOMENTO ✷</div>
    <p>Se busca a una chica que cumple años hoy. Se la reconoce por su energía, sus ocurrencias y por andar repartiendo buena onda sin pedir permiso.</p>
    <p>Si te suena conocida, Cande, es porque sos vos JAJAJA.</p>
    <p>Queda oficialmente prohibido tratar este día como uno cualquiera. Hoy se festeja todo lo que te hace ser vos.</p>
    <div class="surprise-bulletin-stamp">CASO RESUELTO ✓</div>
   </div>
   <p class="surprise-soft-caption">Hay unas cuantas cositas para descubrir. Algunas tiernas, otras un poquito ridículas. Como corresponde ♡</p>
  </article>
  <article class="surprise-page surprise-polaroid-page" hidden>
   <p class="surprise-eyebrow">CANDE EN CUATRO FOTITOS</p><h3>Las cosas que te hacen <em>tan vos</em></h3>
   <p>Tocá cada notita para descubrirla ♡</p>
   <div class="surprise-polaroids">
    <button type="button" data-surprise-flip class="surprise-polaroid"><span>⚡</span><strong>Esa energía tuya</strong><small hidden>Tenés una energía que se nota al toque. Llegás y parece que todo se vuelve un poquito más divertido, más movido, más vivo. Es demasiado vos.</small></button>
    <button type="button" data-surprise-flip class="surprise-polaroid"><span>✨</span><strong>Tu entusiasmo</strong><small hidden>Cuando algo te emociona, se te nota A KILÓMETROS. En cómo lo contás, en la cara que ponés, en esas ganas que tenés. Y es re lindo que seas así.</small></button>
    <button type="button" data-surprise-flip class="surprise-polaroid"><span>☀️</span><strong>Tu alegría</strong><small hidden>Tenés una manera de reírte, de hacer chistes y de encontrarle gracia hasta a las cosas más random. Esa alegría es una de esas cosas que te hacen inconfundible JAJAJA.</small></button>
    <button type="button" data-surprise-flip class="surprise-polaroid"><span>🌼</span><strong>Tu buena onda</strong><small hidden>Sos espontánea, auténtica, cálida y tenés esa forma tan tuya de tratar bien a la gente. Todo eso, junto con mil detalles más, es lo que te hace tan espectacular.</small></button>
   </div>
  </article>


  <article class="surprise-page surprise-friends-page" hidden>
   <p class="surprise-eyebrow">CORREO DE CUMPLEAÑOS</p>
   <h3>Hay gente que también <em>te quiere un montón</em></h3>
   <p>Y OBVIAMENTE no iban a faltar los mensajitos de tus amigos. Mirá quién apareció por acá...</p>
   <div class="friend-mailbox">
    <div class="friend-mailbox-top" aria-hidden="true"><span>✧</span><span>✉</span><span>✦</span></div>
    <button type="button" class="friend-envelope" data-open-friend-note aria-expanded="false">
     <span class="friend-envelope-stamp">✦</span>
     <span class="friend-envelope-address">De: <strong>Juanma</strong></span>
     <span class="friend-envelope-open-label">Abrir mensajito ♡</span>
    </button>
    <div class="friend-letter" hidden>
     <span class="friend-letter-header">UNA NOTITA DE JUANMA</span>
     <p>Cande queridaaaaaa</p>
     <p>Soy afortunado de haberte conocido en el club de ciencias hace ya casi 6 años, sos un cague de risa y me alegra haber mantenido contacto contigo brochacha</p>
     <p class="friend-letter-signature">Atte: el señor mayor (Jj)</p>
    </div>
   </div>
  </article>
  <article class="surprise-page surprise-cassette-page" hidden>
   <p class="surprise-eyebrow">ARCHIVO DE AUDIO · RECUERDOS</p>
   <h3>La casetera de <em>los recuerdos</em></h3>
   <p>Hay conversaciones que deberían estar en un museo JAJAJA. Acá van a quedar guardados esos audios que no se pueden escuchar sin reírse.</p>
   <div class="memory-cassette-player">
    <div class="cassette-player-header"><span>✦ RECUERDOS EN CINTA</span><span>ESTÉREO ♡</span></div>
    <div class="memory-cassette">
     <span class="memory-tape-label">NUESTRAS PAVADAS · VOL. 01</span>
     <div class="memory-tape-window">
      <div class="tape-reel tape-reel-left"><span></span></div>
      <div class="tape-window-spools" aria-hidden="true">✦ ♡ ✦</div>
      <div class="tape-reel tape-reel-right"><span></span></div>
     </div>
     <span class="memory-tape-bottom">SIDE A · MOMENTOS QUE NO SE OLVIDAN</span>
    </div>
    <div class="memory-player-screen">
      <span class="tape-now-playing">CINTA EN ESPERA</span>
      <strong class="tape-track-title" aria-live="polite">Preparando nuestros recuerdos...</strong>
      <div class="tape-timeline"><span class="tape-progress-bar"></span></div>
      <span class="tape-time">00:00 / 00:00</span>
    </div>
    <div class="memory-player-buttons" aria-label="Controles de la casetera">
      <button type="button" data-tape-prev aria-label="Audio anterior">⏮ <small>ANTERIOR</small></button>
      <button type="button" data-tape-play class="tape-play-button" aria-label="Reproducir o pausar">▶ <small>PLAY</small></button>
      <button type="button" data-tape-next aria-label="Audio siguiente">⏭ <small>SIGUIENTE</small></button>
    </div>
    <p class="tape-availability" aria-live="polite">Esta cinta está esperando las grabaciones de nuestras conversaciones ♡</p>
    <audio class="tape-audio" preload="metadata"></audio>
   </div>
  </article>
  <article class="surprise-page surprise-laugh-page" hidden>
   <p class="surprise-eyebrow">UNA COSA SERIA (MENTIRA)</p><h3>Generador de <em>pavadas</em> certificado</h3>
   <p>Apretá el botón y comprobá por qué no se nos puede tomar en serio JAJAJA.</p>
   <div class="surprise-laugh-console"><small>CANDE.EXE ✦ EN FUNCIONAMIENTO</small><strong class="surprise-laugh-result" aria-live="polite">Apretá y fijate qué dice el universo.</strong><button type="button" data-surprise-random>🎲 TIRAR OTRA PAVADA</button></div>
  </article>
  <article class="surprise-page surprise-letter-page" hidden>
   <p class="surprise-eyebrow">AHORA SÍ, UN RATITO EN SERIO</p><h3>Hay algo que <em>quiero decirte</em></h3>
   <div class="surprise-folded-letter">
     <div class="surprise-letter-lock">
      <div class="letter-lock-symbol" aria-hidden="true">💌</div>
      <p>Esta parte tiene contraseña. Y no se abre sin ella, ni siquiera hoy.</p>
      <form class="surprise-letter-password" autocomplete="off">
       <label for="birthday-letter-pass">Contraseña de la carta</label>
       <div class="letter-password-row"><input id="birthday-letter-pass" type="password" maxlength="48" autocomplete="off" spellcheck="false" required placeholder="La frase mágica...">
        <button type="submit">Abrir ♡</button></div>
       <p class="letter-password-message" aria-live="polite"></p>
      </form>
     </div>
     <div class="surprise-letter-body" hidden><div class="surprise-letter-copy"></div></div>
   </div>
   <p class="surprise-soft-caption">Leela cuando tengas ganas. No hace falta apurarse.</p>
  </article>
  <article class="surprise-page surprise-ending" hidden>
   <div class="surprise-ending-emblem">♡</div><p class="surprise-eyebrow">ÚLTIMA COSITA (AHORA SÍ)</p>
   <h3>Feliz cumpleaños, <em>Cande</em> ♡</h3>
   <p>No sé qué traerá este año, pero espero que tengas mil razones para reírte así como vos hacés reír a los demás.</p>
   <p>Y que nunca te olvides de que sos re importante para mí.</p>
   <p class="surprise-ending-sign">Te quiero un montón, bella. ♡</p>
   <button type="button" data-surprise-confetti>✨ Un poquito más de festejo</button>
  </article>
  <footer class="surprise-navigation"><button type="button" data-surprise-prev>← Volver</button><button type="button" data-surprise-next>Seguir ♡ →</button></footer>
 </div>`;
 letterUnlocked=false;
 initTapePlayer();
 showSurpriseScene(0);
}

  function handleSurpriseInteraction(event){
 if(!invitationCurrentlyUnlocked)return;
 const btn=event.target.closest("button");if(!btn||!invitationReveal.contains(btn))return;
 if(btn.hasAttribute("data-surprise-next")){showSurpriseScene(surpriseScene+1);return}
 if(btn.hasAttribute("data-surprise-prev")){showSurpriseScene(surpriseScene-1);return}
 if(btn.hasAttribute("data-surprise-flip")){
  const note=btn.querySelector("small");if(note)note.hidden=!note.hidden;
  btn.classList.toggle("flipped",note&&!note.hidden);return;
 }
 if(btn.hasAttribute("data-open-friend-note")){
  const letter=invitationReveal.querySelector(".friend-letter");
  if(!letter)return;
  letter.hidden=!letter.hidden;
  btn.setAttribute("aria-expanded",String(!letter.hidden));
  const caption=btn.querySelector(".friend-envelope-open-label");
  if(caption)caption.textContent=letter.hidden?"Abrir mensajito ♡":"Cerrar mensajito";
  return;
 }
 if(btn.hasAttribute("data-tape-play")){handleTapeClick("play");return}
 if(btn.hasAttribute("data-tape-prev")){handleTapeClick("prev");return}
 if(btn.hasAttribute("data-tape-next")){handleTapeClick("next");return}
 if(btn.hasAttribute("data-surprise-random")){
  const msg=invitationReveal.querySelector(".surprise-laugh-result");
  if(msg)msg.textContent=surpriseLines[Math.floor(Math.random()*surpriseLines.length)];return;
 }
 if(btn.hasAttribute("data-surprise-confetti")){launchConfetti();btn.textContent="✨ ¡Más confeti!"}
}

function handleSurpriseLetterSubmit(event){
 const form=event.target.closest(".surprise-letter-password");
 if(!form||!invitationReveal.contains(form))return;
 event.preventDefault();
 if(!invitationCurrentlyUnlocked||surpriseScene!==5)return;
 const input=form.querySelector("input");
 const msg=form.querySelector(".letter-password-message");
 if(normalizePreviewPhrase(input.value)!==MAGIC_PREVIEW_KEY){
  input.value="";
  if(msg)msg.textContent="Mmm no, esa no es. Probá de nuevo ♡";
  return;
 }
 letterUnlocked=true;
 const locked=invitationReveal.querySelector(".surprise-letter-lock");
 const body=invitationReveal.querySelector(".surprise-letter-body");
 if(locked)locked.hidden=true;
 if(body)body.hidden=false;
 input.value="";
 renderSurpriseLetter();
}

function openCandeInvitation(){
 updateBirthdayCountdown();
 if(!invitationCurrentlyUnlocked)return;
 if(!invitationOpened){buildSurpriseExperience();invitationOpened=true;}
 invitationReveal.hidden=false;
 invitationReveal.scrollIntoView({behavior:"smooth",block:"start"});
}

  // Truco privado: al escribir la frase mientras se ve la cuenta regresiva
  // (sin enfocarse en otro campo) se desbloquea una VISTA PREVIA temporal.
  // En teléfono también se puede escribir en el discreto campo bajo el reloj.
  // Nunca mostrar la contraseña en el HTML ni en los mensajes visibles.
  function normalizePreviewPhrase(text) {
    return String(text).normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .toLocaleLowerCase("es")
      .replace(/[¡!¿?]/g,"")
      .replace(/\s+/g," ").trim();
  }

  function countdownIsVisible() {
    if (currentLevel !== 4 || !invitationGate) return false;
    const rect = document.getElementById("birthday-countdown").getBoundingClientRect();
    return rect.height > 0 && rect.width > 0 &&
      rect.bottom >= 0 && rect.top <= window.innerHeight;
  }

  function privatePreviewContextIsValid() {
    // En celular el teclado puede sacar temporalmente el reloj del viewport.
    return countdownIsVisible() || (currentLevel === 4 && document.activeElement === previewInput);
  }

  function startPrivateInvitationPreview() {
    if (!privatePreviewContextIsValid() || invitationPreviewUnlocked) return false;
    invitationPreviewUnlocked = true;
    previewKeyBuffer = "";
    previewInput.value = "";
    updateBirthdayCountdown();
    openCandeInvitation();
    return true;
  }

  document.addEventListener("keydown", event => {
    if (!countdownIsVisible() || invitationPreviewUnlocked) return;
    if (event.altKey || event.metaKey || event.ctrlKey) return;
    if (event.target && event.target.closest &&
        event.target.closest("input, textarea, [contenteditable=true]")) return;
    const now = performance.now();
    if (now-lastPreviewKeystroke > 8000) previewKeyBuffer = "";
    lastPreviewKeystroke = now;
    if (event.key === "Backspace") {
      previewKeyBuffer = previewKeyBuffer.slice(0,-1);
    } else if (event.key.length === 1 && !event.repeat) {
      if (event.key === " " && previewKeyBuffer.length > 0) event.preventDefault();
      previewKeyBuffer += event.key;
    } else {
      return;
    }
    previewKeyBuffer = previewKeyBuffer.slice(-70);
    if (normalizePreviewPhrase(previewKeyBuffer).endsWith(MAGIC_PREVIEW_KEY)) {
      event.preventDefault();
      startPrivateInvitationPreview();
    }
  });

  previewAccess.addEventListener("submit", event => {
    event.preventDefault();
    if (privatePreviewContextIsValid() &&
        normalizePreviewPhrase(previewInput.value) === MAGIC_PREVIEW_KEY) {
      startPrivateInvitationPreview();
    } else {
      previewInput.value = "";
      previewInput.placeholder = "······";
    }
  });

  document.getElementById("invitation-preview-close").addEventListener("click", () => {
    invitationPreviewUnlocked = false;
    invitationOpened = false;
    previewKeyBuffer = "";
    previewInput.value = "";
    invitationReveal.hidden = true;
    invitationReveal.replaceChildren();
    updateBirthdayCountdown();
    invitationGate.scrollIntoView({behavior:"smooth",block:"start"});
  });

  invitationReveal.addEventListener("click", handleSurpriseInteraction);
  invitationReveal.addEventListener("submit", handleSurpriseLetterSubmit);
  invitationOpen.addEventListener("click", openCandeInvitation);
  document.getElementById("see-invitation").addEventListener("click", () => {
    invitationGate.scrollIntoView({behavior:"smooth",block:"start"});
  });
  updateBirthdayCountdown();
  setInterval(updateBirthdayCountdown,1000);

  document.getElementById("play-again").addEventListener("click", () => {
    tetrisRunning = false;
    rubikSolvedLock = false;
    newScramble();
    showLevel(0);
  });

  initRubik();
  setProgress(0);
})();