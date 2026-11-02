import * as THREE from 'three';
import { FalconScene } from './three/FalconScene.js';
import { StarshipScene } from './three/StarshipScene.js';
import { StarbaseExplorer } from './explorer/StarbaseExplorer.js';
import { UI } from './ui/UI.js';
import { FALCON_MISSIONS } from './simulation/missions.js';
import { SoundEngine } from './audio.js';
import { clamp, formatClock, formatNumber } from './simulation/math.js';

const STORAGE_QUALITY = 'rte-quality-v1';

function detectQuality() {
  try {
    const stored = localStorage.getItem(STORAGE_QUALITY);
    if (stored === 'high' || stored === 'medium' || stored === 'low') return stored;
  } catch (error) {
    /* storage can be blocked; fall through */
  }
  const cores = navigator.hardwareConcurrency || 8;
  const memory = navigator.deviceMemory || 8;
  const small = window.matchMedia('(max-width: 900px)').matches;
  if (small || cores <= 4 || memory <= 4) return 'medium';
  return 'high';
}

class App {
  constructor() {
    this.canvas = document.getElementById('scene');
    this.viewport = document.getElementById('viewport');
    this.state = {
      mode: 'falcon',
      missionId: 'crew12',
      t: -10,
      playing: false,
      speed: 2,
      quality: detectQuality(),
      sound: false,
      cameraMode: 'overview',
      inspection: null,
      demoMode: 'auto',
      started: false,
      intro: true,
      summaryOpen: false,
      scrubbing: false,
      lunar: false,
    };
    this.ui = new UI(this);
    this.sound = new SoundEngine();
    this.renderer = null;
    this.falconScene = null;
    this.starshipScene = null;
    this.starbaseExplorer = null;
    this.explorerWasPlaying = false;
    this.activeScene = null;
    this.activeSimulator = null;
    this.lastSample = null;
    this.lastFrame = 0;
    this.lastUiUpdate = 0;
    this.challengeMissionId = null;
    this.helpWasPlaying = false;
    this.fpsWindow = { start: 0, frames: 0, degraded: false };
    this.mission = FALCON_MISSIONS.crew12;

    if (!this._initRenderer()) return;
    this._buildInitialScene();
    this._bindAppEvents();
    this._bindKeyboard();
    this._observeResize();
    this.ui.showLoading(true);
    requestAnimationFrame((time) => this._animate(time));
  }

