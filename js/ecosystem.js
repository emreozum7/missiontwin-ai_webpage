(() => {
  const canvas = document.getElementById("ecosystem");
  if (!canvas) return;

  const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
  if (!ctx) return;
  const transitionCanvas = typeof document.createElement === "function" ? document.createElement("canvas") : null;
  const transitionContext = transitionCanvas && transitionCanvas.getContext("2d", { alpha: true });

  const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
  const isLowPower = (navigator.hardwareConcurrency || 4) <= 4;
  const sceneAnchors = {
    hero: [[.52, .16], [.96, .48], [.52, .85]],
    overview: [[.09, .45], [.91, .45], [.50, .80]],
    approach: [[.08, .58], [.50, .27], [.92, .58]],
    team: [[.08, .58], [.92, .58], [.50, .86]],
    reports: [[.08, .63], [.50, .20], [.92, .63]],
    closing: [[.42, .50], [.50, .44], [.58, .50]],
  };
  const taskLayouts = {
    hero: [[.29,.20],[.40,.43],[.63,.22],[.71,.55],[.39,.76],[.89,.65]],
    overview: [[.32,.23],[.68,.24],[.50,.48],[.31,.66],[.72,.69],[.87,.48]],
    approach: [[.50,.19],[.29,.62],[.50,.66],[.71,.62],[.20,.82],[.80,.82]],
    team: [[.33,.26],[.66,.26],[.50,.61],[.28,.70],[.72,.70],[.50,.88]],
    reports: [[.28,.62],[.42,.62],[.56,.62],[.70,.62],[.35,.78],[.65,.78]],
    closing: [[.38,.44],[.50,.34],[.62,.44],[.40,.60],[.60,.60],[.50,.70]],
  };
  const taskState = { free: 0, sensed: 1, assigned: 2, transferring: 3, complete: 4 };
  const scenePalettes = {
    hero: ["#9de2cf", "#d3ef79", "#e7b281"],
    overview: ["#9de2cf", "#d3ef79", "#e7b281"],
    approach: ["#9de2cf", "#d3ef79", "#e7b281"],
    team: ["#9de2cf", "#d3ef79", "#e7b281"],
    reports: ["#9de2cf", "#d3ef79", "#e7b281"],
    closing: ["#9de2cf", "#d3ef79", "#e7b281"],
  };
  const sceneLinks = {
    hero: [[0, 1], [1, 2]],
    overview: [[0, 1], [1, 2], [2, 0]],
    approach: [[0, 1], [1, 2], [2, 0]],
    team: [[0, 1], [1, 2], [2, 0]],
    reports: [[0, 2], [1, 0], [1, 2]],
    closing: [[0, 1], [1, 2]],
  };

  const toRgb = (hex) => {
    const value = Number.parseInt(hex.slice(1), 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  };
  const mixRgb = (from, to, amount) => from.map((value, index) => value + (to[index] - value) * amount);
  const colorCache = new Map();
  function rgba(color, alpha) {
    const r = Math.round(color[0]), g = Math.round(color[1]), b = Math.round(color[2]);
    const opacity = clamp(Math.round(alpha * 200), 0, 200);
    const key = r + "," + g + "," + b + "," + opacity;
    if (!colorCache.has(key)) {
      if (colorCache.size > 1200) colorCache.clear();
      colorCache.set(key, "rgba(" + r + "," + g + "," + b + "," + (opacity / 200) + ")");
    }
    return colorCache.get(key);
  }
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  let width = 0;
  let height = 0;
  let pixelRatio = 1;
  let particles = [];
  let tasks = [];
  let agents = [];
  let scene = "hero";
  let paletteFrom = scenePalettes.hero.map(toRgb);
  let paletteTo = scenePalettes.hero.map(toRgb);
  let paletteMix = 1;
  let lastFrame = 0;
  let rafId = 0;
  let running = false;
  let sceneFrame = 0;
  let sceneElapsed = 0;
  let transitionFade = 0;
  let textRects = [];
  let qualityScale = 1;
  let averageRenderMs = 0;
  let averageFrameDelta = 16.67;
  let slowFrameCount = 0;
  let fastFrameCount = 0;
  let qualityCheckFrames = 0;
  let lastTrailTime = 0;
  const pointer = { x: -1000, y: -1000, active: false };

  function paletteAtCurrentBlend() {
    const amount = paletteMix * paletteMix * (3 - 2 * paletteMix);
    return paletteFrom.map((color, index) => mixRgb(color, paletteTo[index], amount));
  }

  function targetFor(index) {
    const anchors = sceneAnchors[scene] || sceneAnchors.hero;
    return { x: anchors[index][0] * width, y: anchors[index][1] * height };
  }

  function measureTextRects() {
    textRects = [];
    const selector = '.site-header, [data-scene="' + scene + '"] h1, [data-scene="' + scene + '"] h2, [data-scene="' + scene + '"] h3, [data-scene="' + scene + '"] p, [data-scene="' + scene + '"] li, .hero-actions, .hero-meta, .visual-topline, .visual-caption, .model-stack';
    for (const element of document.querySelectorAll(selector)) {
      const rect = element.getBoundingClientRect();
      if (rect.width && rect.height && rect.bottom > -30 && rect.top < height + 30) textRects.push(rect);
    }
  }

  function contentVisibility(x, y) {
    let opacity = 1;
    for (const rect of textRects) {
      const dx = Math.max(rect.left - x, 0, x - rect.right);
      const dy = Math.max(rect.top - y, 0, y - rect.bottom);
      const distance = Math.hypot(dx, dy);
      if (distance < 2) opacity = Math.min(opacity, .24);
      else if (distance < 26) opacity = Math.min(opacity, .24 + distance / 26 * .42);
    }
    return opacity;
  }

  function setScene(nextScene) {
    if (!sceneAnchors[nextScene] || nextScene === scene) return;
    if (transitionContext && !motionPreference.matches && !document.hidden) {
      transitionCanvas.width = canvas.width;
      transitionCanvas.height = canvas.height;
      transitionContext.drawImage(canvas, 0, 0);
      transitionFade = .72;
    } else transitionFade = 0;
    paletteFrom = paletteAtCurrentBlend();
    paletteTo = scenePalettes[nextScene].map(toRgb);
    paletteMix = 0;
    scene = nextScene;
    sceneElapsed = 0;
    agents.forEach((agent, index) => {
      const target = targetFor(index);
      agent.homeX = target.x;
      agent.homeY = target.y;
      agent.targetX = target.x;
      agent.targetY = target.y;
      agent.failed = false;
      agent.energy = .68;
      if (motionPreference.matches) {
        agent.x = target.x;
        agent.y = target.y;
      }
    });
    tasks.forEach((task, index) => {
      task.targetX = taskLayouts[scene][index][0] * width;
      task.targetY = taskLayouts[scene][index][1] * height;
      task.state = taskState.free;
      task.owner = -1;
      task.recipient = -1;
      task.progress = 0;
    });
    measureTextRects();
    if (motionPreference.matches) {
      paletteMix = 1;
      drawStaticFrame();
    }
  }

  function resize() {
    transitionFade = 0;
    const oldWidth = width || window.innerWidth;
    const oldHeight = height || window.innerHeight;
    width = window.innerWidth;
    height = window.innerHeight;
    const area = Math.max(width * height, 1);
    pixelRatio = Math.min((window.devicePixelRatio || 1) * Math.max(.82, qualityScale), 1.3, Math.sqrt(2_500_000 / area));
    canvas.width = Math.max(1, Math.round(width * pixelRatio));
    canvas.height = Math.max(1, Math.round(height * pixelRatio));
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    const mobile = width < 760;
    const minParticles = mobile ? 22 : 34;
    const maxParticles = mobile ? 38 : 76;
    const powerAdjustedCount = Math.floor((area / 20000) * (isLowPower ? .74 : 1) * qualityScale);
    const particleCount = clamp(powerAdjustedCount, minParticles, maxParticles);

    while (particles.length < particleCount) {
      const depth = Math.random();
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - .5) * (.007 + depth * .019),
        vy: (Math.random() - .5) * (.006 + depth * .016),
        phase: Math.random() * Math.PI * 2,
        depth,
        radius: .35 + depth * 1.25,
        alpha: .06 + depth * .2,
        colorIndex: Math.floor(Math.random() * 3),
        interactive: Math.random() > .62,
      });
    }
    particles.length = particleCount;

    if (!tasks.length) {
      tasks = taskLayouts[scene].map((point, index) => ({
        x: point[0] * width, y: point[1] * height,
        targetX: point[0] * width, targetY: point[1] * height,
        state: taskState.free, owner: -1, recipient: -1, progress: 0,
        phase: index * 1.7, pulse: 0,
      }));
    } else {
      tasks.forEach((task, index) => {
        task.x *= width / oldWidth;
        task.y *= height / oldHeight;
        task.targetX = taskLayouts[scene][index][0] * width;
        task.targetY = taskLayouts[scene][index][1] * height;
      });
    }

    if (!agents.length) {
      agents = [0, 1, 2].map((index) => {
        const target = targetFor(index);
        return {
          x: target.x, y: target.y, homeX: target.x, homeY: target.y,
          targetX: target.x, targetY: target.y,
          vx: 0, vy: 0, heading: -Math.PI / 2, energy: .7, failed: false,
          flash: 0, mode: 0, phase: index * 2.1,
          trailX: new Float32Array(8), trailY: new Float32Array(8), trailAge: new Float32Array(8),
          trailCount: 0, trailIndex: 0,
        };
      });
    } else {
      agents.forEach((agent, index) => {
        const target = targetFor(index);
        agent.homeX = target.x;
        agent.homeY = target.y;
        agent.targetX = target.x;
        agent.targetY = target.y;
        if (motionPreference.matches) {
          agent.x = target.x;
          agent.y = target.y;
        }
      });
    }

    measureTextRects();
    if (motionPreference.matches) drawStaticFrame();
  }

  function updateSceneFromScroll() {
    sceneFrame = 0;
    const center = window.innerHeight * .5;
    let selected = null;
    let selectedArea = Infinity;

    for (const zone of document.querySelectorAll("[data-scene]")) {
      const rect = zone.getBoundingClientRect();
      if (rect.top <= center && rect.bottom >= center) {
        const area = Math.max(rect.height, 1);
        if (area < selectedArea) {
          selected = zone;
          selectedArea = area;
        }
      }
    }

    if (selected) setScene(selected.dataset.scene);
    measureTextRects();
  }

  function scheduleSceneUpdate() {
    if (sceneFrame) return;
    sceneFrame = window.requestAnimationFrame(updateSceneFromScroll);
  }

  function setTask(index, state, owner, recipient, progress) {
    const task = tasks[index];
    task.state = state;
    task.owner = owner;
    task.recipient = recipient;
    task.progress = progress || 0;
  }

  function updateScenario(delta) {
    sceneElapsed += Math.min(delta, 40) / 1000;
    for (const agent of agents) {
      agent.failed = false;
      agent.energy = .62;
      agent.mode = 0;
      agent.targetX = agent.homeX;
      agent.targetY = agent.homeY;
      agent.flash = Math.max(0, agent.flash - .025);
    }
    for (const task of tasks) {
      task.state = taskState.free;
      task.owner = task.recipient = -1;
      task.progress = 0;
      task.pulse = Math.max(0, task.pulse - .025);
    }
    const t = sceneElapsed;

    if (scene === "hero") {
      const phase = t % 12, cycle = Math.floor(t / 12), index = cycle % tasks.length;
      const owner = cycle % 3, receiver = (owner + 1) % 3, task = tasks[index];
      for (let i = 0; i < Math.min(cycle, tasks.length); i++) setTask(i, taskState.complete, i % 3, -1, 0);
      if (phase < 2) {
        setTask(index, taskState.sensed, owner, -1, 0);
        agents[owner].targetX = task.x - 24; agents[owner].targetY = task.y - 12;
        agents[owner].mode = 1; agents[owner].flash = Math.max(agents[owner].flash, .35);
      } else if (phase < 4.5) {
        setTask(index, taskState.assigned, owner, -1, 0);
        agents[owner].targetX = task.x - 22; agents[owner].targetY = task.y - 10;
        agents[owner].mode = 2; agents[owner].energy = .94;
      } else if (phase < 7.2) {
        const progress = (phase - 4.5) / 2.7;
        setTask(index, taskState.transferring, owner, receiver, progress);
        agents[owner].mode = 2; agents[receiver].mode = 1;
        if (progress > .86) agents[receiver].flash = Math.max(agents[receiver].flash, .2);
      } else if (phase < 10) {
        setTask(index, taskState.complete, receiver, -1, 0);
        agents[receiver].energy = .86; agents[receiver].flash = Math.max(agents[receiver].flash, .08);
      }
    } else if (scene === "overview") {
      const phase = t % 22, failed = agents[2];
      failed.failed = phase >= 4 && phase < 17;
      failed.energy = failed.failed ? .06 : phase >= 17 ? .64 : .86;
      if (failed.failed) { failed.targetX = failed.x; failed.targetY = failed.y; }
      if (phase < 4) {
        setTask(0, taskState.assigned, 2, -1, 0); setTask(1, taskState.assigned, 2, -1, 0);
        agents[2].mode = 2; agents[2].targetX = tasks[0].x - 16; agents[2].targetY = tasks[0].y - 12;
      } else if (phase < 8) {
        setTask(0, phase < 6 ? taskState.assigned : taskState.transferring, 2, 0, (phase - 6) / 2);
        setTask(1, taskState.assigned, 2, -1, 0);
        agents[0].mode = 2; agents[1].mode = 1;
      } else if (phase < 10) {
        setTask(0, taskState.assigned, 0, -1, 0); setTask(1, taskState.transferring, 2, 1, (phase - 8) / 2);
        agents[0].mode = 2; agents[1].mode = 1;
        if (phase > 9.7) agents[1].flash = Math.max(agents[1].flash, .22);
      } else if (phase < 17) {
        setTask(0, taskState.complete, 0, -1, 0); setTask(1, taskState.complete, 1, -1, 0);
        agents[0].targetX = width * .5 - 25; agents[1].targetX = width * .5 + 25;
        agents[0].targetY = agents[1].targetY = height * .49;
        agents[0].mode = agents[1].mode = 2;
      } else if (phase < 18) {
        failed.failed = false; failed.energy = .64; failed.flash = Math.max(failed.flash, .1);
        setTask(0, taskState.complete, 0, -1, 0); setTask(1, taskState.complete, 1, -1, 0);
      } else {
        setTask(0, taskState.assigned, 2, -1, 0); setTask(1, taskState.assigned, 2, -1, 0);
      }
    } else if (scene === "approach") {
      const phase = t % 17, stage = phase < 4 ? 0 : phase < 9 ? 1 : phase < 13.5 ? 2 : 3;
      setTask(0, taskState.sensed, 1, -1, 0);
      for (let i = 0; i < 3; i++) {
        setTask(i + 1, taskState.assigned, i, -1, 0);
        if (stage === 1) {
          agents[i].targetX = tasks[i + 1].x; agents[i].targetY = tasks[i + 1].y - 14;
          agents[i].mode = 2; agents[i].energy = .9;
        } else if (stage === 2) { agents[i].mode = 2; agents[i].energy = .84; }
      }
      if (stage === 2) {
        const from = Math.floor((phase - 9) / 1.5) % 3, to = (from + 1) % 3;
        const progress = ((phase - 9) % 1.5) / 1.5;
        setTask(from + 1, taskState.transferring, from, to, progress);
        if (progress > .86) agents[to].flash = Math.max(agents[to].flash, .16);
      } else if (stage === 3) {
        for (let i = 1; i <= 3; i++) setTask(i, taskState.complete, i - 1, -1, 0);
      }
    } else if (scene === "team") {
      for (let i = 0; i < 3; i++) { setTask(i, taskState.assigned, i, -1, 0); agents[i].mode = 1; }
      const phase = t % 9;
      if (phase > 6) {
        const from = Math.floor(t / 9) % 3, to = (from + 1) % 3, progress = (phase - 6) / 3;
        setTask(from, taskState.transferring, from, to, progress);
        if (progress > .88) agents[to].flash = Math.max(agents[to].flash, .12);
      }
      for (let i = 3; i < tasks.length; i++) setTask(i, taskState.complete, (i - 3) % 3, -1, 0);
    } else if (scene === "reports") {
      for (let i = 0; i < tasks.length; i++) setTask(i, taskState.complete, i % 3, -1, 0);
      const newest = Math.floor(t / 1.4) % tasks.length;
      tasks[newest].pulse = Math.max(tasks[newest].pulse, .18 + .1 * Math.sin(t * 2));
    } else {
      for (let i = 0; i < tasks.length; i++) setTask(i, i < 5 ? taskState.complete : taskState.free, i % 3, -1, 0);
      agents.forEach((agent, i) => { agent.energy = .55 + .08 * Math.sin(t * .4 + i); });
    }

    const ease = 1 - Math.exp(-Math.min(delta, 40) / 900);
    for (const task of tasks) {
      task.x += (task.targetX - task.x) * ease;
      task.y += (task.targetY - task.y) * ease;
    }
  }

  function drawTasks(time, colors) {
    for (const task of tasks) {
      const color = colors[task.owner >= 0 ? task.owner : task.phase % 3 | 0];
      const visibility = contentVisibility(task.x, task.y);
      const pulse = .5 + .5 * Math.sin(time * .0012 + task.phase);
      const radius = task.state === taskState.complete ? 2.1 : task.state === taskState.assigned ? 4 : task.state === taskState.sensed ? 4.7 : 3;
      if (task.state === taskState.transferring && task.owner >= 0 && task.recipient >= 0) {
        const from = agents[task.owner], to = agents[task.recipient];
        ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y);
        ctx.strokeStyle = rgba(colors[task.owner], .13 * visibility); ctx.lineWidth = 1; ctx.stroke();
        drawPacket(from.x, from.y, to.x, to.y, task.progress, colors[task.owner], .9);
      }
      ctx.save(); ctx.globalAlpha = visibility;
      if (task.state === taskState.sensed || task.state === taskState.assigned) {
        ctx.beginPath(); ctx.arc(task.x, task.y, radius + 5 + pulse * 3, 0, Math.PI * 2);
        ctx.strokeStyle = rgba(color, (task.state === taskState.sensed ? .27 : .16) * visibility);
        ctx.lineWidth = .7; ctx.stroke();
      }
      ctx.translate(task.x, task.y);
      ctx.rotate(time * .00008 + task.phase);
      ctx.beginPath();
      if (task.state === taskState.complete) {
        ctx.moveTo(0, -radius); ctx.lineTo(radius, 0); ctx.lineTo(0, radius); ctx.lineTo(-radius, 0);
      } else ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.closePath();
      ctx.fillStyle = rgba(color, task.state === taskState.free ? .23 : .7 + pulse * .18);
      ctx.strokeStyle = rgba(color, .78); ctx.lineWidth = .85; ctx.fill(); ctx.stroke();
      ctx.restore();
      if (task.pulse > .02) {
        ctx.beginPath(); ctx.arc(task.x, task.y, 7 + (1 - task.pulse) * 13, 0, Math.PI * 2);
        ctx.strokeStyle = rgba(color, task.pulse * visibility); ctx.lineWidth = .8; ctx.stroke();
      }
      if (pointer.active && task.state === taskState.free && Math.hypot(pointer.x - task.x, pointer.y - task.y) < 90) {
        ctx.beginPath(); ctx.arc(task.x, task.y, 11 + pulse * 3, 0, Math.PI * 2);
        ctx.strokeStyle = rgba(color, .16 * visibility); ctx.lineWidth = .7; ctx.stroke();
      }
    }
  }

  function drawConnections(time, colors) {
    const links = sceneLinks[scene] || sceneLinks.hero;
    ctx.lineWidth = 1;
    ctx.setLineDash([]);

    if (scene === "overview") {
      const objective = { x: width * .5, y: height * .48 };
      const pulse = .5 + Math.sin(time * .0011) * .5;
      ctx.beginPath();
      ctx.arc(objective.x, objective.y, 13 + pulse * 3, 0, Math.PI * 2);
      ctx.strokeStyle = rgba(colors[1], .12 + pulse * .08);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(objective.x, objective.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = rgba(colors[1], .4 + pulse * .25);
      ctx.fill();

      for (let index = 0; index < agents.length; index++) {
        const agent = agents[index];
        ctx.beginPath();
        ctx.moveTo(agent.x, agent.y);
        ctx.lineTo(objective.x, objective.y);
        ctx.strokeStyle = rgba(colors[index], .10);
        ctx.stroke();
        if (!agent.failed) {
          const progress = (time * .00011 + index / 3) % 1;
          drawPacket(agent.x, agent.y, objective.x, objective.y, progress, colors[index], .5);
        }
      }
      return;
    }

    if (scene === "approach") {
      const source = tasks[0];
      for (let index = 1; index <= 3; index++) {
        const task = tasks[index];
        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.quadraticCurveTo(width * (.26 + index * .12), height * .4, task.x, task.y);
        ctx.strokeStyle = rgba(colors[index - 1], .12);
        ctx.stroke();
        const progress = (time * .00009 + index * .2) % 1;
        drawPacket(source.x, source.y, task.x, task.y, progress, colors[index - 1], .42);
      }
      return;
    }

    for (let index = 0; index < links.length; index++) {
      const [fromIndex, toIndex] = links[index];
      const from = agents[fromIndex];
      const to = agents[toIndex];
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.strokeStyle = rgba(colors[fromIndex], scene === "approach" ? .19 : .11);
      ctx.stroke();

      const pace = scene === "approach" ? .0002 : scene === "team" ? .00013 : .0001;
      const progress = (time * pace + index * .31) % 1;
      drawPacket(from.x, from.y, to.x, to.y, progress, colors[fromIndex], scene === "approach" ? .9 : .65);
      if (scene === "team") drawPacket(from.x, from.y, to.x, to.y, (progress + .5) % 1, colors[toIndex], .5);
    }

    if (scene === "reports") drawArchiveLattice(time, colors[1]);
  }

  function drawPacket(x1, y1, x2, y2, progress, color, alpha) {
    const x = x1 + (x2 - x1) * progress;
    const y = y1 + (y2 - y1) * progress;
    alpha *= contentVisibility(x, y);
    ctx.beginPath();
    ctx.arc(x, y, 1.8, 0, Math.PI * 2);
    ctx.fillStyle = rgba(color, alpha);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = rgba(color, alpha * .1);
    ctx.fill();
  }

  function drawArchiveLattice(time, color) {
    const anchorX = width * .5;
    const anchorY = height * .60;
    ctx.lineWidth = .7;
    for (let row = 0; row < 4; row++) {
      const y = anchorY + row * 12;
      const rowWidth = 34 + ((row * 17) % 31);
      ctx.beginPath();
      ctx.moveTo(anchorX - rowWidth, y);
      ctx.lineTo(anchorX + rowWidth, y);
      ctx.strokeStyle = rgba(color, .08);
      ctx.stroke();
      const progress = (time * .00015 + row * .23) % 1;
      drawPacket(anchorX - rowWidth, y, anchorX + rowWidth, y, progress, color, .55);
    }
  }

  function updateAgents(delta, time) {
    const dt = Math.min(delta, 40) / 1000;
    agents.forEach((agent) => {
      agent.flash = Math.max(0, agent.flash - dt * 1.1);
      if (agent.failed) {
        agent.vx *= .68;
        agent.vy *= .68;
        return;
      }
      const wander = scene === "hero" ? 7 : scene === "team" ? 3 : 0;
      const targetX = agent.targetX + Math.sin(time * .00028 + agent.phase) * wander;
      const targetY = agent.targetY + Math.cos(time * .00024 + agent.phase) * wander;
      agent.vx += ((targetX - agent.x) * 1.1 - agent.vx * 1.7) * dt;
      agent.vy += ((targetY - agent.y) * 1.1 - agent.vy * 1.7) * dt;
      const speed = Math.hypot(agent.vx, agent.vy);
      if (speed > 30) { agent.vx *= 30 / speed; agent.vy *= 30 / speed; }
      agent.x += agent.vx * dt;
      agent.y += agent.vy * dt;
      if (speed > 1) agent.heading = Math.atan2(agent.vy, agent.vx);
    });

    if (time - lastTrailTime > 90) {
      lastTrailTime = time;
      agents.forEach((agent) => {
        const index = agent.trailIndex;
        agent.trailX[index] = agent.x;
        agent.trailY[index] = agent.y;
        agent.trailAge[index] = 0;
        agent.trailIndex = (index + 1) % agent.trailX.length;
        agent.trailCount = Math.min(agent.trailCount + 1, agent.trailX.length);
      });
    }
    agents.forEach((agent) => {
      for (let index = 0; index < agent.trailCount; index++) agent.trailAge[index] += dt;
    });
    const follow = 1 - Math.exp(-dt * 1.2);
    tasks.forEach((task) => {
      task.x += (task.targetX - task.x) * follow;
      task.y += (task.targetY - task.y) * follow;
      task.pulse = Math.max(0, task.pulse - dt * .65);
    });
  }

  function updateParticles(delta, time, colors) {
    const normalizedDelta = Math.min(delta, 36);
    for (const particle of particles) {
      particle.x += particle.vx * normalizedDelta + Math.sin(time * .00024 + particle.phase) * .035;
      particle.y += particle.vy * normalizedDelta + Math.cos(time * .00019 + particle.phase) * .03;

      if (pointer.active && particle.interactive) {
        const dx = pointer.x - particle.x;
        const dy = pointer.y - particle.y;
        const distance = Math.hypot(dx, dy);
        if (distance < 130 && distance > 1) {
          const influence = 1 - distance / 130;
          particle.vx += dx * .000002 * influence * normalizedDelta;
          particle.vy += dy * .000002 * influence * normalizedDelta;
        }
      }

      particle.vx = clamp(particle.vx, -.03, .03);
      particle.vy = clamp(particle.vy, -.03, .03);

      if (particle.x < -5) particle.x = width + 5;
      if (particle.x > width + 5) particle.x = -5;
      if (particle.y < -5) particle.y = height + 5;
      if (particle.y > height + 5) particle.y = -5;

      const shimmer = .72 + Math.sin(time * .001 + particle.phase) * .28;
      const color = colors[particle.colorIndex];
      const radius = particle.radius + (particle.interactive ? .15 : 0);
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, radius, 0, Math.PI * 2);
      const mask = contentVisibility(particle.x, particle.y);
      ctx.fillStyle = rgba(color, particle.alpha * shimmer * mask);
      ctx.fill();

      if (particle.interactive && (scene === "approach" || scene === "overview")) {
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, radius + 2.2, 0, Math.PI * 2);
        ctx.fillStyle = rgba(color, particle.alpha * shimmer * .1);
        ctx.fill();
      }
    }
  }

  function drawAgentTrail(agent, color) {
    if (agent.trailCount < 2 || agent.failed) return;
    let previous = -1;
    for (let step = 0; step < agent.trailCount; step++) {
      const index = (agent.trailIndex - agent.trailCount + step + agent.trailX.length) % agent.trailX.length;
      if (agent.trailAge[index] > 1.1) continue;
      if (previous >= 0) {
        const alpha = (1 - agent.trailAge[index] / 1.1) * .18 * contentVisibility(agent.trailX[index], agent.trailY[index]);
        ctx.beginPath();
        ctx.moveTo(agent.trailX[previous], agent.trailY[previous]);
        ctx.lineTo(agent.trailX[index], agent.trailY[index]);
        ctx.strokeStyle = rgba(color, alpha);
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      previous = index;
    }
  }

  function drawAgent(agent, index, color, time) {
    const visibility = contentVisibility(agent.x, agent.y);
    const breathing = .5 + Math.sin(time * .001 + agent.phase) * .5;
    const distance = Math.hypot(pointer.x - agent.x, pointer.y - agent.y);
    const engaged = pointer.active && distance < 100;
    const energy = agent.failed ? .08 : agent.energy;
    const radius = engaged ? 9.5 : 7.5;
    const glowRadius = agent.failed ? 28 : engaged ? 91 : 62;
    const glow = ctx.createRadialGradient(agent.x, agent.y, 1, agent.x, agent.y, glowRadius);
    glow.addColorStop(0, rgba(color, visibility * (agent.failed ? .035 : .12 + energy * .06 + agent.flash * .12)));
    glow.addColorStop(.4, rgba(color, visibility * .045));
    glow.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(agent.x, agent.y, glowRadius, 0, Math.PI * 2); ctx.fill();
    drawAgentTrail(agent, color);

    ctx.save();
    ctx.translate(agent.x, agent.y);
    ctx.rotate(agent.heading || -Math.PI / 2);
    ctx.globalAlpha = visibility;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 22 + breathing * 2, -.48, .48);
    ctx.closePath();
    ctx.fillStyle = rgba(color, agent.failed ? .008 : .035 + energy * .018);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, 13 + breathing * 2, -.46, .46);
    ctx.strokeStyle = rgba(color, agent.failed ? .06 : .12 + energy * .06);
    ctx.lineWidth = .7;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-4,-3); ctx.lineTo(-10,-7); ctx.lineTo(-8,-1); ctx.lineTo(-4,-1);
    ctx.moveTo(-4,3); ctx.lineTo(-10,7); ctx.lineTo(-8,1); ctx.lineTo(-4,1);
    ctx.strokeStyle = rgba(color, agent.failed ? .18 : .52 + breathing * .2);
    ctx.lineWidth = .9;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-7,-3); ctx.lineTo(-2,-6); ctx.lineTo(4,-5); ctx.lineTo(8,0);
    ctx.lineTo(4,5); ctx.lineTo(-2,6); ctx.lineTo(-7,3); ctx.closePath();
    ctx.fillStyle = rgba(color, agent.failed ? .08 : .2 + energy * .18);
    ctx.strokeStyle = rgba(color, agent.failed ? .2 : .72 + breathing * .2);
    ctx.lineWidth = 1;
    ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(7,-2); ctx.lineTo(11,0); ctx.lineTo(7,2); ctx.closePath();
    ctx.fillStyle = rgba(color, agent.failed ? .12 : .82); ctx.fill();
    ctx.beginPath(); ctx.arc(0,0,agent.failed ? 1.5 : 1.8 + breathing * .4,0,Math.PI * 2);
    ctx.fillStyle = rgba(color, agent.failed ? .24 : .96); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-1,-6); ctx.lineTo(-1,-9);
    ctx.strokeStyle = rgba(color, agent.failed ? .14 : .45); ctx.lineWidth = .7; ctx.stroke();
    ctx.restore();

    ctx.font = "600 7px Aptos, Segoe UI, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = rgba(color, visibility * (agent.failed ? .3 : engaged ? .9 : .64));
    ctx.fillText("A" + (index + 1), agent.x + 12, agent.y + 11);
    if (agent.flash > .03 && !agent.failed) {
      ctx.beginPath(); ctx.arc(agent.x, agent.y, 15 + (1 - agent.flash) * 11, 0, Math.PI * 2);
      ctx.strokeStyle = rgba(color, agent.flash * .4 * visibility); ctx.lineWidth = .9; ctx.stroke();
    }
  }

  function drawFrame(time, delta) {
    if (!width || !height) return;
    ctx.clearRect(0, 0, width, height);
    if (transitionContext && transitionFade > 0) {
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = Math.min(.42, transitionFade / .72 * .42);
      ctx.drawImage(transitionCanvas, 0, 0, width, height);
      ctx.globalAlpha = 1;
      transitionFade = Math.max(0, transitionFade - Math.min(delta, 40) / 1000);
    }
    ctx.globalCompositeOperation = "lighter";

    if (paletteMix < 1) paletteMix = Math.min(1, paletteMix + Math.min(delta, 40) / 820);
    const ease = paletteMix * paletteMix * (3 - 2 * paletteMix);
    const colors = paletteTo;

    updateScenario(delta);
    updateParticles(delta, time, colors);
    updateAgents(delta, time);
    drawTasks(time, colors);
    drawConnections(time, colors);
    agents.forEach((agent, index) => drawAgent(agent, index, colors[index], time));

    ctx.globalCompositeOperation = "source-over";
  }

  function drawStaticFrame() {
    if (!width || !height || !agents.length || !tasks.length) return;
    sceneElapsed = scene === "overview" ? 9.2 : scene === "approach" ? 10.5 : 5.4;
    agents.forEach((agent) => {
      agent.x = agent.targetX;
      agent.y = agent.targetY;
      agent.vx = agent.vy = 0;
    });
    tasks.forEach((task) => {
      task.x = task.targetX;
      task.y = task.targetY;
    });
    drawFrame(0, 0);
  }

  function loop(time) {
    if (!running) return;
    if (document.hidden) {
      stop();
      return;
    }
    const frameDelta = lastFrame ? time - lastFrame : 1000 / 60;
    const delta = Math.min(frameDelta, 50);
    lastFrame = time;
    averageFrameDelta = averageFrameDelta * .92 + frameDelta * .08;
    const startedAt = performance.now();
    drawFrame(time, delta);
    const duration = performance.now() - startedAt;
    averageRenderMs = averageRenderMs ? averageRenderMs * .92 + duration * .08 : duration;
    qualityCheckFrames++;
    if (averageRenderMs > 8 || averageFrameDelta > 21) { slowFrameCount++; fastFrameCount = 0; }
    else if (averageRenderMs < 3.5 && averageFrameDelta < 19) { fastFrameCount++; slowFrameCount = 0; }
    else { slowFrameCount = Math.max(0, slowFrameCount - 1); fastFrameCount = Math.max(0, fastFrameCount - 1); }
    if (qualityCheckFrames > 90) {
      qualityCheckFrames = 0;
      if (slowFrameCount > 50 && qualityScale > .6) {
        qualityScale = Math.max(.6, qualityScale - .12);
        resize();
        slowFrameCount = 0;
      } else if (fastFrameCount > 150 && qualityScale < 1) {
        qualityScale = Math.min(1, qualityScale + .08);
        resize();
        fastFrameCount = 0;
      }
    }
    rafId = window.requestAnimationFrame(loop);
  }

  function start() {
    if (running || motionPreference.matches || document.hidden) return;
    running = true;
    lastFrame = 0;
    rafId = window.requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    if (rafId) window.cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function syncMotionPreference() {
    stop();
    if (motionPreference.matches || document.hidden) {
      transitionFade = 0;
      drawStaticFrame();
    }
    else start();
  }

  window.addEventListener("pointermove", (event) => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.active = true;
  }, { passive: true });
  window.addEventListener("pointerout", (event) => {
    if (!event.relatedTarget) pointer.active = false;
  }, { passive: true });
  window.addEventListener("pointerup", (event) => {
    if (event.pointerType !== "mouse") pointer.active = false;
  }, { passive: true });
  window.addEventListener("scroll", scheduleSceneUpdate, { passive: true });
  window.addEventListener("resize", () => {
    resize();
    scheduleSceneUpdate();
  }, { passive: true });
  document.addEventListener("visibilitychange", syncMotionPreference);
  if (motionPreference.addEventListener) motionPreference.addEventListener("change", syncMotionPreference);
  else motionPreference.addListener?.(syncMotionPreference);

  resize();
  updateSceneFromScroll();
  syncMotionPreference();
})();
