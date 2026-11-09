(function () {
  "use strict";

  var defaults = {
    type: "first", K: 1.8, tau: 2.4, zeta: 0.45, wn: 2.1,
    signal: "step", dt: 0.1, noise: 2, duration: 20,
    na: 1, nb: 1, nk: 1
  };
  var state = Object.assign({}, defaults, {
    step: 1, previewKind: "input", data: null, result: null,
    showMeasured: true, showPredicted: true, runCount: 0
  });
  var color = { green: "#287657", blue: "#6389ae", orange: "#c67c4b", grid: "#e4ebe5", text: "#76877a" };
  var toastTimer;

  function el(id) { return document.getElementById(id); }
  function all(selector) { return Array.prototype.slice.call(document.querySelectorAll(selector)); }
  function toast(message) {
    var box = el("toast");
    box.textContent = message;
    box.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { box.classList.remove("show"); }, 2800);
  }
  function formatNumber(value, digits) {
    return Number(value).toFixed(digits);
  }
  function niceNumber(value) {
    if (Math.abs(value) >= 10) return value.toFixed(0);
    if (Math.abs(value) >= 1) return value.toFixed(1);
    return value.toFixed(2);
  }
  function seededRandom(seed) {
    var value = seed >>> 0;
    return function () {
      value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
      return value / 4294967296;
    };
  }
  function makeGaussian(random) {
    var spare = null;
    return function () {
      if (spare !== null) { var next = spare; spare = null; return next; }
      var u = Math.max(random(), 1e-12), v = random();
      var size = Math.sqrt(-2 * Math.log(u)), angle = 2 * Math.PI * v;
      spare = size * Math.sin(angle);
      return size * Math.cos(angle);
    };
  }
  function inputValue(t, duration, signal) {
    if (signal === "step") {
      if (t < duration * 0.16) return 0;
      if (t < duration * 0.46) return 1;
      if (t < duration * 0.70) return 0.25;
      if (t < duration * 0.84) return -0.35;
      return 0.8;
    }
    if (signal === "prbs") {
      var block = Math.floor(t / 0.65) + 1;
      var hash = (Math.imul(block, 1103515245) + 12345) >>> 0;
      return (hash % 7 < 3 ? -0.85 : 0.85);
    }
    if (signal === "sine") return 0.85 * Math.sin(2 * Math.PI * (0.1 * t + 0.012 * t * t));
    var levels = [-0.7, 0.5, 1, -0.25, 0.75, -0.55, 0.3];
    return levels[Math.min(6, Math.floor(t / duration * 7))];
  }
  function simulate(unitStep, includeNoise, seed) {
    var dt = unitStep ? 0.06 : state.dt;
    var duration = unitStep ? 12 : state.duration;
    var n = Math.round(duration / dt) + 1;
    var t = new Array(n), u = new Array(n), y = new Array(n);
    var gaussian = makeGaussian(seededRandom(seed || 42));
    var noiseScale = includeNoise ? state.noise / 100 * Math.max(0.25, state.K) : 0;
    for (var i = 0; i < n; i++) {
      t[i] = i * dt;
      u[i] = unitStep ? (t[i] < 0.5 ? 0 : 1) : inputValue(t[i], duration, state.signal);
    }
    y[0] = 0;
    if (state.type === "first") {
      var a = Math.exp(-dt / state.tau), b = state.K * (1 - a);
      var trueOutput = 0;
      for (var k = 1; k < n; k++) {
        trueOutput = a * trueOutput + b * u[k - 1];
        y[k] = trueOutput + gaussian() * noiseScale;
      }
    } else {
      var position = 0, velocity = 0, h = dt / 8;
      function derivative(p, v, input) {
        return [v, state.K * state.wn * state.wn * input - 2 * state.zeta * state.wn * v - state.wn * state.wn * p];
      }
      for (var j = 1; j < n; j++) {
        for (var sub = 0; sub < 8; sub++) {
          var driving = u[j - 1];
          var k1 = derivative(position, velocity, driving);
          var k2 = derivative(position + h * k1[0] / 2, velocity + h * k1[1] / 2, driving);
          var k3 = derivative(position + h * k2[0] / 2, velocity + h * k2[1] / 2, driving);
          var k4 = derivative(position + h * k3[0], velocity + h * k3[1], driving);
          position += h * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]) / 6;
          velocity += h * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]) / 6;
        }
        y[j] = position + gaussian() * noiseScale;
      }
    }
    return { t: t, u: u, y: y, dt: dt, source: "Simulated experiment", kind: "simulation" };
  }

  function solve(matrix, vector) {
    var n = vector.length;
    var rows = matrix.map(function (row, i) { return row.slice().concat(vector[i]); });
    for (var col = 0; col < n; col++) {
      var pivot = col;
      for (var r = col + 1; r < n; r++) if (Math.abs(rows[r][col]) > Math.abs(rows[pivot][col])) pivot = r;
      if (Math.abs(rows[pivot][col]) < 1e-12) return null;
      var temp = rows[pivot]; rows[pivot] = rows[col]; rows[col] = temp;
      var scale = rows[col][col];
      for (var c = col; c <= n; c++) rows[col][c] /= scale;
      for (var rowIndex = 0; rowIndex < n; rowIndex++) {
        if (rowIndex === col) continue;
        var factor = rows[rowIndex][col];
        for (var q = col; q <= n; q++) rows[rowIndex][q] -= factor * rows[col][q];
      }
    }
    return rows.map(function (row) { return row[n]; });
  }
  function identifyModel() {
    if (!state.data) { toast("Collect data before fitting a model."); return; }
    var u = state.data.u, y = state.data.y, n = y.length;
    var na = state.na, nb = state.nb, nk = state.nk;
    var first = Math.max(na, nk + nb - 1), split = Math.floor(n * 0.7);
    if (split - first < na + nb + 8 || n - split < 10) {
      toast("This record is too short for the chosen model order.");
      return;
    }
    var p = na + nb;
    var xtx = Array.from({ length: p }, function () { return Array(p).fill(0); });
    var xty = Array(p).fill(0);
    for (var k = first; k < split; k++) {
      var row = [];
      for (var a = 1; a <= na; a++) row.push(-y[k - a]);
      for (var b = 0; b < nb; b++) row.push(u[k - nk - b]);
      for (var i = 0; i < p; i++) {
        xty[i] += row[i] * y[k];
        for (var j = 0; j < p; j++) xtx[i][j] += row[i] * row[j];
      }
    }
    var trace = 0;
    for (var d = 0; d < p; d++) trace += xtx[d][d];
    var ridge = Math.max(1e-9, trace / p * 1e-8);
    for (var e = 0; e < p; e++) xtx[e][e] += ridge;
    var coefficients = solve(xtx, xty);
    if (!coefficients) { toast("This model could not be estimated. Try a simpler order or a more varied input."); return; }
    var aa = coefficients.slice(0, na), bb = coefficients.slice(na);
    var prediction = Array(n).fill(NaN), residual = [];
    for (var sample = split; sample < n; sample++) {
      var estimate = 0;
      for (var lag = 1; lag <= na; lag++) {
        var pastOutput = sample - lag < split ? y[sample - lag] : prediction[sample - lag];
        estimate -= aa[lag - 1] * pastOutput;
      }
      for (var inputLag = 0; inputLag < nb; inputLag++) estimate += bb[inputLag] * u[sample - nk - inputLag];
      prediction[sample] = estimate;
      residual.push(y[sample] - estimate);
    }
    var observed = y.slice(split), meanY = observed.reduce(function (sum, value) { return sum + value; }, 0) / observed.length;
    var errorSum = residual.reduce(function (sum, value) { return sum + value * value; }, 0);
    var variation = observed.reduce(function (sum, value) { return sum + Math.pow(value - meanY, 2); }, 0);
    var rmse = Math.sqrt(errorSum / residual.length);
    var fit = 100 * (1 - Math.sqrt(errorSum / Math.max(variation, 1e-12)));
    var residualMean = residual.reduce(function (sum, value) { return sum + value; }, 0) / residual.length;
    var residualStd = Math.sqrt(residual.reduce(function (sum, value) { return sum + Math.pow(value - residualMean, 2); }, 0) / residual.length);
    var cov = 0, varLag = 0;
    for (var c = 1; c < residual.length; c++) {
      cov += (residual[c] - residualMean) * (residual[c - 1] - residualMean);
      varLag += Math.pow(residual[c - 1] - residualMean, 2);
    }
    state.result = {
      a: aa, b: bb, prediction: prediction, residual: residual, split: split,
      fit: fit, rmse: rmse, mean: residualMean, std: residualStd,
      correlation: varLag ? cov / varLag : 0
    };
    renderResults();
    setStep(4);
  }

  function parseCSV(text, filename) {
    var lines = text.trim().split(/\r?\n/);
    if (lines.length < 12) throw new Error("Use a CSV with at least 12 measurements.");
    if (lines.length > 20001) throw new Error("Use a CSV with 20,000 rows or fewer.");
    function cells(line) {
      return line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(function (value) { return value.trim().replace(/^"|"$/g, ""); });
    }
    var header = cells(lines[0]).map(function (value) { return value.toLowerCase(); });
    var hasHeader = ["time", "input", "output"].every(function (name) { return header.indexOf(name) >= 0; });
    var columns = hasHeader ? [header.indexOf("time"), header.indexOf("input"), header.indexOf("output")] : [0, 1, 2];
    var t = [], u = [], y = [];
    lines.slice(hasHeader ? 1 : 0).forEach(function (line) {
      if (!line.trim()) return;
      var row = cells(line);
      var selected = columns.map(function (index) { return row[index]; });
      if (selected.some(function (value) { return value === undefined || value === ""; })) throw new Error("Every row needs time, input, and output values.");
      var numbers = selected.map(Number);
      if (!numbers.every(Number.isFinite)) throw new Error("The CSV contains a non-numeric value.");
      t.push(numbers[0]); u.push(numbers[1]); y.push(numbers[2]);
    });
    if (t.length < 12) throw new Error("Use a CSV with at least 12 measurements.");
    for (var i = 1; i < t.length; i++) if (!(t[i] > t[i - 1])) throw new Error("Time values must increase in every row.");
    var dt = (t[t.length - 1] - t[0]) / (t.length - 1);
    var maxDeviation = 0;
    for (var j = 1; j < t.length; j++) maxDeviation = Math.max(maxDeviation, Math.abs((t[j] - t[j - 1]) - dt));
    if (maxDeviation > Math.max(0.0001, dt * 0.08)) throw new Error("Time samples should be approximately evenly spaced.");
    return { t: t, u: u, y: y, dt: dt, source: filename || "Imported CSV", kind: "import" };
  }

  function plot(canvasId, times, series, options) {
    var canvas = el(canvasId);
    if (!canvas) return;
    var rect = canvas.getBoundingClientRect();
    if (rect.width < 40 || rect.height < 40 || !times || !times.length) return;
    var width = rect.width, height = rect.height, dpr = window.devicePixelRatio || 1;
    var tooltip = canvas.parentElement.querySelector(".plot-tooltip");
    var left = 45, right = 12, top = 14, bottom = 29;
    var plotWidth = width - left - right, plotHeight = height - top - bottom;
    var valid = [];
    series.forEach(function (item) { if (item.visible !== false) item.data.forEach(function (value) { if (Number.isFinite(value)) valid.push(value); }); });
    if (!valid.length) valid = [-1, 1];
    var min = Math.min.apply(null, valid), max = Math.max.apply(null, valid);
    if (options && options.zeroLine) { min = Math.min(min, 0); max = Math.max(max, 0); }
    if (Math.abs(max - min) < 0.001) { min -= 1; max += 1; }
    var padding = (max - min) * 0.12;
    min -= padding; max += padding;
    var t0 = times[0], t1 = times[times.length - 1], timeSpan = Math.max(1e-9, t1 - t0);
    function xAt(index) { return left + (times[index] - t0) / timeSpan * plotWidth; }
    function yAt(value) { return top + (max - value) / (max - min) * plotHeight; }
    function draw(hoverIndex) {
      canvas.width = width * dpr; canvas.height = height * dpr;
      var ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      if (options && options.validationStart !== undefined) {
        var startX = xAt(options.validationStart);
        ctx.fillStyle = "#eaf5ed";
        ctx.fillRect(startX, top, width - right - startX, plotHeight);
      }
      ctx.strokeStyle = color.grid; ctx.lineWidth = 1;
      for (var row = 0; row <= 4; row++) {
        var gy = top + plotHeight * row / 4;
        ctx.beginPath(); ctx.moveTo(left, gy); ctx.lineTo(width - right, gy); ctx.stroke();
      }
      for (var col = 0; col <= 4; col++) {
        var gx = left + plotWidth * col / 4;
        ctx.beginPath(); ctx.moveTo(gx, top); ctx.lineTo(gx, top + plotHeight); ctx.stroke();
      }
      if (options && options.zeroLine) {
        ctx.strokeStyle = "#b8c9bc"; ctx.setLineDash([5, 4]);
        ctx.beginPath(); ctx.moveTo(left, yAt(0)); ctx.lineTo(width - right, yAt(0)); ctx.stroke(); ctx.setLineDash([]);
      }
      if (options && options.validationStart !== undefined) {
        var boundary = xAt(options.validationStart);
        ctx.strokeStyle = "#94bca0"; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(boundary, top); ctx.lineTo(boundary, top + plotHeight); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = color.green; ctx.font = "600 11px Inter, sans-serif"; ctx.textAlign = "left";
        ctx.fillText("Validation", Math.min(boundary + 8, width - 82), top + 16);
      }
      ctx.fillStyle = color.text; ctx.font = "11px Inter, sans-serif"; ctx.textBaseline = "middle";
      for (var yTick = 0; yTick <= 4; yTick++) {
        var value = max - (max - min) * yTick / 4;
        ctx.textAlign = "right"; ctx.fillText(niceNumber(value), left - 8, top + plotHeight * yTick / 4);
      }
      ctx.textBaseline = "alphabetic";
      for (var xTick = 0; xTick <= 4; xTick++) {
        var label = niceNumber(t0 + timeSpan * xTick / 4) + " s";
        ctx.textAlign = xTick === 0 ? "left" : xTick === 4 ? "right" : "center";
        ctx.fillText(label, left + plotWidth * xTick / 4, height - 5);
      }
      series.forEach(function (item) {
        if (item.visible === false) return;
        ctx.beginPath(); ctx.lineWidth = 2.2; ctx.strokeStyle = item.color; ctx.lineJoin = "round";
        var started = false;
        item.data.forEach(function (value, index) {
          if (!Number.isFinite(value)) { started = false; return; }
          if (!started) { ctx.moveTo(xAt(index), yAt(value)); started = true; }
          else ctx.lineTo(xAt(index), yAt(value));
        });
        ctx.stroke();
      });
      if (hoverIndex !== null && hoverIndex !== undefined) {
        var hoverX = xAt(hoverIndex);
        ctx.strokeStyle = "#9aaa9e"; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
        ctx.beginPath(); ctx.moveTo(hoverX, top); ctx.lineTo(hoverX, top + plotHeight); ctx.stroke(); ctx.setLineDash([]);
        series.forEach(function (item) {
          var value = item.data[hoverIndex];
          if (item.visible === false || !Number.isFinite(value)) return;
          ctx.beginPath(); ctx.arc(hoverX, yAt(value), 4, 0, Math.PI * 2);
          ctx.fillStyle = "#fff"; ctx.fill(); ctx.strokeStyle = item.color; ctx.lineWidth = 2; ctx.stroke();
        });
      }
    }
    draw(null);
    canvas.onpointermove = function (event) {
      var bounds = canvas.getBoundingClientRect();
      var px = event.clientX - bounds.left;
      if (px < left || px > width - right) { tooltip.classList.remove("show"); draw(null); return; }
      var targetTime = t0 + (px - left) / plotWidth * timeSpan;
      var closest = 0, best = Infinity;
      for (var i = 0; i < times.length; i++) {
        var distance = Math.abs(times[i] - targetTime);
        if (distance < best) { best = distance; closest = i; }
      }
      draw(closest);
      var parts = ["<strong>" + times[closest].toFixed(2) + " s</strong>"];
      series.forEach(function (item) {
        if (item.visible !== false && Number.isFinite(item.data[closest])) parts.push(item.label + ": " + item.data[closest].toFixed(3));
      });
      tooltip.innerHTML = parts.join("<br>");
      tooltip.style.left = Math.min(width - 150, Math.max(12, xAt(closest) + 12)) + "px";
      tooltip.style.top = Math.max(8, Math.min(height - 75, event.clientY - bounds.top - 70)) + "px";
      tooltip.classList.add("show");
    };
    canvas.onpointerleave = function () { tooltip.classList.remove("show"); draw(null); };
  }

  function invalidateData() {
    state.data = null; state.result = null;
    updateStepper();
  }
  function updateSystemView() {
    all("[data-system]").forEach(function (button) {
      var selected = button.dataset.system === state.type;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    });
    all(".first-only").forEach(function (node) { node.classList.toggle("hidden", state.type !== "first"); });
    all(".second-only").forEach(function (node) { node.classList.toggle("hidden", state.type !== "second"); });
    el("gainValue").textContent = formatNumber(state.K, 1);
    el("tauValue").textContent = formatNumber(state.tau, 1) + " s";
    el("zetaValue").textContent = formatNumber(state.zeta, 2);
    el("wnValue").textContent = formatNumber(state.wn, 1) + " rad/s";
    el("systemInsight").textContent = state.type === "first"
      ? "The output approaches the final level set by gain. Increase the time constant to make that rise slower."
      : state.zeta < 0.7
        ? "The response overshoots and settles because damping is low. Raise damping to reduce that overshoot."
        : "The response settles with little oscillation. Increase natural frequency to make it react faster.";
    var data = simulate(true, false, 42);
    plot("systemChart", data.t, [{ label: "Output", data: data.y, color: color.green }], {});
  }
  function updateInputView() {
    all("[data-signal]").forEach(function (button) {
      var selected = button.dataset.signal === state.signal;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    });
    el("sampleValue").textContent = formatNumber(state.dt, 2) + " s";
    el("noiseValue").textContent = formatNumber(state.noise, 1) + "%";
    el("durationValue").textContent = state.duration + " s";
    var data = simulate(false, true, 42);
    el("previewSamples").textContent = data.y.length;
    var showingInput = state.previewKind === "input";
    all(".preview-tab").forEach(function (button) { button.classList.toggle("active", button.dataset.preview === state.previewKind); });
    el("previewLegend").innerHTML = showingInput
      ? '<i class="line-swatch blue"></i>Input signal'
      : '<i class="line-swatch teal"></i>System output';
    plot("previewChart", data.t, [{
      label: showingInput ? "Input" : "Output", data: showingInput ? data.u : data.y,
      color: showingInput ? color.blue : color.green
    }], {});
    var explanations = {
      step: "Step changes make the final gain and response speed easy to see. The later changes give the model more than one transition to learn from.",
      prbs: "Repeated switches expose the system across many time scales. This often gives the estimator richer information.",
      sine: "The sine sweep gradually changes its frequency, showing which speeds of change the system follows well.",
      levels: "Multiple levels show how the response behaves across a wider input range."
    };
    var extra = state.noise >= 7 ? " With high noise, small response details become harder to distinguish." : state.dt >= 0.35 ? " The long sample interval may miss fast changes." : "";
    el("inputInsight").textContent = explanations[state.signal] + extra;
  }
  function updatePresetView() {
    all("[data-preset]").forEach(function (button) {
      var preset = button.dataset.preset;
      var selected = preset === "simple" && state.na === 1 && state.nb === 1 && state.nk === 1
        || preset === "balanced" && state.na === 2 && state.nb === 2 && state.nk === 1
        || preset === "flexible" && state.na === 4 && state.nb === 4 && state.nk === 1;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    });
    el("orderNa").value = state.na; el("orderNb").value = state.nb; el("orderNk").value = state.nk;
  }
  function updateDataView() {
    if (!state.data) return;
    el("dataSource").textContent = state.data.source;
    el("dataSamples").textContent = state.data.y.length;
    el("dataInterval").textContent = formatNumber(state.data.dt, 3) + " s";
    var imported = state.data.kind === "import";
    el("dataOriginNote").textContent = imported
      ? "Imported measurements are used exactly as recorded. The first- or second-order simulator did not create or change this file."
      : "These measurements were generated from the " + (state.type === "first" ? "first-order" : "second-order") + " system selected in Step 1.";
    el("fitIntro").textContent = imported
      ? "A CSV contains input and output values, not a system-order label. Start with Simple (1 / 1), then try Balanced (2 / 2) and compare the validation fit."
      : "These data came from a " + (state.type === "first" ? "first-order" : "second-order") + " simulation. " + (state.type === "first" ? "Simple (1 / 1)" : "Balanced (2 / 2)") + " is selected as the starting ARX model; you can change it below.";
    el("backToData").textContent = imported ? "Choose another source" : "Back to simulation";
    plot("fitPreviewChart", state.data.t, [{ label: "Measured", data: state.data.y, color: color.green }], {});
  }
  function polynomial(terms, startPower) {
    if (!terms.length) return "0";
    return terms.map(function (value, index) {
      var sign = value < 0 ? "−" : index === 0 ? "" : "+";
      var coefficient = Math.abs(value).toFixed(4);
      var power = startPower + index;
      return (index ? " " : "") + sign + (sign ? " " : "") + coefficient + "z^(-" + power + ")";
    }).join("");
  }
  function renderResults() {
    if (!state.result || !state.data) return;
    var result = state.result, data = state.data;
    el("resultsIntro").textContent = (data.kind === "import" ? "Imported CSV: " + data.source : "Simulated " + state.type + "-order system") + ". Fitted ARX (" + state.na + ", " + state.nb + ", " + state.nk + "); the final 30% checks its predictions.";
    el("plotExplanation").textContent = "The output may rise and fall when the input changes repeatedly. The shaded region compares measured output with the model's prediction on unseen data.";
    el("fitMetric").textContent = result.fit.toFixed(1) + "%";
    el("rmseMetric").textContent = niceNumber(result.rmse);
    el("spreadMetric").textContent = niceNumber(result.std);
    el("fitDescriptor").textContent = result.fit > 85 ? "Strong match on unseen data" : result.fit > 60 ? "Some behavior is captured" : "The model misses important behavior";
    var predicted = result.prediction;
    plot("comparisonChart", data.t, [
      { label: "Measured", data: data.y, color: color.green, visible: state.showMeasured },
      { label: "Predicted", data: predicted, color: color.orange, visible: state.showPredicted }
    ], { validationStart: result.split });
    all(".series-button").forEach(function (button) {
      button.classList.toggle("active", button.dataset.series === "measured" ? state.showMeasured : state.showPredicted);
    });
    plot("residualChart", data.t.slice(result.split), [
      { label: "Residual", data: result.residual, color: color.orange }
    ], { zeroLine: true });
    el("residualMean").textContent = result.mean.toFixed(3);
    el("residualCorrelation").textContent = result.correlation.toFixed(2);
    el("transferNumerator").textContent = polynomial(result.b, state.nk);
    el("transferDenominator").textContent = "1 " + (result.a[0] >= 0 ? "+ " : "") + polynomial(result.a, 1);
    el("modelOrderText").textContent = "ARX order: na = " + state.na + ", nb = " + state.nb + ", nk = " + state.nk;
    var table = el("coefficientTable");
    table.innerHTML = "";
    result.a.concat(result.b).forEach(function (value, index) {
      var row = document.createElement("div");
      row.className = "coefficient-table-row";
      var name = document.createElement("span");
      name.textContent = index < state.na ? "Output coefficient a" + (index + 1) : "Input coefficient b" + (index - state.na + 1);
      var number = document.createElement("strong");
      number.textContent = value.toFixed(6);
      row.appendChild(name); row.appendChild(number); table.appendChild(row);
    });
    var headline, explanation;
    if (result.fit > 85 && Math.abs(result.correlation) < 0.25) {
      headline = "The model tracks the system well.";
      explanation = "Its prediction follows the held-out measurements closely, and the residuals show little one-step pattern. Try more noise or a different input to see how stable this result is.";
    } else if (result.fit > 60) {
      headline = "The model captures the main trend.";
      explanation = "It follows much of the unseen response, but some dynamics remain in the errors. Try a richer input, a different model order, or faster sampling.";
    } else {
      headline = "The model needs a better experiment.";
      explanation = "The held-out response differs from the prediction. A more varied input, less noise, a longer record, or another model order may help reveal the dynamics.";
    }
    el("resultHeadline").textContent = headline;
    el("resultExplanation").textContent = explanation;
  }
  function updateStepper() {
    var imported = !!state.data && state.data.kind === "import";
    el("step2Subtitle").textContent = imported ? "Skipped for imported CSV" : "Give it a signal";
    all(".step-link").forEach(function (button) {
      var number = Number(button.dataset.step);
      var skipped = imported && number === 2 && state.step !== 2;
      button.classList.toggle("active", number === state.step);
      button.classList.toggle("complete", !skipped && number < state.step && (number < 2 || !!state.data));
      button.classList.toggle("skipped", skipped);
      button.setAttribute("aria-current", number === state.step ? "step" : "false");
      button.setAttribute("aria-disabled", number === 3 && !state.data || number === 4 && !state.result ? "true" : "false");
    });
  }
  function setStep(number) {
    if (number === 3 && !state.data) { toast("Collect measurements first."); return; }
    if (number === 4 && !state.result) { toast("Fit a model first."); return; }
    state.step = number;
    all(".stage").forEach(function (section) { section.classList.toggle("hidden", section.id !== "stage" + number); });
    updateStepper();
    if (number === 1) updateSystemView();
    if (number === 2) updateInputView();
    if (number === 3) { updatePresetView(); updateDataView(); }
    if (number === 4) renderResults();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function exportCSV() {
    if (!state.data || !state.result) { toast("Fit a model before exporting results."); return; }
    var rows = ["time,input,output,prediction,residual"];
    for (var i = 0; i < state.data.t.length; i++) {
      var prediction = state.result.prediction[i];
      rows.push([state.data.t[i], state.data.u[i], state.data.y[i], Number.isFinite(prediction) ? prediction : "", Number.isFinite(prediction) ? state.data.y[i] - prediction : ""].join(","));
    }
    var blob = new Blob([rows.join("\n")], { type: "text/csv" });
    var link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "system-lab-results.csv";
    link.click();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
    toast("Results CSV downloaded.");
  }
  function resetExperiment() {
    Object.keys(defaults).forEach(function (key) { state[key] = defaults[key]; });
    state.data = null; state.result = null; state.previewKind = "input"; state.showMeasured = true; state.showPredicted = true;
    ["gain", "tau", "zeta", "wn", "sampleTime", "noiseLevel", "duration"].forEach(function (id) {
      var key = { gain: "K", sampleTime: "dt", noiseLevel: "noise" }[id] || id;
      el(id).value = state[key];
    });
    updatePresetView(); setStep(1); toast("A new experiment is ready.");
  }

  all("[data-system]").forEach(function (button) {
    button.addEventListener("click", function () {
      if (state.type === button.dataset.system) return;
      state.type = button.dataset.system;
      state.na = state.type === "first" ? 1 : 2;
      state.nb = state.na;
      state.nk = 1;
      invalidateData(); updateSystemView(); updatePresetView();
    });
  });
  [["gain", "K"], ["tau", "tau"], ["zeta", "zeta"], ["wn", "wn"]].forEach(function (pair) {
    el(pair[0]).addEventListener("input", function (event) {
      state[pair[1]] = Number(event.target.value); invalidateData(); updateSystemView();
    });
  });
  all("[data-signal]").forEach(function (button) {
    button.addEventListener("click", function () {
      state.signal = button.dataset.signal; invalidateData(); updateInputView();
    });
  });
  [["sampleTime", "dt"], ["noiseLevel", "noise"], ["duration", "duration"]].forEach(function (pair) {
    el(pair[0]).addEventListener("input", function (event) {
      state[pair[1]] = Number(event.target.value); invalidateData(); updateInputView();
    });
  });
  all(".preview-tab").forEach(function (button) {
    button.addEventListener("click", function () { state.previewKind = button.dataset.preview; updateInputView(); });
  });
  all("[data-preset]").forEach(function (button) {
    button.addEventListener("click", function () {
      var order = { simple: [1, 1, 1], balanced: [2, 2, 1], flexible: [4, 4, 1] }[button.dataset.preset];
      state.na = order[0]; state.nb = order[1]; state.nk = order[2]; state.result = null;
      updatePresetView(); updateStepper();
    });
  });
  [["orderNa", "na"], ["orderNb", "nb"], ["orderNk", "nk"]].forEach(function (pair) {
    el(pair[0]).addEventListener("change", function (event) {
      var field = event.target;
      state[pair[1]] = Math.max(Number(field.min), Math.min(Number(field.max), Number(field.value) || 1));
      state.result = null; updatePresetView(); updateStepper();
    });
  });
  all(".step-link").forEach(function (button) {
    button.addEventListener("click", function () { setStep(Number(button.dataset.step)); });
  });
  el("toStep2").addEventListener("click", function () { setStep(2); });
  el("generateButton").addEventListener("click", function () {
    state.runCount += 1;
    state.data = simulate(false, true, 1234 + state.runCount * 7919);
    state.result = null;
    setStep(3);
    toast("Measurements ready. Now choose a model.");
  });
  el("fileInput").addEventListener("change", function (event) {
    var file = event.target.files[0];
    if (!file) return;
    file.text().then(function (text) {
      state.data = parseCSV(text, file.name);
      state.na = 1; state.nb = 1; state.nk = 1;
      state.result = null;
      setStep(3);
      toast("Imported " + state.data.y.length + " measurements.");
    }).catch(function (error) { toast(error.message || "Could not read this CSV."); });
    event.target.value = "";
  });
  el("fitButton").addEventListener("click", identifyModel);
  el("backToData").addEventListener("click", function () { setStep(state.data && state.data.kind === "import" ? 1 : 2); });
  el("adjustModel").addEventListener("click", function () { setStep(3); });
  el("startAgain").addEventListener("click", resetExperiment);
  el("exportButton").addEventListener("click", exportCSV);
  all(".series-button").forEach(function (button) {
    button.addEventListener("click", function () {
      if (button.dataset.series === "measured") state.showMeasured = !state.showMeasured;
      else state.showPredicted = !state.showPredicted;
      renderResults();
    });
  });
  el("helpButton").addEventListener("click", function () { el("helpDialog").showModal(); });
  el("closeHelp").addEventListener("click", function () { el("helpDialog").close(); });
  window.addEventListener("resize", function () {
    if (state.step === 1) updateSystemView();
    if (state.step === 2) updateInputView();
    if (state.step === 3) updateDataView();
    if (state.step === 4) renderResults();
  });
  updateSystemView();
  updatePresetView();
  updateStepper();
})();
