/**
 * ============================================================================
 * SPECTRA INDUSTRIAL COLOR METROLOGY ENGINE + 20-AGENT SWARM REBUILD SUITE
 * Enterprise Production Build — Performance, Accessibility & Memory Optimized
 * ============================================================================
 */

(function () {
  'use strict';

  /* ==========================================================================
     PART 0: RUNTIME ENVIRONMENT & ACCESSIBILITY PREFERENCES
     ========================================================================== */
  const Env = {
    prefersReducedMotion: window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,

    init() {
      if (!window.matchMedia) return;
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      const handler = (e) => {
        this.prefersReducedMotion = e.matches;
      };
      if (mq.addEventListener) {
        mq.addEventListener('change', handler);
      } else if (mq.addListener) {
        mq.addListener(handler);
      }
    }
  };
  Env.init();

  /* ==========================================================================
     PART 1: SPECTRA COLOR SCIENCE & METROLOGY ENGINE
     ========================================================================== */
  const ColorScience = {
    D65: Object.freeze({ X: 95.047, Y: 100.0, Z: 108.883 }),
    RAD2DEG: 180.0 / Math.PI,
    DEG2RAD: Math.PI / 180.0,
    EPSILON: 216.0 / 24389.0,
    KAPPA: 24389.0 / 27.0,
    POW25_7: 6103515625.0, // 25^7 constant for CIEDE2000

    // Pre-computed LUT for 8-bit sRGB to Linear RGB (eliminates Math.pow in pixel loops)
    SRGB_TO_LINEAR_LUT: (() => {
      const lut = new Float32Array(256);
      for (let i = 0; i < 256; i++) {
        const v = i / 255.0;
        lut[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      }
      return lut;
    })(),

    inverseCompand(val8Bit) {
      const idx = Math.max(0, Math.min(255, val8Bit | 0));
      return this.SRGB_TO_LINEAR_LUT[idx];
    },

    compand(linear) {
      const clamped = Math.max(0, Math.min(1, linear));
      const v = clamped <= 0.0031308
        ? 12.92 * clamped
        : 1.055 * Math.pow(clamped, 1.0 / 2.4) - 0.055;
      return Math.round(Math.max(0, Math.min(255, v * 255.0)));
    },

    srgbToXyz(r, g, b) {
      const rL = this.inverseCompand(r);
      const gL = this.inverseCompand(g);
      const bL = this.inverseCompand(b);

      return {
        X: (rL * 0.4124564 + gL * 0.3575761 + bL * 0.1804375) * 100.0,
        Y: (rL * 0.2126729 + gL * 0.7151522 + bL * 0.0721750) * 100.0,
        Z: (rL * 0.0193339 + gL * 0.1191920 + bL * 0.9503041) * 100.0
      };
    },

    xyzToLab(X, Y, Z) {
      const xr = X / this.D65.X;
      const yr = Y / this.D65.Y;
      const zr = Z / this.D65.Z;
      const eps = this.EPSILON;
      const kap = this.KAPPA;

      const fx = xr > eps ? Math.cbrt(xr) : (kap * xr + 16.0) / 116.0;
      const fy = yr > eps ? Math.cbrt(yr) : (kap * yr + 16.0) / 116.0;
      const fz = zr > eps ? Math.cbrt(zr) : (kap * zr + 16.0) / 116.0;

      return {
        L: Math.max(0, Math.min(100, 116.0 * fy - 16.0)),
        a: 500.0 * (fx - fy),
        b: 200.0 * (fy - fz)
      };
    },

    labToXyz(L, a, b) {
      const fy = (L + 16.0) / 116.0;
      const fx = a / 500.0 + fy;
      const fz = fy - b / 200.0;
      const eps = this.EPSILON;
      const kap = this.KAPPA;

      const fx3 = fx * fx * fx;
      const fz3 = fz * fz * fz;

      const xr = fx3 > eps ? fx3 : (116.0 * fx - 16.0) / kap;
      const yr = L > (kap * eps) ? Math.pow((L + 16.0) / 116.0, 3) : L / kap;
      const zr = fz3 > eps ? fz3 : (116.0 * fz - 16.0) / kap;

      return {
        X: Math.max(0, xr * this.D65.X),
        Y: Math.max(0, yr * this.D65.Y),
        Z: Math.max(0, zr * this.D65.Z)
      };
    },

    xyzToSrgb(X, Y, Z) {
      const x = X / 100.0;
      const y = Y / 100.0;
      const z = Z / 100.0;

      const rL = x *  3.2404542 + y * -1.5371385 + z * -0.4985314;
      const gL = x * -0.9692660 + y *  1.8760108 + z *  0.0415560;
      const bL = x *  0.0556434 + y * -0.2040259 + z *  1.0572252;

      return {
        r: this.compand(rL),
        g: this.compand(gL),
        b: this.compand(bL)
      };
    },

    rgbToLab(r, g, b) {
      const xyz = this.srgbToXyz(r, g, b);
      return this.xyzToLab(xyz.X, xyz.Y, xyz.Z);
    },

    labToRgb(L, a, b) {
      const xyz = this.labToXyz(L, a, b);
      return this.xyzToSrgb(xyz.X, xyz.Y, xyz.Z);
    },

    computeDeltaE00(lab1, lab2) {
      const { L: L1, a: a1, b: b1 } = lab1;
      const { L: L2, a: a2, b: b2 } = lab2;

      const C1 = Math.hypot(a1, b1);
      const C2 = Math.hypot(a2, b2);
      const Cbar = (C1 + C2) * 0.5;
      const Cbar7 = Math.pow(Cbar, 7);
      const G = 0.5 * (1.0 - Math.sqrt(Cbar7 / (Cbar7 + this.POW25_7)));

      const a1p = (1.0 + G) * a1;
      const a2p = (1.0 + G) * a2;
      const C1p = Math.hypot(a1p, b1);
      const C2p = Math.hypot(a2p, b2);

      const rad2deg = this.RAD2DEG;
      const deg2rad = this.DEG2RAD;

      const h1p = C1p === 0 ? 0 : ((Math.atan2(b1, a1p) * rad2deg + 360.0) % 360.0);
      const h2p = C2p === 0 ? 0 : ((Math.atan2(b2, a2p) * rad2deg + 360.0) % 360.0);

      const deltaLp = L2 - L1;
      const deltaCp = C2p - C1p;

      let deltahp = 0;
      if (C1p * C2p !== 0) {
        const diff = h2p - h1p;
        if (Math.abs(diff) <= 180.0) deltahp = diff;
        else if (diff > 180.0) deltahp = diff - 360.0;
        else deltahp = diff + 360.0;
      }
      const deltaHp = 2.0 * Math.sqrt(C1p * C2p) * Math.sin((deltahp * deg2rad) * 0.5);

      const Lbarp = (L1 + L2) * 0.5;
      const Cbarp = (C1p + C2p) * 0.5;

      let hbarp = 0;
      if (C1p * C2p !== 0) {
        const diff = Math.abs(h1p - h2p);
        const sum = h1p + h2p;
        if (diff <= 180.0) hbarp = sum * 0.5;
        else if (sum < 360.0) hbarp = (sum + 360.0) * 0.5;
        else hbarp = (sum - 360.0) * 0.5;
      } else {
        hbarp = h1p + h2p;
      }

      const T = 1.0 - 0.17 * Math.cos((hbarp - 30.0) * deg2rad)
                    + 0.24 * Math.cos((2.0 * hbarp) * deg2rad)
                    + 0.32 * Math.cos((3.0 * hbarp + 6.0) * deg2rad)
                    - 0.20 * Math.cos((4.0 * hbarp - 63.0) * deg2rad);

      const hDiff = (hbarp - 275.0) / 25.0;
      const deltaTheta = 30.0 * Math.exp(-(hDiff * hDiff));
      const Cbarp7 = Math.pow(Cbarp, 7);
      const RC = 2.0 * Math.sqrt(Cbarp7 / (Cbarp7 + this.POW25_7));
      const lDiff = Lbarp - 50.0;
      const lDiff2 = lDiff * lDiff;
      const SL = 1.0 + (0.015 * lDiff2) / Math.sqrt(20.0 + lDiff2);
      const SC = 1.0 + 0.045 * Cbarp;
      const SH = 1.0 + 0.015 * Cbarp * T;
      const RT = -Math.sin(2.0 * deltaTheta * deg2rad) * RC;

      const termL = deltaLp / (SL || 1);
      const termC = deltaCp / (SC || 1);
      const termH = deltaHp / (SH || 1);

      return Math.sqrt(
        Math.max(0, termL * termL + termC * termC + termH * termH + RT * termC * termH)
      );
    },

    rgbToHex(r, g, b) {
      const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)))
        .toString(16)
        .padStart(2, '0');
      return `#${clamp(r)}${clamp(g)}${clamp(b)}`.toUpperCase();
    },

    rgbToHsl(r, g, b) {
      const rn = r / 255;
      const gn = g / 255;
      const bn = b / 255;
      const max = Math.max(rn, gn, bn);
      const min = Math.min(rn, gn, bn);
      let h = 0;
      let s = 0;
      const l = (max + min) * 0.5;

      if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case rn: h = (gn - bn) / d + (gn < bn ? 6 : 0); break;
          case gn: h = (bn - rn) / d + 2; break;
          case bn: h = (rn - gn) / d + 4; break;
        }
        h /= 6;
      }
      return {
        h: Math.round(h * 360),
        s: Math.round(s * 100),
        l: Math.round(l * 100)
      };
    },

    calculateWcagContrast(r, g, b) {
      const l = 0.2126 * this.inverseCompand(r)
              + 0.7152 * this.inverseCompand(g)
              + 0.0722 * this.inverseCompand(b);
      const ratioWhite = 1.05 / (l + 0.05);
      const ratioBlack = (l + 0.05) / 0.05;
      return Math.max(ratioWhite, ratioBlack).toFixed(1);
    },

    resolveName(r, g, b) {
      const { h, s, l } = this.rgbToHsl(r, g, b);
      if (l < 10) return 'Jet Carbon Black';
      if (l > 92 && s < 10) return 'Specular White';
      if (s < 12) {
        if (l < 35) return 'Industrial Charcoal';
        if (l < 65) return 'Neutral Mid-Gray';
        return 'Anodized Silver';
      }

      let tone = '';
      if (l < 28) tone = 'Deep ';
      else if (l > 75) tone = 'Light ';
      else if (s > 75) tone = 'Vibrant ';

      let hue = 'Spectrum';
      if (h >= 350 || h < 12) hue = 'Ruby Oxide';
      else if (h < 40) hue = 'Safety Orange';
      else if (h < 65) hue = 'Industrial Yellow';
      else if (h < 155) hue = 'Signal Green';
      else if (h < 195) hue = 'Cyan Matrix';
      else if (h < 255) hue = 'Process Cobalt';
      else if (h < 290) hue = 'Reflective Violet';
      else if (h < 330) hue = 'Magenta Pulse';
      else hue = 'Crimson Accent';

      return `${tone}${hue}`;
    }
  };

  /* ==========================================================================
     PART 1B: APPLICATION STATE, TYPED BUFFERS & DOM CACHE
     ========================================================================== */
  const MAX_KERNEL_PIXELS = 32 * 32;
  const pixelBuffers = {
    r: new Uint8Array(MAX_KERNEL_PIXELS),
    g: new Uint8Array(MAX_KERNEL_PIXELS),
    b: new Uint8Array(MAX_KERNEL_PIXELS),
    sortScratch: new Uint8Array(MAX_KERNEL_PIXELS)
  };

  const SHADE_VECTORS = Object.freeze([
    { dL: 0,    da: 0,    db: 0,    desc: 'Target Match' },
    { dL: 3.5,  da: 0,    db: 0,    desc: 'High Lum Tint' },
    { dL: -3.5, da: 0,    db: 0,    desc: 'Deep Shade' },
    { dL: 0,    da: 3.2,  db: 1.5,  desc: 'Warm Vector' },
    { dL: 0,    da: -3.2, db: -1.5, desc: 'Cool Vector' },
    { dL: 2.0,  da: 4.5,  db: -2.0, desc: 'Saturation Boost' },
    { dL: -2.0, da: -4.5, db: 2.0,  desc: 'Muted Low-Tone' },
    { dL: 6.0,  da: 0,    db: 0,    desc: 'Specular Tint' },
    { dL: -6.0, da: 0,    db: 0,    desc: 'Umbra Tone' },
    { dL: 0,    da: -2.0, db: 4.0,  desc: 'Amber Bias' },
    { dL: 0,    da: 2.0,  db: -4.0, desc: 'Cyan Bias' },
    { dL: 1.5,  da: 2.5,  db: 2.5,  desc: 'Chroma Push' }
  ]);

  function loadStoredHistory() {
    try {
      const raw = localStorage.getItem('spectra_log');
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  const state = {
    stream: null,
    rafId: null,
    facingMode: 'environment',
    precisionMode: false,
    isLocked: false,
    isTransitioning: false,
    isImageMode: false,
    isDraggingReticle: false,
    lastTime: 0,
    targetNormalizedPos: { x: 0.5, y: 0.5 },
    currentReading: null,
    lastRenderedHex: '',
    lastRenderedQuality: -1,
    lastRenderedVariance: -1,
    historyLog: loadStoredHistory(),
    matrixElements: []
  };

  const dom = {
    video: document.getElementById('cameraStream'),
    staticImage: document.getElementById('staticImagePreview'),
    fileInput: document.getElementById('fileUploadInput'),
    viewportCard: document.getElementById('viewportCard'),
    reticle: document.getElementById('reticle'),
    canvas: document.getElementById('samplerCanvas'),
    reticleCore: document.getElementById('reticleColorCore'),
    streamIndicator: document.getElementById('streamIndicator'),
    streamStatus: document.getElementById('streamStatus'),
    deviceFpsChip: document.getElementById('deviceFpsChip'),
    viewportPrompt: document.getElementById('viewportPrompt'),
    stageCover: document.getElementById('stageCover'),
    noticeBanner: document.getElementById('noticeBanner'),
    btnPower: document.getElementById('btnPower'),
    btnCoverPower: document.getElementById('btnCoverPower'),
    btnUpload: document.getElementById('btnUpload'),
    btnCoverUpload: document.getElementById('btnCoverUpload'),
    btnFlip: document.getElementById('btnFlip'),
    btnLock: document.getElementById('btnLock'),
    lockText: document.getElementById('lockText'),
    btnSave: document.getElementById('btnSave'),
    modeQuick: document.getElementById('modeQuick'),
    modePrecision: document.getElementById('modePrecision'),
    scanMethodBadge: document.getElementById('scanMethod'),
    targetSwatch: document.getElementById('targetSwatch'),
    contrastBadge: document.getElementById('contrastBadge'),
    colorName: document.getElementById('colorName'),
    hexDisplay: document.getElementById('hexDisplay'),
    rgbVector: document.getElementById('rgbVector'),
    barR: document.getElementById('barR'),
    barG: document.getElementById('barG'),
    barB: document.getElementById('barB'),
    copyHex: document.getElementById('copyHex'),
    copyRgb: document.getElementById('copyRgb'),
    qualityPercent: document.getElementById('qualityPercent'),
    qualityFill: document.getElementById('qualityFill'),
    varianceValue: document.getElementById('varianceValue'),
    varianceFill: document.getElementById('varianceFill'),
    shadeMatrix: document.getElementById('shadeMatrix'),
    detailsAccordion: document.getElementById('detailsAccordion'),
    accordionBody: document.getElementById('accordionBody'),
    accIcon: document.getElementById('accIcon'),
    labCoords: document.getElementById('labCoords'),
    xyzCoords: document.getElementById('xyzCoords'),
    hslCoords: document.getElementById('hslCoords'),
    lumCoords: document.getElementById('lumCoords'),
    outliersCoords: document.getElementById('outliersCoords'),
    clearLog: document.getElementById('clearLog'),
    exportLog: document.getElementById('exportLog'),
    logScroller: document.getElementById('logScroller'),
    toast: document.getElementById('toastNotification')
  };

  const ctx = dom.canvas ? dom.canvas.getContext('2d', { willReadFrequently: true }) : null;

  /* ==========================================================================
     PART 1C: UI SETUP, KEYBOARD ACCESSIBILITY & EVENT DELEGATION
     ========================================================================== */
  function setupMatrixDOM() {
    if (!dom.shadeMatrix) return;
    const fragment = document.createDocumentFragment();
    state.matrixElements = [];

    for (let i = 0; i < 12; i++) {
      const cell = document.createElement('div');
      cell.className = 'matrix-cell';
      cell.tabIndex = 0;
      cell.setAttribute('role', 'button');
      cell.setAttribute('aria-label', `Copy shade vector ${i + 1}`);

      const swatch = document.createElement('div');
      swatch.className = 'cell-swatch';

      const meta = document.createElement('div');
      meta.className = 'cell-meta';

      const metaTop = document.createElement('div');
      metaTop.className = 'cell-meta-top';

      const hexSpan = document.createElement('span');
      hexSpan.className = 'cell-hex';
      hexSpan.textContent = '#000000';

      const deltaSpan = document.createElement('span');
      deltaSpan.className = 'cell-delta';
      deltaSpan.textContent = '\u03940.0';

      const tagSpan = document.createElement('span');
      tagSpan.className = 'cell-tag';
      tagSpan.textContent = 'Vector';

      metaTop.appendChild(hexSpan);
      metaTop.appendChild(deltaSpan);
      meta.appendChild(metaTop);
      meta.appendChild(tagSpan);
      cell.appendChild(swatch);
      cell.appendChild(meta);
      fragment.appendChild(cell);

      state.matrixElements.push({
        container: cell,
        swatch,
        hexLabel: hexSpan,
        deltaLabel: deltaSpan,
        descLabel: tagSpan
      });
    }

    dom.shadeMatrix.innerHTML = '';
    dom.shadeMatrix.appendChild(fragment);
  }

  function loadDemoCalibration() {
    if (state.stream || state.isImageMode) return;

    processSamplePayload({
      r: 14,
      g: 165,
      b: 233,
      variance: 0.42,
      outlierRatio: 0.012
    });

    if (dom.streamIndicator) dom.streamIndicator.className = 'status-beacon live';
    if (dom.streamStatus) dom.streamStatus.textContent = 'CALIBRATED DEMO';
    if (dom.deviceFpsChip) dom.deviceFpsChip.textContent = '60.0 FPS';
    if (dom.btnSave) dom.btnSave.disabled = false;

    if (!state.historyLog.length) {
      state.historyLog = [
        { hex: '#0EA5E9', name: 'Vibrant Cyan Matrix', rgb: 'rgb(14, 165, 233)', lab: 'L:65.4 a:-14.2 b:-42.8', time: 'CALIB-01' },
        { hex: '#10B981', name: 'Vibrant Signal Green', rgb: 'rgb(16, 185, 129)', lab: 'L:68.9 a:-51.4 b:24.1', time: 'CALIB-02' },
        { hex: '#6366F1', name: 'Vibrant Process Cobalt', rgb: 'rgb(99, 102, 241)', lab: 'L:49.1 a:32.8 b:-66.4', time: 'CALIB-03' },
        { hex: '#F59E0B', name: 'Vibrant Industrial Yellow', rgb: 'rgb(245, 158, 11)', lab: 'L:70.2 a:18.5 b:74.0', time: 'CALIB-04' }
      ];
      renderHistoryTray();
    }
  }

  /* ==========================================================================
     PART 1D: CAMERA SENSOR & STATIC IMAGE LIFECYCLE
     ========================================================================== */
  async function activateCameraStream() {
    if (state.isTransitioning) return;
    state.isTransitioning = true;
    hideNotice();

    if (state.isImageMode) {
      if (dom.staticImage) {
        dom.staticImage.style.display = 'none';
        dom.staticImage.removeAttribute('src');
      }
      if (dom.video) dom.video.style.display = 'block';
      state.isImageMode = false;
    }

    const isSecure = window.isSecureContext || ['localhost', '127.0.0.1'].includes(window.location.hostname);
    if (!isSecure) {
      showNotice('Camera access requires an HTTPS context or localhost.');
      state.isTransitioning = false;
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      showNotice('WebRTC Camera API is unavailable on this browser.');
      state.isTransitioning = false;
      return;
    }

    if (dom.streamStatus) dom.streamStatus.textContent = 'SYNCHRONIZING...';

    const configurations = [
      { video: { facingMode: { ideal: state.facingMode }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false },
      { video: { facingMode: state.facingMode }, audio: false },
      { video: true, audio: false }
    ];

    let validStream = null;
    for (const spec of configurations) {
      try {
        validStream = await navigator.mediaDevices.getUserMedia(spec);
        if (validStream) break;
      } catch (err) {
        // Fallback to next constraint profile
      }
    }

    if (!validStream) {
      showNotice('Hardware sensor unreachable. Verify camera permissions.');
      if (dom.streamStatus) dom.streamStatus.textContent = 'OFFLINE';
      state.isTransitioning = false;
      return;
    }

    state.stream = validStream;
    if (!dom.video) {
      state.isTransitioning = false;
      return;
    }

    dom.video.srcObject = validStream;
    dom.video.classList.toggle('is-mirrored', state.facingMode === 'user');

    dom.video.onloadedmetadata = async () => {
      try {
        await dom.video.play();
        if (dom.stageCover) dom.stageCover.style.display = 'none';
        setSensorEngagedUI(true);
        startProcessingLoop();
      } catch (e) {
        showNotice('Autoplay blocked. Click or tap within the viewport to start.');
      } finally {
        state.isTransitioning = false;
      }
    };
  }

  function terminateCameraStream() {
    if (state.rafId) {
      cancelAnimationFrame(state.rafId);
      state.rafId = null;
    }
    if (state.stream) {
      state.stream.getTracks().forEach((track) => track.stop());
      state.stream = null;
    }

    if (dom.video) {
      dom.video.onloadedmetadata = null;
      dom.video.srcObject = null;
    }
    if (!state.isImageMode) {
      if (dom.stageCover) dom.stageCover.style.display = 'flex';
      setSensorEngagedUI(false);
    }
  }

  function setSensorEngagedUI(isEngaged) {
    if (!dom.btnPower) return;
    const powerSpan = dom.btnPower.querySelector('span');

    if (isEngaged) {
      dom.btnPower.classList.replace('btn-primary', 'btn-warning');
      if (powerSpan) powerSpan.textContent = 'Disengage';
      dom.btnPower.setAttribute('aria-pressed', 'true');
      if (dom.btnFlip) dom.btnFlip.disabled = state.isImageMode;
      if (dom.btnLock) dom.btnLock.disabled = false;
      if (dom.btnSave) dom.btnSave.disabled = false;
      if (dom.streamIndicator) dom.streamIndicator.className = 'status-beacon live';
      if (dom.streamStatus) dom.streamStatus.textContent = 'OPTICAL RUNNING';
      if (dom.viewportPrompt) {
        dom.viewportPrompt.textContent = 'Click, drag, or use arrow keys on reticle to sample coordinate';
      }
    } else {
      dom.btnPower.classList.replace('btn-warning', 'btn-primary');
      if (powerSpan) powerSpan.textContent = 'Power Sensor';
      dom.btnPower.setAttribute('aria-pressed', 'false');
      if (dom.btnFlip) dom.btnFlip.disabled = true;
      if (dom.btnLock) {
        dom.btnLock.disabled = true;
        dom.btnLock.classList.replace('btn-primary', 'btn-warning');
        dom.btnLock.setAttribute('aria-pressed', 'false');
      }
      state.isLocked = false;
      if (dom.lockText) dom.lockText.textContent = 'Hold Lock';
      if (dom.streamIndicator) dom.streamIndicator.className = 'status-beacon';
      if (dom.streamStatus) dom.streamStatus.textContent = 'SENSOR STANDBY';
      if (dom.viewportPrompt) {
        dom.viewportPrompt.textContent = 'Initialize sensor to start color analysis';
      }
      if (dom.deviceFpsChip) dom.deviceFpsChip.textContent = '0.0 FPS';
    }
  }

  async function flipSensorLens() {
    if (!state.stream || state.isTransitioning) return;
    state.facingMode = state.facingMode === 'environment' ? 'user' : 'environment';
    terminateCameraStream();
    await activateCameraStream();
  }

  function handleImageFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      showNotice('Unsupported file format. Please select a valid image file.');
      return;
    }
    hideNotice();

    const reader = new FileReader();
    reader.onload = (e) => {
      terminateCameraStream();
      state.isImageMode = true;
      if (dom.video) dom.video.style.display = 'none';
      if (!dom.staticImage) return;

      dom.staticImage.onload = () => {
        analyzeStaticFrame();
      };
      dom.staticImage.onerror = () => {
        showNotice('Failed to decode image file.');
      };
      dom.staticImage.src = e.target.result;
      dom.staticImage.style.display = 'block';
      if (dom.stageCover) dom.stageCover.style.display = 'none';
      setSensorEngagedUI(true);
      if (dom.btnFlip) dom.btnFlip.disabled = true;
      if (dom.streamStatus) dom.streamStatus.textContent = 'STATIC SAMPLE';
      if (dom.streamIndicator) dom.streamIndicator.className = 'status-beacon locked';
      if (dom.deviceFpsChip) dom.deviceFpsChip.textContent = 'STATIC';
    };
    reader.onerror = () => {
      showNotice('File read error. Please try another image.');
    };
    reader.readAsDataURL(file);
  }

  /* ==========================================================================
     PART 1E: ZERO-ALLOCATION PIXEL EXTRACTION & SIGNAL PROCESSING
     ========================================================================== */
  function computeTrimmedMean(typedArr, length) {
    if (length <= 0) return 0;
    const scratch = pixelBuffers.sortScratch.subarray(0, length);
    scratch.set(typedArr.subarray(0, length));
    scratch.sort();

    const start = Math.floor(length * 0.15);
    const end = Math.max(start + 1, Math.ceil(length * 0.85));
    let sum = 0;
    for (let i = start; i < end; i++) {
      sum += scratch[i];
    }
    return Math.round(sum / (end - start));
  }

  function executeColorExtraction(sourceElement, isVideo = true) {
    if (!sourceElement || !ctx || !dom.canvas) return null;

    const sw = isVideo ? sourceElement.videoWidth : sourceElement.naturalWidth;
    const sh = isVideo ? sourceElement.videoHeight : sourceElement.naturalHeight;
    const cw = sourceElement.clientWidth;
    const ch = sourceElement.clientHeight;
    if (!sw || !sh || !cw || !ch) return null;

    const sRatio = sw / sh;
    const cRatio = cw / ch;

    let rendW, rendH, rendX, rendY;
    if (cRatio > sRatio) {
      rendW = sw;
      rendH = sw / cRatio;
      rendX = 0;
      rendY = (sh - rendH) * 0.5;
    } else {
      rendW = sh * cRatio;
      rendH = sh;
      rendX = (sw - rendW) * 0.5;
      rendY = 0;
    }

    const kernel = state.precisionMode ? 32 : 20;
    const half = kernel * 0.5;

    const isMirrored = isVideo && state.facingMode === 'user';
    const normX = isMirrored ? 1.0 - state.targetNormalizedPos.x : state.targetNormalizedPos.x;
    const normY = state.targetNormalizedPos.y;

    const sampleCenterX = rendX + normX * rendW;
    const sampleCenterY = rendY + normY * rendH;

    const startX = Math.max(0, Math.min(sw - kernel, Math.floor(sampleCenterX - half)));
    const startY = Math.max(0, Math.min(sh - kernel, Math.floor(sampleCenterY - half)));

    if (dom.canvas.width !== kernel || dom.canvas.height !== kernel) {
      dom.canvas.width = kernel;
      dom.canvas.height = kernel;
    }

    let pixels;
    try {
      ctx.drawImage(sourceElement, startX, startY, kernel, kernel, 0, 0, kernel, kernel);
      pixels = ctx.getImageData(0, 0, kernel, kernel).data;
    } catch (e) {
      return null;
    }

    const total = kernel * kernel;
    let validCount = 0;
    let rejectedGlare = 0;

    const rBuf = pixelBuffers.r;
    const gBuf = pixelBuffers.g;
    const bBuf = pixelBuffers.b;

    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];

      if ((r > 248 && g > 248 && b > 248) || (r < 8 && g < 8 && b < 8)) {
        rejectedGlare++;
        continue;
      }
      rBuf[validCount] = r;
      gBuf[validCount] = g;
      bBuf[validCount] = b;
      validCount++;
    }

    let meanR, meanG, meanB;
    if (validCount >= 8) {
      meanR = computeTrimmedMean(rBuf, validCount);
      meanG = computeTrimmedMean(gBuf, validCount);
      meanB = computeTrimmedMean(bBuf, validCount);
    } else {
      meanR = pixels[0];
      meanG = pixels[1];
      meanB = pixels[2];
      validCount = 1;
      rBuf[0] = meanR;
      gBuf[0] = meanG;
      bBuf[0] = meanB;
    }

    let varianceSum = 0;
    for (let i = 0; i < validCount; i++) {
      varianceSum += Math.abs(rBuf[i] - meanR)
                   + Math.abs(gBuf[i] - meanG)
                   + Math.abs(bBuf[i] - meanB);
    }
    const avgSpatialVariance = varianceSum / (validCount * 3);

    return {
      r: meanR,
      g: meanG,
      b: meanB,
      variance: avgSpatialVariance,
      outlierRatio: rejectedGlare / total
    };
  }

  function startProcessingLoop() {
    let frameCounter = 0;
    let lastFpsStamp = performance.now();

    function cycle(timestamp) {
      if (!state.stream || state.isImageMode) return;

      if (!document.hidden) {
        const threshold = state.precisionMode ? 40 : 20;
        if (!state.isLocked && timestamp - state.lastTime >= threshold) {
          state.lastTime = timestamp;
          analyzeFrame();
        }

        frameCounter++;
        if (timestamp - lastFpsStamp >= 1000) {
          const fps = ((frameCounter * 1000) / (timestamp - lastFpsStamp)).toFixed(1);
          if (dom.deviceFpsChip) dom.deviceFpsChip.textContent = `${fps} FPS`;
          frameCounter = 0;
          lastFpsStamp = timestamp;
        }
      }

      state.rafId = requestAnimationFrame(cycle);
    }

    if (state.rafId) cancelAnimationFrame(state.rafId);
    state.rafId = requestAnimationFrame(cycle);
  }

  function analyzeFrame() {
    if (!dom.video || dom.video.readyState < 2) return;
    const sample = executeColorExtraction(dom.video, true);
    if (sample) processSamplePayload(sample);
  }

  function analyzeStaticFrame() {
    if (state.isLocked || !dom.staticImage) return;
    const sample = executeColorExtraction(dom.staticImage, false);
    if (sample) processSamplePayload(sample);
  }

  function processSamplePayload(sample) {
    const { r, g, b, variance, outlierRatio } = sample;
    const hex = ColorScience.rgbToHex(r, g, b);
    const qualityScore = Math.max(
      10,
      Math.min(99, Math.round(100 - variance * 2.2 - outlierRatio * 60))
    );

    const colorChanged = hex !== state.lastRenderedHex;

    let lab, xyz, hsl, name, wcag;
    if (colorChanged || !state.currentReading) {
      xyz = ColorScience.srgbToXyz(r, g, b);
      lab = ColorScience.xyzToLab(xyz.X, xyz.Y, xyz.Z);
      hsl = ColorScience.rgbToHsl(r, g, b);
      name = ColorScience.resolveName(r, g, b);
      wcag = ColorScience.calculateWcagContrast(r, g, b);
    } else {
      ({ lab, xyz, hsl, name, wcag } = state.currentReading);
    }

    state.currentReading = {
      r, g, b, hex, lab, xyz, hsl, name, wcag, qualityScore, variance, outlierRatio
    };

    renderDashboard(state.currentReading, colorChanged);
  }

  function renderDashboard(data, colorChanged) {
    const { r, g, b, hex, lab, xyz, hsl, name, wcag, qualityScore, variance, outlierRatio } = data;

    if (colorChanged) {
      state.lastRenderedHex = hex;
      if (dom.reticleCore) dom.reticleCore.style.backgroundColor = hex;
      if (dom.targetSwatch) dom.targetSwatch.style.backgroundColor = hex;
      if (dom.contrastBadge) dom.contrastBadge.textContent = `WCAG: ${wcag}:1`;
      if (dom.colorName) dom.colorName.textContent = name;
      if (dom.hexDisplay) dom.hexDisplay.textContent = hex;
      if (dom.rgbVector) dom.rgbVector.textContent = `RGB: (${r}, ${g}, ${b})`;

      if (dom.barR) dom.barR.style.width = `${((r / 255) * 100).toFixed(1)}%`;
      if (dom.barG) dom.barG.style.width = `${((g / 255) * 100).toFixed(1)}%`;
      if (dom.barB) dom.barB.style.width = `${((b / 255) * 100).toFixed(1)}%`;

      if (dom.labCoords) dom.labCoords.textContent = `L*: ${lab.L.toFixed(1)} a*: ${lab.a.toFixed(1)} b*: ${lab.b.toFixed(1)}`;
      if (dom.xyzCoords) dom.xyzCoords.textContent = `X: ${xyz.X.toFixed(1)} Y: ${xyz.Y.toFixed(1)} Z: ${xyz.Z.toFixed(1)}`;
      if (dom.hslCoords) dom.hslCoords.textContent = `${hsl.h}\u00B0 / ${hsl.s}% / ${hsl.l}%`;
      if (dom.lumCoords) dom.lumCoords.textContent = `${(xyz.Y / 100).toFixed(3)} rel`;

      updateShadeMatrix(lab);
    }

    if (qualityScore !== state.lastRenderedQuality) {
      state.lastRenderedQuality = qualityScore;
      if (dom.qualityPercent) dom.qualityPercent.textContent = `${qualityScore}%`;
      if (dom.qualityFill) {
        dom.qualityFill.style.width = `${qualityScore}%`;
        dom.qualityFill.style.backgroundColor = qualityScore > 75
          ? 'var(--accent-green)'
          : qualityScore > 45
            ? 'var(--accent-amber)'
            : 'var(--accent-rose)';
      }
    }

    const roundedVar = Math.round(variance * 100);
    if (roundedVar !== state.lastRenderedVariance) {
      state.lastRenderedVariance = roundedVar;
      const varMeterVal = Math.min(100, Math.round(variance * 5));
      if (dom.varianceValue) dom.varianceValue.textContent = `\u00B1${variance.toFixed(2)}`;
      if (dom.varianceFill) dom.varianceFill.style.width = `${varMeterVal}%`;
      if (dom.outliersCoords) dom.outliersCoords.textContent = `${(outlierRatio * 100).toFixed(1)}%`;
    }
  }

  function updateShadeMatrix(centerLab) {
    for (let idx = 0; idx < SHADE_VECTORS.length; idx++) {
      const vec = SHADE_VECTORS[idx];
      const node = state.matrixElements[idx];
      if (!node) continue;

      const modLab = {
        L: Math.max(0, Math.min(100, centerLab.L + vec.dL)),
        a: centerLab.a + vec.da,
        b: centerLab.b + vec.db
      };

      const srgb = ColorScience.labToRgb(modLab.L, modLab.a, modLab.b);
      const hex = ColorScience.rgbToHex(srgb.r, srgb.g, srgb.b);
      const clippedLab = ColorScience.rgbToLab(srgb.r, srgb.g, srgb.b);
      const deltaE = ColorScience.computeDeltaE00(centerLab, clippedLab);

      node.swatch.style.backgroundColor = hex;
      node.hexLabel.textContent = hex;
      node.deltaLabel.textContent = `\u0394${deltaE.toFixed(1)}`;
      node.descLabel.textContent = vec.desc;
      node.container.setAttribute('aria-label', `${vec.desc}: ${hex}, Delta E ${deltaE.toFixed(1)}. Activate to copy.`);
    }
  }

  /* ==========================================================================
     PART 1F: USER ACTIONS, SESSION LOGGING & CLIPBOARD UTILITIES
     ========================================================================== */
  function toggleColorLock() {
    state.isLocked = !state.isLocked;
    if (state.isLocked) {
      if (dom.btnLock) {
        dom.btnLock.classList.replace('btn-warning', 'btn-primary');
        dom.btnLock.setAttribute('aria-pressed', 'true');
      }
      if (dom.lockText) dom.lockText.textContent = 'Unlock Stream';
      if (dom.streamIndicator) dom.streamIndicator.className = 'status-beacon locked';
      if (dom.streamStatus) dom.streamStatus.textContent = 'FREEZE FRAME';
      showToast('Color metrology coordinate locked.');
    } else {
      if (dom.btnLock) {
        dom.btnLock.classList.replace('btn-primary', 'btn-warning');
        dom.btnLock.setAttribute('aria-pressed', 'false');
      }
      if (dom.lockText) dom.lockText.textContent = 'Hold Lock';
      if (dom.streamIndicator) dom.streamIndicator.className = 'status-beacon live';
      if (dom.streamStatus) {
        dom.streamStatus.textContent = state.isImageMode ? 'STATIC SAMPLE' : 'OPTICAL RUNNING';
      }
      showToast('Real-time optical stream resumed.');
    }
  }

  function storeCurrentReading() {
    if (!state.currentReading) return;
    const entry = {
      hex: state.currentReading.hex,
      name: state.currentReading.name,
      rgb: `rgb(${state.currentReading.r}, ${state.currentReading.g}, ${state.currentReading.b})`,
      lab: `L:${state.currentReading.lab.L.toFixed(1)} a:${state.currentReading.lab.a.toFixed(1)} b:${state.currentReading.lab.b.toFixed(1)}`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };

    state.historyLog.unshift(entry);
    if (state.historyLog.length > 30) state.historyLog.pop();

    try {
      localStorage.setItem('spectra_log', JSON.stringify(state.historyLog));
    } catch (e) {
      // Storage quota or private browsing restriction
    }

    renderHistoryTray();
    showToast(`Registered ${entry.hex} in session log`);
  }

  function escapeCSVField(val) {
    const str = String(val ?? '').replace(/"/g, '""');
    return `"${str}"`;
  }

  function exportLogCSV() {
    if (!state.historyLog.length) {
      showToast('No logged data to export.');
      return;
    }
    const headers = 'Timestamp,Color Name,HEX,RGB,Lab\n';
    const rows = state.historyLog
      .map((i) => [i.time, i.name, i.hex, i.rgb, i.lab].map(escapeCSVField).join(','))
      .join('\n');

    const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SPECTRA_METROLOGY_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Session CSV exported.');
  }

  function renderHistoryTray() {
    if (!dom.logScroller) return;
    dom.logScroller.innerHTML = '';

    if (!state.historyLog.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'No recorded points in memory';
      dom.logScroller.appendChild(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    state.historyLog.forEach((item) => {
      const chip = document.createElement('div');
      chip.className = 'history-item';
      chip.tabIndex = 0;
      chip.setAttribute('role', 'button');
      chip.dataset.hex = item.hex;
      chip.title = `${item.name} (${item.time})`;
      chip.setAttribute('aria-label', `Copy ${item.name} ${item.hex}, recorded at ${item.time}`);

      const swatch = document.createElement('div');
      swatch.className = 'item-swatch';
      swatch.style.backgroundColor = item.hex;

      const hexText = document.createElement('div');
      hexText.className = 'item-hex';
      hexText.textContent = item.hex;

      chip.appendChild(swatch);
      chip.appendChild(hexText);
      fragment.appendChild(chip);
    });

    dom.logScroller.appendChild(fragment);
  }

  function copyData(str) {
    if (!str) return;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(str)
        .then(() => showToast(`Copied ${str}`))
        .catch(() => fallbackCopy(str));
    } else {
      fallbackCopy(str);
    }
  }

  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    ta.style.pointerEvents = 'none';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      showToast(`Copied ${text}`);
    } catch (e) {
      showToast('Clipboard permission rejected.');
    }
    document.body.removeChild(ta);
  }

  let toastTimer = null;
  function showToast(msg) {
    if (!dom.toast) return;
    dom.toast.textContent = msg;
    dom.toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      dom.toast.classList.remove('visible');
    }, 2200);
  }

  function showNotice(msg) {
    if (!dom.noticeBanner) return;
    dom.noticeBanner.textContent = msg;
    dom.noticeBanner.style.display = 'block';
    dom.noticeBanner.setAttribute('role', 'alert');
  }

  function hideNotice() {
    if (!dom.noticeBanner) return;
    dom.noticeBanner.style.display = 'none';
  }

  /* ==========================================================================
     PART 1G: RETICLE POSITIONING & EVENT LISTENERS
     ========================================================================== */
  function setReticleNormalized(normX, normY) {
    if (!dom.viewportCard || !dom.reticle) return;
    const rect = dom.viewportCard.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const clampedNormX = Math.max(0, Math.min(1, normX));
    const clampedNormY = Math.max(0, Math.min(1, normY));

    state.targetNormalizedPos = { x: clampedNormX, y: clampedNormY };

    dom.reticle.style.left = `${(clampedNormX * rect.width).toFixed(1)}px`;
    dom.reticle.style.top = `${(clampedNormY * rect.height).toFixed(1)}px`;

    if (state.isImageMode) {
      analyzeStaticFrame();
    } else if (state.stream && !state.isLocked) {
      analyzeFrame();
    }
  }

  function updateReticlePosition(clientX, clientY) {
    if (!dom.viewportCard) return;
    const rect = dom.viewportCard.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const clampedX = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const clampedY = Math.max(0, Math.min(rect.height, clientY - rect.top));

    setReticleNormalized(clampedX / rect.width, clampedY / rect.height);
  }

  function bindApplicationEvents() {
    if (dom.viewportCard) {
      dom.viewportCard.addEventListener('pointerdown', (e) => {
        if ((!state.stream && !state.isImageMode) || e.target.closest('button')) return;
        state.isDraggingReticle = true;
        try {
          dom.viewportCard.setPointerCapture(e.pointerId);
        } catch (err) {}
        updateReticlePosition(e.clientX, e.clientY);
      });

      dom.viewportCard.addEventListener('pointermove', (e) => {
        if (!state.isDraggingReticle) return;
        updateReticlePosition(e.clientX, e.clientY);
      });

      const endReticleDrag = (e) => {
        if (!state.isDraggingReticle) return;
        state.isDraggingReticle = false;
        try {
          if (e?.pointerId !== undefined && dom.viewportCard.hasPointerCapture(e.pointerId)) {
            dom.viewportCard.releasePointerCapture(e.pointerId);
          }
        } catch (err) {}
      };

      dom.viewportCard.addEventListener('pointerup', endReticleDrag);
      dom.viewportCard.addEventListener('pointercancel', endReticleDrag);

      dom.viewportCard.addEventListener('dragover', (e) => e.preventDefault());
      dom.viewportCard.addEventListener('drop', (e) => {
        e.preventDefault();
        if (e.dataTransfer?.files?.[0]) handleImageFile(e.dataTransfer.files[0]);
      });
    }

    // Keyboard navigation support for reticle
    if (dom.reticle) {
      if (!dom.reticle.hasAttribute('tabindex')) dom.reticle.tabIndex = 0;
      dom.reticle.setAttribute('role', 'slider');
      dom.reticle.setAttribute('aria-label', 'Optical sampling reticle. Use arrow keys to move.');

      dom.reticle.addEventListener('keydown', (e) => {
        if (!state.stream && !state.isImageMode) return;
        const step = e.shiftKey ? 0.05 : 0.015;
        let { x, y } = state.targetNormalizedPos;
        let handled = true;

        switch (e.key) {
          case 'ArrowLeft':  x -= step; break;
          case 'ArrowRight': x += step; break;
          case 'ArrowUp':    y -= step; break;
          case 'ArrowDown':  y += step; break;
          default: handled = false;
        }

        if (handled) {
          e.preventDefault();
          setReticleNormalized(x, y);
        }
      });
    }

    // Keep reticle accurately positioned on viewport resize
    window.addEventListener('resize', () => {
      if (!dom.viewportCard || !dom.reticle) return;
      const rect = dom.viewportCard.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      dom.reticle.style.left = `${(state.targetNormalizedPos.x * rect.width).toFixed(1)}px`;
      dom.reticle.style.top = `${(state.targetNormalizedPos.y * rect.height).toFixed(1)}px`;
    }, { passive: true });

    // Delegated click & keyboard activation for Shade Matrix
    if (dom.shadeMatrix) {
      const handleMatrixActivate = (e) => {
        const cell = e.target.closest('.matrix-cell');
        if (!cell) return;
        const hexEl = cell.querySelector('.cell-hex');
        if (hexEl) copyData(hexEl.textContent);
      };

      dom.shadeMatrix.addEventListener('click', handleMatrixActivate);
      dom.shadeMatrix.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleMatrixActivate(e);
        }
      });
    }

    // Delegated click & keyboard activation for History Log
    if (dom.logScroller) {
      const handleHistoryActivate = (e) => {
        const item = e.target.closest('.history-item');
        if (!item) return;
        const hex = item.dataset.hex || item.querySelector('.item-hex')?.textContent;
        if (hex) copyData(hex);
      };

      dom.logScroller.addEventListener('click', handleHistoryActivate);
      dom.logScroller.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleHistoryActivate(e);
        }
      });
    }

    dom.btnPower?.addEventListener('click', () => {
      if (state.stream) terminateCameraStream();
      else activateCameraStream();
    });
    dom.btnCoverPower?.addEventListener('click', activateCameraStream);

    dom.btnFlip?.addEventListener('click', flipSensorLens);
    dom.btnLock?.addEventListener('click', toggleColorLock);
    dom.btnSave?.addEventListener('click', storeCurrentReading);
    dom.exportLog?.addEventListener('click', exportLogCSV);

    dom.btnUpload?.addEventListener('click', () => dom.fileInput?.click());
    dom.btnCoverUpload?.addEventListener('click', () => dom.fileInput?.click());
    dom.fileInput?.addEventListener('change', (e) => {
      if (e.target.files?.[0]) {
        handleImageFile(e.target.files[0]);
        e.target.value = '';
      }
    });

    dom.modeQuick?.addEventListener('click', () => {
      state.precisionMode = false;
      dom.modeQuick.classList.add('active');
      dom.modeQuick.setAttribute('aria-checked', 'true');
      dom.modePrecision?.classList.remove('active');
      dom.modePrecision?.setAttribute('aria-checked', 'false');
      if (dom.scanMethodBadge) dom.scanMethodBadge.textContent = 'TRIMMED MEAN (20PX)';
      if (state.isImageMode) analyzeStaticFrame();
    });

    dom.modePrecision?.addEventListener('click', () => {
      state.precisionMode = true;
      dom.modePrecision.classList.add('active');
      dom.modePrecision.setAttribute('aria-checked', 'true');
      dom.modeQuick?.classList.remove('active');
      dom.modeQuick?.setAttribute('aria-checked', 'false');
      if (dom.scanMethodBadge) dom.scanMethodBadge.textContent = 'CONVERGENCE KERNEL (32PX)';
      if (state.isImageMode) analyzeStaticFrame();
    });

    dom.copyHex?.addEventListener('click', () => {
      if (state.currentReading) copyData(state.currentReading.hex);
    });

    dom.copyRgb?.addEventListener('click', () => {
      if (state.currentReading) {
        copyData(`rgb(${state.currentReading.r}, ${state.currentReading.g}, ${state.currentReading.b})`);
      }
    });

    if (dom.detailsAccordion && dom.accordionBody) {
      dom.detailsAccordion.addEventListener('click', () => {
        const isExpanded = dom.accordionBody.classList.toggle('expanded');
        dom.detailsAccordion.setAttribute('aria-expanded', String(isExpanded));
        dom.accIcon?.classList.toggle('rotated', isExpanded);
      });
    }

    dom.clearLog?.addEventListener('click', () => {
      state.historyLog = [];
      try {
        localStorage.removeItem('spectra_log');
      } catch (e) {}
      renderHistoryTray();
      showToast('History buffer purged.');
    });

    window.addEventListener('beforeunload', terminateCameraStream);
    window.addEventListener('pagehide', terminateCameraStream);
  }

  setupMatrixDOM();
  renderHistoryTray();
  bindApplicationEvents();

  window.SpectraApp = { loadDemoCalibration };

  /* ==========================================================================
     PART 2: SWARM REBUILD — 20-AGENT CURSOR MANAGER
     ========================================================================== */
  class SwarmCursor {
    constructor(config, container) {
      this.id = config.id;
      this.name = config.name;
      this.role = config.role;
      this.color = config.color;
      this.container = container;

      this.currentX = config.startX !== undefined ? config.startX : window.innerWidth * 0.5;
      this.currentY = config.startY !== undefined ? config.startY : window.innerHeight * 0.5;

      this.domElement = null;
      this.badgeEl = null;
      this.speechEl = null;
      this.clickTimer = null;

      this.initDOM();
    }

    initDOM() {
      const el = document.createElement('div');
      el.className = 'swarm-cursor';
      el.id = `swarm-cursor-${this.id}`;
      el.style.setProperty('--swarm-cursor-color', this.color);

      el.innerHTML = `
        <svg class="swarm-cursor-pointer" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5.65 2.15C5.22 1.76 4.5 2.07 4.5 2.65V20.35C4.5 20.9 5.17 21.18 5.56 20.79L10.15 16.2C10.34 16.01 10.6 15.9 10.87 15.9H17.85C18.43 15.9 18.74 15.18 18.35 14.75L5.65 2.15Z" 
                fill="${this.color}" 
                stroke="#ffffff" 
                stroke-width="1.5" 
                stroke-linejoin="round"/>
        </svg>
        <div class="swarm-cursor-badge" style="background-color: ${this.color}">
          <span class="swarm-cursor-dot"></span>
          <span class="swarm-cursor-name"></span>
          <span class="swarm-cursor-role"></span>
        </div>
        <div class="swarm-cursor-speech"></div>
      `;

      el.querySelector('.swarm-cursor-name').textContent = this.name;
      el.querySelector('.swarm-cursor-role').textContent = this.role;

      this.container.appendChild(el);
      this.domElement = el;
      this.badgeEl = el.querySelector('.swarm-cursor-badge');
      this.speechEl = el.querySelector('.swarm-cursor-speech');
      this.updatePosition(this.currentX, this.currentY);
    }

    updatePosition(x, y) {
      this.currentX = x;
      this.currentY = y;
      if (this.domElement) {
        this.domElement.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      }
    }

    setSpeech(text) {
      if (!this.speechEl) return;
      if (!text) {
        this.speechEl.classList.remove('visible');
      } else {
        this.speechEl.textContent = text;
        this.speechEl.classList.add('visible');
      }
    }

    setClicking(isClicking) {
      if (!this.domElement) return;
      if (isClicking) {
        this.domElement.classList.add('clicking');
        this.spawnRipple(this.currentX, this.currentY);
        clearTimeout(this.clickTimer);
        this.clickTimer = setTimeout(() => {
          if (this.domElement) this.domElement.classList.remove('clicking');
        }, 180);
      } else {
        clearTimeout(this.clickTimer);
        this.domElement.classList.remove('clicking');
      }
    }

    setTyping(isTyping) {
      if (!this.domElement) return;
      this.domElement.classList.toggle('typing', Boolean(isTyping));
    }

    spawnRipple(x, y) {
      if (!this.container) return;
      const rip = document.createElement('div');
      rip.className = 'swarm-click-ripple';
      rip.style.setProperty('--swarm-ripple-color', this.color);
      rip.style.left = `${x.toFixed(1)}px`;
      rip.style.top = `${y.toFixed(1)}px`;
      this.container.appendChild(rip);
      setTimeout(() => {
        if (rip.parentNode) rip.parentNode.removeChild(rip);
      }, 380);
    }

    destroy() {
      clearTimeout(this.clickTimer);
      if (this.domElement?.parentNode) {
        this.domElement.parentNode.removeChild(this.domElement);
      }
      this.domElement = null;
    }
  }

  class SwarmCursorManager {
    constructor(overlayContainer) {
      this.container = overlayContainer;
      this.cursors = new Map();

      this.cursorProfiles = [
        { id: 'c1',  name: 'Alex',    role: 'Lead Architect',     color: '#38bdf8' },
        { id: 'c2',  name: 'Elena',   role: 'UI Designer',        color: '#a855f7' },
        { id: 'c3',  name: 'Marcus',  role: 'Typography',         color: '#10b981' },
        { id: 'c4',  name: 'Sarah',   role: 'Visuals',            color: '#f59e0b' },
        { id: 'c5',  name: 'Liam',    role: 'Interactions',       color: '#ec4899' },
        { id: 'c6',  name: 'Devon',   role: 'Color Scientist',    color: '#06b6d4' },
        { id: 'c7',  name: 'Jordan',  role: 'Kernel Engineer',    color: '#8b5cf6' },
        { id: 'c8',  name: 'Taylor',  role: 'QA Lead',            color: '#f97316' },
        { id: 'c9',  name: 'Aria',    role: 'Palette Builder',    color: '#14b8a6' },
        { id: 'c10', name: 'Zane',    role: 'Shader Dev',         color: '#6366f1' },
        { id: 'c11', name: 'Maya',    role: 'Motion Lead',        color: '#d946ef' },
        { id: 'c12', name: 'Ethan',   role: 'WebGL Expert',       color: '#84cc16' },
        { id: 'c13', name: 'Chloe',   role: 'Tokens Lead',        color: '#f43f5e' },
        { id: 'c14', name: 'Oliver',  role: 'Layout Specialist',  color: '#0ea5e9' },
        { id: 'c15', name: 'Lucas',   role: 'CSS Grid Dev',       color: '#22c55e' },
        { id: 'c16', name: 'Kira',    role: 'Micro-Interactions', color: '#eab308' },
        { id: 'c17', name: 'Noah',    role: 'Metrology QA',       color: '#3b82f6' },
        { id: 'c18', name: 'Sophia',  role: 'Audio Engineer',     color: '#a21caf' },
        { id: 'c19', name: 'Leo',     role: 'Telemetry Dev',      color: '#059669' },
        { id: 'c20', name: 'Ruby',    role: 'Inspector',          color: '#fb7185' }
      ];
    }

    setupCursors(count = 20) {
      this.clearAll();
      const countClamped = Math.min(this.cursorProfiles.length, Math.max(2, count));
      const w = window.innerWidth;
      const h = window.innerHeight;
      const fragment = document.createDocumentFragment();

      for (let i = 0; i < countClamped; i++) {
        const p = this.cursorProfiles[i];
        const angle = (i / countClamped) * Math.PI * 2;
        const startX = w * 0.5 + Math.cos(angle) * (w * 0.55);
        const startY = h * 0.5 + Math.sin(angle) * (h * 0.55);

        const cursor = new SwarmCursor({ ...p, startX, startY }, fragment);
        this.cursors.set(p.id, cursor);
      }

      this.container.appendChild(fragment);
      // Re-bind container reference for future ripples
      this.cursors.forEach((cursor) => {
        cursor.container = this.container;
      });
    }

    getCursor(id) {
      return this.cursors.get(id);
    }

    getAllCursors() {
      return Array.from(this.cursors.values());
    }

    clearAll() {
      this.cursors.forEach((cursor) => cursor.destroy());
      this.cursors.clear();
    }
  }

  window.SwarmCursorManager = SwarmCursorManager;

  /* ==========================================================================
     PART 3: SWARM REBUILD — AUDIO SYNTHESIZER & DRAGGABLE STUDIO HUD
     ========================================================================== */
  class SwarmAudioManager {
    constructor() {
      this.audioCtx = null;
      this.isMuted = false;
      this.lastClickTime = 0;
      this.lastTypeTime = 0;

      const unlock = () => {
        this.ensureContext();
        window.removeEventListener('pointerdown', unlock);
        window.removeEventListener('keydown', unlock);
      };
      window.addEventListener('pointerdown', unlock, { passive: true });
      window.addEventListener('keydown', unlock, { passive: true });
    }

    ensureContext() {
      if (!this.audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
          try {
            this.audioCtx = new AudioContextClass();
          } catch (e) {}
        }
      }
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
    }

    playClick() {
      if (this.isMuted) return;
      const now = performance.now();
      if (now - this.lastClickTime < 45) return;
      this.lastClickTime = now;

      try {
        this.ensureContext();
        if (!this.audioCtx || this.audioCtx.state !== 'running') return;

        const t = this.audioCtx.currentTime;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(840, t);
        osc.frequency.exponentialRampToValueAtTime(220, t + 0.03);

        gain.gain.setValueAtTime(0.07, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);

        osc.connect(gain);
        gain.connect(this.audioCtx.destination);

        osc.onended = () => {
          osc.disconnect();
          gain.disconnect();
        };

        osc.start(t);
        osc.stop(t + 0.03);
      } catch (e) {}
    }

    playTyping() {
      if (this.isMuted) return;
      const now = performance.now();
      if (now - this.lastTypeTime < 35) return;
      this.lastTypeTime = now;

      try {
        this.ensureContext();
        if (!this.audioCtx || this.audioCtx.state !== 'running') return;

        const t = this.audioCtx.currentTime;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        const baseFreq = 460 + Math.random() * 280;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(baseFreq, t);

        gain.gain.setValueAtTime(0.04, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.02);

        osc.connect(gain);
        gain.connect(this.audioCtx.destination);

        osc.onended = () => {
          osc.disconnect();
          gain.disconnect();
        };

        osc.start(t);
        osc.stop(t + 0.02);
      } catch (e) {}
    }

    playCompletion() {
      if (this.isMuted) return;
      try {
        this.ensureContext();
        if (!this.audioCtx || this.audioCtx.state !== 'running') return;

        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((freq, idx) => {
          const start = this.audioCtx.currentTime + idx * 0.07;
          const osc = this.audioCtx.createOscillator();
          const gain = this.audioCtx.createGain();

          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, start);

          gain.gain.setValueAtTime(0.1, start);
          gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);

          osc.connect(gain);
          gain.connect(this.audioCtx.destination);

          osc.onended = () => {
            osc.disconnect();
            gain.disconnect();
          };

          osc.start(start);
          osc.stop(start + 0.25);
        });
      } catch (e) {}
    }

    setMuted(muted) {
      this.isMuted = Boolean(muted);
    }
  }

  class SwarmControlPanel {
    constructor(delegate) {
      this.delegate = delegate;
      this.domElement = null;
      this.bannerElement = null;
      this.isDragging = false;
      this.dragOffset = { x: 0, y: 0 };
      this.initDOM();
    }

    initDOM() {
      const banner = document.createElement('div');
      banner.className = 'swarm-cinematic-banner';
      banner.id = 'swarm-banner';
      banner.setAttribute('role', 'status');
      banner.setAttribute('aria-live', 'polite');
      banner.innerHTML = `
        <div class="swarm-cinematic-spinner" aria-hidden="true"></div>
        <span id="swarm-banner-text">SWARM 20-AGENT ENGINE ACTIVE</span>
      `;
      document.body.appendChild(banner);
      this.bannerElement = banner;

      const panel = document.createElement('aside');
      panel.className = 'swarm-control-panel hidden-panel';
      panel.id = 'swarm-control-panel';
      panel.setAttribute('aria-label', 'Swarm Reconstruction Studio Controls');
      panel.innerHTML = `
        <div class="swarm-panel-header" id="swarm-drag-handle" title="Drag to reposition">
          <div class="swarm-panel-title-group">
            <span class="swarm-panel-badge">SWARM &times; 20</span>
            <span class="swarm-panel-title">Reconstruction Studio</span>
          </div>
          <button type="button" class="swarm-panel-close-btn" id="swarm-close-btn" title="Finish & Close" aria-label="Finish and close studio panel">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div class="swarm-activity-display">
          <span class="swarm-activity-text" id="swarm-activity-text">Initializing 20-agent swarm...</span>
          <span class="font-mono" id="swarm-progress-label">0%</span>
        </div>

        <div class="swarm-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="swarm-progress-bar">
          <div class="swarm-progress-fill" id="swarm-progress-fill"></div>
        </div>

        <div class="swarm-controls-row">
          <button type="button" class="swarm-btn swarm-btn-primary" id="swarm-pause-btn">
            <span id="swarm-pause-label">Pause</span>
          </button>
          <button type="button" class="swarm-btn" id="swarm-replay-btn">Replay</button>
          <button type="button" class="swarm-btn" id="swarm-skip-btn">Finish Now</button>
        </div>

        <div class="swarm-toggles-row">
          <div class="swarm-select-group">
            <label for="swarm-speed-select">Speed:</label>
            <select class="swarm-select" id="swarm-speed-select">
              <option value="0.5">0.5x</option>
              <option value="1" selected>1.0x</option>
              <option value="2">2.0x</option>
              <option value="4">4.0x</option>
            </select>
          </div>
          <div class="swarm-select-group">
            <label for="swarm-agent-select">Agents:</label>
            <select class="swarm-select" id="swarm-agent-select">
              <option value="5">5</option>
              <option value="10">10</option>
              <option value="20" selected>20</option>
            </select>
          </div>
          <label style="display:flex;align-items:center;gap:4px;cursor:pointer;">
            <input type="checkbox" id="swarm-mute-toggle" />
            <span>Mute</span>
          </label>
        </div>
      `;

      document.body.appendChild(panel);
      this.domElement = panel;

      this.activityText = panel.querySelector('#swarm-activity-text');
      this.progressLabel = panel.querySelector('#swarm-progress-label');
      this.progressFill = panel.querySelector('#swarm-progress-fill');
      this.progressBar = panel.querySelector('#swarm-progress-bar');
      this.pauseBtn = panel.querySelector('#swarm-pause-btn');
      this.pauseLabel = panel.querySelector('#swarm-pause-label');
      this.replayBtn = panel.querySelector('#swarm-replay-btn');
      this.skipBtn = panel.querySelector('#swarm-skip-btn');
      this.closeBtn = panel.querySelector('#swarm-close-btn');
      this.speedSelect = panel.querySelector('#swarm-speed-select');
      this.agentSelect = panel.querySelector('#swarm-agent-select');
      this.muteToggle = panel.querySelector('#swarm-mute-toggle');
      this.dragHandle = panel.querySelector('#swarm-drag-handle');

      this.bindEvents();
    }

    bindEvents() {
      this.pauseBtn.addEventListener('click', () => {
        this.delegate?.onTogglePause?.();
      });

      this.replayBtn.addEventListener('click', () => {
        this.delegate?.onReplay?.();
      });

      this.skipBtn.addEventListener('click', () => {
        this.delegate?.onSkip?.();
      });

      this.closeBtn.addEventListener('click', () => {
        this.delegate?.onClose?.();
      });

      this.speedSelect.addEventListener('change', (e) => {
        const val = parseFloat(e.target.value) || 1;
        this.delegate?.onSpeedChange?.(val);
      });

      this.agentSelect.addEventListener('change', (e) => {
        const count = parseInt(e.target.value, 10) || 20;
        this.delegate?.onAgentCountChange?.(count);
      });

      this.muteToggle.addEventListener('change', (e) => {
        this.delegate?.onMuteChange?.(e.target.checked);
      });

      this.dragHandle.addEventListener('pointerdown', (e) => {
        if (e.target.closest('button')) return;
        this.isDragging = true;
        try {
          this.dragHandle.setPointerCapture(e.pointerId);
        } catch (err) {}
        const rect = this.domElement.getBoundingClientRect();
        this.dragOffset.x = e.clientX - rect.left;
        this.dragOffset.y = e.clientY - rect.top;
        this.domElement.style.transition = 'none';
      });

      this.dragHandle.addEventListener('pointermove', (e) => {
        if (!this.isDragging) return;
        const maxX = Math.max(8, window.innerWidth - this.domElement.offsetWidth - 8);
        const maxY = Math.max(8, window.innerHeight - this.domElement.offsetHeight - 8);
        const x = Math.max(8, Math.min(maxX, e.clientX - this.dragOffset.x));
        const y = Math.max(8, Math.min(maxY, e.clientY - this.dragOffset.y));
        this.domElement.style.left = `${x}px`;
        this.domElement.style.top = `${y}px`;
        this.domElement.style.right = 'auto';
        this.domElement.style.bottom = 'auto';
      });

      const stopDrag = (e) => {
        if (!this.isDragging) return;
        this.isDragging = false;
        this.domElement.style.transition = '';
        try {
          if (e?.pointerId !== undefined && this.dragHandle.hasPointerCapture(e.pointerId)) {
            this.dragHandle.releasePointerCapture(e.pointerId);
          }
        } catch (err) {}
      };

      this.dragHandle.addEventListener('pointerup', stopDrag);
      this.dragHandle.addEventListener('pointercancel', stopDrag);

      // Keep panel within viewport bounds on window resize
      window.addEventListener('resize', () => {
        if (!this.domElement.style.left || this.domElement.style.left === 'auto') return;
        const rect = this.domElement.getBoundingClientRect();
        const maxX = Math.max(8, window.innerWidth - this.domElement.offsetWidth - 8);
        const maxY = Math.max(8, window.innerHeight - this.domElement.offsetHeight - 8);
        if (rect.left > maxX) this.domElement.style.left = `${maxX}px`;
        if (rect.top > maxY) this.domElement.style.top = `${maxY}px`;
      }, { passive: true });
    }

    show() {
      this.domElement.classList.remove('hidden-panel');
      this.bannerElement.classList.add('visible');
    }

    hide() {
      this.domElement.classList.add('hidden-panel');
      this.bannerElement.classList.remove('visible');
    }

    hideBanner() {
      this.bannerElement.classList.remove('visible');
    }

    setPaused(isPaused) {
      this.pauseLabel.textContent = isPaused ? 'Resume' : 'Pause';
    }

    updateProgress(percent, statusText) {
      const clamped = Math.max(0, Math.min(100, Math.round(percent)));
      this.progressFill.style.width = `${clamped}%`;
      this.progressLabel.textContent = `${clamped}%`;
      if (this.progressBar) {
        this.progressBar.setAttribute('aria-valuenow', String(clamped));
      }
      if (statusText) {
        this.activityText.textContent = statusText;
      }
    }

    setBannerText(text) {
      const span = this.bannerElement.querySelector('#swarm-banner-text');
      if (span) span.textContent = text;
    }
  }

  /* ==========================================================================
     PART 4: SWARM REBUILD — 20-AGENT RECONSTRUCTION ENGINE
     ========================================================================== */
  class SwarmRebuildEngine {
    constructor() {
      this.stage = null;
      this.backdrop = null;
      this.svgLayer = null;
      this.audio = new SwarmAudioManager();
      this.cursorManager = null;
      this.controlPanel = null;

      this.agentCount = 20;
      this.speedMultiplier = 1.0;
      this.isPaused = false;
      this.isRunning = false;
      this.rafId = null;
      this.bannerTimer = null;
      this.activeGhosts = [];

      this.blueprintSteps = [
        { selector: '#navHeaderBar',         tag: 'NAV_HEADER',       action: 'Mounting top navigation shell' },
        { selector: '.brand-cluster',        tag: 'BRAND_ID',         action: 'Aligning SPECTRA emblem & ASTM tags' },
        { selector: '#navStatusPill',        tag: 'TELEMETRY_BEACON', action: 'Wiring optical status beacon' },
        { selector: '#deviceFpsChip',        tag: 'FPS_CLOCK',        action: 'Calibrating frame-rate counter' },
        { selector: '#startSwarmRebuild',    tag: 'SWARM_TRIGGER',    action: 'Binding 20-agent replay trigger' },
        { selector: '#kernelSelector',       tag: 'KERNEL_SWITCH',    action: 'Configuring 50Hz / 32px selector' },
        { selector: '#viewportCard',         tag: 'OPTICAL_CHAMBER',  action: 'Constructing optical viewport chamber' },
        { selector: '#stageCover',           tag: 'STANDBY_POSTER',   action: 'Rendering sensor standby cover' },
        { selector: '#posterIconRing',       tag: 'OPTIC_RING',       action: 'Centering vector lens graphic' },
        { selector: '#posterActionGroup',    tag: 'CHAMBER_ACTIONS',  action: 'Attaching sensor & upload triggers' },
        { selector: '#reticle',              tag: 'RETICLE_CORE',     action: 'Calibrating crosshair reticle' },
        { selector: '#chamberToolbar',       tag: 'HARDWARE_BAR',     action: 'Building hardware control deck' },
        { selector: '#toolbarSensorGroup',   tag: 'SENSOR_IO',        action: 'Linking WebRTC camera controls' },
        { selector: '#toolbarLockGroup',     tag: 'SAMPLE_LOCK',      action: 'Wiring freeze-frame & register lock' },
        { selector: '#heroReadingCard',      tag: 'PRIMARY_DECK',     action: 'Assembling primary coordinate card' },
        { selector: '#swatchContainer',      tag: 'MONOLITH_SWATCH',  action: 'Polishing target swatch & WCAG badge' },
        { selector: '#metaContainer',        tag: 'HEX_VECTOR',       action: 'Binding HEX readout & RGB bars' },
        { selector: '#gaugesGrid',           tag: 'SIGNAL_GAUGES',    action: 'Calibrating reliability & variance meters' },
        { selector: '#matrixPanelCard',      tag: 'CIEDE2000_GRID',   action: 'Computing \u0394E00 tolerance matrix' },
        { selector: '#coordinatesPanelCard', tag: 'CIE_LAB_XYZ',      action: 'Populating CIE L*a*b* & XYZ table' },
        { selector: '#sessionBufferCard',    tag: 'SESSION_LOG',      action: 'Mounting CSV buffer & history strip' }
      ];

      this.initStageDOM();
    }

    initStageDOM() {
      const backdrop = document.createElement('div');
      backdrop.id = 'swarm-backdrop-grid';
      backdrop.setAttribute('aria-hidden', 'true');
      document.body.appendChild(backdrop);
      this.backdrop = backdrop;

      const stage = document.createElement('div');
      stage.id = 'swarm-rebuild-stage';
      stage.setAttribute('aria-hidden', 'true');
      stage.innerHTML = `<svg id="swarm-vector-svg" xmlns="http://www.w3.org/2000/svg"></svg>`;
      document.body.appendChild(stage);
      this.stage = stage;
      this.svgLayer = stage.querySelector('#swarm-vector-svg');

      this.cursorManager = new SwarmCursorManager(stage);
      this.controlPanel = new SwarmControlPanel({
        onTogglePause: () => this.togglePause(),
        onReplay: () => this.startRebuild(true),
        onSkip: () => this.finishImmediately(),
        onClose: () => {
          this.finishImmediately();
          this.controlPanel.hide();
        },
        onSpeedChange: (val) => {
          this.speedMultiplier = val;
        },
        onAgentCountChange: (count) => {
          this.agentCount = count;
          if (this.isRunning) this.startRebuild(true);
        },
        onMuteChange: (muted) => this.audio.setMuted(muted)
      });

      const replayTrigger = document.getElementById('startSwarmRebuild');
      if (replayTrigger) {
        replayTrigger.addEventListener('click', () => this.startRebuild(true));
      }
    }

    collectTargets() {
      const targets = [];
      this.blueprintSteps.forEach((step) => {
        const el = document.querySelector(step.selector);
        if (el) {
          targets.push({
            el,
            tag: step.tag,
            action: step.action
          });
        }
      });

      const matrixCells = document.querySelectorAll('#shadeMatrix .matrix-cell');
      matrixCells.forEach((cell, idx) => {
        targets.push({
          el: cell,
          tag: `DELTA_CELL_${idx + 1}`,
          action: `Synthesizing \u0394E00 vector #${idx + 1}`
        });
      });

      return targets;
    }

    clearGhosts() {
      this.activeGhosts.forEach((g) => {
        if (g.parentNode) g.parentNode.removeChild(g);
      });
      this.activeGhosts = [];
      if (this.svgLayer) this.svgLayer.innerHTML = '';
    }

    startRebuild(forceAnimation = false) {
      if (this.rafId) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
      clearTimeout(this.bannerTimer);

      const targets = this.collectTargets();

      // Respect prefers-reduced-motion on initial page boot unless explicitly triggered by user
      if (Env.prefersReducedMotion && !forceAnimation) {
        this.completeSequence(targets, true);
        return;
      }

      this.clearGhosts();
      this.isPaused = false;
      this.isRunning = true;
      this.controlPanel.setPaused(false);
      this.controlPanel.show();
      this.controlPanel.setBannerText(`SWARM ${this.agentCount}-AGENT ENGINE ACTIVE`);

      this.stage.classList.add('active');
      this.backdrop.classList.add('visible');

      targets.forEach((item) => {
        item.el.classList.remove('swarm-element-revealing');
        item.el.classList.add('swarm-anim-hidden');
      });

      document.documentElement.classList.remove('swarm-preboot');

      this.cursorManager.setupCursors(this.agentCount);
      const cursors = this.cursorManager.getAllCursors();

      const totalTargets = targets.length;
      if (totalTargets === 0 || cursors.length === 0) {
        this.completeSequence(targets);
        return;
      }

      let completedCount = 0;

      // Pre-allocate reusable SVG lines and cache bounding boxes to prevent layout thrashing
      const tasks = targets.map((t, index) => {
        const assignedCursor = cursors[index % cursors.length];
        const startDelay = Math.floor(index / cursors.length) * 520 + (index % cursors.length) * 55;
        const duration = 480 + (index % 4) * 90;

        const svgLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        svgLine.setAttribute('stroke', assignedCursor.color);
        svgLine.setAttribute('stroke-width', '1.2');
        svgLine.setAttribute('stroke-dasharray', '4 4');
        svgLine.setAttribute('opacity', '0.45');
        svgLine.style.display = 'none';
        this.svgLayer.appendChild(svgLine);

        return {
          ...t,
          cursor: assignedCursor,
          startDelay,
          duration,
          started: false,
          completed: false,
          ghost: null,
          svgLine,
          cachedRect: null,
          originX: assignedCursor.currentX,
          originY: assignedCursor.currentY
        };
      });

      // Refresh cached rects if viewport resizes or scrolls during animation
      const invalidateRectCache = () => {
        tasks.forEach((task) => {
          if (task.started && !task.completed) {
            task.cachedRect = task.el.getBoundingClientRect();
          }
        });
      };
      window.addEventListener('resize', invalidateRectCache, { passive: true });
      window.addEventListener('scroll', invalidateRectCache, { passive: true });

      const cleanupListeners = () => {
        window.removeEventListener('resize', invalidateRectCache);
        window.removeEventListener('scroll', invalidateRectCache);
      };

      const maxTimeline = Math.max(...tasks.map((t) => t.startDelay + t.duration)) + 300;
      let elapsedVirtual = 0;
      let lastFrameTime = performance.now();

      const tick = (now) => {
        if (!this.isRunning) {
          cleanupListeners();
          return;
        }

        const dt = Math.min(100, now - lastFrameTime);
        lastFrameTime = now;

        if (!this.isPaused) {
          elapsedVirtual += dt * this.speedMultiplier;

          for (let i = 0; i < tasks.length; i++) {
            const task = tasks[i];
            if (task.completed) continue;

            if (elapsedVirtual >= task.startDelay && !task.started) {
              task.started = true;
              task.originX = task.cursor.currentX;
              task.originY = task.cursor.currentY;
              task.cachedRect = task.el.getBoundingClientRect();
              task.cursor.setSpeech(`${task.tag}: ${task.action}`);
              task.cursor.setTyping(true);
              this.audio.playTyping();

              const rect = task.cachedRect;
              if (rect.width > 0 && rect.height > 0) {
                const ghost = document.createElement('div');
                ghost.className = 'swarm-element-ghost swarm-ghost-blueprint';
                ghost.style.setProperty('--swarm-cursor-color', task.cursor.color);
                ghost.style.left = `${rect.left.toFixed(1)}px`;
                ghost.style.top = `${rect.top.toFixed(1)}px`;
                ghost.style.width = `${rect.width.toFixed(1)}px`;
                ghost.style.height = `${rect.height.toFixed(1)}px`;

                const tagSpan = document.createElement('span');
                tagSpan.className = 'swarm-ghost-tag';
                tagSpan.textContent = `${task.cursor.name} \u2022 ${task.tag}`;
                ghost.appendChild(tagSpan);

                this.stage.appendChild(ghost);
                task.ghost = ghost;
                this.activeGhosts.push(ghost);
              }

              task.svgLine.style.display = '';
            }

            if (task.started && !task.completed) {
              const localProgress = Math.min(1, (elapsedVirtual - task.startDelay) / task.duration);
              const inv = 1 - localProgress;
              const ease = 1 - inv * inv * inv;
              const rect = task.cachedRect || task.el.getBoundingClientRect();

              const targetX = rect.left + Math.min(rect.width * 0.5, 140) + Math.sin(localProgress * Math.PI * 2) * 14;
              const targetY = rect.top + Math.min(rect.height * 0.5, 45) + Math.cos(localProgress * Math.PI * 2) * 8;

              const curX = task.originX + (targetX - task.originX) * ease;
              const curY = task.originY + (targetY - task.originY) * ease;
              task.cursor.updatePosition(curX, curY);

              task.svgLine.setAttribute('x1', curX.toFixed(1));
              task.svgLine.setAttribute('y1', curY.toFixed(1));
              task.svgLine.setAttribute('x2', (rect.left + rect.width * 0.5).toFixed(1));
              task.svgLine.setAttribute('y2', (rect.top + rect.height * 0.5).toFixed(1));

              if (localProgress >= 1) {
                task.completed = true;
                completedCount++;

                task.svgLine.style.display = 'none';
                task.cursor.setTyping(false);
                task.cursor.setClicking(true);
                this.audio.playClick();

                task.el.classList.remove('swarm-anim-hidden');
                task.el.classList.add('swarm-element-revealing');

                if (task.ghost) {
                  const ghostRef = task.ghost;
                  ghostRef.classList.remove('swarm-ghost-blueprint');
                  ghostRef.classList.add('swarm-ghost-revealed');
                  setTimeout(() => {
                    if (ghostRef.parentNode) ghostRef.parentNode.removeChild(ghostRef);
                  }, 260);
                }

                const pct = (completedCount / totalTargets) * 100;
                this.controlPanel.updateProgress(pct, `${task.cursor.name}: ${task.action}`);
              }
            }
          }

          if (elapsedVirtual >= maxTimeline || completedCount >= totalTargets) {
            cleanupListeners();
            this.completeSequence(targets);
            return;
          }
        }

        this.rafId = requestAnimationFrame(tick);
      };

      this.rafId = requestAnimationFrame(tick);
    }

    togglePause() {
      if (!this.isRunning) return;
      this.isPaused = !this.isPaused;
      this.controlPanel.setPaused(this.isPaused);
      this.controlPanel.setBannerText(
        this.isPaused
          ? 'SWARM RECONSTRUCTION PAUSED'
          : `SWARM ${this.agentCount}-AGENT ENGINE ACTIVE`
      );
    }

    finishImmediately() {
      if (this.rafId) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
      const targets = this.collectTargets();
      this.completeSequence(targets);
    }

    completeSequence(targets, silent = false) {
      this.isRunning = false;
      this.isPaused = false;
      this.controlPanel.setPaused(false);

      document.documentElement.classList.remove('swarm-preboot');

      targets.forEach((item) => {
        item.el.classList.remove('swarm-anim-hidden');
        item.el.classList.add('swarm-element-revealing');
      });

      this.clearGhosts();
      this.cursorManager.clearAll();
      this.backdrop.classList.remove('visible');
      this.stage.classList.remove('active');

      this.controlPanel.updateProgress(100, 'All 20 agents completed metrology build.');
      this.controlPanel.setBannerText('SPECTRA METROLOGY SUITE READY');

      if (!silent) {
        this.audio.playCompletion();
      } else {
        this.controlPanel.hide();
      }

      if (window.SpectraApp?.loadDemoCalibration) {
        window.SpectraApp.loadDemoCalibration();
      }

      clearTimeout(this.bannerTimer);
      this.bannerTimer = setTimeout(() => {
        if (!this.isRunning) {
          this.controlPanel.hideBanner();
        }
      }, 1800);
    }
  }

  /* ==========================================================================
     PART 5: BOOTSTRAP ON DOM READY
     ========================================================================== */
  function bootSpectraSuite() {
    if (window.SpectraApp?.loadDemoCalibration) {
      window.SpectraApp.loadDemoCalibration();
    }
    const swarmEngine = new SwarmRebuildEngine();
    window.SwarmEngine = swarmEngine;
    swarmEngine.startRebuild(false);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootSpectraSuite);
  } else {
    bootSpectraSuite();
  }
})();