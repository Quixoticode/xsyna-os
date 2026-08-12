import { initNeuralBackground } from "./js/neural-bg.js";
import "./js/sw-register.js";
import "./js/api-assets.js";

initNeuralBackground("neural-canvas");

const $ = (id) => document.getElementById(id);
const gamesGrid = $("games-grid");

const games = [
  {
    id: "reflex",
    title: "Neural Reflex",
    desc: "Klicke die aktiven Zellen so schnell wie möglich. Reaktionsschärfe zählt.",
    render: renderReflexGame,
  },
  {
    id: "snake",
    title: "Synapse Snake",
    desc: "Klassisches Snake – füttere die Synapse, ohne die Wände zu berühren.",
    render: renderSnakeGame,
  },
  {
    id: "memory",
    title: "Cortex Memory",
    desc: "Finde passende Paare in einem neuronalen Kartenfeld.",
    render: renderMemoryGame,
  },
  {
    id: "breakout",
    title: "Spike Breakout",
    desc: "Zerstöre die Blöcke mit dem Spike-Ball.",
    render: renderBreakoutGame,
  },
  {
    id: "typing",
    title: "Neuron Typing",
    desc: "Tippe die Wörter so schnell wie möglich ab.",
    render: renderTypingGame,
  },
];

function renderGameList() {
  gamesGrid.innerHTML = games.map((g) => `
    <div class="card card-sm game-card" data-game="${g.id}" style="cursor: pointer; transition: transform 0.2s, border-color 0.2s;">
      <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 8px;">${g.title}</h3>
      <p style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 16px;">${g.desc}</p>
      <button class="btn btn-primary btn-sm">Spielen</button>
    </div>
  `).join("");

  gamesGrid.querySelectorAll(".game-card").forEach((card) => {
    card.addEventListener("click", () => {
      const game = games.find((g) => g.id === card.dataset.game);
      if (game) startGame(game);
    });
  });
}

function startGame(game) {
  gamesGrid.innerHTML = "";
  const back = document.createElement("button");
  back.textContent = "← Zurück zur Übersicht";
  back.className = "btn btn-secondary btn-sm";
  back.style.marginBottom = "16px";
  back.addEventListener("click", renderGameList);
  gamesGrid.appendChild(back);

  const container = document.createElement("div");
  container.className = "card";
  container.style.width = "100%";
  gamesGrid.appendChild(container);
  game.render(container);
}

function renderReflexGame(container) {
  container.innerHTML = `
    <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 8px;">Neural Reflex</h3>
    <p style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 16px;">Klicke so schnell wie möglich auf die aktiven Zellen.</p>
    <div id="reflex-grid" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 16px;"></div>
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <div style="font-family: var(--font-mono); font-size: 0.9rem;">Score: <span id="reflex-score" style="color: var(--cyan); font-weight: 700;">0</span></div>
      <button id="reflex-start" class="btn btn-primary btn-sm">Start</button>
    </div>
  `;
  const grid = $("reflex-grid");
  for (let i = 0; i < 16; i++) {
    const cell = document.createElement("button");
    cell.style.cssText = "height: 60px; border-radius: 8px; background: rgba(255,255,255,0.05); border: 1px solid var(--border); cursor: pointer; transition: all 0.2s;";
    cell.dataset.index = i;
    grid.appendChild(cell);
  }
  let score = 0, interval;
  $("reflex-start")?.addEventListener("click", () => {
    score = 0; $("reflex-score").textContent = score; clearInterval(interval);
    interval = setInterval(() => {
      Array.from(grid.children).forEach(c => { c.style.background = "rgba(255,255,255,0.05)"; c.style.borderColor = "var(--border)"; });
      const active = Math.floor(Math.random() * 16);
      grid.children[active].style.background = "var(--cyan)";
      grid.children[active].style.borderColor = "var(--cyan)";
    }, 800);
  });
  grid.addEventListener("click", (e) => {
    if (e.target.style.background === "var(--cyan)") { score += 10; $("reflex-score").textContent = score; e.target.style.background = "rgba(255,255,255,0.05)"; }
  });
}