  _initRenderer() {
    try {
      const context = this.canvas.getContext('webgl2', {
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: false,
      });
      if (!context) throw new Error('WebGL2 unavailable');
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        context,
        antialias: true,
        powerPreference: 'high-performance',
        logarithmicDepthBuffer: true,
      });
      this.renderer.setClearColor(0x02070b, 1);
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.16;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.info.autoReset = false;
      this.canvas.addEventListener('webglcontextlost', (event) => {
        event.preventDefault();
        this.state.playing = false;
        this.ui.setPlaying(false);
        this.ui.toast('WebGL 上下文丢失。请刷新页面以重新载入场景。');
      });
      return true;
    } catch (error) {
      this.ui.showWebGLError();
      return false;
    }
  }

  _buildInitialScene() {
    this.mission = FALCON_MISSIONS[this.state.missionId];
    this.falconScene = new FalconScene(this.renderer, this.mission, {
      quality: this.state.quality,
    });
    this.activeScene = this.falconScene;
    this.activeSimulator = this.falconScene.simulator;
    this.activeScene.setCameraMode('overview');
    this.ui.setupFalcon(this.mission);
    this.ui.showIntro(true);
    this.ui.setQuality(this.state.quality);
    this.ui.setSound(false);
    this.ui.setPlaying(false);
    this.ui.setSpeed(2);
    this.state.cameraMode = 'overview';
    this.state.t = this.mission.start;
    this.activeScene.notifySeek();
    const rect = this.viewport.getBoundingClientRect();
    this.activeScene.resize(rect.width, rect.height);
    this._updateCanvasCursor();
    this._bindCanvasPicking();
    this._renderIntroFrame();
  }

  _renderIntroFrame() {
    try {
      const sample = this.activeSimulator.sample(this.state.t);
      this.lastSample = sample;
      this.activeScene.update(1 / 60, sample, { playing: false });
      this.activeScene.render();
      this.ui.update(sample, {
        ...this.state,
        partAnchors: [],
      });
    } catch (error) {
      console.error(error);
      this.ui.toast('场景初始化失败，请查看控制台。');
    }
    window.setTimeout(() => this.ui.showLoading(false), 160);
  }

  _bindAppEvents() {
    this._boundCanvasPointerUp = (event) => {
      if (this.starbaseExplorer || this.state.lunar || this.state.mode !== 'falcon') return;
      if (!this.activeScene || this.state.intro) return;
      if (this.activeScene.rig?.didDrag()) return;
      const partId = this.activeScene.pickPart?.(event);
      if (partId) {
        this.selectPart(partId);
      } else if (!document.getElementById('partInfo').hidden) {
        this.clearSelectedPart();
      }
    };
    this.canvas.addEventListener('pointerup', this._boundCanvasPointerUp);
    document.getElementById('starbaseEntryBtn')?.addEventListener('click', () => this.openStarbaseExplorer());
  }

  _bindCanvasPicking() {
    // The renderer canvas persists across scene rebuilds; binding is done once.
  }

  _bindKeyboard() {
    window.addEventListener('keydown', (event) => {
      if (this.starbaseExplorer) return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) {
        if (event.key === 'Escape') target.blur();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.code === 'Space') {
        event.preventDefault();
        this.togglePlay();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        if (this.ui.isHelpOpen()) {
          this.ui.closeHelp();
        } else if (this.state.lunar) {
          this.closeHls();
        } else if (this.state.summaryOpen) {
          this.closeSummary();
        } else if (this.state.inspection) {
          this.exitInspection();
        } else if (!document.getElementById('partInfo').hidden) {
          this.clearSelectedPart();
        } else if (this.state.demoMode === 'challenge') {
          this.setDemoMode('auto');
        }
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        this.seek(this.state.t - 5);
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        this.seek(this.state.t + 5);
        return;
      }
      if (event.key === 'Home') {
        event.preventDefault();
        this.seek(this.getStart());
        return;
      }
      if (event.key.toLowerCase() === 'r') {
        this.restart();
        return;
      }
      if (event.key.toLowerCase() === 'm') {
        this.toggleSound();
        return;
      }
      if (event.key.toLowerCase() === 'f') {
        this.setCameraMode('free');
        return;
      }
      if (event.key.toLowerCase() === 'e') {
        if (this.state.inspection === 'exploded') this.exitInspection();
        else if (this.state.mode === 'falcon') this.startInspection('exploded');
        return;
      }
      if (event.key.toLowerCase() === 'c') {
        if (this.state.inspection === 'cutaway') this.exitInspection();
        else if (this.state.mode === 'falcon') this.startInspection('cutaway');
        return;
      }
      if (/^[1-7]$/.test(event.key)) {
        const modes = this.ui.cameraModes;
        const mode = modes[Number(event.key) - 1];
        if (mode) this.setCameraMode(mode.id);
      }
    });
  }

  _observeResize() {
    this.resizeObserver = new ResizeObserver(() => this.resizeActive());
    this.resizeObserver.observe(this.viewport);
    window.addEventListener('orientationchange', () => {
      window.setTimeout(() => this.resizeActive(), 120);
    });
  }

  resizeActive() {
    if (!this.activeScene) return;
    const rect = this.viewport.getBoundingClientRect();
    this.activeScene.resize(rect.width, rect.height);
  }

  _animate(time) {
    if (this.starbaseExplorer) {
      this.lastFrame = time;
      requestAnimationFrame((next) => this._animate(next));
      return;
    }
    const dt = this.lastFrame ? Math.min(0.2, (time - this.lastFrame) / 1000) : 1 / 60;
    this.lastFrame = time;
    const duration = this.getDuration();
    const start = this.getStart();
    const playing = this.state.playing && !this.state.scrubbing && !this.state.summaryOpen && !this.state.lunar;

    if (playing) {
      this.state.t = clamp(this.state.t + dt * this.state.speed, start, duration);
      if (this.state.mode === 'falcon' && this.state.demoMode === 'challenge') {
        const touchdown = this.mission.touchdown;
        if (this.state.t >= touchdown + 1.4 && this.state.t < duration) {
          this.state.t = Math.min(duration, touchdown + 1.4);
          this.state.playing = false;
          this.ui.setPlaying(false);
          this.showSummary(true);
        }
      }
      if (this.state.t >= duration - 0.001) {
        this.state.t = duration;
        this.state.playing = false;
        this.ui.setPlaying(false);
        if (!this.state.summaryOpen) this.showSummary(true);
      }
    }

    let sample;
    try {
      sample = this.activeSimulator.sample(this.state.t);
      this.lastSample = sample;
      this.activeScene.update(dt, sample, { playing });
    } catch (error) {
      console.error(error);
      this.ui.toast('模拟循环出现异常，已在控制台输出诊断信息。');
      this.state.playing = false;
      return;
    }

    if (time - this.lastUiUpdate > 52) {
      const partAnchors =
        this.state.inspection && this.activeScene.getPartAnchors
          ? this.activeScene.getPartAnchors()
          : [];
      this.ui.update(sample, { ...this.state, partAnchors });
      this.lastUiUpdate = time;
    }

    this._updateSound(sample, playing);
    this._maybeDegradeQuality(time);
    this._updateCanvasCursor();
    if (!this.state.lunar) this.activeScene.render();
    requestAnimationFrame((nextTime) => this._animate(nextTime));
  }

  _updateSound(sample, playing) {
    if (!this.sound.enabled) return;
    const falcon = this.state.mode === 'falcon';
    const primary = falcon ? sample.stage1 : sample.booster;
    const secondary = falcon ? sample.stage2 : sample.ship;
    const engine = (primary.engineCount / (falcon ? 9 : 33)) * primary.throttle;
    const upperEngine = (secondary.engineCount / (falcon ? 1 : 6)) * secondary.throttle;
    const wind = clamp(
      (primary.speed / 1400) * (1 - primary.altitude / 130000),
      0,
      1,
    );
    this.sound.update({
      mode: this.state.mode,
      mission: sample.mission,
      t: sample.t,
      playing: playing && !this.state.inspection && !this.state.summaryOpen,
      engine,
      secondary: upperEngine,
      wind,
      heat: sample.heat,
    });
  }

  _maybeDegradeQuality(time) {
    if (!this.fpsWindow.start) this.fpsWindow.start = time;
    this.fpsWindow.frames += 1;
    const elapsed = time - this.fpsWindow.start;
    if (elapsed < 5000 || this.fpsWindow.degraded) return;
    const fps = (this.fpsWindow.frames / elapsed) * 1000;
    this.fpsWindow.start = time;
    this.fpsWindow.frames = 0;
    if (fps < 32 && this.state.quality !== 'low' && !this.state.intro) {
      const next = this.state.quality === 'high' ? 'medium' : 'low';
      this.state.quality = next;
      this.ui.setQuality(next);
      if (this.activeScene) this.activeScene.applyQuality(next);
      this.ui.toast(`帧率较低，画质已自动调整为${next === 'medium' ? '中' : '低'}。`);
      this.fpsWindow.degraded = true;
    }
  }

  _updateCanvasCursor() {
    if (!this.canvas) return;
    if (this.state.lunar) this.canvas.style.cursor = 'default';
    else if (this.state.inspection) this.canvas.style.cursor = 'crosshair';
    else this.canvas.style.cursor = 'grab';
  }

  getStart() {
    return this.activeSimulator?.mission?.start ?? -10;
  }

  getDuration() {
    return this.activeSimulator?.mission?.duration ?? 497;
  }

  /* --------------------------------------------------------------- playback */
  startDemo() {
    if (!this.activeScene) return;
    this.state.started = true;
    this.state.intro = false;
    this.ui.showIntro(false);
    if (this.state.inspection) this.exitInspection();
    if (this.state.summaryOpen) this.closeSummary();
    this.state.t = this.getStart();
    this.state.playing = true;
    this.ui.setPlaying(true);
    this.activeScene.notifySeek();
    this.activeScene.setCameraMode(this.state.cameraMode);
  }

  togglePlay() {
    if (!this.activeScene || this.state.lunar) return;
    if (this.state.summaryOpen) {
      this.closeSummary();
      return;
    }
    if (this.state.t >= this.getDuration() - 0.05) {
      this.restart();
      return;
    }
    if (this.state.intro) {
      this.state.intro = false;
      this.ui.showIntro(false);
    }
    if (this.state.inspection) this.exitInspection();
    this.state.playing = !this.state.playing;
    this.ui.setPlaying(this.state.playing);
  }

  setPlaying(playing) {
    this.state.playing = !!playing;
    this.ui.setPlaying(this.state.playing);
  }

  beginScrub() {
    this.helpWasPlaying = this.state.playing;
    this.state.scrubbing = true;
    this.state.playing = false;
    this.ui.setPlaying(false);
  }

  endScrub() {
    this.state.scrubbing = false;
    if (this.helpWasPlaying && this.state.t < this.getDuration() && !this.state.summaryOpen && !this.state.lunar) {
      this.state.playing = true;
      this.ui.setPlaying(true);
    }
    this.helpWasPlaying = false;
  }

  seek(t) {
    if (!this.activeScene) return;
    if (this.state.summaryOpen) this.closeSummary();
    if (this.state.intro) {
      this.state.intro = false;
      this.ui.showIntro(false);
    }
    this.state.t = clamp(t, this.getStart(), this.getDuration());
    this.sound.resetTimeline();
    this.activeScene.notifySeek();
  }

  restart() {
    if (!this.activeScene) return;
    this.state.t = this.getStart();
    this.sound.resetTimeline();
    this.state.playing = true;
    this.state.started = true;
    this.state.intro = false;
    this.state.summaryOpen = false;
    this.ui.hideSummary();
    this.ui.showIntro(false);
    if (this.state.inspection) this.exitInspection();
    this.activeScene.notifySeek();
    this.activeScene.setCameraMode(this.state.cameraMode);
    this.ui.setPlaying(true);
  }

  setSpeed(speed) {
    this.state.speed = speed;
    this.ui.setSpeed(speed);
  }

  setCameraMode(mode) {
    if (!this.activeScene) return;
    if (this.state.inspection) this.exitInspection();
    this.state.cameraMode = mode;
    this.activeScene.setCameraMode(mode);
    this.ui._setCameraActive(mode);
  }

  /* --------------------------------------------------------------- vehicles */
  setVehicle(mode) {
    if (mode === this.state.mode) return;
    this.sound.resetTimeline();
    this.state.mode = mode;
    this.state.playing = false;
    this.state.summaryOpen = false;
    this.state.inspection = null;
    this.state.demoMode = 'auto';
    this.state.cameraMode = 'overview';
    this.state.t = -10;
    this.state.lunar = false;
    this.ui.closeLunar();
    this.ui.hideSummary();
    this.ui.hidePartInfo();
    this.activeScene?.setSelectedPart?.(null);
    this.falconScene?.simulator?.resetChallenge?.();
    if (mode === 'falcon') {
      if (!this.falconScene) this._createFalconScene();
      this.activeScene = this.falconScene;
      this.activeSimulator = this.falconScene.simulator;
      this.ui.setupFalcon(this.mission);
    } else {
      if (!this.starshipScene) this._createStarshipScene();
      this.activeScene = this.starshipScene;
      this.activeSimulator = this.starshipScene.simulator;
      this.ui.setupStarship();
    }
    this.activeScene.applyQuality(this.state.quality);
    this.activeScene.setCameraMode('overview');
    this.activeScene.notifySeek();
    this.resizeActive();
    this.state.t = this.getStart();
    this.ui.setPlaying(false);
    this.ui.setSpeed(this.state.speed);
    if (this.state.started) {
      this.state.playing = true;
      this.state.intro = false;
      this.ui.showIntro(false);
      this.ui.setPlaying(true);
    } else {
      this.state.intro = true;
      this.ui.showIntro(true);
    }
    this.ui.toast(mode === 'falcon' ? '已切换至 Falcon 9 主场景' : '已切换至 Starship 独立概念场景');
  }

  _createFalconScene() {
    if (this.falconScene) {
      this.falconScene.dispose();
      this.falconScene = null;
    }
    this.falconScene = new FalconScene(this.renderer, this.mission, {
      quality: this.state.quality,
    });
  }

  _createStarshipScene() {
    if (this.starshipScene) {
      this.starshipScene.dispose();
      this.starshipScene = null;
    }
    this.starshipScene = new StarshipScene(this.renderer, { quality: this.state.quality });
  }

  setMission(id) {
    const mission = FALCON_MISSIONS[id];
    if (!mission) return;
    this.sound.resetTimeline();
    this.mission = mission;
    this.state.missionId = id;
    this.state.mode = 'falcon';
    this.state.playing = false;
    this.state.summaryOpen = false;
    this.state.inspection = null;
    this.state.cameraMode = 'overview';
    this.state.demoMode = 'auto';
    this.state.t = mission.start;
    this.ui.hideSummary();
    this.ui.hidePartInfo();
    this.ui.closeLunar();
    this.activeScene?.setSelectedPart?.(null);
    this._createFalconScene();
    this.activeScene = this.falconScene;
    this.activeSimulator = this.falconScene.simulator;
    this.falconScene.setCameraMode('overview');
    this.falconScene.applyQuality(this.state.quality);
    this.falconScene.notifySeek();
    this.ui.setupFalcon(mission);
    this.ui.setQuality(this.state.quality);
    this.resizeActive();
    this.state.intro = !this.state.started;
    this.ui.showIntro(!this.state.started);
    if (this.state.started) {
      this.state.playing = true;
      this.ui.setPlaying(true);
    } else {
      this.ui.setPlaying(false);
    }
    this.ui.toast(`已加载 ${mission.name} · ${mission.recoveryShort}`);
  }

  setQuality(quality) {
    this.state.quality = quality;
    try {
      localStorage.setItem(STORAGE_QUALITY, quality);
    } catch (error) {
      /* ignore */
    }
    if (this.activeScene) this.activeScene.applyQuality(quality);
    this.ui.setQuality(quality);
    this.ui.toast(`画质已切换为${quality === 'high' ? '高' : quality === 'medium' ? '中' : '低'}`);
  }

  async toggleSound() {
    const enabled = await this.sound.setEnabled(!this.sound.enabled);
    if (enabled === false) {
      this.ui.toast('当前浏览器无法启用音频。');
      return;
    }
    this.state.sound = this.sound.enabled;
    this.ui.setSound(this.state.sound);
    this.ui.toast(this.state.sound ? '飞行音效已开启' : '声音已关闭');
  }

  /* --------------------------------------------------------------- inspection */
  startInspection(view) {
    if (!this.activeScene || this.state.mode !== 'falcon') return;
    this.state.playing = false;
    this.state.started = true;
    this.state.intro = false;
    this.state.summaryOpen = false;
    this.state.inspection = view;
    this.ui.showIntro(false);
    this.ui.hideSummary();
    this.ui.setPlaying(false);
    this.activeScene.setInspectionMode(view);
    this.canvas.style.cursor = 'crosshair';
    this.ui.toast(view === 'cutaway' ? '剖面模式：点选高亮部件查看功能' : '拆解模式：点击部件查看信息，一键复原');
  }

  exitInspection() {
    if (!this.state.inspection) return;
    this.state.inspection = null;
    this.activeScene?.setInspectionMode(null);
    this.activeScene?.setSelectedPart(null);
    this.ui.hidePartInfo();
    this.canvas.style.cursor = 'grab';
  }

  restoreInspection() {
    this.exitInspection();
    this.ui.toast('火箭已复原。');
  }

  selectPart(partId) {
    if (!this.activeScene || this.state.mode !== 'falcon') return;
    const info = this.activeScene.getPartInfo?.(partId);
    if (!info) return;
    if (!this.state.inspection) {
      // Selecting from the flying rocket is allowed; pause so the part stays in view.
      this.state.playing = false;
      this.ui.setPlaying(false);
    }
    this.activeScene.setSelectedPart(partId);
    this.ui.showPartInfo(info, partId);
  }

  clearSelectedPart() {
    this.activeScene?.setSelectedPart?.(null);
    this.ui.hidePartInfo();
  }

  /* ------------------------------------------------------------------ modes */
  setDemoMode(mode) {
    if (this.state.mode !== 'falcon') return;
    this.state.demoMode = mode;
    if (mode === 'auto') {
      this.activeScene?.simulator?.resetChallenge?.();
      this.ui.setChallengeValues({
        boostback: 100,
        landingAlt: this.mission.landingBurnAltitude,
        lateral: 0,
        aoa: 6,
      });
      this.ui.setChallengeVisible(false);
    } else {
      this.state.playing = false;
      this.state.started = true;
      this.state.intro = false;
      this.ui.showIntro(false);
      this.ui.setPlaying(false);
      this.ui.setChallengeValues(this.activeScene.simulator.challenge);
      this.ui.toast('手动挑战：这是教学模型，结果不代表真实制导。');
    }
    this.ui.setChallengeVisible(mode === 'challenge');
  }

  setChallengeParam(key, value) {
    if (this.state.mode !== 'falcon' || !this.activeScene) return;
    const challenge = this.activeScene.simulator.challenge;
    if (key === 'boostback' && !this.mission.hasBoostback) return;
    challenge[key] = value;
    const outcome = this.activeScene.simulator.getChallengeOutcome();
    this.ui.updateChallengePreview(outcome);
    this.activeScene.notifySeek?.();
  }

  resetChallengeParams() {
    if (this.state.mode !== 'falcon' || !this.activeScene) return;
    this.activeScene.simulator.resetChallenge();
    this.ui.setChallengeValues(this.activeScene.simulator.challenge);
    this.ui.updateChallengePreview(this.activeScene.simulator.getChallengeOutcome());
    this.ui.toast('挑战参数已恢复默认。');
  }

  jumpToChallengeLanding() {
    if (this.state.mode !== 'falcon') return;
    const start = Math.max(this.getStart(), this.mission.landingBurn - 30);
    this.seek(start);
    this.state.playing = true;
    this.state.intro = false;
    this.state.started = true;
    this.state.summaryOpen = false;
    this.ui.hideSummary();
    this.ui.showIntro(false);
    this.ui.setPlaying(true);
    this.setCameraMode('landing');
    this.state.demoMode = 'challenge';
    this.ui.setChallengeVisible(true);
  }

  applyChallengeAndReplay() {
    if (this.state.mode !== 'falcon') return;
    const start = Math.max(this.getStart(), this.mission.landingBurn - 38);
    this.state.t = start;
    this.state.playing = true;
    this.state.started = true;
    this.state.intro = false;
    this.state.summaryOpen = false;
    this.ui.hideSummary();
    this.ui.showIntro(false);
    this.ui.setPlaying(true);
    this.activeScene.notifySeek();
    this.setCameraMode('landing');
    this.state.demoMode = 'challenge';
    this.ui.setChallengeVisible(true);
  }

  /* ------------------------------------------------------------------ summary */
  _buildSummary() {
    const sample = this.lastSample;
    const challenge = this.state.mode === 'falcon' && this.state.demoMode === 'challenge';
    if (this.state.mode === 'falcon') {
      if (!sample) return null;
      if (challenge) {
        const outcome = sample.challengeOutcome;
        return {
          kicker: 'MANUAL CHALLENGE · TEACHING MODEL',
          title: outcome.title,
          lead: `${outcome.line} 这是教学模型的简化结果，不是 SpaceX 的飞控、制导或推进剂数据。`,
          tone: outcome.tone,
          showChallenge: true,
          stats: [
            { label: '触地速度', value: outcome.impactSpeed.toFixed(1), unit: 'm/s' },
            { label: '落点偏差', value: formatNumber(outcome.missDistance, 0), unit: 'm' },
            { label: '点火高度', value: formatNumber(outcome.chosenAlt, 0), unit: 'm' },
            { label: '剩余推进剂', value: outcome.fuelRemaining.toFixed(1), unit: '%' },
            { label: '目标', value: this.mission.recoveryShort },
            {
              label: '一级状态',
              value:
                outcome.grade === 'destroyed'
                  ? '撞击 / 失败'
                  : outcome.grade === 'hard'
                    ? '硬着陆受损'
                    : sample.landed
                      ? '已着陆'
                      : '接近中',
            },
          ],
        };
      }
      const landed = sample.landed;
      const stage2Alt = {
        value: formatNumber(sample.stage2.altitude / 1000, 1),
        unit: 'km',
      };
      const miss = sample.stage1.landingError;
      return {
        kicker: landed ? 'MISSION COMPLETE · FALCON 9' : 'MISSION IN PROGRESS · FALCON 9',
        title: landed ? this.mission.summary.title : '任务进行中',
        lead: landed
          ? `${this.mission.summary.lines.join(' ')} 页面中的高度、速度、燃料与轨迹均为简化模拟。`
          : '演示仍在进行。此面板中的数值为当前模拟状态。',
        tone: 'success',
        showChallenge: true,
        stats: [
          { label: '一级落点', value: landed ? '已着陆' : '飞行中' },
          { label: '模拟落点偏差', value: miss === null ? '—' : formatNumber(miss, 0), unit: miss === null ? '' : 'm' },
          { label: '二级高度', value: stage2Alt.value, unit: stage2Alt.unit },
          { label: '任务时间', value: formatClock(sample.t) },
          { label: '回收方式', value: this.mission.recoveryShort },
          { label: '一级剩余推进剂', value: sample.stage1.fuel.toFixed(1), unit: '%' },
        ],
      };
    }
    if (!sample) return null;
    return {
      kicker: 'CONCEPT COMPLETE · STARSHIP',
      title: sample.caught ? '发射塔机械臂捕获完成' : '概念演示进行中',
      lead: sample.caught
        ? 'Super Heavy 在发射塔机械臂之间被捕获，没有使用着陆腿。这一结果来自概念模型，不是官方逐秒时间线。'
        : '概念演示仍在进行。Starship 继续飞向轨道；本面板不作飞行结论。',
      tone: 'success',
      showChallenge: false,
      stats: [
        { label: 'Super Heavy', value: sample.caught ? '已捕获' : '返航中' },
        { label: '机械臂高度', value: '106', unit: 'm' },
        { label: 'Starship 高度', value: formatNumber(sample.ship.altitude / 1000, 0), unit: 'km' },
        { label: '任务时间', value: formatClock(sample.t) },
        { label: '回收机构', value: '塔臂 · 无着陆腿' },
        { label: '版本', value: '概念构型' },
      ],
    };
  }

  showSummary(auto = false) {
    if (this.activeSimulator) {
      this.lastSample = this.activeSimulator.sample(this.state.t);
    }
    if (this.state.mode === 'falcon' && this.state.demoMode === 'challenge' && this.lastSample) {
      const outcome = this.lastSample.challengeOutcome;
      this.ui.updateChallengePreview(outcome);
    }
    const data = this._buildSummary();
    if (!data) return;
    this.state.summaryOpen = true;
    this.state.playing = false;
    this.ui.setPlaying(false);
    this.ui.showSummary(data);
  }

  showSummaryManually() {
    this.showSummary(false);
  }

  closeSummary() {
    this.state.summaryOpen = false;
    this.ui.hideSummary();
  }

  replayFromSummary() {
    this.closeSummary();
    this.restart();
  }

  challengeFromSummary() {
    if (this.state.mode !== 'falcon') return;
    this.closeSummary();
    this.setDemoMode('challenge');
    this.jumpToChallengeLanding();
  }

  /* ----------------------------------------------------------- starbase explorer */
  openStarbaseExplorer() {
    if (this.starbaseExplorer) return;
    this.explorerWasPlaying = this.state.playing;
    this.state.playing = false;
    this.ui.setPlaying(false);
    this.sound.silence();
    if (this.state.summaryOpen) this.closeSummary();
    const overlay = document.getElementById('starbaseExplorer');
    if (!overlay) return;
    overlay.hidden = false;
    document.body.classList.add('sb-open');
    const appRoot = document.getElementById('app');
    if (appRoot) appRoot.inert = true;
    this.starbaseExplorer = new StarbaseExplorer({
      quality: this.state.quality,
      onClose: () => this.closeStarbaseExplorer(),
      onQualityChange: (quality) => {
        this.state.quality = quality;
        try {
          localStorage.setItem(STORAGE_QUALITY, quality);
        } catch (error) {
          /* local storage may be unavailable */
        }
        this.ui.setQuality(quality);
        this.activeScene?.applyQuality?.(quality);
      },
    });
    window.setTimeout(() => document.getElementById('starbaseClose')?.focus(), 160);
  }

  closeStarbaseExplorer() {
    if (!this.starbaseExplorer) return;
    const explorer = this.starbaseExplorer;
    this.starbaseExplorer = null;
    explorer.dispose();
    const overlay = document.getElementById('starbaseExplorer');
    if (overlay) overlay.hidden = true;
    document.body.classList.remove('sb-open');
    const appRoot = document.getElementById('app');
    if (appRoot) appRoot.inert = false;
    this.resizeActive();
    document.getElementById('starbaseEntryBtn')?.focus();
    if (this.explorerWasPlaying && !document.hidden && !this.state.lunar) {
      this.state.playing = true;
      this.ui.setPlaying(true);
    }
    this.explorerWasPlaying = false;
    this.ui.toast('已返回现有飞行演示。');
  }

  /* -------------------------------------------------------------------- lunar */
  openHls() {
    if (this.state.mode !== 'starship') return;
    this.state.lunar = true;
    this.state.playing = false;
    this.ui.setPlaying(false);
    this.ui.openLunar();
  }

  closeHls() {
    this.state.lunar = false;
    this.ui.closeLunar();
    this.resizeActive();
  }

  /* ------------------------------------------------------------------ cleanup */
  dispose() {
    this.resizeObserver?.disconnect();
    this.canvas?.removeEventListener('pointerup', this._boundCanvasPointerUp);
    this.starbaseExplorer?.dispose();
    this.starbaseExplorer = null;
    const appRoot = document.getElementById('app');
    if (appRoot) appRoot.inert = false;
    this.falconScene?.dispose();
    this.starshipScene?.dispose();
    this.renderer?.dispose();
    this.sound.dispose();
    this.ui.closeLunar();
  }
}

const app = new App();
window.__RETURN_TO_EARTH__ = app;

window.addEventListener('beforeunload', () => app.dispose());
document.addEventListener('visibilitychange', () => {
  if (document.hidden && app.state.playing) {
    app.state.playing = false;
    app.ui.setPlaying(false);
  }
});
