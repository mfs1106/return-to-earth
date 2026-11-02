import {
  MonotoneTrack,
  clamp,
  smoothstep,
  lerp,
  formatClock,
  formatMissionTime,
  rocketCenter,
} from './math.js';
import { FALCON_STACK_OFFSET, VIS_SCALE } from './missions.js';

/**
 * Deterministic Falcon 9 flight model.
 *
 * Every getter is a function of mission time. The renderer never advances the
 * rocket by delta time; it asks for a complete sample at `t`, so paused frames,
 * rewinds, replays and arbitrary scrubs all show the same state.
 *
 * The trajectory is a monotone cubic spline through *visualisation keyframes*.
 * Published event times are anchors. Between anchors, altitude / downrange /
 * velocity are a scripted approximation — not flight telemetry.
 */

function makeTrack(rawKeys) {
  return new MonotoneTrack(
    rawKeys.map(([t, altitude, downrange, slopeAlt, slopeDown]) => ({
      t,
      values: [altitude, downrange],
      slope: slopeAlt === undefined ? undefined : [slopeAlt, slopeDown ?? 0],
    })),
  );
}

function pointFrom(altitude, downrange, lateral = 0) {
  return {
    x: downrange * VIS_SCALE,
    y: altitude * VIS_SCALE,
    z: lateral * VIS_SCALE,
  };
}

function hypotSpeed(altRate, downRate) {
  return Math.hypot(altRate, downRate);
}

export class FalconSimulator {
  constructor(mission) {
    this.setMission(mission);
  }

  setMission(mission) {
    this.mission = mission;
    this.stage1Track = makeTrack(mission.stage1Keys);
    this.stage2Track = makeTrack(mission.stage2Keys);
    this.challenge = {
      boostback: 100,
      landingAlt: mission.landingBurnAltitude,
      lateral: 0,
      aoa: 6,
    };
  }

  resetChallenge() {
    this.challenge = {
      boostback: 100,
      landingAlt: this.mission.landingBurnAltitude,
      lateral: 0,
      aoa: 6,
    };
  }

  /** Stage-1 pitch in degrees: 0 = vertical, positive = nose toward downrange. */
  stage1PitchAt(t) {
    const m = this.mission;
    const sep = m.separation;
    if (t < sep) {
      return 28 * smoothstep(8, m.meco, t);
    }
    if (m.hasBoostback) {
      if (t < m.boostback[0] + 1) {
        return lerp(28, -92, smoothstep(sep, m.boostback[0] + 1, t));
      }
      if (t < m.boostback[1]) {
        return -92 + Math.sin(t * 0.42) * 1.2;
      }
      if (t < 242) {
        return lerp(-92, 1.5, smoothstep(m.boostback[1], 242, t));
      }
    } else {
      if (t < sep + 17) {
        return lerp(28, -92, smoothstep(sep, sep + 17, t));
      }
      if (t < 242) {
        return lerp(-92, 1.5, smoothstep(sep + 20, 242, t));
      }
    }
    if (t < m.entry[0] - 8) return 1.5;
    if (t < m.entry[1] + 18) {
      return 2.5 + Math.sin(t * 0.34) * 1.6;
    }
    if (t < m.landingBurn) {
      return 3.5 + Math.sin(t * 0.22) * 2.7;
    }
    return 0;
  }

  stage2PitchAt(t, s1Pitch) {
    const m = this.mission;
    if (t < m.separation) return s1Pitch;
    const s = this.stage2Track.sample(t);
    const vAlt = s.derivatives[0];
    const vDown = s.derivatives[1];
    const velocityPitch = clamp(
      (Math.atan2(Math.max(vDown, 0), Math.max(vAlt, 1)) * 180) / Math.PI,
      0,
      88,
    );
    return lerp(28, velocityPitch, smoothstep(m.separation, m.separation + 12, t));
  }