function renderSnakeGame(container) {
  container.innerHTML = `
    <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 8px;">Synapse Snake</h3>
    <canvas id="snake-canvas" width="300" height="300" style="width: 100%; max-width: 400px; aspect-ratio: 1; background: rgba(0,0,0,0.3); border-radius: 8px; display: block; margin: 0 auto 16px;"></canvas>
    <div style="text-align: center;"><button id="snake-start" class="btn btn-primary btn-sm">Start</button></div>
  `;
  const canvas = $("snake-canvas");
  const ctx = canvas.getContext("2d");
  const grid = 15; const tileCount = 20;
  let snake, food, dx, dy, score, loop;
  function reset() {
    snake = [{ x: 10, y: 10 }]; food = { x: 15, y: 15 }; dx = 1; dy = 0; score = 0;
  }
  function draw() {
    ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "var(--cyan)";
    snake.forEach(s => ctx.fillRect(s.x * grid, s.y * grid, grid - 1, grid - 1));
    ctx.fillStyle = "var(--amber)"; ctx.fillRect(food.x * grid, food.y * grid, grid - 1, grid - 1);
  }
  function step() {
    const head = { x: snake[0].x + dx, y: snake[0].y + dy };
    if (head.x < 0 || head.x >= tileCount || head.y < 0 || head.y >= tileCount || snake.some(s => s.x === head.x && s.y === head.y)) {
      clearInterval(loop); alert("Game Over! Score: " + score); reset(); draw(); return;
    }
    snake.unshift(head);
    if (head.x === food.x && head.y === food.y) { food = { x: Math.floor(Math.random() * tileCount), y: Math.floor(Math.random() * tileCount) }; }
    else { snake.pop(); }
    draw();
  }
  reset(); draw();
  $("snake-start")?.addEventListener("click", () => { clearInterval(loop); reset(); loop = setInterval(step, 100); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp" && dy === 0) { dx = 0; dy = -1; }
    if (e.key === "ArrowDown" && dy === 0) { dx = 0; dy = 1; }
    if (e.key === "ArrowLeft" && dx === 0) { dx = -1; dy = 0; }
    if (e.key === "ArrowRight" && dx === 0) { dx = 1; dy = 0; }
  });
}

function renderMemoryGame(container) {
  container.innerHTML = `
    <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 8px;">Cortex Memory</h3>
    <div style="text-align: center; margin-bottom: 16px;">Züge: <span id="memory-moves" style="color: var(--cyan); font-weight: 700;">0</span></div>
    <div id="memory-grid" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; max-width: 400px; margin: 0 auto;"></div>
    <div style="text-align: center; margin-top: 16px;"><button id="memory-reset" class="btn btn-secondary btn-sm">Neustart</button></div>
  `;
  const icons = ["●", "■", "▲", "◆", "★", "♦", "♠", "♣"];
  let cards, flipped, matched, moves, lock;
  function init() {
    cards = [...icons, ...icons].sort(() => Math.random() - 0.5);
    flipped = []; matched = 0; moves = 0; lock = false;
    $("memory-moves").textContent = moves;
    const grid = $("memory-grid");
    grid.innerHTML = "";
    cards.forEach((icon, i) => {
      const card = document.createElement("button");
      card.style.cssText = "height: 80px; border-radius: 12px; background: rgba(255,255,255,0.05); border: 1px solid var(--border); cursor: pointer; font-size: 1.5rem; color: transparent; transition: all 0.3s;";
      card.dataset.index = i;
      card.dataset.icon = icon;
      card.textContent = icon;
      card.addEventListener("click", () => flip(card));
      grid.appendChild(card);
    });
  }
  function flip(card) {
    if (lock || card.classList.contains("matched") || card.style.color === "var(--cyan)") return;
    card.style.color = "var(--cyan)";
    flipped.push(card);
    if (flipped.length === 2) {
      lock = true; moves++; $("memory-moves").textContent = moves;
      if (flipped[0].dataset.icon === flipped[1].dataset.icon) {
        flipped.forEach(c => c.classList.add("matched")); matched += 2; flipped = []; lock = false;
        if (matched === cards.length) setTimeout(() => alert("Gewonnen! Züge: " + moves), 200);
      } else {
        setTimeout(() => { flipped.forEach(c => c.style.color = "transparent"); flipped = []; lock = false; }, 800);
      }
    }
  }
  init();
  $("memory-reset")?.addEventListener("click", init);
}

