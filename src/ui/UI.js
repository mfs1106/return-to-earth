import {
  FALCON_CAMERA_MODES,
  FALCON_MISSIONS,
  STARSHIP_EVENTS,
} from '../simulation/missions.js';
import {
  clamp,
  formatClock,
  formatMissionTime,
  formatNumber,
} from '../simulation/math.js';

const STARSHIP_CAMERA_MODES = [
  { id: 'overview', label: '全景', key: '1' },
  { id: 'tower', label: '发射塔', key: '2' },
  { id: 'booster', label: 'Super Heavy', key: '3' },
  { id: 'ship', label: 'Starship', key: '4' },
  { id: 'catch', label: '塔臂捕获', key: '5' },
  { id: 'ground', label: '地面', key: '6' },
  { id: 'free', label: '自由轨道', key: '7' },
];

const HLS_STEPS = [
  {
    id: 'earth',
    name: '地球发射',
    status: '计划',
    title: '地球发射 · Starship + Super Heavy',
    text: 'Starship 与 Super Heavy 从 Starbase 发射升空。Super Heavy 在热分离后返航，由发射塔机械臂捕获；这部分属于地球段的回收系统，不是月球着陆器。',
    targets: ['earthGroup', 'route-earth'],
  },
  {
    id: 'supply',
    name: '轨道补给',
    status: '计划',
    title: '轨道补给 · 低温推进剂转移',
    text: 'HLS 在近地轨道与燃料补给船对接，补充液氧与液态甲烷。该步骤需要多次补给发射，是 Artemis 架构中的关键计划环节；具体次数尚未固定。',
    targets: ['earthGroup', 'route-earth'],
  },
  {
    id: 'transfer',
    name: '前往月球',
    status: '概念演示',
    title: '地月转移 · 飞向月球轨道',
    text: '完成补给的 HLS 执行地月转移，飞向月球附近的计划轨道。任务剖面与轨道参数在官方文件中仍是规划性描述。',
    targets: ['moonGroup', 'route-earth', 'route-orbit'],
  },
  {
    id: 'rendezvous',
    name: '月球轨道会合',
    status: '计划',
    title: '月球轨道会合 · 与 Orion / Gateway 对接',
    text: 'HLS 在月球轨道与 Orion 飞船或 Gateway 会合，Artemis 乘组转入着陆器。NASA 将 HLS 定位为月球轨道与月面之间的载人着陆器。',
    targets: ['moonGroup', 'route-orbit'],
  },
  {
    id: 'landing',
    name: '月面着陆',
    status: '计划 / 概念',
    title: '月面着陆 · HLS 下降到月球表面',
    text: 'HLS 从月球轨道下降，在月球南极附近着陆。注意：在月面着陆的是 Starship HLS，而不是把地球发射用的 Super Heavy 助推器画到月面。',
    targets: ['moonGroup', 'route-descent', 'hls-glyph'],
  },
  {
    id: 'return',
    name: '返回月球轨道',
    status: '计划 / 概念',
    title: '返回月球轨道 · 与 Orion 会合',
    text: '乘组从月面起飞，HLS 返回月球轨道并与 Orion 对接，完成 Artemis 月面任务。所有步骤均为计划或概念演示，不代表已完成飞行。',
    targets: ['moonGroup', 'route-ascent'],
  },
];

const MODE_LABELS = {
  ascent: '上升段',
  boostback: '返航点火',
  entry: '再入点火',
  landing: '着陆点火',
  catch: '捕获减速',
  off: '关机',
  vacuum: 'MVac 工作',
  ship: '飞船发动机工作',
};

export class UI {
  constructor(app) {
    this.app = app;
    this.mode = 'falcon';
    this.mission = FALCON_MISSIONS.crew12;
    this.scrubbing = false;
    this.lastEventKey = null;
    this.lastT = -10;
    this.toastTimer = null;
    this.eventTimer = null;
    this.engineDotCount = 0;
    this.cameraModes = [];
    this.summaryVisible = false;
    this.cache = {};
    this._els = {};
    this._collectElements();
    this._bindStatic();
    this._renderLunarSteps();
    this._setLunarStep(0);
  }

  _collectElements() {
    const ids = [
      'app', 'missionSelect', 'missionSelectWrap', 'qualitySelect', 'soundBtn', 'soundLabel',
      'helpBtn', 'phaseKicker', 'phaseTitle', 'phaseHint', 'clockBadge', 'clockBadgeSub',
      'cameraDock', 'partLabels', 'eventToast', 'dragHint', 'inspectBar', 'inspectTitle',
      'restoreBtn', 'partInfo', 'partInfoClose', 'partCategory', 'partName', 'partFunction',
      'partReality', 'challengePanel', 'challengeClose', 'boostbackField', 'chBoostback',
      'chBoostbackOut', 'chLandingAlt', 'chLandingAltOut', 'chLateral', 'chLateralOut',
      'chAoa', 'chAoaOut', 'challengePreview', 'challengeReset', 'challengeJump',
      'challengeReplay', 'introOverlay', 'introKicker', 'introLead', 'introMission',
      'introSource', 'startBtn', 'exploreBtn', 'summaryOverlay', 'summaryKicker',
      'summaryTitle', 'summaryLead', 'summaryStats', 'summaryReplay', 'summaryChallenge',
      'summaryClose', 'loading', 'webglFallback', 'missionClock', 'missionName',
      'missionType', 'altLabel', 'altValue', 'altUnit', 'speedLabel', 'speedValue',
      'vSpeedValue', 'vSpeedDirection', 'missLabel', 'missValue', 'missUnit',
      'missSubLabel', 's1State', 's1Alt', 's1Unit', 's1Speed', 's1Role', 's2State',
      's2Alt', 's2Unit', 's2Speed', 's2Role', 's1FuelLabel', 's1FuelBar', 's2FuelLabel',
      's2FuelBar', 'engineSummary', 'engineDots', 'engineMode', 'engineThrottle',
      'targetLabel', 'targetStatus', 'missionNoteText', 'sourceLinks', 'phaseIndex',
      'phaseLabel', 'nextEventLabel', 'timelineMarkers', 'timelineProgress', 'timeSlider',
      'timeReadout', 'restartBtn', 'playBtn', 'playIcon', 'viewModes', 'modeToggle',
      'autoModeBtn', 'challengeModeBtn', 'hlsBtn', 'summaryBtn', 'officialSourceInline',
      'lunarPanel', 'lunarClose', 'lunarStepList', 'lunarDetail', 'helpModal', 'helpClose',
      'helpDone', 'toastRegion', 'stageCard1', 'stageCard2',
    ];
    for (const id of ids) this._els[id] = document.getElementById(id);
  }