  throttleAt(t, engineType) {
    const m = this.mission;
    if (engineType === 'stage1') {
      if (t < 0 || t >= m.meco) return 0;
      if (t < 2.2) return smoothstep(0, 2.2, t);
      const maxqDip = 0.24 * Math.exp(-Math.pow((t - 63) / 8, 2));
      return clamp(0.97 - maxqDip, 0, 1);
    }
    if (t < m.ses) return 0;
    return 0.94;
  }

  stage1EngineState(t) {
    const m = this.mission;
    if (t >= 0 && t < m.meco) {
      return { count: 9, throttle: this.throttleAt(t, 'stage1'), mode: 'ascent' };
    }
    if (m.hasBoostback && t >= m.boostback[0] && t < m.boostback[1]) {
      return { count: 3, throttle: 0.64, mode: 'boostback' };
    }
    if (t >= m.entry[0] && t < m.entry[1]) {
      return { count: 3, throttle: 0.72, mode: 'entry' };
    }
    if (t >= m.landingBurn && t < m.touchdown) {
      const final = t > m.touchdown - 5.5;
      return { count: final ? 1 : 3, throttle: final ? 0.9 : 0.82, mode: 'landing' };
    }
    return { count: 0, throttle: 0, mode: 'off' };
  }

  stage2EngineState(t) {
    if (t < this.mission.ses) return { count: 0, throttle: 0, mode: 'off' };
    return { count: 1, throttle: 0.94, mode: 'vacuum' };
  }

  stage1Fuel(t) {
    const m = this.mission;
    if (t <= 0) return 100;
    if (t < m.meco) return 100 - 82 * clamp(t / m.meco, 0, 1);
    let fuel = 18;
    let burn = 0;
    if (m.hasBoostback && t > m.boostback[0]) {
      burn = 5.5 * clamp((t - m.boostback[0]) / (m.boostback[1] - m.boostback[0]), 0, 1);
    }
    fuel -= burn;
    if (t > m.entry[0]) {
      fuel -= 4.2 * clamp((t - m.entry[0]) / (m.entry[1] - m.entry[0]), 0, 1);
    }
    if (t > m.landingBurn) {
      fuel -= 7.5 * clamp((t - m.landingBurn) / (m.touchdown - m.landingBurn), 0, 1);
    }
    return clamp(fuel, 2.2, 100);
  }

  stage2Fuel(t) {
    const m = this.mission;
    if (t < m.ses) return 100;
    const progress = clamp((t - m.ses) / (m.duration - m.ses), 0, 1);
    return clamp(100 - 76 * progress, 24, 100);
  }

