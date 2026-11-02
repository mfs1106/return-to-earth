import { MonotoneTrack, clamp, smoothstep, lerp, formatClock, rocketCenter } from './math.js';
import { STARSHIP_EVENTS } from './missions.js';

/**
 * Starship / Super Heavy is a separate conceptual simulation.
 * It intentionally does NOT share Falcon 9's landing-leg recovery logic.
 *
 * Version note: the geometry is a generic "Flight 13 era" stainless-steel
 * concept model. Hardware changes between vehicles and flights, so this is
 * labelled conceptual throughout the UI.
 */

export const BOOSTER_HEIGHT = 71;
export const SHIP_HEIGHT = 52;
export const SHIP_STACK_OFFSET = 73; // booster top + hot-stage ring
const TOWER_ARM_HEIGHT = 106;
const CATCH_ALTITUDE = TOWER_ARM_HEIGHT - BOOSTER_HEIGHT; // 35 m
const HORIZONTAL_SCALE = 0.004;

/** Non-linear altitude mapping keeps the rocket readable near the pad and at 100+ km. */
export function starshipAltitudeToScene(altitude) {
  if (altitude <= 0) return 0;
  return 35 * Math.pow(altitude / 35, 0.32);
}

function pointFrom(altitude, downrange, { offset = 0 } = {}) {
  return {
    x: downrange * HORIZONTAL_SCALE,
    y: starshipAltitudeToScene(altitude - offset) + offset,
    z: 0,
  };
}

function makeTrack(rawKeys) {
  return new MonotoneTrack(
    rawKeys.map(([t, altitude, downrange, slopeAlt, slopeDown]) => ({
      t,
      values: [altitude, downrange],
      slope: slopeAlt === undefined ? undefined : [slopeAlt, slopeDown ?? 0],
    })),
  );
}

const PHASES = [
  { id: 'countdown', label: '发射台待命', short: '待命', start: -10, end: 0, hint: '概念演示：Starbase 发射塔、Super Heavy 与 Starship 待命。' },
  { id: 'liftoff', label: '点火 · 升空', short: '点火', start: 0, end: 16, hint: 'Super Heavy 33 台发动机点火，塔架释放。' },
  { id: 'ascent', label: '上升 · 最大动压', short: '上升', start: 16, end: 160, hint: '程序转弯；具体节流与轨迹为概念演示。' },
  { id: 'hotstage', label: '热分离 · 飞船点火', short: '热分离', start: 160, end: 166, hint: 'Starship 发动机在两级仍连接时点火，随后分离。该时序为概念演示。' },
  { id: 'boostback', label: '助推器返航', short: '返航', start: 166, end: 300, hint: 'Super Heavy 调头返航，没有着陆腿。' },
  { id: 'entry', label: '助推器再入 · 对准发射塔', short: '再入', start: 300, end: 408, hint: '助推器在气动控制下降落回发射塔附近。' },
  { id: 'catchburn', label: '捕获前减速点火', short: '减速', start: 408, end: 420, hint: '助推器点火减速，下降到机械臂高度。' },
  { id: 'caught', label: '发射塔机械臂捕获', short: '捕获', start: 420, end: 470, hint: '两根机械臂合拢夹住 Super Heavy；与 Falcon 9 的着陆腿回收完全不同。' },
];

