/* =====================================================
   CHIP FLYER - IPET 249 (Informática)
   Juego arcade 2D en JavaScript Vanilla + HTML5 Canvas
   Estilo: Flappy Bird / Helicopter (vuelo con toques)
   Un procesador volador esquiva torres de servidores.
   ===================================================== */

// ---------- 1. CONFIGURACIÓN GENERAL ----------
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const W = canvas.width;    // 480
const H = canvas.height;   // 640
const SUELO = H - 60;      // donde empieza la placa del piso

// Paleta institucional IPET 249
const COLOR = {
  bordo: "#6b1020",
  bordoOscuro: "#2a0710",
  amarillo: "#f2c230",
  rojo: "#d63232",
  blanco: "#ffffff",
};

// Física (píxeles y segundos)
const GRAVEDAD = 1500;      // px/s²: tira del chip hacia abajo
const IMPULSO = -430;       // px/s: cada toque le da esta velocidad hacia arriba
const VEL_INICIAL = 170;    // px/s: velocidad de las torres
const VEL_MAXIMA = 260;
const HUECO = 150;          // alto del espacio libre entre torres
const ANCHO_TORRE = 70;
const SEPARACION = 230;     // distancia horizontal entre torres

const ESTADO = { MENU: "menu", JUGANDO: "jugando", GAME_OVER: "gameover" };
let estado = ESTADO.MENU;

// ---------- 2. RECURSOS ----------
const escudo = new Image();
let escudoCargado = false;
escudo.onload = () => { escudoCargado = true; };
escudo.src = "assets/escudo.png";

// Sonidos generados por código (WebAudio)
let audioCtx = null;
function sonido(frecuencia, duracion, tipo = "square") {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const vol = audioCtx.createGain();
    osc.type = tipo;
    osc.frequency.value = frecuencia;
    vol.gain.value = 0.05;
    osc.connect(vol);
    vol.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duracion);
  } catch (e) { /* si el audio está bloqueado, el juego sigue igual */ }
}

// ---------- 3. VARIABLES DEL JUEGO ----------
// Jugador: posición (x, y), velocidad (vx, vy) y tamaño
const chip = { x: 110, y: H / 2 - 40, w: 44, h: 32, vx: 0, vy: 0 };

let torres = [];        // cada torre = par de racks con un hueco
let lineas = [];        // coleccionables "</>" (+3 puntos)
let velocidad = VEL_INICIAL;
let puntaje = 0;
let record = Number(localStorage.getItem("chipflyer_record")) || 0;
let nuevoRecord = false;
let distanciaHastaSpawn = 0;
let ultimoHueco = 260;
let tiempo = 0;
let tiempoGameOver = 0;
let desplazamiento = 0;
let ultimoHito = 0;

// Pistas de circuito del fondo (decoración con parallax)
const pistas = [];
for (let i = 0; i < 16; i++) {
  pistas.push({
    x: Math.random() * W * 1.5,
    y: 40 + Math.random() * (SUELO - 80),
    largo: 40 + Math.random() * 90,
    baja: Math.random() < 0.5 ? 1 : -1,
  });
}

// ---------- 4. CONTROLES ----------
function accion() {
  if (estado === ESTADO.MENU) {
    iniciarPartida();
    volar();
  } else if (estado === ESTADO.JUGANDO) {
    volar();
  } else if (estado === ESTADO.GAME_OVER && tiempoGameOver > 0.4) {
    iniciarPartida();
    volar();
  }
}

function volar() {
  chip.vy = IMPULSO;   // el toque reemplaza la velocidad vertical
  sonido(620, 0.08);
}

document.addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.code === "ArrowUp") {
    e.preventDefault();
    if (!e.repeat) accion();
  }
});
canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  accion();
});

// ---------- 5. LÓGICA ----------
function iniciarPartida() {
  estado = ESTADO.JUGANDO;
  torres = [];
  lineas = [];
  velocidad = VEL_INICIAL;
  puntaje = 0;
  nuevoRecord = false;
  tiempo = 0;
  ultimoHito = 0;
  ultimoHueco = 260;
  distanciaHastaSpawn = 260;   // primera torre aparece algo lejos
  chip.y = H / 2 - 40;
  chip.vy = 0;
}