  /** Return the stage independent state at time t, in SI units + scene units. */
  sample(t) {
    const m = this.mission;
    const time = clamp(t, m.start, m.duration);
    const s1 = this.stage1Track.sample(time);
    const s2 = this.stage2Track.sample(time);
    const challenge = this.challenge;

    let s1Alt = s1.values[0];
    let s1Down = s1.values[1];
    let s1AltRate = s1.derivatives[0];
    let s1DownRate = s1.derivatives[1];
    if (time > m.touchdown + 0.01) {
      s1AltRate = 0;
      s1DownRate = 0;
    }
    const s1Pitch = this.stage1PitchAt(time);
    const s2Pitch = this.stage2PitchAt(time, s1Pitch);

    const separated = time >= m.separation;
    const lateralFactor = smoothstep(m.separation, Math.max(m.separation + 1, m.landingBurn - 50), time);
    const boostDeviation = m.hasBoostback ? (challenge.boostback - 100) * 8 : 0;
    const manualDown = boostDeviation * lateralFactor;
    const manualLateral = challenge.lateral * lateralFactor;
    const lateralScene = manualLateral * 0.55;
    s1Down += manualDown;

    const s1Pos = pointFrom(s1Alt, s1Down, lateralScene);

    let s2Pos;
    let s2Alt;
    let s2Down;
    let s2AltRate;
    let s2DownRate;
    if (!separated) {
      const offsetX = Math.sin((s1Pitch * Math.PI) / 180) * FALCON_STACK_OFFSET;
      const offsetY = Math.cos((s1Pitch * Math.PI) / 180) * FALCON_STACK_OFFSET;
      s2Pos = {
        x: s1Pos.x + offsetX,
        y: s1Pos.y + offsetY,
        z: s1Pos.z,
      };
      // Telemetry uses metres, while the attached scene offset is in scene units.
      s2Alt = s1Alt + FALCON_STACK_OFFSET;
      s2Down = s1Down;
      s2AltRate = s1AltRate;
      s2DownRate = s1DownRate;
    } else {
      s2Alt = s2.values[0];
      s2Down = s2.values[1];
      s2AltRate = s2.derivatives[0];
      s2DownRate = s2.derivatives[1];
      // Keep the physical stack offset in scene units at separation, then let
      // it decay. Otherwise the compressed altitude scale would make stage 2
      // pop through stage 1 at the exact separation frame.
      const sepPitch = this.stage1PitchAt(m.separation);
      const sepOffsetX = Math.sin((sepPitch * Math.PI) / 180) * FALCON_STACK_OFFSET;
      const sepOffsetY = Math.cos((sepPitch * Math.PI) / 180) * FALCON_STACK_OFFSET;
      const decay = 1 - smoothstep(m.separation, m.separation + 4.5, time);
      const geometricY = (s2Alt - FALCON_STACK_OFFSET) * VIS_SCALE + FALCON_STACK_OFFSET;
      const attachedY = s1Alt * VIS_SCALE + sepOffsetY;
      s2Pos = {
        x: s2Down * VIS_SCALE + sepOffsetX * decay,
        y: geometricY + (attachedY - geometricY) * decay,
        z: 0,
      };
    }

    const stage1Engines = this.stage1EngineState(time);
    const stage2Engines = this.stage2EngineState(time);
    const stage1Speed = hypotSpeed(s1AltRate, s1DownRate);
    const stage2Speed = hypotSpeed(s2AltRate, s2DownRate);
    const stage1Fuel = this.stage1Fuel(time);
    const stage2Fuel = this.stage2Fuel(time);

    const landingError =
      separated && time < m.touchdown + 20
        ? Math.hypot(s1Down - m.targetDownrange, manualLateral)
        : separated
          ? Math.hypot(manualDown, manualLateral)
          : null;

    const gridFins = clamp(smoothstep(m.separation + 2, m.separation + 10, time), 0, 1);
    const legs = clamp(
      smoothstep(m.legsDeploy - 2, m.legsDeploy + 4, time),
      0,
      1,
    );
    const heat = clamp(
      smoothstep(m.entry[0] - 8, m.entry[0] + 4, time) *
        (1 - smoothstep(m.landingBurn, m.landingBurn + 5, time)) *
        clamp((s1Alt - 12_000) / 45_000, 0, 1),
      0,
      1,
    );
    const phase = this.phaseAt(time);
    const currentEvent = this.eventAt(time);
    const nextEvent = this.nextEventAt(time);

    return {
      t: time,
      mission: m,
      phase,
      currentEvent,
      nextEvent,
      separated,
      landed: time >= m.touchdown,
      clock: formatClock(time),
      elapsedLabel: formatMissionTime(time),
      heat,
      target: pointFrom(0, m.targetDownrange, 0),
      stage1: {
        id: 's1',
        name: '一级',
        altitude: s1Alt,
        downrange: s1Down,
        speed: stage1Speed,
        verticalSpeed: s1AltRate,
        horizontalSpeed: s1DownRate,
        fuel: stage1Fuel,
        engineCount: stage1Engines.count,
        throttle: stage1Engines.throttle,
        engineMode: stage1Engines.mode,
        pitch: s1Pitch,
        gridFins,
        legs,
        heat,
        pos: s1Pos,
        targetX: m.targetDownrange,
        landingError,
        attached: !separated,
      },
      stage2: {
        id: 's2',
        name: '二级',
        altitude: s2Alt,
        downrange: s2Down,
        speed: stage2Speed,
        verticalSpeed: s2AltRate,
        horizontalSpeed: s2DownRate,
        fuel: stage2Fuel,
        engineCount: stage2Engines.count,
        throttle: stage2Engines.throttle,
        engineMode: stage2Engines.mode,
        pitch: s2Pitch,
        pos: s2Pos,
        attached: !separated,
      },
      stack: { pos: s1Pos, pitch: s1Pitch },
      challengeOutcome: this.getChallengeOutcome(),
      isBoostback: !!m.hasBoostback && time >= m.boostback[0] && time <= m.boostback[1],
      isEntry: time >= m.entry[0] && time <= m.entry[1],
      isLandingBurn: time >= m.landingBurn && time < m.touchdown,
      isAero: time >= m.entry[1] && time < m.landingBurn,
    };
  }

