(() => {
  "use strict";

  const levels = {
    1: document.getElementById("level-rubik"),
    2: document.getElementById("level-tetris"),
    3: document.getElementById("level-ducks"),
    4: document.getElementById("win-screen")
  };
  const flash = document.getElementById("level-flash");
  const flashTitle = document.getElementById("flash-title");
  const flashSubtitle = document.getElementById("flash-subtitle");
  const flashIcon = document.getElementById("flash-icon");

  let currentLevel = 1;

  function setProgress(level) {
    document.querySelectorAll(".step").forEach((step) => {
      const n = Number(step.dataset.step);
      step.classList.toggle("done", n < level);
      step.classList.toggle("active", n === level);
    });
  }

  function showLevel(level) {
    currentLevel = level;
    Object.values(levels).forEach((el) => el.classList.remove("active"));
    levels[level].classList.add("active");
    setProgress(level);
    window.scrollTo({ top: 0, behavior: "smooth" });
    clearHorizontalHold(); // Evita que un botón quede "presionado" al cambiar de nivel.
    clearTetrisTouchGesture();
    if (level === 2) startTetris();
    if (level === 1) updateRubikPractice();
    if (level === 3) startDuckLevel(1);
    if (level === 4) { renderCakeDucks(); launchConfetti(); }
  }

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
  // GUÍA TEMPORAL DE PRÁCTICA. Quitar esta sección y su interfaz
  // cuando se prepare la versión final de cumpleaños.
  const rubikPractice = document.getElementById("rubik-practice");
  const rubikHintStep = document.getElementById("rubik-hint-step");
  const rubikHintInstruction = document.getElementById("rubik-hint-instruction");
  const rubikHintDetail = document.getElementById("rubik-hint-detail");
  const rubikDemoButton = document.getElementById("rubik-demo-move");
  let rubikGuideMoves = [];
  let rubikHintOverlay = null;


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


  function removeRubikHintOverlay() {
    if (!rubikHintOverlay || !cubeGroup) return;
    cubeGroup.remove(rubikHintOverlay);
    rubikHintOverlay.traverse(object => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) object.material.dispose();
    });
    rubikHintOverlay = null;
  }

  function markRubikLayer(move) {
    removeRubikHintOverlay();
    if (!move || !rubikPractice.open || !cubeGroup || currentLevel !== 1 || rotating) return;
    const { axis, layer } = move;
    const dims = axis === "x" ? [1.08, 3.08, 3.08]
      : axis === "y" ? [3.08, 1.08, 3.08] : [3.08, 3.08, 1.08];
    const geometry = new THREE.BoxGeometry(...dims);
    rubikHintOverlay = new THREE.Group();
    rubikHintOverlay.position[axis] = layer;
    rubikHintOverlay.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
      color: 0xbab5ff, transparent: true, opacity: 0.13,
      depthWrite: false, side: THREE.DoubleSide
    })));
    rubikHintOverlay.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry),
      new THREE.LineBasicMaterial({ color: 0x8152e9, transparent: true, opacity: 0.94 })));
    cubeGroup.add(rubikHintOverlay);
  }

  function sameRubikMove(a, b) {
    return a.axis === b.axis && a.layer === b.layer && a.turn === b.turn;
  }

  function updateRubikPractice() {
    if (!rubikGuideMoves.length || !rubikHintStep) return;
    let matching = 0;
    while (matching < moveHistory.length && matching < rubikGuideMoves.length
      && sameRubikMove(moveHistory[matching], rubikGuideMoves[matching])) matching++;

    if (matching !== moveHistory.length) {
      rubikHintStep.textContent = "REVISAR ÚLTIMO GIRO";
      rubikHintInstruction.textContent = "Tu último giro no es el que indicaba la guía.";
      rubikHintDetail.textContent = "Tocá «Deshacer» hasta retomar los pasos, o «Mezclar de nuevo» para empezar.";
      rubikDemoButton.disabled = true;
      removeRubikHintOverlay();
      return;
    }

    if (matching >= rubikGuideMoves.length) {
      rubikHintStep.textContent = "7 DE 7 PASOS";
      rubikHintInstruction.textContent = "¡Completaste los 7 giros!";
      rubikHintDetail.textContent = "Todas las caras deben tener un solo color.";
      rubikDemoButton.disabled = true;
      removeRubikHintOverlay();
      return;
    }

    const move = rubikGuideMoves[matching];
    const faceNames = {
      x: move.layer > 0 ? "derecha" : "izquierda",
      y: move.layer > 0 ? "superior" : "inferior",
      z: move.layer > 0 ? "delantera" : "trasera"
    };
    const clockwise = move.turn * move.layer < 0;
    rubikHintStep.textContent = "PASO " + (matching + 1) + " DE " + rubikGuideMoves.length;
    rubikHintInstruction.textContent = "Girá la capa " + faceNames[move.axis] + " un cuarto de vuelta.";
    rubikHintDetail.textContent = (clockwise ? "↻ Horario" : "↺ Antihorario")
      + " · Mirá esa cara de frente para interpretar el sentido de giro.";
    rubikDemoButton.disabled = rotating;
    markRubikLayer(move);
  }

  rubikPractice.addEventListener("toggle", () => {
    if (rubikPractice.open) updateRubikPractice();
    else removeRubikHintOverlay();
  });
  rubikDemoButton.addEventListener("click", () => {
    if (rotating || rubikSolvedLock || !rubikPractice.open) return;
    const step = moveHistory.length;
    if (step >= rubikGuideMoves.length
      || !moveHistory.every((move, index) => sameRubikMove(move, rubikGuideMoves[index]))) return;
    const move = rubikGuideMoves[step];
    removeRubikHintOverlay();
    rotateSlice(move.axis, move.layer, move.turn);
  });

  function buildCube() {
    removeRubikHintOverlay();
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
        removeRubikHintOverlay();
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
      updateRubikPractice();
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
    removeRubikHintOverlay();
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
    rubikSolvedLock = false;
    moveHistory = [];
    buildCube();
    scrambleMoves = makeScramble();
    scrambleMoves.forEach(applyMoveInstant);
    rubikGuideMoves = [...scrambleMoves].reverse().map(move => {
      const parsed = parseMove(move);
      return { axis: parsed.axis, layer: parsed.layer,
        turn: -Math.sign(parsed.angle) };
    });
    rubikMovesEl.textContent = "0";
    updateRubikPractice();
    rubikStatus.textContent = "Arrastrá sobre una pieza para girar la capa. Fuera del cubo cambiás la vista.";
  }

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
  const RECORD_STORAGE_KEY = "cande-tetris-records-v1";
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
  let duckWrongGuesses = 0;
  let duckHintsUsed = 0;

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
  // Los colores distintos son deliberadamente visibles en 7×7–10×10.
  function duckSvg(level, odd) {
    const specialPinkBeak = odd && level === 1;
    const specialMintWing = odd && level === 2;
    const specialMintHead = odd && level === 3;
    const specialPeachBody = odd && level === 4;
    const specialMintDuck = odd && level === 5;
    const golden = "#F2AF4D";
    const headColor = specialMintHead ? "#F3E2A1" : specialMintDuck ? "#E9E69A" : "#FFEB85";
    const bodyColor = specialPeachBody ? "#FFD9A1" : specialMintDuck ? "#E4E992" : "#FFE98A";
    const wingColor = specialMintWing ? "#F4D775" : specialMintDuck ? "#8FD9A9" : "#FFE78A";
    const headEdge = specialMintHead || specialMintDuck ? "#DEB461" : golden;
    const bodyEdge = specialPeachBody ? "#E6A85E" : specialMintDuck ? "#D3B75B" : golden;
    const leftWingEdge = specialMintWing || specialMintDuck ? "#D3B75B" : golden;
    const beak = specialPinkBeak ? "#F0A069" : "#EF9653";
    const beakDark = specialPinkBeak ? "#E78E57" : "#E58642";
    const cheekGlow = specialMintDuck ? "#B6EBC8" : "#FFF0A4";
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 230"
      role="img" aria-label="Patito de goma de aspecto tierno y redondito">
      <!-- Aletas laterales redondeadas como en la imagen de referencia. -->
      <path d="M48 112 C28 107 10 120 7 142 C3 161 13 179 32 182
        C53 189 69 170 67 144 C65 127 59 116 48 112Z"
        fill="${wingColor}" stroke="${leftWingEdge}" stroke-width="7"
        stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M170 111 C190 112 207 126 208 148 C210 166 198 181 180 185
        C161 188 150 170 153 147 C156 127 161 115 170 111Z"
        fill="${specialMintDuck ? wingColor : bodyColor}" stroke="${bodyEdge}"
        stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
      <!-- Cabecita grande, ligeramente girada hacia la derecha. -->
      <path d="M51 88 C47 51 66 15 106 11 C142 7 174 27 180 62
        C187 97 173 126 141 133 C102 144 59 122 51 88Z"
        fill="${headColor}" stroke="${headEdge}" stroke-width="7.5"
        stroke-linejoin="round"/>
      <!-- Cuerpo gordito que se une de manera suave al cuello. -->
      <path d="M48 109 C30 123 29 147 29 166 C25 186 35 206 61 214
        C85 223 137 224 164 216 C194 208 208 187 205 165
        C201 138 186 117 172 108 C163 121 148 128 126 128
        C91 128 67 116 48 109Z"
        fill="${bodyColor}" stroke="${bodyEdge}" stroke-width="7.5"
        stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M69 140 Q62 163 71 181 Q82 204 126 208 Q145 207 164 198"
        fill="none" stroke="${cheekGlow}" stroke-width="13"
        opacity=".25" stroke-linecap="round"/>
      <!-- Dos ojitos ovalados, sin pestañas ni brillos exagerados. -->
      <ellipse cx="80" cy="62" rx="11" ry="14" fill="#0D1010"/>
      <ellipse cx="160" cy="44" rx="6.9" ry="12.5"
        transform="rotate(-27 160 44)" fill="#0D1010"/>
      <!-- Pico naranja ancho y suave. -->
      <path d="M102 66 C111 52 136 50 150 54 C166 56 171 69 167 77
        C158 89 133 92 114 86 C96 82 93 75 102 66Z" fill="${beak}"/>
      <path d="M106 71 C126 63 153 69 163 73 C153 83 129 84 109 79Z"
        fill="${beakDark}" opacity=".72"/>
      <path d="M112 64 C122 60 141 59 151 62"
        stroke="${specialPinkBeak ? "#FFC08B" : "#F8B277"}"
        stroke-width="5" fill="none" stroke-linecap="round" opacity=".65"/>
    </svg>`;
  }
  function startDuckLevel(level) {
    duckLevel = level;
    duckLocked = false;
    duckLevelEl.textContent = level;
    const sizes = [3,5,7,8,10];
    const n = sizes[level - 1];
    document.getElementById("duck-size").textContent = "· " + n + "×" + n;
    document.getElementById("duck-hint-text").textContent =
      "Sin cronómetro. Podés equivocarte y volver a intentar.";
    duckWrongGuesses = 0;
    duckHintsUsed = 0;
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
    duckStatus.textContent = level === 1 ? "👀 Encontrá el pico de otro color." :
      level === 2 ? "🔎 Encontrá una alita de color diferente." :
      level === 3 ? "🍀 Prestá atención a la cabecita." :
      "🍃 Buscá el patito con el color diferente. No hay límite de tiempo.";

    for (let i = 0; i < total; i++) {
      const btn = document.createElement("button");
      btn.className = "duck-item";
      btn.setAttribute("aria-label", "Pato " + (i + 1));
      btn.innerHTML = duckSvg(level, i === oddDuck);
      btn.addEventListener("click", () => chooseDuck(i, btn));
      duckGrid.appendChild(btn);
    }
  }

  // Pistas humanas, sin revelar la casilla exacta.
  document.getElementById("duck-hint").addEventListener("click", () => {
    if (currentLevel !== 3 || duckLocked || oddDuck < 0) return;
    duckHintsUsed++;
    const n = [3,5,7,8,10][duckLevel - 1];
    const column = oddDuck % n;
    const row = Math.floor(oddDuck / n);
    const location = document.getElementById("duck-hint-text");
    const group = duckHintsUsed === 1 ? 2 : 3;
    const columnPart = Math.min(group-1, Math.floor(column * group/n));
    const rowPart = Math.min(group-1, Math.floor(row * group/n));
    const colLabels = group === 2 ? ["izquierda", "derecha"] : ["izquierda", "centro", "derecha"];
    const rowLabels = group === 2 ? ["superior", "inferior"] : ["superior", "central", "inferior"];
    location.textContent = "💡 Pista: buscá en la zona " + rowLabels[rowPart] +
      " " + colLabels[columnPart] + ".";
  });

  function chooseDuck(index, btn) {
    if (duckLocked || currentLevel !== 3) return;
    if (index !== oddDuck) {
      duckWrongGuesses++;
      duckStatus.textContent = duckWrongGuesses >= 3
        ? "Ese no era. Podés usar «Dame una pista» si querés ayuda."
        : "Ese no era 😅 Seguí mirando.";
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
    host.innerHTML = "";
    const colors = ["#ff5f9f","#7d5cff","#ffd34e","#5ed28b","#58c8ef","#ff8b45"];
    for (let i = 0; i < 120; i++) {
      const c = document.createElement("i");
      c.className = "confetto";
      c.style.left = Math.random() * 100 + "vw";
      c.style.background = colors[Math.floor(Math.random()*colors.length)];
      c.style.setProperty("--drift", (Math.random()*240-120) + "px");
      c.style.animationDuration = (2.8 + Math.random()*2.6) + "s";
      c.style.animationDelay = (Math.random()*1.7) + "s";
      c.style.transform = "rotate(" + Math.random()*180 + "deg)";
      host.appendChild(c);
    }
    setTimeout(() => host.innerHTML = "", 6500);
  }

  document.getElementById("play-again").addEventListener("click", () => {
    tetrisRunning = false;
    rubikSolvedLock = false;
    newScramble();
    showLevel(1);
  });

  initRubik();
  setProgress(1);
})();