function crearTorre() {
  // El hueco cambia de altura de forma limitada, para que siempre se pueda pasar
  let y = ultimoHueco + (Math.random() * 360 - 180);
  y = Math.max(80, Math.min(SUELO - HUECO - 80, y));
  ultimoHueco = y;

  const torre = { x: W + 10, huecoY: y, pasada: false };
  torres.push(torre);

  // A veces hay una línea de código en el centro del hueco
  if (Math.random() < 0.35) {
    lineas.push({ x: torre.x + ANCHO_TORRE / 2 - 17, y: y + HUECO / 2 - 11, w: 34, h: 22 });
  }
}

// Colisión AABB (Axis-Aligned Bounding Box)
function colisiona(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

function terminarPartida() {
  estado = ESTADO.GAME_OVER;
  tiempoGameOver = 0;
  sonido(140, 0.4, "sawtooth");
  if (Math.floor(puntaje) > record) {
    record = Math.floor(puntaje);
    nuevoRecord = true;
    localStorage.setItem("chipflyer_record", String(record));
  }
}

function actualizar(dt) {
  desplazamiento += (estado === ESTADO.JUGANDO ? velocidad : 50) * dt;

  if (estado === ESTADO.GAME_OVER) {
    tiempoGameOver += dt;
    return;
  }

  // En el menú el chip flota suavemente
  if (estado === ESTADO.MENU) {
    chip.y = H / 2 - 40 + Math.sin(performance.now() / 300) * 8;
    return;
  }

  tiempo += dt;

  // --- Física del chip ---
  chip.vy += GRAVEDAD * dt;       // la gravedad cambia la velocidad
  chip.y += chip.vy * dt;         // la velocidad cambia la posición

  // --- Dificultad progresiva: cada 10 puntos las torres van más rápido ---
  velocidad = Math.min(VEL_MAXIMA, VEL_INICIAL + Math.floor(puntaje / 10) * 8);

  // --- Aparición de torres ---
  distanciaHastaSpawn -= velocidad * dt;
  if (distanciaHastaSpawn <= 0) {
    crearTorre();
    distanciaHastaSpawn = SEPARACION;
  }

  // --- Hitbox del chip (un poco más chica que el dibujo, para que sea justa) ---
  const hit = { x: chip.x + 5, y: chip.y + 5, w: chip.w - 10, h: chip.h - 10 };

  // Límites del canvas: techo y piso
  const piso = { x: 0, y: SUELO, w: W, h: H - SUELO };
  const techo = { x: 0, y: -60, w: W, h: 60 };
  if (colisiona(hit, piso) || colisiona(hit, techo)) {
    terminarPartida();
    return;
  }

  // --- Torres: movimiento, colisión y puntaje ---
  for (const t of torres) {
    t.x -= velocidad * dt;
    const arriba = { x: t.x, y: 0, w: ANCHO_TORRE, h: t.huecoY };
    const abajo = { x: t.x, y: t.huecoY + HUECO, w: ANCHO_TORRE, h: SUELO - (t.huecoY + HUECO) };
    if (colisiona(hit, arriba) || colisiona(hit, abajo)) {
      terminarPartida();
      return;
    }
    // Si la torre quedó atrás del chip, suma 1 punto
    if (!t.pasada && t.x + ANCHO_TORRE < chip.x) {
      t.pasada = true;
      puntaje += 1;
      sonido(760, 0.07, "triangle");
    }
  }
  torres = torres.filter((t) => t.x + ANCHO_TORRE > -10);

  // --- Líneas de código ---
  for (const l of lineas) l.x -= velocidad * dt;
  lineas = lineas.filter((l) => {
    if (colisiona(hit, l)) {
      puntaje += 3;
      sonido(1000, 0.1, "triangle");
      return false;
    }
    return l.x + l.w > -10;
  });
}

// ---------- 6. DIBUJO ----------
function dibujarEscudo(x, y, alto) {
  if (escudoCargado) {
    const ancho = alto * (escudo.width / escudo.height);
    ctx.drawImage(escudo, x, y, ancho, alto);
    return ancho;
  }
  const ancho = alto * 0.84;   // escudo de respaldo si falta la imagen
  ctx.fillStyle = COLOR.amarillo;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + ancho, y);
  ctx.lineTo(x + ancho, y + alto * 0.6);
  ctx.quadraticCurveTo(x + ancho / 2, y + alto * 1.1, x, y + alto * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = COLOR.bordo;
  ctx.font = `bold ${alto * 0.3}px Courier New`;
  ctx.textAlign = "center";
  ctx.fillText("249", x + ancho / 2, y + alto * 0.55);
  return ancho;
}

function dibujarFondo() {
  // Placa madre: degradé bordó oscuro
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, COLOR.bordoOscuro);
  g.addColorStop(1, COLOR.bordo);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Pistas de circuito que se desplazan lentamente (parallax)
  ctx.strokeStyle = "rgba(242, 194, 48, 0.13)";
  ctx.fillStyle = "rgba(242, 194, 48, 0.2)";
  ctx.lineWidth = 3;
  const ciclo = W * 1.5;
  for (const p of pistas) {
    const x = ((p.x - desplazamiento * 0.3) % ciclo + ciclo) % ciclo - 100;
    ctx.beginPath();
    ctx.moveTo(x, p.y);
    ctx.lineTo(x + p.largo, p.y);
    ctx.lineTo(x + p.largo + 22, p.y + 22 * p.baja);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + p.largo + 22, p.y + 22 * p.baja, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Piso: placa con pines dorados que se mueven
  ctx.fillStyle = COLOR.bordoOscuro;
  ctx.fillRect(0, SUELO, W, H - SUELO);
  ctx.fillStyle = COLOR.amarillo;
  ctx.fillRect(0, SUELO, W, 4);
  for (let i = 0; i < 40; i++) {
    const x = ((i * 16 - desplazamiento) % (W + 32) + (W + 32)) % (W + 32) - 16;
    ctx.fillRect(x, SUELO + 14, 8, 22);
  }
}

// Rack de servidor con luces LED que parpadean
function dibujarRack(x, y, w, h, esTecho) {
  ctx.fillStyle = "#3b0c17";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = COLOR.amarillo;
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);

  // Bandejas de servidor
  const alto = 22;
  const n = Math.floor((h - 8) / alto);
  const parpadeo = Math.floor(performance.now() / 400);
  for (let i = 0; i < n; i++) {
    const by = esTecho ? y + h - 6 - (i + 1) * alto : y + 6 + i * alto;
    ctx.fillStyle = "#5a1424";
    ctx.fillRect(x + 8, by + 2, w - 16, alto - 5);
    // LED: alterna entre amarillo, rojo y blanco
    const colores = [COLOR.amarillo, COLOR.rojo, COLOR.blanco];
    ctx.fillStyle = colores[(i + parpadeo) % 3];
    ctx.fillRect(x + 13, by + 8, 6, 6);
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.fillRect(x + 26, by + 9, w - 46, 3);
  }
  // Borde de la boca del rack (lado del hueco)
  ctx.fillStyle = COLOR.amarillo;
  ctx.fillRect(x - 4, esTecho ? y + h - 8 : y, w + 8, 8);
}