export class StarshipSimulator {
  constructor() {
    this.mission = {
      id: 'starship',
      name: 'Starship · Flight Demo',
      start: -10,
      duration: 470,
      source: {
        label: 'SpaceX · Starship',
        url: 'https://new.spacex.com/vehicles/starship',
      },
      version: 'Flight 13 时代构型概念模型',
      events: STARSHIP_EVENTS,
      phases: PHASES,
    };
    this.boosterTrack = makeTrack([
      [-10, 0, 0],
      [0, 0, 0],
      [15, 320, 80],
      [30, 3_600, 1_400],
      [60, 16_000, 11_000],
      [100, 39_000, 33_000],
      [140, 60_000, 70_000],
      [158, 68_000, 88_000],
      [161, 69_200, 90_000],
      [166, 70_000, 91_000],
      [175, 78_000, 73_000],
      [195, 96_000, 42_000],
      [220, 108_000, 5_000],
      [250, 103_000, 1_500],
      [300, 82_000, 240],
      [335, 46_000, 55],
      [375, 17_000, 12],
      [402, 4_500, 2],
      [412, 900, 0.4],
      [416, 300, 0.1],
      [420, CATCH_ALTITUDE, 0, -2.5, 0],
    ]);
    this.shipTrack = makeTrack([
      [-10, SHIP_STACK_OFFSET, 0],
      [0, SHIP_STACK_OFFSET, 0],
      [60, 16_073, 12_000],
      [140, 60_073, 70_000],
      [158, 68_073, 88_000],
      [166, 72_073, 91_000],
      [175, 80_073, 100_000],
      [220, 110_073, 200_000],
      [300, 150_073, 520_000],
      [380, 185_073, 980_000],
      [470, 210_073, 1_500_000],
    ]);
  }

  boosterPitchAt(t) {
    if (t < 161) return 27 * smoothstep(10, 158, t);
    if (t < 174) return lerp(27, -100, smoothstep(161, 174, t));
    if (t < 214) return -100 + Math.sin(t * 0.4) * 1.5;
    if (t < 250) return lerp(-100, 0, smoothstep(214, 250, t));
    if (t < 390) return 2 + Math.sin(t * 0.25) * 2;
    return 0;
  }

  shipPitchAt(t, boosterPitch) {
    if (t < 166) return boosterPitch;
    const s = this.shipTrack.sample(t);
    const pitch = clamp(
      (Math.atan2(Math.max(s.derivatives[1], 0), Math.max(s.derivatives[0], 1)) * 180) /
        Math.PI,
      0,
      88,
    );
    return lerp(27, pitch, smoothstep(166, 182, t));
  }

  boosterEngines(t) {
    if (t >= 0 && t < 160) {
      return { count: 33, throttle: 0.94, mode: 'ascent' };
    }
    if (t >= 172 && t < 214) {
      return { count: 13, throttle: 0.7, mode: 'boostback' };
    }
    if (t >= 322 && t < 338) {
      return { count: 13, throttle: 0.7, mode: 'entry' };
    }
    if (t >= 408 && t < 420) {
      return { count: t > 417 ? 3 : 13, throttle: t > 417 ? 0.8 : 0.65, mode: 'catch' };
    }
    return { count: 0, throttle: 0, mode: 'off' };
  }

  shipEngines(t) {
    if (t < 160) return { count: 0, throttle: 0, mode: 'off' };
    return { count: 6, throttle: 0.9, mode: 'ship' };
  }