function renderBreakoutGame(container) {
  container.innerHTML = `
    <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 8px;">Spike Breakout</h3>
    <canvas id="breakout-canvas" width="400" height="300" style="width: 100%; max-width: 600px; background: rgba(0,0,0,0.3); border-radius: 8px; display: block; margin: 0 auto 16px;"></canvas>
    <div style="text-align: center;"><button id="breakout-start" class="btn btn-primary btn-sm">Start</button></div>
  `;
  const canvas = $("breakout-canvas");
  const ctx = canvas.getContext("2d");
  let ball, paddle, dx, dy, loop, rightPressed, leftPressed;
  const brickRowCount = 4; const brickColumnCount = 7; const brickWidth = 45; const brickHeight = 15;
  let bricks = [];
  function reset() {
    ball = { x: canvas.width / 2, y: canvas.height - 30, r: 6 };
    dx = 2; dy = -2; paddle = { x: (canvas.width - 80) / 2, width: 80, height: 10 };
    bricks = [];
    for (let c = 0; c < brickColumnCount; c++) for (let r = 0; r < brickRowCount; r++) bricks.push({ x: c * (brickWidth + 5) + 20, y: r * (brickHeight + 5) + 30, status: 1 });
  }
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "var(--cyan)"; bricks.forEach(b => { if (b.status) { ctx.fillRect(b.x, b.y, brickWidth, brickHeight); } });
    ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2); ctx.fillStyle = "var(--amber)"; ctx.fill(); ctx.closePath();
    ctx.fillStyle = "var(--cyan)"; ctx.fillRect(paddle.x, canvas.height - paddle.height - 5, paddle.width, paddle.height);
  }
  function update() {
    ball.x += dx; ball.y += dy;
    if (ball.x + dx > canvas.width - ball.r || ball.x + dx < ball.r) dx = -dx;
    if (ball.y + dy < ball.r) dy = -dy;
    else if (ball.y + dy > canvas.height - ball.r - 5 && ball.x > paddle.x && ball.x < paddle.x + paddle.width) dy = -dy;
    else if (ball.y + dy > canvas.height - ball.r) { clearInterval(loop); alert("Game Over"); reset(); draw(); }
    bricks.forEach(b => { if (b.status && ball.x > b.x && ball.x < b.x + brickWidth && ball.y > b.y && ball.y < b.y + brickHeight) { dy = -dy; b.status = 0; } });
    if (rightPressed && paddle.x < canvas.width - paddle.width) paddle.x += 5;
    if (leftPressed && paddle.x > 0) paddle.x -= 5;
    draw();
  }
  reset(); draw();
  $("breakout-start")?.addEventListener("click", () => { clearInterval(loop); reset(); loop = setInterval(update, 16); });
  document.addEventListener("keydown", (e) => { if (e.key === "ArrowRight") rightPressed = true; if (e.key === "ArrowLeft") leftPressed = true; });
  document.addEventListener("keyup", (e) => { if (e.key === "ArrowRight") rightPressed = false; if (e.key === "ArrowLeft") leftPressed = false; });
}

function renderTypingGame(container) {
  const words = ["synapse", "neuron", "spike", "cortex", "xSyna", "intelligence", "bio", "pulse", "liquid", "neural"];
  container.innerHTML = `
    <h3 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 8px;">Neuron Typing</h3>
    <p id="typing-word" style="font-size: 1.5rem; font-family: var(--font-mono); text-align: center; letter-spacing: 2px; margin: 24px 0;"></p>
    <input id="typing-input" type="text" class="input" placeholder="Tippe das Wort..." style="max-width: 300px; margin: 0 auto 16px; display: block;" autocomplete="off" />
    <div style="text-align: center;">Score: <span id="typing-score" style="color: var(--cyan); font-weight: 700;">0</span> | Zeit: <span id="typing-time" style="color: var(--amber); font-weight: 700;">60</span>s</div>
  `;
  let score = 0, time = 60, loop, current;
  function nextWord() { current = words[Math.floor(Math.random() * words.length)]; $("typing-word").textContent = current; }
  $("typing-input")?.addEventListener("input", (e) => {
    if (!loop) loop = setInterval(() => { time--; $("typing-time").textContent = time; if (time <= 0) { clearInterval(loop); alert("Zeit abgelaufen! Score: " + score); } }, 1000);
    if (e.target.value.trim() === current) { score++; $("typing-score").textContent = score; e.target.value = ""; nextWord(); }
  });
  nextWord();
}

renderGameList();
