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
    if (level === 2) startTetris();
    if (level === 3) startDuckLevel(1);
    if (level === 4) launchConfetti();
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
  const scrambleLabel = document.getElementById("scramble-sequence");

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

    let dragging = false;
    let lastX = 0, lastY = 0;

    renderer.domElement.addEventListener("pointerdown", (e) => {
      dragging = true; lastX = e.clientX; lastY = e.clientY;
      renderer.domElement.setPointerCapture?.(e.pointerId);
    });
    renderer.domElement.addEventListener("pointermove", (e) => {
      if (!dragging || rotating) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      viewGroup.rotation.y += dx * 0.008;
      viewGroup.rotation.x += dy * 0.008;
      viewGroup.rotation.x = Math.max(-1.45, Math.min(1.45, viewGroup.rotation.x));
      lastX = e.clientX; lastY = e.clientY;
    });
    const stopDrag = () => dragging = false;
    renderer.domElement.addEventListener("pointerup", stopDrag);
    renderer.domElement.addEventListener("pointercancel", stopDrag);

    window.addEventListener("resize", resizeRubik);
    requestAnimationFrame(renderRubik);
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

  function rotateMove(move, { record = true, check = true } = {}) {
    if (rotating || rubikSolvedLock || currentLevel !== 1) return;
    rotating = true;
    const { axis, layer, angle } = parseMove(move);
    const selected = layerCubies(axis, layer);
    const pivot = new THREE.Group();
    cubeGroup.add(pivot);
    selected.forEach(c => pivot.attach(c));

    const duration = 190;
    const started = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      pivot.rotation[axis] = angle * eased;
      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        pivot.rotation[axis] = angle;
        pivot.updateMatrixWorld(true);
        selected.forEach(c => {
          cubeGroup.attach(c);
          snapCubie(c);
        });
        cubeGroup.remove(pivot);
        if (record) moveHistory.push(move);
        rotating = false;
        if (check && isCubeSolved()) {
          rubikSolvedLock = true;
          rubikStatus.textContent = "✨ ¡Perfecto! Cubo armado.";
          levelComplete(2, "¡Cubo armado!", "Ahora viene Tetris a toda velocidad.", "🧩");
        }
      }
    };
    requestAnimationFrame(tick);
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
    scrambleLabel.textContent = scrambleMoves.map(m => m.replace("'", "′")).join("  ");
    rubikStatus.textContent = "Arrastrá el cubo para mirarlo. Después empezá a girar caras.";
  }

  document.querySelectorAll("[data-move]").forEach(btn => {
    btn.addEventListener("click", () => rotateMove(btn.dataset.move));
  });
  document.getElementById("new-scramble").addEventListener("click", newScramble);
  document.getElementById("rubik-undo").addEventListener("click", () => {
    if (rotating || !moveHistory.length) return;
    const last = moveHistory.pop();
    rotateMove(inverseMove(last), { record: false, check: true });
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
    if (collides(piece.matrix, piece.x, piece.y)) {
      tetrisRunning = false;
      tetrisStatus.textContent = "💥 Se llenó. Reiniciando…";
      setTimeout(startTetris, 750);
    }
  }

  function startTetris() {
    board = freshBoard();
    tScore = 0; tLines = 0; tetrisWon = false;
    nextPiece = randomPiece();
    scoreEl.textContent = "0";
    linesEl.textContent = "0";
    scoreFill.style.width = "0%";
    tetrisStatus.textContent = "¡A toda velocidad!";
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
      scoreFill.style.width = Math.min(100, tScore / 5) + "%";
      tetrisStatus.textContent = cleared === 4 ? "🔥 ¡TETRIS!" : "✨ Línea" + (cleared > 1 ? "s" : "") + " completada" + (cleared > 1 ? "s" : "") + ".";
      if (tScore >= 500 && !tetrisWon) {
        tetrisWon = true;
        tetrisRunning = false;
        scoreEl.textContent = tScore;
        levelComplete(3, "¡500 puntos!", "Último nivel: encontrá los patos diferentes.", "⚡");
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

  function tetrisLoop(now) {
    if (tetrisRunning && currentLevel === 2) {
      const interval = Math.max(135, 390 - tLines * 18);
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

  document.addEventListener("keydown", e => {
    if (currentLevel !== 2 || !tetrisRunning) return;
    if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"," "].includes(e.key)) e.preventDefault();
    if (e.key === "ArrowLeft") tetrisAction("left");
    if (e.key === "ArrowRight") tetrisAction("right");
    if (e.key === "ArrowUp") tetrisAction("rotate");
    if (e.key === "ArrowDown") tetrisAction("down");
    if (e.key === " ") tetrisAction("drop");
  });
  document.querySelectorAll("[data-tetris]").forEach(btn => btn.addEventListener("click", () => tetrisAction(btn.dataset.tetris)));
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

  function duckSvg(level, odd) {
    const beak = odd && level === 1 ? "#ffb82e" : "#ff8a3d";
    const tail = odd && level === 2 ? "" : '<path d="M27 62 Q15 57 18 48 Q27 51 32 55Z" fill="#f2bd32"/>';
    const eye = odd && level === 3
      ? '<path d="M61 36 q4 4 8 0" fill="none" stroke="#332b36" stroke-width="2.8" stroke-linecap="round"/>'
      : '<circle cx="65" cy="35" r="2.8" fill="#332b36"/>';
    const foot2 = odd && level === 4 ? "" : '<path d="M61 76 q8 2 11 0" stroke="#e87738" stroke-width="3.4" stroke-linecap="round"/>';
    const feather = odd && level === 5
      ? '<path d="M49 21 q-8-9-13-2" fill="none" stroke="#e9ad2f" stroke-width="3" stroke-linecap="round"/>'
      : '<path d="M49 21 q8-9 13-2" fill="none" stroke="#e9ad2f" stroke-width="3" stroke-linecap="round"/>';

    return '<svg viewBox="0 0 100 90" aria-hidden="true">' +
      '<ellipse cx="50" cy="60" rx="30" ry="20" fill="#f7c943"/>' +
      tail +
      '<circle cx="58" cy="37" r="20" fill="#ffd85a"/>' +
      feather +
      '<ellipse cx="77" cy="43" rx="13" ry="7" fill="' + beak + '"/>' +
      eye +
      '<path d="M43 56 q14-10 24 2 q-9 13-24 7Z" fill="#eeb832"/>' +
      '<path d="M40 76 q-8 2-11 0" stroke="#e87738" stroke-width="3.4" stroke-linecap="round"/>' +
      foot2 +
      '</svg>';
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