  sample(t) {
    const time = clamp(t, -10, 470);
    const b = this.boosterTrack.sample(time);
    const s = this.shipTrack.sample(time);
    const separated = time >= 166;
    const boosterPitch = this.boosterPitchAt(time);
    const shipPitch = this.shipPitchAt(time, boosterPitch);
    const boosterEngines = this.boosterEngines(time);
    const shipEngines = this.shipEngines(time);
    const boosterScene = pointFrom(b.values[0], b.values[1]);
    let shipScene;
    if (!separated) {
      const offsetX = Math.sin((boosterPitch * Math.PI) / 180) * SHIP_STACK_OFFSET;
      const offsetY = Math.cos((boosterPitch * Math.PI) / 180) * SHIP_STACK_OFFSET;
      shipScene = {
        x: boosterScene.x + offsetX,
        y: boosterScene.y + offsetY,
        z: 0,
      };
    } else {
      shipScene = pointFrom(s.values[0], s.values[1], { offset: SHIP_STACK_OFFSET });
    }
    const boosterSpeed = Math.hypot(b.derivatives[0], b.derivatives[1]);
    const shipSpeed = Math.hypot(s.derivatives[0], s.derivatives[1]);
    const armsClose = clamp(smoothstep(414, 421, time), 0, 1);
    const hotStage = smoothstep(158, 160, time) * (1 - smoothstep(166, 170, time));
    const catchBurst = time >= 420 ? clamp(1 - (time - 420) / 7, 0, 1) : 0;
    const heat = clamp(
      smoothstep(296, 310, time) *
        (1 - smoothstep(390, 410, time)) *
        clamp((b.values[0] - 15_000) / 60_000, 0, 1),
      0,
      1,
    );
    const catchDistance = Math.max(0, Math.hypot(b.values[1] * HORIZONTAL_SCALE, b.values[0] - CATCH_ALTITUDE));

    return {
      t: time,
      mission: this.mission,
      phase: this.phaseAt(time),
      currentEvent: this.eventAt(time),
      nextEvent: this.nextEventAt(time),
      clock: formatClock(time),
      separated,
      caught: time >= 420,
      hotStage,
      armsClose,
      catchBurst,
      heat,
      booster: {
        altitude: b.values[0],
        downrange: b.values[1],
        speed: boosterSpeed,
        verticalSpeed: b.derivatives[0],
        horizontalSpeed: b.derivatives[1],
        fuel: this.boosterFuel(time),
        engineCount: boosterEngines.count,
        throttle: boosterEngines.throttle,
        engineMode: boosterEngines.mode,
        pitch: boosterPitch,
        gridFins: clamp(smoothstep(166, 176, time), 0, 1),
        legs: 0,
        pos: boosterScene,
        catchDistance,
        targetX: 0,
      },
      ship: {
        altitude: separated ? s.values[0] : b.values[0] + SHIP_STACK_OFFSET,
        downrange: separated ? s.values[1] : b.values[1],
        speed: separated ? shipSpeed : boosterSpeed,
        verticalSpeed: separated ? s.derivatives[0] : b.derivatives[0],
        horizontalSpeed: separated ? s.derivatives[1] : b.derivatives[1],
        fuel: this.shipFuel(time),
        engineCount: shipEngines.count,
        throttle: shipEngines.throttle,
        engineMode: shipEngines.mode,
        pitch: shipPitch,
        pos: shipScene,
        flaps: clamp(smoothstep(380, 420, time), 0.2, 1),
      },
      towerCatch: {
        armHeight: TOWER_ARM_HEIGHT,
        catchAltitude: CATCH_ALTITUDE,
        armsClose,
      },
    };
  }

  boosterFuel(t) {
    if (t < 0) return 100;
    if (t < 160) return 100 - 79 * clamp(t / 160, 0, 1);
    let fuel = 21;
    if (t > 172) fuel -= 7 * clamp((t - 172) / 42, 0, 1);
    if (t > 322) fuel -= 5 * clamp((t - 322) / 16, 0, 1);
    if (t > 408) fuel -= 3.5 * clamp((t - 408) / 12, 0, 1);
    return clamp(fuel, 1.8, 100);
  }

  shipFuel(t) {
    if (t < 160) return 100;
    return clamp(100 - 72 * clamp((t - 160) / 310, 0, 1), 28, 100);
  }

  phaseAt(t) {
    for (let i = 0; i < PHASES.length; i += 1) {
      if (t >= PHASES[i].start && t < PHASES[i].end) return { ...PHASES[i], index: i };
    }
    return { ...PHASES[PHASES.length - 1], index: PHASES.length - 1 };
  }

  eventAt(t) {
    let found = null;
    for (const ev of STARSHIP_EVENTS) {
      if (t + 0.001 >= ev.t) found = ev;
      else break;
    }
    return found;
  }

  nextEventAt(t) {
    return STARSHIP_EVENTS.find((ev) => ev.t > t + 0.001) ?? null;
  }

  trailSamples(stage, step = 1.5) {
    const points = [];
    for (let t = -10; t <= 470; t += step) {
      const sample = this.sample(t);
      const vehicle = stage === 'booster' ? sample.booster : sample.ship;
      const p = rocketCenter(vehicle.pos, vehicle.pitch, stage === 'booster' ? 35.5 : 26);
      points.push({ t, ...p });
    }
    return points;
  }
}