  phaseAt(t) {
    const phases = this.mission.phases;
    for (let i = 0; i < phases.length; i += 1) {
      if (t >= phases[i].start && t < phases[i].end) return { ...phases[i], index: i };
    }
    return { ...phases[phases.length - 1], index: phases.length - 1 };
  }

  eventAt(t) {
    let found = null;
    for (const ev of this.mission.events) {
      if (t + 0.001 >= ev.t) found = ev;
      else break;
    }
    return found;
  }

  nextEventAt(t) {
    return this.mission.events.find((ev) => ev.t > t + 0.001) ?? null;
  }

  /**
   * Small teaching model for the optional manual challenge.
   * Success/failure is deliberately simplified; it is not a GNC simulation.
   */
  getChallengeOutcome() {
    const p = this.challenge;
    const m = this.mission;
    const nominalAlt = m.landingBurnAltitude;
    const nominalEntrySpeed = 320; // m/s at the start of the landing burn in this teaching model
    const maxDecel = (nominalEntrySpeed ** 2 - 1.8 ** 2) / (2 * nominalAlt);
    const chosenAlt = clamp(p.landingAlt, 1200, 5200);
    const disc = nominalEntrySpeed ** 2 - 2 * maxDecel * chosenAlt;
    let impact = disc > 0 ? Math.sqrt(disc) : 1.8;
    impact = Math.max(1.8, impact + Math.max(0, p.aoa - 12) * 1.15);
    const boostDeviation = m.hasBoostback ? Math.abs(p.boostback - 100) : 0;
    const miss = Math.hypot(p.lateral, boostDeviation * 12);
    let grade = 'nominal';
    if (impact > 28) grade = 'destroyed';
    else if (impact > 8.5) grade = 'hard';
    else if (miss > 40) grade = 'off';

    const fuelUsed =
      7.5 +
      Math.max(0, chosenAlt - nominalAlt) * 0.0022 +
      Math.max(0, 100 - p.boostback) * 0.035 +
      Math.max(0, p.aoa - 6) * 0.08;
    const fuelRemaining = clamp(18 - 5.5 - 4.2 - fuelUsed, 0, 100);

    const labels = {
      nominal: { title: '成功回收', tone: 'success', line: '一级减速到安全触地速度，并落在目标区内。' },
      off: { title: '偏离着陆区', tone: 'warning', line: '下降与减速基本正常，但横向落点超出安全区域。' },
      hard: { title: '硬着陆', tone: 'danger', line: '可用减速距离不足，触地速度过高，一级受损。' },
      destroyed: { title: '任务失败', tone: 'danger', line: '着陆点火过晚，一级高速撞击着陆区。' },
    };

    return {
      grade,
      ...labels[grade],
      impactSpeed: impact,
      missDistance: miss,
      nominalAlt,
      chosenAlt,
      fuelRemaining,
      boostDeviation,
    };
  }

  /** Scene-space sample list used to draw the two independent trails. */
  trailSamples(stage, step = 1) {
    const m = this.mission;
    const points = [];
    for (let t = m.start; t <= m.duration + 0.001; t += step) {
      const sample = this.sample(t);
      const vehicle = stage === 's1' ? sample.stage1 : sample.stage2;
      const p = rocketCenter(vehicle.pos, vehicle.pitch, stage === 's1' ? 23.8 : 11);
      points.push({ t, ...p });
    }
    return points;
  }
}
