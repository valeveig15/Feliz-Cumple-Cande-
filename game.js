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
  const tetrisPractice = document.getElementById("tetris-practice");
  const tetrisAdviceText = document.getElementById("tetris-advice-text");
  let tetrisRecommended = null;

  const COLS = 10, ROWS = 20, BLOCK = 30;
  const TETRIS_TARGET = 2000;
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
  let tetrisRunning = false, tetrisWon = false;
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

  function spawnPiece() {
    piece = nextPiece || randomPiece();
    nextPiece = randomPiece();
    piece.x = Math.floor(COLS / 2 - piece.matrix[0].length / 2);
    piece.y = 0;
    drawNext();
    calculateTetrisRecommendation();
    if (collides(piece.matrix, piece.x, piece.y)) {
      tetrisRunning = false;
      tetrisStatus.textContent = "💥 Se llenó. Reiniciando…";
      setTimeout(startTetris, 750);
    }
  }

  function startTetris() {
    clearHorizontalHold();
    board = freshBoard();
    tScore = 0; tLines = 0; tetrisWon = false;
    nextPiece = randomPiece();
    scoreEl.textContent = "0";
    linesEl.textContent = "0";
    scoreFill.style.width = "0%";
    tetrisStatus.textContent = "⚡ ¡A toda velocidad! Meta: 2.000 puntos.";
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
      linesEl.textContent = tLines;
      scoreFill.style.width = Math.min(100, (tScore / TETRIS_TARGET) * 100) + "%";
      tetrisStatus.textContent = cleared === 4 ? "🔥 ¡TETRIS!" : "✨ Línea" + (cleared > 1 ? "s" : "") + " completada" + (cleared > 1 ? "s" : "") + ".";
      if (tScore >= TETRIS_TARGET && !tetrisWon) {
        tetrisWon = true;
        tetrisRunning = false;
        scoreEl.textContent = tScore;
        levelComplete(3, "¡2.000 puntos!", "Último nivel: encontrá los patos diferentes.", "⚡");
      }
    }
  }

  function lockPiece() {
    mergePiece();
    sweepLines();
    if (!tetrisWon) spawnPiece();
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

  // Recomendador temporal: simula TODAS las celdas de cada pieza,
  // busca posiciones alcanzables con los controles del juego y evalúa
  // puntos, huecos, altura y la pieza que ya aparece en "Siguiente".
  // El resultado es heurístico: no promete jugar de forma óptima.
  const TetrisAdvisor = (() => {
    const LINE_POINTS = [0, 100, 250, 400, 600];

    function boardCollision(grid, shape, px, py) {
      for (let dy = 0; dy < shape.length; dy++) {
        for (let dx = 0; dx < shape[dy].length; dx++) {
          if (!shape[dy][dx]) continue;
          const xx = px + dx, yy = py + dy;
          if (xx < 0 || xx >= COLS || yy >= ROWS) return true;
          if (yy >= 0 && grid[yy][xx]) return true;
        }
      }
      return false;
    }

    function afterPlacement(grid, shape, px, py, type) {
      const result = grid.map(row => row.slice());
      for (let dy = 0; dy < shape.length; dy++) {
        for (let dx = 0; dx < shape[dy].length; dx++) {
          // dx is important: every tile occupies its own column.
          if (shape[dy][dx]) result[py + dy][px + dx] = type;
        }
      }
      let lines = 0;
      for (let row = ROWS - 1; row >= 0; row--) {
        if (result[row].every(Boolean)) {
          result.splice(row, 1);
          result.unshift(Array(COLS).fill(0));
          lines++;
          row++;
        }
      }
      return { board: result, lines, points: LINE_POINTS[lines] };
    }

    function boardCost(grid) {
      const heights = [];
      let holes = 0, aggregateHeight = 0;
      for (let x = 0; x < COLS; x++) {
        let top = -1;
        for (let y = 0; y < ROWS; y++) {
          if (grid[y][x] && top < 0) top = y;
          if (top >= 0 && !grid[y][x]) holes++;
        }
        const height = top < 0 ? 0 : ROWS - top;
        aggregateHeight += height;
        heights.push(height);
      }
      const highest = Math.max(...heights);
      let bumpiness = 0;
      for (let x = 1; x < COLS; x++) bumpiness += Math.abs(heights[x] - heights[x - 1]);
      // Severely penalize hidden holes and a stack near the ceiling.
      const danger = highest > 13 ? Math.pow(highest - 13, 2) * 3 : 0;
      return holes * 19 + aggregateHeight * 0.6 +
        bumpiness * 0.9 + highest * highest * 0.11 + danger;
    }

    function orientations(shape) {
      const out = [];
      let m = shape.map(row => row.slice());
      const keys = new Set();
      for (let r = 0; r < 4; r++) {
        const key = JSON.stringify(m);
        if (!keys.has(key)) {
          out.push({ rotation: r, matrix: m });
          keys.add(key);
        }
        m = rotated(m);
      }
      return out;
    }

    function spawnX(matrix) {
      return Math.floor(COLS / 2 - matrix[0].length / 2);
    }

    function dropPlacements(grid, type, restrictToReachable = false) {
      const shape = cloneShape(type);
      if (restrictToReachable) {
        return reachablePlacements(grid, shape, type);
      }
      const placements = [];
      for (const o of orientations(shape)) {
        for (let x = 0; x <= COLS - o.matrix[0].length; x++) {
          if (boardCollision(grid, o.matrix, x, 0)) continue;
          let y = 0;
          while (!boardCollision(grid, o.matrix, x, y + 1)) y++;
          placements.push({
            x, y, rotation: o.rotation, matrix: o.matrix,
            actions: Math.abs(x - spawnX(shape)) + o.rotation
          });
        }
      }
      return placements;
    }

    function reachablePlacements(grid, baseShape, type) {
      const matrices = [
        baseShape,
        rotated(baseShape),
        rotated(rotated(baseShape)),
        rotated(rotated(rotated(baseShape)))
      ];
      const startX = spawnX(baseShape);
      if (boardCollision(grid, baseShape, startX, 0)) return [];

      const queue = [{ x: startX, y: 0, rotation: 0, actions: 0 }];
      const seen = new Set([startX + ",0,0"]);
      const finalMoves = new Map();

      function push(candidate) {
        const key = candidate.x + "," + candidate.y + "," + candidate.rotation;
        if (seen.has(key)) return;
        seen.add(key);
        queue.push(candidate);
      }

      for (let i = 0; i < queue.length; i++) {
        const state = queue[i];
        const matrix = matrices[state.rotation];
        if (boardCollision(grid, matrix, state.x, state.y + 1)) {
          const landingKey = state.x + "," + state.y + "," + state.rotation;
          if (!finalMoves.has(landingKey)) {
            finalMoves.set(landingKey, { ...state, matrix });
          }
        } else {
          push({ ...state, y: state.y + 1 });
        }
        for (const offset of [-1, 1]) {
          if (!boardCollision(grid, matrix, state.x + offset, state.y)) {
            push({ ...state, x: state.x + offset, actions: state.actions + 1 });
          }
        }
        const nextRotation = (state.rotation + 1) % 4;
        const nextMatrix = matrices[nextRotation];
        // Same simple "wall kick" order as the player's ↑ control.
        for (const kick of [0, -1, 1, -2, 2]) {
          if (!boardCollision(grid, nextMatrix, state.x + kick, state.y)) {
            push({
              x: state.x + kick, y: state.y, rotation: nextRotation,
              actions: state.actions + 1
            });
            break;
          }
        }
      }
      return [...finalMoves.values()];
    }

    function nextPieceCost(grid, next, scoreSoFar) {
      if (!next) return { cost: boardCost(grid), points: 0 };
      const shape = cloneShape(next.type);
      if (boardCollision(grid, shape, spawnX(shape), 0)) {
        return { cost: 10000 + boardCost(grid), points: 0 };
      }
      const moves = dropPlacements(grid, next.type);
      if (!moves.length) return { cost: 10000, points: 0 };
      let best = null;
      for (const m of moves) {
        const result = afterPlacement(grid, m.matrix, m.x, m.y, next.type);
        const cost = boardCost(result.board) - result.points * 0.16;
        if (!best || cost < best.cost) best = { cost, points: result.points };
        if (scoreSoFar + result.points >= TETRIS_TARGET) {
          return { cost: cost - 300, points: result.points };
        }
      }
      return best;
    }

    function recommend(grid, current, next, scoreSoFar) {
      if (!current) return null;
      const options = reachablePlacements(grid, current.matrix, current.type);
      if (!options.length) return null;
      let winner = null;
      for (const m of options) {
        const result = afterPlacement(grid, m.matrix, m.x, m.y, current.type);
        const immediateWin = scoreSoFar + result.points >= TETRIS_TARGET;
        const currentCost = boardCost(result.board) - result.points * 0.16;
        const future = immediateWin
          ? { cost: 0, points: 0 }
          : nextPieceCost(result.board, next, scoreSoFar + result.points);

        const score = immediateWin
          ? -100000 + m.actions * 0.25
          : currentCost * 0.6 + future.cost * 0.4 + m.actions * 0.55;

        if (!winner || score < winner.cost) {
          winner = {
            x: m.x, y: m.y, rotation: m.rotation,
            matrix: m.matrix.map(row => row.slice()),
            cost: score,
            cleared: result.lines,
            points: result.points,
            nextPoints: future.points,
            actions: m.actions
          };
        }
      }
      return winner;
    }

    return { recommend, afterPlacement, boardCost, reachablePlacements };
  })();

  function calculateTetrisRecommendation() {
    tetrisRecommended = TetrisAdvisor.recommend(board, piece, nextPiece, tScore);
    if (!tetrisRecommended) {
      tetrisAdviceText.textContent = "La torre está demasiado alta para calcular un lugar seguro. Intentá despejar una fila.";
      return;
    }
    const r = tetrisRecommended;
    const points = r.points > 0
      ? "Completa " + r.cleared + " línea" + (r.cleared === 1 ? "" : "s") + " y suma " + r.points + " puntos."
      : "Busca evitar huecos y mantener baja la torre.";
    const next = r.nextPoints > 0 ? " También prepara una posible línea para la próxima pieza." : "";
    tetrisAdviceText.textContent = "Columna " + (r.x + 1) + " desde la izquierda, " +
      (r.rotation ? "rotá " + r.rotation + " vez" + (r.rotation === 1 ? "" : "ces") : "sin rotar") +
      ". " + points + next + " La marca turquesa muestra dónde podría quedar.";
  }

  function drawRecommendedTetrisOutline() {
    if (!tetrisRecommended || !tetrisPractice.open) return;
    const recommendation = tetrisRecommended;
    tCtx.save();
    tCtx.fillStyle = "rgba(85, 239, 210, 0.19)";
    tCtx.strokeStyle = "#52f6d9";
    tCtx.lineWidth = 2.5;
    recommendation.matrix.forEach((row, dy) => row.forEach((cell, dx) => {
      if (!cell) return;
      const px = (recommendation.x + dx) * BLOCK;
      const py = (recommendation.y + dy) * BLOCK;
      tCtx.fillRect(px + 2, py + 2, BLOCK - 4, BLOCK - 4);
      tCtx.strokeRect(px + 2, py + 2, BLOCK - 4, BLOCK - 4);
    }));
    tCtx.restore();
  }

  tetrisPractice.addEventListener("toggle", () => drawTetris());

  function drawTetris() {
    tCtx.clearRect(0, 0, tCanvas.width, tCanvas.height);
    tCtx.fillStyle = "#17131e";
    tCtx.fillRect(0, 0, tCanvas.width, tCanvas.height);

    tCtx.strokeStyle = "rgba(255,255,255,.035)";
    for (let x = 0; x <= COLS; x++) { tCtx.beginPath(); tCtx.moveTo(x*BLOCK,0); tCtx.lineTo(x*BLOCK,600); tCtx.stroke(); }
    for (let y = 0; y <= ROWS; y++) { tCtx.beginPath(); tCtx.moveTo(0,y*BLOCK); tCtx.lineTo(300,y*BLOCK); tCtx.stroke(); }

    board.forEach((row, y) => row.forEach((v, x) => v && drawBlock(tCtx, x, y, TCOLORS[v], BLOCK)));

    drawRecommendedTetrisOutline();
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

  function tetrisLoop(now) {
    if (tetrisRunning && currentLevel === 2) {
      repeatHorizontalWhileHeld(now);
      const interval = 95; // Velocidad fija: 95 ms desde la primera pieza, sin aceleración progresiva.
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
    if (currentLevel !== 2 || !tetrisRunning) return;
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
  function duckSvg(level, odd) {
    const uid = "rubberbath-v6-" + (++duckRenderSeq);
    const bodyGrad = uid + "-body";
    const headGrad = uid + "-head";
    const beakGrad = uid + "-beak";
    const wingGrad = uid + "-wing";
    const blushGrad = uid + "-blush";
    const lightGrad = uid + "-light";
    const pinkBeak = odd && level === 1;
    const beakBase = pinkBeak ? "#ff79a2" : "#ff963a";
    const beakShade = pinkBeak ? "#d84478" : "#ce5d1c";
    const tail = odd && level === 2
      ? '<path d="M30 87 C20 82 19 72 25 66 C32 68 38 75 43 81Z" fill="url(#' + bodyGrad + ')" stroke="#e6b12d" stroke-width="1.4"/>'
      : '<path d="M34 91 C17 83 8 64 13 47 C23 51 36 58 46 78Z" fill="url(#' + bodyGrad + ')" stroke="#e6ab22" stroke-width="1.5"/>' +
        '<path d="M16 56 Q22 69 30 77" fill="none" stroke="#fff6b1" stroke-width="4" opacity=".58" stroke-linecap="round"/>' +
        '<path d="M14 47 Q20 51 23 56" fill="none" stroke="#fff9cf" stroke-width="2.6" opacity=".7" stroke-linecap="round"/>';
    const eye = odd && level === 3
      ? '<path d="M105 48 Q112 54 121 47" stroke="#312529" stroke-width="4" stroke-linecap="round" fill="none"/>' +
        '<path d="M108 44 Q112 42 116 44" stroke="#c78c35" stroke-width="1.6" fill="none" opacity=".5"/>'
      : '<ellipse cx="114" cy="46" rx="6.1" ry="6.5" fill="#d5a02c" opacity=".42"/>' +
        '<ellipse cx="114" cy="45.7" rx="5.45" ry="5.9" fill="#242024"/>' +
        '<ellipse cx="112.4" cy="43.5" rx="2.35" ry="2.55" fill="#fffefa"/>' +
        '<circle cx="116.7" cy="48.2" r="1.1" fill="#ded8d7" opacity=".75"/>';
    const wingFill = odd && level === 4 ? "#f6a6d9" : "url(#" + wingGrad + ")";
    const bow = odd && level === 5
      ? '<g transform="translate(89 20) rotate(-15)">' +
        '<path d="M0 0 Q-17 -14 -19 -2 Q-18 12 0 2 Q17 14 20 1 Q19 -13 0 0Z" fill="#f369ac" stroke="#c44a8c" stroke-width="1.3"/>' +
        '<circle cx="0" cy="1" r="5" fill="#ffd6ed" stroke="#e874b5" stroke-width="1"/>' +
        '<path d="M-3 6 -9 14 M4 6 10 14" stroke="#ec69a5" stroke-width="3" stroke-linecap="round"/>' +
        '<path d="M-13 -3 L-6 0 M9 0 L15 -2" stroke="#ffe8f4" stroke-width="1.8" opacity=".7"/>' +
        '</g>' : '';

    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 172 140" role="img" aria-label="Patito de goma amarillo brillante">' +
      '<defs>' +
        '<radialGradient id="' + bodyGrad + '" cx="37%" cy="23%" r="83%">' +
          '<stop offset="0" stop-color="#ffffdb"/>' +
          '<stop offset=".17" stop-color="#fff9a2"/>' +
          '<stop offset=".42" stop-color="#ffe658"/>' +
          '<stop offset=".69" stop-color="#ffd336"/>' +
          '<stop offset=".86" stop-color="#eeb11f"/>' +
          '<stop offset="1" stop-color="#c88713"/>' +
        '</radialGradient>' +
        '<radialGradient id="' + headGrad + '" cx="30%" cy="21%" r="87%">' +
          '<stop offset="0" stop-color="#fffce7"/>' +
          '<stop offset=".14" stop-color="#fff8b5"/>' +
          '<stop offset=".38" stop-color="#ffec6c"/>' +
          '<stop offset=".67" stop-color="#ffdb42"/>' +
          '<stop offset=".9" stop-color="#eeb51f"/>' +
          '<stop offset="1" stop-color="#cc8b14"/>' +
        '</radialGradient>' +
        '<linearGradient id="' + beakGrad + '" x1="0" y1="0" x2=".18" y2="1">' +
          '<stop offset="0" stop-color="#fff0bf"/>' +
          '<stop offset=".19" stop-color="' + beakBase + '"/>' +
          '<stop offset=".59" stop-color="' + beakBase + '"/>' +
          '<stop offset="1" stop-color="' + beakShade + '"/>' +
        '</linearGradient>' +
        '<linearGradient id="' + wingGrad + '" x1=".1" y1="0" x2=".93" y2="1">' +
          '<stop offset="0" stop-color="#fffac1"/>' +
          '<stop offset=".28" stop-color="#ffe979"/>' +
          '<stop offset=".66" stop-color="#ffcf38"/>' +
          '<stop offset="1" stop-color="#dc9f19"/>' +
        '</linearGradient>' +
        '<radialGradient id="' + blushGrad + '">' +
          '<stop offset="0" stop-color="#f58f85" stop-opacity=".38"/>' +
          '<stop offset="1" stop-color="#f9a184" stop-opacity="0"/>' +
        '</radialGradient>' +
        '<linearGradient id="' + lightGrad + '" x1="0" y1="0" x2=".6" y2="1">' +
          '<stop offset="0" stop-color="#ffffff" stop-opacity=".62"/>' +
          '<stop offset=".55" stop-color="#ffffff" stop-opacity=".12"/>' +
          '<stop offset="1" stop-color="#ffffff" stop-opacity="0"/>' +
        '</linearGradient>' +
      '</defs>' +

      // Water ring and contact shadow beneath the bath toy.
      '<ellipse cx="84" cy="127" rx="64" ry="7" fill="#65b6cc" opacity=".18"/>' +
      '<path d="M36 126 Q84 133 137 124" fill="none" stroke="#c6f8ff" stroke-width="2.2" opacity=".8" stroke-linecap="round"/>' +
      '<path d="M21 120 Q31 116 40 121 M136 120 Q146 116 154 119" fill="none" stroke="#9edce9" stroke-width="1.4" opacity=".5" stroke-linecap="round"/>' +
      tail +

      // Chubby one-piece duck hull with a subtly darker rubber underside.
      '<path d="M24 85 C19 68 29 56 49 54 C65 51 76 57 88 60 ' +
        'C101 57 120 62 131 74 C143 89 129 112 107 119 ' +
        'C78 127 46 119 31 107 C25 102 23 94 24 85Z" ' +
        'fill="url(#' + bodyGrad + ')" stroke="#dea225" stroke-width="1.45"/>' +
      '<path d="M34 106 Q61 124 99 117 Q118 114 128 102" fill="none" ' +
        'stroke="#bd8111" opacity=".22" stroke-width="3" stroke-linecap="round"/>' +
      '<path d="M28 76 Q30 63 51 62 Q69 60 77 64" fill="none" ' +
        'stroke="#fffcdc" opacity=".48" stroke-width="4.4" stroke-linecap="round"/>' +

      // Round expressive head and neck, integrated into the plastic mold.
      '<path d="M59 75 C57 65 58 43 67 30 C78 14 93 11 108 14 ' +
        'C128 17 139 34 136 52 C134 72 116 85 96 85 C78 85 64 81 59 75Z" ' +
        'fill="url(#' + headGrad + ')" stroke="#e6af27" stroke-width="1.3"/>' +
      '<path d="M66 43 C70 26 84 20 99 20" fill="none" ' +
        'stroke="#fffff6" stroke-width="7.2" stroke-linecap="round" opacity=".76"/>' +
      '<path d="M63 54 Q60 68 71 76" fill="none" ' +
        'stroke="#fff4a3" stroke-width="3.5" stroke-linecap="round" opacity=".35"/>' +
      '<ellipse cx="89" cy="33" rx="18" ry="12" fill="url(#' + lightGrad + ')" opacity=".28" transform="rotate(-23 89 33)"/>' +

      // Gently smiling two-part beak, slightly lifted at its corners.
      '<path d="M133 49 C141 45 157 46 163 52 C169 58 153 65 134 64 L130 57Z" ' +
        'fill="url(#' + beakGrad + ')" stroke="' + beakShade + '" stroke-width="1.3"/>' +
      '<path d="M136 63 Q150 69 160 60 Q153 73 140 70 Q136 68 136 63Z" ' +
        'fill="' + beakShade + '" opacity=".68"/>' +
      '<path d="M140 50 Q152 49 158 53" fill="none" ' +
        'stroke="#fff3d5" stroke-width="3" opacity=".78" stroke-linecap="round"/>' +
      '<path d="M136 63 Q149 67 159 61" fill="none" ' +
        'stroke="#a95623" stroke-width=".85" opacity=".33"/>' +

      // Beady gloss eye, cheek blush, slightly raised molded wing.
      eye +
      '<ellipse cx="105" cy="66" rx="16" ry="10" fill="url(#' + blushGrad + ')" opacity=".66"/>' +
      '<path d="M47 85 C48 73 62 68 77 71 C89 74 96 82 96 88 ' +
        'C90 104 74 110 57 106 C49 103 46 96 47 85Z" ' +
        'fill="' + wingFill + '" stroke="#dfa625" stroke-width="1.5"/>' +
      '<path d="M54 82 C63 73 81 77 88 84" fill="none" ' +
        'stroke="#ffffec" opacity=".82" stroke-width="4.4" stroke-linecap="round"/>' +
      '<path d="M57 99 Q76 109 90 94" fill="none" ' +
        'stroke="#c08e17" opacity=".31" stroke-width="1.4" stroke-linecap="round"/>' +
      '<path d="M34 88 Q32 98 40 104" fill="none" ' +
        'stroke="#fffbe4" opacity=".61" stroke-width="4.6" stroke-linecap="round"/>' +
      '<ellipse cx="55" cy="65" rx="7" ry="15" transform="rotate(-25 55 65)" fill="#fff" opacity=".055"/>' +

      // Sublevel 5 has an intentionally distinct little fondant-pink bow.
      bow + '</svg>';
  }

  function startDuckLevel(level) {
    duckLevel = level;
    duckLocked = false;
    duckLevelEl.textContent = level;
    duckDots.forEach((d, i) => {
      d.classList.toggle("done", i < level - 1);
      d.classList.toggle("active", i === level - 1);
    });

    const sizes = [3,4,5,6,7];
    const n = sizes[level - 1];
    const total = n * n;
    oddDuck = Math.floor(Math.random() * total);
    duckGrid.innerHTML = "";
    duckGrid.style.gridTemplateColumns = "repeat(" + n + ", 1fr)";
    duckStatus.textContent = level === 1 ? "👀 Mirá con atención…" : "🔎 Ahora son más chicos. Encontrá el detalle.";

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
      duckStatus.textContent = "Ese no era 😅 Seguí mirando.";
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