function dibujarTorre(t) {
  dibujarRack(t.x, 0, ANCHO_TORRE, t.huecoY, true);
  const yAbajo = t.huecoY + HUECO;
  dibujarRack(t.x, yAbajo, ANCHO_TORRE, SUELO - yAbajo, false);
}

function dibujarLinea(l) {
  ctx.fillStyle = COLOR.blanco;
  ctx.fillRect(l.x, l.y, l.w, l.h);
  ctx.strokeStyle = COLOR.amarillo;
  ctx.lineWidth = 2;
  ctx.strokeRect(l.x, l.y, l.w, l.h);
  ctx.fillStyle = COLOR.bordo;
  ctx.font = "bold 14px Courier New";
  ctx.textAlign = "center";
  ctx.fillText("</>", l.x + l.w / 2, l.y + 16);
}

// Procesador volador: chip con hélice y pines
function dibujarChip() {
  ctx.save();
  ctx.translate(chip.x + chip.w / 2, chip.y + chip.h / 2);
  // Se inclina según la velocidad: sube = nariz arriba, cae = nariz abajo
  const giro = Math.max(-0.5, Math.min(0.9, chip.vy / 700));
  ctx.rotate(estado === ESTADO.GAME_OVER ? 0.9 : giro);
  const x = -chip.w / 2, y = -chip.h / 2, w = chip.w, h = chip.h;

  // Pines dorados a los costados
  ctx.fillStyle = COLOR.blanco;
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(x - 6, y + 4 + i * 7, 6, 3);
    ctx.fillRect(x + w, y + 4 + i * 7, 6, 3);
  }
  // Cuerpo del chip
  ctx.fillStyle = COLOR.amarillo;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = COLOR.bordo;
  ctx.fillRect(x + 5, y + 5, w - 10, h - 10);
  ctx.fillStyle = COLOR.amarillo;
  ctx.font = "bold 11px Courier New";
  ctx.textAlign = "center";
  ctx.fillText("CPU", x + w / 2, y + h / 2 + 4);
  // Marca de pin 1
  ctx.fillStyle = COLOR.rojo;
  ctx.fillRect(x + 2, y + 2, 4, 4);

  // Hélice giratoria
  const largo = 14 + Math.abs(Math.sin(performance.now() / 25)) * 14;
  ctx.fillStyle = COLOR.blanco;
  ctx.fillRect(x + w / 2 - 2, y - 8, 4, 8);
  ctx.fillStyle = COLOR.rojo;
  ctx.fillRect(x + w / 2 - largo, y - 11, largo * 2, 4);
  ctx.restore();
}