  _bindStatic() {
    const E = this._els;
    E.startBtn?.addEventListener('click', () => this.app.startDemo());
    E.exploreBtn?.addEventListener('click', () => {
      if (this.mode === 'falcon') this.app.startInspection('exploded');
      else this.app.openHls();
    });
    E.playBtn?.addEventListener('click', () => this.app.togglePlay());
    E.restartBtn?.addEventListener('click', () => this.app.restart());
    E.speedGroup = document.querySelector('.speed-group');
    E.speedGroup?.querySelectorAll('[data-speed]').forEach((button) => {
      button.addEventListener('click', () => this.app.setSpeed(Number(button.dataset.speed)));
    });

    E.timeSlider?.addEventListener('pointerdown', () => {
      this.scrubbing = true;
      this.app.beginScrub();
    });
    E.timeSlider?.addEventListener('input', (event) => {
      this.app.seek(Number(event.target.value));
    });
    const endScrub = () => {
      if (!this.scrubbing) return;
      this.scrubbing = false;
      this.app.endScrub();
    };
    E.timeSlider?.addEventListener('pointerup', endScrub);
    E.timeSlider?.addEventListener('pointercancel', endScrub);
    E.timeSlider?.addEventListener('change', endScrub);
    E.timeSlider?.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') event.stopPropagation();
    });

    document.querySelectorAll('.vehicle-tab').forEach((button) => {
      button.addEventListener('click', () => this.app.setVehicle(button.dataset.vehicle));
    });
    E.missionSelect?.addEventListener('change', (event) => this.app.setMission(event.target.value));
    E.qualitySelect?.addEventListener('change', (event) => this.app.setQuality(event.target.value));
    E.soundBtn?.addEventListener('click', () => this.app.toggleSound());

    E.viewModes?.querySelectorAll('[data-view]').forEach((button) => {
      button.addEventListener('click', () => {
        const view = button.dataset.view;
        if (view === 'stack') this.app.exitInspection();
        else this.app.startInspection(view);
      });
    });

    E.autoModeBtn?.addEventListener('click', () => this.app.setDemoMode('auto'));
    E.challengeModeBtn?.addEventListener('click', () => this.app.setDemoMode('challenge'));
    E.hlsBtn?.addEventListener('click', () => this.app.openHls());
    E.summaryBtn?.addEventListener('click', () => this.app.showSummaryManually());

    E.cameraDock?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-camera]');
      if (button) this.app.setCameraMode(button.dataset.camera);
    });
    E.timelineMarkers?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-event-t]');
      if (button) this.app.seek(Number(button.dataset.eventT));
    });
    E.partLabels?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-part-id]');
      if (button) this.app.selectPart(button.dataset.partId);
    });
    E.partInfoClose?.addEventListener('click', () => this.app.clearSelectedPart());
    E.restoreBtn?.addEventListener('click', () => this.app.restoreInspection());

    E.challengeClose?.addEventListener('click', () => this.app.setDemoMode('auto'));
    E.challengeReset?.addEventListener('click', () => this.app.resetChallengeParams());
    E.challengeJump?.addEventListener('click', () => this.app.jumpToChallengeLanding());
    E.challengeReplay?.addEventListener('click', () => this.app.applyChallengeAndReplay());

    const challengeBindings = [
      ['chBoostback', 'boostback'],
      ['chLandingAlt', 'landingAlt'],
      ['chLateral', 'lateral'],
      ['chAoa', 'aoa'],
    ];
    challengeBindings.forEach(([id, key]) => {
      E[id]?.addEventListener('input', (event) => {
        const value = Number(event.target.value);
        const out = {
          boostback: E.chBoostbackOut,
          landingAlt: E.chLandingAltOut,
          lateral: E.chLateralOut,
          aoa: E.chAoaOut,
        }[key];
        if (out) {
          if (key === 'boostback') out.textContent = `${value}%`;
          else if (key === 'landingAlt') out.textContent = `${formatNumber(value)} m`;
          else if (key === 'lateral') out.textContent = `${value > 0 ? '+' : ''}${value} m`;
          else out.textContent = `${value}°`;
        }
        this.app.setChallengeParam(key, value);
      });
    });

    E.summaryReplay?.addEventListener('click', () => this.app.replayFromSummary());
    E.summaryChallenge?.addEventListener('click', () => this.app.challengeFromSummary());
    E.summaryClose?.addEventListener('click', () => this.app.closeSummary());

    E.helpBtn?.addEventListener('click', () => this.openHelp());
    E.helpClose?.addEventListener('click', () => this.closeHelp());
    E.helpDone?.addEventListener('click', () => this.closeHelp());
    E.helpModal?.addEventListener('click', (event) => {
      if (event.target === E.helpModal) this.closeHelp();
    });

    E.lunarClose?.addEventListener('click', () => this.app.closeHls());
    E.lunarStepList?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-lunar-step]');
      if (button) this._setLunarStep(Number(button.dataset.lunarStep));
    });

    window.addEventListener('resize', () => {
      if (this.scrubbing) this.scrubbing = false;
    });
  }

  /* ------------------------------------------------------------------ setup */
  _setFactTags(starship = false) {
    const officialTag = document.querySelector('.phase-tags .tag.official');
    const simulatedTag = document.querySelector('.phase-tags .tag.simulated');
    const introTag = document.querySelector('.intro-mission .tag');
    const legend = document.querySelector('.timeline-legend');
    const officialLegend = legend?.querySelector('span:first-child');
    const simLegend = legend?.querySelector('span:nth-child(2)');
    if (starship) {
      if (officialTag) officialTag.hidden = true;
      if (simulatedTag) simulatedTag.textContent = '概念时间线 · 非官方';
      if (introTag) {
        introTag.className = 'tag planned';
        introTag.textContent = '概念演示';
      }
      if (officialLegend) officialLegend.hidden = true;
      if (simLegend) simLegend.textContent = '概念事件';
    } else {
      if (officialTag) {
        officialTag.hidden = false;
        officialTag.className = 'tag official';
        officialTag.textContent = '官方事件时间';
      }
      if (simulatedTag) simulatedTag.textContent = '模拟 / 估算';
      if (introTag) {
        introTag.className = 'tag official';
        introTag.textContent = '官方事件锚点';
      }
      if (officialLegend) officialLegend.hidden = false;
      if (simLegend) simLegend.textContent = '模拟 / 估算';
    }
  }

  _setVehicleTabs() {
    document.querySelectorAll('.vehicle-tab').forEach((button) => {
      const active = button.dataset.vehicle === this.mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
    });
  }

  setupFalcon(mission) {
    this.mode = 'falcon';
    this.mission = mission;
    this._setFactTags(false);
    this._setVehicleTabs();
    this._els.missionSelectWrap.hidden = false;
    this._els.missionSelect.value = mission.id;
    document.body.classList.remove('is-starship');
    this._els.viewModes.hidden = false;
    this._els.modeToggle.hidden = false;
    this._els.hlsBtn.hidden = true;
    this._els.exploreBtn.hidden = false;
    this._els.exploreBtn.textContent = '探索火箭部件';
    this._els.summaryChallenge.hidden = false;
    this._els.missionName.textContent = mission.shortName;
    this._els.missionType.textContent = mission.recoveryLabel;
    this._els.phaseKicker.textContent = `FALCON 9 · ${mission.shortName}`;
    this._els.missionName.textContent = mission.shortName;
    this._els.introKicker.textContent = 'MISSION SIMULATION / FALCON 9';
    this._els.introLead.textContent =
      mission.recovery === 'land'
        ? '两级火箭，一台返航的一级。用 SpaceX 官方任务时间轴作为锚点，重建 Falcon 9 从发射、分离到陆地垂直回收的完整流程。'
        : '两级火箭，一台返航的一级。海上模式使用 Starlink 10-38 的官方事件时间；该任务没有公开的返航点火，因此流程中不会凭空出现这一步骤。';
    this._els.introMission.textContent = `${mission.name} · ${mission.recoveryShort}`;
    this._els.introSource.textContent = mission.source.label;
    this._els.startBtn.innerHTML = '<span class="play-glyph" aria-hidden="true">▶</span> 开始自动演示';
    this._els.targetLabel.textContent = mission.recoveryLabel;
    this._els.missLabel.textContent = '模拟落点偏差';
    this._els.missSubLabel.textContent = '距目标区';
    this._els.missUnit.textContent = '';
    this._els.altLabel.textContent = '高度 · 一级';
    this._els.speedLabel.textContent = '速度 · 一级';
    this._els.s1Role.textContent = '一级';
    this._els.s2Role.textContent = '二级';
    this._els.missionNoteText.textContent = mission.notes.join(' ');
    this._renderSources(mission);
    this._renderTimeline(mission.events, mission.start, mission.duration);
    this._renderCameraDock(FALCON_CAMERA_MODES);
    this._setCameraActive('overview');
    this._setEngineDots(9);
    this._els.challengePreview.className = 'challenge-preview';
    this._els.boostbackField.classList.toggle('is-disabled', !mission.hasBoostback);
    this._setChallengeDefaults(mission);
    this._els.officialSourceInline.innerHTML = `<span class="mini-label">OFFICIAL ANCHOR</span><a href="${mission.source.url}" target="_blank" rel="noopener">${mission.source.label} ↗</a>`;
    this._els.clockBadgeSub.textContent = 'SIMULATED CLOCK';
    this._els.summaryKicker.textContent = 'MISSION COMPLETE · FALCON 9';
    this._els.phaseTitle.textContent = '发射台待命';
    this._els.phaseHint.textContent = mission.phases[0].hint;
    this._els.phaseLabel.textContent = mission.phases[0].label;
    this.lastEventKey = null;
    this._resetReadouts();
  }

  setupStarship() {
    this.mode = 'starship';
    this._setFactTags(true);
    this._setVehicleTabs();
    this.mission = {
      id: 'starship',
      name: 'Starship · Super Heavy',
      shortName: 'STARSHIP',
      start: -10,
      duration: 470,
      events: STARSHIP_EVENTS,
      source: {
        label: 'SpaceX · Starship',
        url: 'https://new.spacex.com/vehicles/starship',
      },
      phases: [
        { id: 'countdown', label: '发射台待命', start: -10, end: 0, hint: '概念演示：Starbase 发射塔、Super Heavy 与 Starship 待命。' },
        { id: 'ascent', label: '点火 · 上升', start: 0, end: 160, hint: '33 台 Super Heavy 发动机点火。' },
        { id: 'hotstage', label: '热分离 · 飞船点火', start: 160, end: 166, hint: 'Starship 在分离过程中点火。' },
        { id: 'boostback', label: '助推器返航', start: 166, end: 300, hint: 'Super Heavy 调头返航。' },
        { id: 'entry', label: '再入 · 对准发射塔', start: 300, end: 408, hint: 'Super Heavy 气动下降。' },
        { id: 'catchburn', label: '捕获前减速', start: 408, end: 420, hint: '助推器减速到机械臂高度。' },
        { id: 'caught', label: '发射塔机械臂捕获', start: 420, end: 470, hint: '无着陆腿；机械臂夹住 Super Heavy。' },
      ],
    };
    this._els.missionSelectWrap.hidden = true;
    document.body.classList.add('is-starship');
    this._els.viewModes.hidden = true;
    this._els.modeToggle.hidden = true;
    this._els.hlsBtn.hidden = false;
    this._els.exploreBtn.hidden = false;
    this._els.exploreBtn.textContent = 'HLS 月球架构';
    this._els.summaryChallenge.hidden = true;
    this._els.missionName.textContent = 'STARSHIP';
    this._els.missionType.textContent = '概念演示';
    this._els.phaseKicker.textContent = 'STARSHIP · FLIGHT 13 时代概念构型';
    this._els.introKicker.textContent = 'CONCEPT SIMULATION / STARSHIP';
    this._els.introLead.textContent =
      '独立的 Starship / Super Heavy 概念演示：热分离、助推器返航，以及由发射塔机械臂完成的捕获。这里不使用 Falcon 9 的着陆腿。';
    this._els.introMission.textContent = 'SUPER HEAVY · 塔臂捕获';
    this._els.introSource.textContent = 'SpaceX Starship / Reusability 资料';
    this._els.startBtn.innerHTML = '<span class="play-glyph" aria-hidden="true">▶</span> 开始概念演示';
    this._els.targetLabel.textContent = '发射塔机械臂';
    this._els.missLabel.textContent = '捕获点高差';
    this._els.missSubLabel.textContent = '相对机械臂高度';
    this._els.missUnit.textContent = '';
    this._els.altLabel.textContent = '高度 · Super Heavy';
    this._els.speedLabel.textContent = '速度 · Super Heavy';
    this._els.s1Role.textContent = 'Super Heavy';
    this._els.s2Role.textContent = 'Starship';
    this._els.missionNoteText.textContent =
      '参考 Flight 13 时代构型的概念模型；逐秒时序、节流与轨迹均为概念演示，不是官方遥测。 Starship 与 Super Heavy 的回收方式与 Falcon 9 完全不同。';
    this._els.missionName.textContent = 'STARSHIP';
    this._renderSources({
      source: {
        label: 'SpaceX · Starship',
        url: 'https://new.spacex.com/vehicles/starship',
      },
      sourceSecondary: {
        label: 'SpaceX · Reusability',
        url: 'https://www.spacex.com/updates/reusability',
      },
      extra: {
        label: 'NASA · Human Landing Systems',
        url: 'https://www.nasa.gov/reference/human-landing-systems-2/',
      },
    });
    this._renderTimeline(STARSHIP_EVENTS, -10, 470);
    this._renderCameraDock(STARSHIP_CAMERA_MODES);
    this._setCameraActive('overview');
    this._setEngineDots(33);
    this._els.boostbackField.classList.add('is-disabled');
    this._els.challengePanel.hidden = true;
    this._els.officialSourceInline.innerHTML =
      '<span class="mini-label">CONCEPT / VERSION</span><a href="https://new.spacex.com/vehicles/starship" target="_blank" rel="noopener">Flight 13 时代构型 · 概念模型 ↗</a>';
    this._els.clockBadgeSub.textContent = 'CONCEPT CLOCK';
    this._els.summaryKicker.textContent = 'MISSION COMPLETE · STARSHIP';
    this._els.phaseTitle.textContent = '发射台待命';
    this._els.phaseHint.textContent = '概念演示：Starbase 发射塔与两级飞行器待命。';
    this._els.phaseLabel.textContent = '发射台待命';
    this.lastEventKey = null;
    this._resetReadouts();
  }

  _resetReadouts() {
    this._setText('missionClock', 'T−00:10');
    this._setText('clockBadge', 'T−00:10');
    this._setText('altValue', '0');
    this._setText('altUnit', 'm');
    this._setText('speedValue', '0');
    this._setText('vSpeedValue', '0');
    this._setText('missValue', '—');
    this._setText('s1Alt', '0');
    this._setText('s2Alt', '0');
    this._setText('s1Speed', '0');
    this._setText('s2Speed', '0');
    this._setText('s1State', this.mode === 'falcon' ? '随整箭' : '待命');
    this._setText('s2State', this.mode === 'falcon' ? '随整箭' : '待命');
    this._setText('s1FuelLabel', '100%');
    this._setText('s2FuelLabel', '100%');
    this._els.s1FuelBar.style.width = '100%';
    this._els.s2FuelBar.style.width = '100%';
    this._setText('phaseIndex', '00');
    this._setText('nextEventLabel', '下一事件：待命');
    this._setText('targetStatus', this.mode === 'falcon' ? '等待分离' : '等待返回');
    this._setText('s1Unit', 'm');
    this._setText('s2Unit', 'm');
    this._setText('engineSummary', this.mode === 'falcon' ? '9 / 9' : '33 / 33');
    this._setText('engineMode', '待命');
    this._setText('engineThrottle', '节流 —');
    this._setText('phaseTitle', '发射台待命');
    this._setText('phaseLabel', '发射台待命');
    this._els.timelineProgress.style.width = '0%';
    this._els.timeSlider.value = this.mission?.start ?? -10;
    this._setText('timeReadout', `T−00:10 / ${formatClock(this.mission?.duration ?? 0)}`);
    this._els.summaryOverlay.hidden = true;
    this.summaryVisible = false;
  }

  /* --------------------------------------------------------------- rendering */
  _renderSources(mission) {
    const links = [];
    if (mission.source) links.push([mission.source.label, mission.source.url]);
    if (mission.sourceSecondary) links.push([mission.sourceSecondary.label, mission.sourceSecondary.url]);
    if (mission.extra) links.push([mission.extra.label, mission.extra.url]);
    this._els.sourceLinks.innerHTML = '<span class="mini-label">官方来源</span>';
    links.forEach(([label, url]) => {
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = `${label} ↗`;
      this._els.sourceLinks.appendChild(a);
    });
  }

  _renderTimeline(events, start, duration) {
    this._els.timelineMarkers.innerHTML = '';
    this._els.timeSlider.min = String(start);
    this._els.timeSlider.max = String(duration);
    this._els.timeSlider.value = String(start);
    events.forEach((event, index) => {
      const button = document.createElement('button');
      button.className = `timeline-marker ${event.official ? 'official' : 'simulated'}`;
      button.dataset.eventT = String(event.t);
      button.dataset.eventId = event.id;
      button.style.left = `${((event.t - start) / (duration - start)) * 100}%`;
      button.title = `${formatClock(event.t)} · ${event.label}${event.official ? '（官方事件）' : '（模拟 / 估算）'}`;
      button.setAttribute('aria-label', button.title);
      const label = document.createElement('span');
      label.className = 'marker-label';
      label.textContent = event.shortLabel || event.label;
      const dot = document.createElement('span');
      dot.className = 'marker-dot';
      button.append(label, dot);
      this._els.timelineMarkers.appendChild(button);
      if (index === 0) button.dataset.first = 'true';
    });
    this._setText('timeReadout', `${formatClock(start)} / ${formatClock(duration)}`);
  }

  _renderCameraDock(modes) {
    this.cameraModes = modes;
    this._els.cameraDock.innerHTML = '';
    modes.forEach((mode) => {
      const button = document.createElement('button');
      button.className = 'camera-btn';
      button.dataset.camera = mode.id;
      button.title = `${mode.label}（${mode.key}）`;
      button.innerHTML = `<span class="cam-key">${mode.key}</span><span class="cam-label">${mode.label}</span>`;
      this._els.cameraDock.appendChild(button);
    });
  }

  _setCameraActive(mode) {
    this._els.cameraDock.querySelectorAll('[data-camera]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.camera === mode);
    });
  }

  _setEngineDots(count) {
    if (this.engineDotCount === count) return;
    this.engineDotCount = count;
    this._els.engineDots.innerHTML = '';
    for (let i = 0; i < count; i += 1) {
      const dot = document.createElement('span');
      dot.className = 'engine-dot';
      if (count > 20) dot.classList.add('compact');
      this._els.engineDots.appendChild(dot);
    }
  }

  _setChallengeDefaults(mission) {
    this._els.chBoostback.value = '100';
    this._els.chBoostbackOut.textContent = '100%';
    this._els.chLandingAlt.value = String(mission.landingBurnAltitude);
    this._els.chLandingAltOut.textContent = `${formatNumber(mission.landingBurnAltitude)} m`;
    this._els.chLateral.value = '0';
    this._els.chLateralOut.textContent = '0 m';
    this._els.chAoa.value = '6';
    this._els.chAoaOut.textContent = '6°';
    this._els.challengePreview.className = 'challenge-preview';
    this._els.challengePreview.innerHTML = '<span>预估结果</span><strong>成功回收</strong><small>触地速度 1.8 m/s · 落点偏差 0 m</small>';
  }

  setChallengeVisible(visible) {
    this._els.challengePanel.hidden = !visible;
  }

  setChallengeValues(params) {
    if (!params) return;
    this._els.chBoostback.value = String(params.boostback);
    this._els.chBoostbackOut.textContent = `${Math.round(params.boostback)}%`;
    this._els.chLandingAlt.value = String(params.landingAlt);
    this._els.chLandingAltOut.textContent = `${formatNumber(params.landingAlt)} m`;
    this._els.chLateral.value = String(params.lateral);
    this._els.chLateralOut.textContent = `${params.lateral > 0 ? '+' : ''}${Math.round(params.lateral)} m`;
    this._els.chAoa.value = String(params.aoa);
    this._els.chAoaOut.textContent = `${Math.round(params.aoa)}°`;
  }

  updateChallengePreview(outcome) {
    if (!outcome) return;
    const preview = this._els.challengePreview;
    preview.className = `challenge-preview ${outcome.tone}`;
    preview.innerHTML = `<span>预估结果</span><strong>${outcome.title}</strong><small>触地速度 ${outcome.impactSpeed.toFixed(1)} m/s · 落点偏差 ${formatNumber(outcome.missDistance, 0)} m</small>`;
  }

  /* ------------------------------------------------------------------ update */
  update(sample, state) {
    if (!sample) return;
    this.state = state;
    const mission = sample.mission ?? this.mission;
    this._setText('missionClock', formatClock(sample.t));
    this._setText('clockBadge', formatClock(sample.t));
    this._setText('phaseKicker', this.mode === 'falcon' ? `FALCON 9 · ${this.mission.shortName}` : 'STARSHIP · CONCEPT');
    this._setText('phaseTitle', sample.phase.label);
    this._setText('phaseHint', sample.phase.hint);
    this._setText('phaseLabel', sample.phase.label);
    this._setText('phaseIndex', String(sample.phase.index + 1).padStart(2, '0'));
    this._setText('nextEventLabel', sample.nextEvent
      ? `下一事件：${formatClock(sample.nextEvent.t)} ${sample.nextEvent.label}`
      : '已到演示结束');
    this._setText('timeReadout', `${formatClock(sample.t)} / ${formatClock(mission.duration)}`);
    if (!this.scrubbing) this._els.timeSlider.value = String(sample.t);
    const progress = clamp(
      ((sample.t - mission.start) / (mission.duration - mission.start)) * 100,
      0,
      100,
    );
    this._els.timelineProgress.style.width = `${progress}%`;
    this._els.timelineMarkers.querySelectorAll('[data-event-id]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.eventId === sample.currentEvent?.id);
    });
    this._updateEventToast(sample);
    this._setCameraActive(state.cameraMode);
    this._updateViewButtons(state);
    this._updateInspectBar(state);
    this._updateChallengeState(state, sample);
    if (this.mode === 'falcon') this._updateFalconTelemetry(sample);
    else this._updateStarshipTelemetry(sample);
    this.lastT = sample.t;
  }

  _updateViewButtons(state) {
    this._els.viewModes.querySelectorAll('[data-view]').forEach((button) => {
      const active = state.inspection ? button.dataset.view === state.inspection : button.dataset.view === 'stack';
      button.classList.toggle('is-active', active);
    });
  }

  _updateInspectBar(state) {
    const isInspect = !!state.inspection;
    this._els.inspectBar.hidden = !isInspect;
    if (isInspect) {
      this._els.inspectTitle.textContent = state.inspection === 'cutaway' ? '透视剖面 · 点选部件' : '爆炸拆解 · 教学展示';
      this._els.inspectBar.querySelector('.tag').textContent = state.inspection === 'cutaway' ? '教学剖面' : '教学拆解';
    }
    this._setPartLabels(state);
  }

  _updateChallengeState(state, sample) {
    if (this.mode !== 'falcon') return;
    const challengeMode = state.demoMode === 'challenge';
    this._els.autoModeBtn.classList.toggle('is-active', !challengeMode);
    this._els.challengeModeBtn.classList.toggle('is-active', challengeMode);
    this._els.challengePanel.hidden = !challengeMode;
    if (challengeMode && sample.challengeOutcome) {
      this.updateChallengePreview(sample.challengeOutcome);
    }
  }

  _updateEventToast(sample) {
    const event = sample.currentEvent;
    const key = event ? `${event.id}:${event.t}` : null;
    if (key === this.lastEventKey) return;
    this.lastEventKey = key;
    if (!event || sample.t < 0 || this.summaryVisible) return;
    const toast = this._els.eventToast;
    const official = event.official;
    toast.innerHTML = `
      <span class="toast-time">${formatClock(event.t)}</span>
      <span class="toast-title">${event.label}</span>
      <span class="tag ${official ? 'official' : 'simulated'}">${official ? '官方事件' : '模拟'}</span>
      <span class="toast-detail">${event.detail ?? ''}</span>
    `;
    toast.classList.add('show');
    clearTimeout(this.eventTimer);
    this.eventTimer = setTimeout(() => toast.classList.remove('show'), 6200);
  }

  _updateFalconTelemetry(sample) {
    const s1 = sample.stage1;
    const s2 = sample.stage2;
    const alt = this._formatDistance(s1.altitude);
    this._setText('altValue', alt.value);
    this._setText('altUnit', alt.unit);
    this._setText('speedValue', formatNumber(Math.round(s1.speed)));
    this._setText('vSpeedValue', this._signed(Math.round(s1.verticalSpeed)));
    this._setText('vSpeedDirection', s1.verticalSpeed > 1 ? '上升' : s1.verticalSpeed < -1 ? '下降' : '相对地面稳定');
    const miss = s1.landingError;
    if (miss === null || miss === undefined) {
      this._setText('missValue', '—');
      this._setText('missUnit', '');
    } else {
      const dist = this._formatDistance(miss);
      this._setText('missValue', dist.value);
      this._setText('missUnit', dist.unit);
    }
    this._setText('s1Alt', this._formatStageDistance(s1.altitude).value);
    this._setText('s1Unit', this._formatStageDistance(s1.altitude).unit);
    this._setText('s2Alt', this._formatStageDistance(s2.altitude).value);
    this._setText('s2Unit', this._formatStageDistance(s2.altitude).unit);
    this._setText('s1Speed', formatNumber(Math.round(s1.speed)));
    this._setText('s2Speed', formatNumber(Math.round(s2.speed)));
    this._setText('s1State', this._s1State(sample));
    this._setText('s2State', this._s2State(sample));
    this._setText('s1FuelLabel', `${s1.fuel.toFixed(1)}%`);
    this._setText('s2FuelLabel', `${s2.fuel.toFixed(1)}%`);
    this._els.s1FuelBar.style.width = `${clamp(s1.fuel, 0, 100)}%`;
    this._els.s2FuelBar.style.width = `${clamp(s2.fuel, 0, 100)}%`;

    const dots = this._els.engineDots.children;
    for (let i = 0; i < dots.length; i += 1) dots[i].classList.toggle('on', i < s1.engineCount);
    this._setText('engineSummary', `${s1.engineCount} / 9 · S1`);
    this._setText('engineThrottle', s1.engineCount > 0 ? `节流 ${Math.round(s1.throttle * 100)}%` : '节流 —');
    const s2Status = s2.engineCount > 0 ? 'MVac 点火' : 'MVac 待机';
    this._setText('engineMode', `${MODE_LABELS[s1.engineMode] ?? '待命'} · ${s2Status}`);

    const targetStatus = this._targetStatus(sample);
    this._setText('targetStatus', targetStatus);
    this._els.stageCard1.classList.toggle('is-active', sample.separated && !sample.landed);
    this._els.stageCard2.classList.toggle('is-active', sample.separated);
    this._els.missionNoteText.textContent = this.mission.notes.join(' ');
    this._setText('missionName', this.mission.shortName);
    this._setText('missionType', this.mission.recoveryLabel);
  }

  _updateStarshipTelemetry(sample) {
    const b = sample.booster;
    const s = sample.ship;
    const alt = this._formatDistance(b.altitude);
    this._setText('altValue', alt.value);
    this._setText('altUnit', alt.unit);
    this._setText('speedValue', formatNumber(Math.round(b.speed)));
    this._setText('vSpeedValue', this._signed(Math.round(b.verticalSpeed)));
    this._setText('vSpeedDirection', b.verticalSpeed > 1 ? '上升' : b.verticalSpeed < -1 ? '下降' : '相对地面稳定');
    const heightDiff = Math.max(0, b.altitude - sample.towerCatch.catchAltitude);
    this._setText('missValue', b.altitude < 1000 ? formatNumber(Math.round(heightDiff)) : '—');
    this._setText('missUnit', b.altitude < 1000 ? 'm' : '');
    const bAlt = this._formatStageDistance(b.altitude);
    const sAlt = this._formatStageDistance(s.altitude);
    this._setText('s1Alt', bAlt.value);
    this._setText('s1Unit', bAlt.unit);
    this._setText('s2Alt', sAlt.value);
    this._setText('s2Unit', sAlt.unit);
    this._setText('s1Speed', formatNumber(Math.round(b.speed)));
    this._setText('s2Speed', formatNumber(Math.round(s.speed)));
    this._setText('s1State', sample.caught ? '已捕获' : sample.separated ? '返航中' : '随整箭');
    this._setText('s2State', sample.separated ? '独立飞行' : '随整箭');
    this._setText('s1FuelLabel', `${b.fuel.toFixed(1)}%`);
    this._setText('s2FuelLabel', `${s.fuel.toFixed(1)}%`);
    this._els.s1FuelBar.style.width = `${clamp(b.fuel, 0, 100)}%`;
    this._els.s2FuelBar.style.width = `${clamp(s.fuel, 0, 100)}%`;
    const dots = this._els.engineDots.children;
    for (let i = 0; i < dots.length; i += 1) dots[i].classList.toggle('on', i < b.engineCount);
    this._setText('engineSummary', `${b.engineCount} / 33 · SH`);
    this._setText('engineThrottle', b.engineCount > 0 ? `节流 ${Math.round(b.throttle * 100)}%` : '节流 —');
    const shipStatus = s.engineCount > 0 ? 'Starship 点火' : 'Starship 待机';
    this._setText('engineMode', `${MODE_LABELS[b.engineMode] ?? '待命'} · ${shipStatus}`);
    this._setText('targetStatus', sample.caught ? '已捕获 · 无着陆腿' : sample.t > 380 ? '对准塔臂' : '等待返回');
    this._els.stageCard1.classList.toggle('is-active', sample.separated && !sample.caught);
    this._els.stageCard2.classList.toggle('is-active', sample.separated);
    this._setText('missionName', 'STARSHIP');
    this._setText('missionType', '概念演示');
  }

  _targetStatus(sample) {
    if (sample.landed) return '已着陆';
    if (!sample.separated) return '等待分离';
    if (sample.isLandingBurn) return '终端减速';
    if (sample.isAero) return '气动引导';
    return '返回中';
  }

  _s1State(sample) {
    if (sample.landed) return '已着陆';
    if (!sample.separated) return '随整箭';
    if (sample.isBoostback) return '返航点火';
    if (sample.isEntry) return '再入点火';
    if (sample.isLandingBurn) return '着陆点火';
    return '独立飞行';
  }

  _s2State(sample) {
    if (!sample.separated) return '随整箭';
    if (sample.stage2.engineCount > 0) return '动力飞行';
    return '惯性飞行';
  }

  _formatDistance(meters) {
    if (!Number.isFinite(meters)) return { value: '—', unit: '' };
    const abs = Math.abs(meters);
    if (abs >= 100_000) return { value: (meters / 1000).toFixed(0), unit: 'km' };
    if (abs >= 10_000) return { value: (meters / 1000).toFixed(1), unit: 'km' };
    if (abs >= 1_000) return { value: (meters / 1000).toFixed(2), unit: 'km' };
    return { value: formatNumber(Math.round(meters)), unit: 'm' };
  }

  _formatStageDistance(meters) {
    if (meters >= 10_000) return { value: (meters / 1000).toFixed(1), unit: 'km' };
    if (meters >= 1000) return { value: (meters / 1000).toFixed(2), unit: 'km' };
    return { value: formatNumber(Math.round(meters)), unit: 'm' };
  }

  _signed(value) {
    if (value > 0) return `+${formatNumber(value)}`;
    return formatNumber(value);
  }

  /* ------------------------------------------------------------- event/state */
  setPlaying(playing) {
    this._els.playBtn.classList.toggle('is-playing', playing);
    this._els.playIcon.textContent = playing ? '❚❚' : '▶';
    this._els.playBtn.setAttribute('aria-label', playing ? '暂停' : '播放');
  }

  setSpeed(speed) {
    document.querySelectorAll('[data-speed]').forEach((button) => {
      button.classList.toggle('is-active', Number(button.dataset.speed) === speed);
    });
  }

  setSound(enabled) {
    this._els.soundBtn.setAttribute('aria-pressed', String(enabled));
    this._els.soundBtn.title = enabled ? '关闭声音' : '开启声音（默认关闭）';
    this._els.soundLabel.textContent = enabled ? '声音开' : '声音关';
    this._els.soundBtn.querySelector('.sound-icon').textContent = enabled ? '◉' : '◌';
  }

  setQuality(quality) {
    this._els.qualitySelect.value = quality;
  }

  showIntro(show) {
    this._els.introOverlay.classList.toggle('is-hidden', !show);
    this._els.app.classList.toggle('intro-open', !!show);
  }

  showLoading(show) {
    this._els.loading.classList.toggle('is-hidden', !show);
  }

  showWebGLError() {
    this._els.loading.classList.add('is-hidden');
    this._els.webglFallback.hidden = false;
  }

  showPartInfo(info, partId) {
    if (!info) return;
    this._els.partCategory.textContent = info.category;
    this._els.partName.textContent = info.name;
    this._els.partFunction.textContent = info.functionText;
    this._els.partReality.textContent = info.reality;
    this._els.partInfo.hidden = false;
    this._els.partLabels.querySelectorAll('[data-part-id]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.partId === partId);
    });
  }

  hidePartInfo() {
    this._els.partInfo.hidden = true;
    this._els.partLabels.querySelectorAll('.is-active').forEach((button) => button.classList.remove('is-active'));
  }

  _setPartLabels(state) {
    const container = this._els.partLabels;
    const anchors = state.partAnchors ?? [];
    if (!state.inspection || anchors.length === 0) {
      container.querySelectorAll('.part-label').forEach((el) => {
        el.style.display = 'none';
      });
      return;
    }
    const seen = new Set();
    const containerWidth = container.clientWidth || window.innerWidth;
    const containerHeight = container.clientHeight || window.innerHeight;
    const sideOffset = containerWidth > 900 ? 120 : 0;
    const sorted = [...anchors].sort((a, b) => a.y - b.y);
    let lastY = -Infinity;
    const placed = sorted.map((anchor) => {
      let y = clamp(anchor.y, 34, containerHeight - 34);
      if (y < lastY + 26) y = lastY + 26;
      lastY = y;
      return { ...anchor, labelY: y };
    });
    if (placed.length && placed[placed.length - 1].labelY > containerHeight - 34) {
      const shift = placed[placed.length - 1].labelY - (containerHeight - 34);
      placed.forEach((anchor) => {
        anchor.labelY = Math.max(32, anchor.labelY - shift);
      });
    }
    placed.forEach((anchor) => {
      seen.add(anchor.id);
      let button = container.querySelector(`[data-part-id="${anchor.id}"]`);
      if (!button) {
        button = document.createElement('button');
        button.className = 'part-label';
        button.dataset.partId = anchor.id;
        button.addEventListener('click', () => this.app.selectPart(anchor.id));
        container.appendChild(button);
      }
      button.textContent = anchor.info?.name?.replace(/\s*×\s*\d+/, '') ?? anchor.id;
      button.style.display = 'flex';
      button.style.left = `${clamp(anchor.x + sideOffset, 92, containerWidth - 96)}px`;
      button.style.top = `${anchor.labelY}px`;
      button.title = anchor.info?.name ?? anchor.id;
    });
    container.querySelectorAll('.part-label').forEach((button) => {
      if (!seen.has(button.dataset.partId)) button.style.display = 'none';
    });
  }

  showSummary({ kicker, title, lead, stats, showChallenge = false, tone = 'success' }) {
    this.summaryVisible = true;
    this._els.summaryOverlay.hidden = false;
    this._els.summaryKicker.textContent = kicker;
    this._els.summaryTitle.textContent = title;
    this._els.summaryLead.textContent = lead;
    this._els.summaryStats.innerHTML = '';
    stats.forEach((stat) => {
      const item = document.createElement('div');
      item.className = 'summary-stat';
      item.innerHTML = `<span>${stat.label}</span><strong>${stat.value}${stat.unit ? ` <small>${stat.unit}</small>` : ''}</strong>`;
      this._els.summaryStats.appendChild(item);
    });
    this._els.summaryChallenge.hidden = !showChallenge;
    this._els.summaryOverlay.dataset.tone = tone;
  }

  hideSummary() {
    this.summaryVisible = false;
    this._els.summaryOverlay.hidden = true;
  }

  openHelp() {
    this._els.helpModal.hidden = false;
    this._els.helpClose.focus?.();
  }

  closeHelp() {
    this._els.helpModal.hidden = true;
    this._els.helpBtn.focus?.();
  }

  isHelpOpen() {
    return !this._els.helpModal.hidden;
  }

  openLunar() {
    this._els.lunarPanel.hidden = false;
    document.body.classList.add('lunar-open');
  }

  closeLunar() {
    this._els.lunarPanel.hidden = true;
    document.body.classList.remove('lunar-open');
  }

  /* ------------------------------------------------------------------- toast */
  toast(message) {
    const item = document.createElement('div');
    item.className = 'small-toast';
    item.textContent = message;
    this._els.toastRegion.appendChild(item);
    setTimeout(() => item.remove(), 3200);
  }

  _setText(id, value) {
    const el = this._els[id];
    if (!el) return;
    if (el.textContent !== value) el.textContent = value;
  }

  /* ------------------------------------------------------------------ lunar */
  _renderLunarSteps() {
    this._els.lunarStepList.innerHTML = '';
    HLS_STEPS.forEach((step, index) => {
      const button = document.createElement('button');
      button.className = 'lunar-step';
      button.dataset.lunarStep = String(index);
      button.setAttribute('role', 'listitem');
      button.innerHTML = `
        <span class="step-index">${String(index + 1).padStart(2, '0')}</span>
        <span class="step-name">${step.name}</span>
        <span class="step-status">${step.status}</span>
      `;
      this._els.lunarStepList.appendChild(button);
    });
  }

  _setLunarStep(index) {
    const step = HLS_STEPS[index];
    if (!step) return;
    this.activeLunarStep = index;
    this._els.lunarStepList.querySelectorAll('[data-lunar-step]').forEach((button) => {
      button.classList.toggle('is-active', Number(button.dataset.lunarStep) === index);
    });
    this._els.lunarDetail.innerHTML = `
      <h3>${step.title}</h3>
      <p>${step.text}</p>
      <div class="detail-status">
        <span class="tag planned">${step.status}</span>
        <span class="tag simulated">概念示意</span>
      </div>
    `;
    this._els.lunarPanel.querySelectorAll('.is-highlight').forEach((element) => {
      element.classList.remove('is-highlight');
    });
    step.targets.forEach((target) => {
      const element =
        document.getElementById(target) || this._els.lunarPanel.querySelector(`.${target}`);
      element?.classList.add('is-highlight');
    });
  }
}