function dibujarHUD() {
  dibujarEscudo(10, 8, 44);

  // Puntaje grande en el centro (estilo Flappy)
  ctx.textAlign = "center";
  ctx.font = "bold 52px Courier New";
  ctx.fillStyle = COLOR.bordoOscuro;
  ctx.fillText(String(Math.floor(puntaje)), W / 2 + 3, 83);
  ctx.fillStyle = COLOR.blanco;
  ctx.fillText(String(Math.floor(puntaje)), W / 2, 80);

  ctx.textAlign = "right";
  ctx.font = "bold 16px Courier New";
  ctx.fillStyle = COLOR.amarillo;
  ctx.fillText("RÉCORD " + record, W - 12, 28);
}

function panelGameOver() {
  const px = 60, py = 190, pw = W - 120, ph = 250;
  ctx.fillStyle = "rgba(42, 7, 18, 0.93)";
  ctx.fillRect(px, py, pw, ph);
  ctx.strokeStyle = COLOR.amarillo;
  ctx.lineWidth = 4;
  ctx.strokeRect(px, py, pw, ph);

  ctx.textAlign = "center";
  ctx.fillStyle = COLOR.rojo;
  ctx.font = "bold 30px Courier New";
  ctx.fillText("SYSTEM FAILURE", W / 2, py + 50);

  ctx.fillStyle = COLOR.blanco;
  ctx.font = "18px Courier New";
  ctx.fillText("Puntaje: " + Math.floor(puntaje), W / 2, py + 100);
  ctx.fillStyle = COLOR.amarillo;
  ctx.fillText("Récord máximo: " + record, W / 2, py + 130);
  if (nuevoRecord) {
    ctx.fillStyle = COLOR.rojo;
    ctx.font = "bold 18px Courier New";
    ctx.fillText("¡NUEVO RÉCORD!", W / 2, py + 165);
  }
  if (Math.floor(performance.now() / 500) % 2 === 0) {
    ctx.fillStyle = COLOR.blanco;
    ctx.font = "15px Courier New";
    ctx.fillText("Espacio o toque para reiniciar", W / 2, py + 215);
  }
}

function dibujar() {
  dibujarFondo();

  if (estado === ESTADO.MENU) {
    dibujarEscudo(W / 2 - 46, 60, 110);
    ctx.textAlign = "center";
    ctx.fillStyle = COLOR.amarillo;
    ctx.font = "bold 42px Courier New";
    ctx.fillText("CHIP FLYER", W / 2, 230);
    ctx.fillStyle = COLOR.blanco;
    ctx.font = "15px Courier New";
    ctx.fillText("IPET 249 · Especialidad Informática", W / 2, 258);
    dibujarChip();
    if (Math.floor(performance.now() / 500) % 2 === 0) {
      ctx.fillStyle = COLOR.amarillo;
      ctx.font = "bold 17px Courier New";
      ctx.fillText("Presioná ESPACIO o tocá para volar", W / 2, 440);
    }
    ctx.fillStyle = COLOR.blanco;
    ctx.font = "13px Courier New";
    ctx.fillText("Pasá entre los servidores y juntá </> (+3)", W / 2, 480);
    ctx.fillStyle = COLOR.amarillo;
    ctx.fillText("Récord: " + record, W / 2, 520);
    return;
  }

  torres.forEach(dibujarTorre);
  lineas.forEach(dibujarLinea);
  dibujarChip();
  dibujarHUD();

  if (estado === ESTADO.GAME_OVER) panelGameOver();
}

// ---------- 7. GAME LOOP ----------
let ultimoTiempo = 0;
function bucle(ahora) {
  // dt = segundos desde el cuadro anterior (limitado para evitar saltos)
  const dt = Math.min((ahora - ultimoTiempo) / 1000, 0.05) || 0;
  ultimoTiempo = ahora;

  actualizar(dt);
  dibujar();
  requestAnimationFrame(bucle);
}
requestAnimationFrame(bucle);
