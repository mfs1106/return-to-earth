/**
 * Mission definitions.
 *
 * FACT BOUNDARY
 * -------------
 * Official event times below are the approximate times published on the two
 * SpaceX mission pages named in `source`. Everything else (max-Q, SECO,
 * legs-deploy timing, vehicle state between events, visual trajectory) is a
 * simplified visualisation, clearly marked `simulated: true`.
 *
 * The positions stored in the keyframes are SIMULATION SCRIPT COORDINATES, not
 * published telemetry. They are selected so the trajectory reads correctly and
 * the published events line up. They are not actual range-safety data.
 */

export const VIS_SCALE = 0.02; // 1 scene unit = 50 m in the compressed world view.
export const FALCON_STACK_OFFSET = 41.8; // stage-2 origin above the stage-1 feet, metres.

const official = (detail) => ({ official: true, simulated: false, detail });
const simulated = (detail) => ({ official: false, simulated: true, detail });

const event = (t, id, label, kind, flags, shortLabel = label) => ({
  t,
  id,
  label,
  shortLabel,
  kind,
  ...flags,
});

const crewEvents = [
  event(0, 'liftoff', '点火 · 起飞', 'liftoff', official('倒计时归零，一级 9 台 Merlin 发动机产生推力。')),
  event(62, 'maxq', '最大动压', 'maxq', simulated('最大动压时刻为示意值，官方时间线未公布。此时发动机节流并承受最大气动载荷。')),
  event(144, 'meco', '一级发动机关机', 'meco', official('T+02:24，一级 9 台 Merlin 发动机关机（MECO）。')),
  event(147, 'stage-sep', '两级分离', 'sep', official('T+02:27，级间气动推杆动作，一级与二级成为两个独立飞行器。')),
  event(155, 'ses', '二级点火', 'ses', official('T+02:35，二级 Merlin Vacuum 发动机点火。')),
  event(161, 'boostback-start', '返航点火开始', 'boostback', official('T+02:41，返航点火（Boostback）开始，一级调头飞向陆地着陆区。')),
  event(207, 'boostback-end', '返航点火结束', 'boostback', official('T+03:27，返航点火结束。')),
  event(380, 'entry-start', '再入点火开始', 'entry', official('T+06:20，再入点火（Entry Burn）开始，为一级减速并保护结构。')),
  event(393, 'entry-end', '再入点火结束', 'entry', official('T+06:33，再入点火结束，一级进入气动下降段。')),
  event(403, 'grid-fin', '栅格翼气动引导', 'aero', simulated('四片栅格翼展开并参与姿态控制，具体控制律为简化模型。')),
  event(437, 'landing-burn', '着陆点火', 'landing', official('T+07:17，着陆点火开始，一级减速并对准 LZ-1。')),
  event(450, 'legs', '着陆腿展开', 'legs', simulated('着陆腿展开时刻为估算值，用于可视化。')),
  event(462, 'touchdown', '一级着陆', 'touchdown', official('T+07:42，一级在 LZ-1 陆地着陆区垂直着陆。')),
  event(497, 'demo-end', '演示结束', 'end', simulated('演示在二级继续飞向轨道时结束；未展示轨道插入后的任务。')),
];

const starlinkEvents = [
  event(0, 'liftoff', '点火 · 起飞', 'liftoff', official('倒计时归零，一级 9 台 Merlin 发动机产生推力。')),
  event(63, 'maxq', '最大动压', 'maxq', simulated('最大动压时刻为示意值，官方时间线未公布。')),
  event(146, 'meco', '一级发动机关机', 'meco', official('T+02:26，一级 9 台 Merlin 发动机关机（MECO）。')),
  event(150, 'stage-sep', '两级分离', 'sep', official('T+02:30，两级分离。')),
  event(156, 'ses', '二级点火', 'ses', official('T+02:36，二级 Merlin Vacuum 发动机点火。')),
  event(366, 'entry-start', '再入点火开始', 'entry', official('T+06:06，再入点火开始。')),
  event(388, 'entry-end', '再入点火结束', 'entry', official('T+06:28，再入点火结束。')),
  event(398, 'grid-fin', '栅格翼气动引导', 'aero', simulated('四片栅格翼展开并参与姿态控制，具体控制律为简化模型。')),
  event(481, 'landing-burn', '着陆点火', 'landing', official('T+08:01，着陆点火开始，一级减速并对准海上无人船。')),
  event(491, 'legs', '着陆腿展开', 'legs', simulated('着陆腿展开时刻为估算值，用于可视化。')),
  event(503, 'touchdown', '一级着陆', 'touchdown', official('T+08:23，一级在海上无人船垂直着陆。')),
  event(538, 'demo-end', '演示结束', 'end', simulated('演示在二级继续飞行时结束。')),
];

const crewPhases = [
  { id: 'countdown', label: '发射台待命', short: '待命', start: -10, end: 0, hint: '发射台、加注与终端倒计时。画面中的倒计时与状态为演示。' },
  { id: 'ignition', label: '点火 · 升空', short: '点火', start: 0, end: 14, hint: '9 台 Merlin 发动机点火，一级推力大于重力，火箭离塔。' },
  { id: 'ascent', label: '一级上升 · 最大动压', short: '上升', start: 14, end: 144, hint: '程序转弯、最大动压与发动机节流。高度和速度为模拟估算。' },
  { id: 'meco', label: '一级发动机关机', short: 'MECO', start: 144, end: 147, hint: '一级关机，火箭依靠惯性继续爬升，随后分离。' },
  { id: 'separation', label: '两级分离', short: '分离', start: 147, end: 155, hint: '级间段留在了一级上；二级尚未点火。' },
  { id: 'second-stage', label: '二级点火 · 一级翻转', short: '二级点火', start: 155, end: 161, hint: '二级 Merlin Vacuum 点火，一级开始调头为返航点火做准备。' },
  { id: 'boostback', label: '返航点火', short: '返航点火', start: 161, end: 207, hint: '一级 3 台发动机反推，横向速度朝发射场方向反转。' },
  { id: 'coast', label: '一级滑行 · 二级继续上升', short: '滑行', start: 207, end: 380, hint: '一级在高层大气中惯性飞行；二级继续加速。' },
  { id: 'entry', label: '再入点火', short: '再入点火', start: 380, end: 393, hint: '3 台发动机点火，降低再入速度与热载荷。' },
  { id: 'aero', label: '栅格翼气动引导', short: '气动引导', start: 393, end: 437, hint: '栅格翼调整升力与姿态，一级滑向 LZ-1。' },
  { id: 'landing', label: '着陆点火 · 着陆腿展开', short: '着陆', start: 437, end: 462, hint: '一级减速、对准目标，着陆腿展开。' },
  { id: 'landed', label: '一级回收完成', short: '完成', start: 462, end: 497, hint: '一级在 LZ-1 着陆；二级继续飞向轨道。' },
];

const starlinkPhases = [
  { id: 'countdown', label: '发射台待命', short: '待命', start: -10, end: 0, hint: '发射台待命与终端倒计时。画面中的倒计时与状态为演示。' },
  { id: 'ignition', label: '点火 · 升空', short: '点火', start: 0, end: 14, hint: '9 台 Merlin 发动机点火，火箭离塔。' },
  { id: 'ascent', label: '一级上升 · 最大动压', short: '上升', start: 14, end: 146, hint: '程序转弯、最大动压与发动机节流。' },
  { id: 'meco', label: '一级发动机关机', short: 'MECO', start: 146, end: 150, hint: '一级关机，准备两级分离。' },
  { id: 'separation', label: '两级分离', short: '分离', start: 150, end: 156, hint: '级间段留在了一级上；二级即将点火。' },
  { id: 'coast', label: '二级点火 · 一级滑行', short: '二级点火', start: 156, end: 366, hint: '二级继续上升。本任务官方时间线未列出返航点火，因此一级直接进入滑行段。' },
  { id: 'entry', label: '再入点火', short: '再入点火', start: 366, end: 388, hint: '一级 3 台发动机点火减速，朝海上无人船下降。' },
  { id: 'aero', label: '栅格翼气动引导', short: '气动引导', start: 388, end: 481, hint: '栅格翼调整升力与姿态，一级飞向海上无人船。' },
  { id: 'landing', label: '着陆点火 · 着陆腿展开', short: '着陆', start: 481, end: 503, hint: '一级减速、对准无人船，着陆腿展开。' },
  { id: 'landed', label: '一级回收完成', short: '完成', start: 503, end: 538, hint: '一级在海上无人船着陆；二级继续飞行。' },
];

export const FALCON_MISSIONS = {
  crew12: {
    id: 'crew12',
    name: 'Crew-12',
    shortName: 'CREW-12',
    subtitle: 'Falcon 9 · Crew Dragon · 陆地回收',
    recovery: 'land',
    recoveryLabel: 'LZ-1 陆地着陆区',
    recoveryShort: '陆地着陆',
    vehicle: 'Falcon 9 Block 5 + Crew Dragon',
    badge: 'RTLS / LZ-1',
    source: {
      label: 'SpaceX · Crew-12 任务页',
      url: 'https://www.spacex.com/launches/crew12',
      note: '官方事件时间为该任务公布的近似值。',
    },
    sourceSecondary: {
      label: 'SpaceX · Falcon 9 产品页',
      url: 'https://new.spacex.com/vehicles/falcon-9',
    },
    duration: 497,
    start: -10,
    targetDownrange: 14_000,
    targetLateral: 0,
    targetNote: 'LZ-1 距离为示意值；世界坐标经过压缩。',
    landingBurnAltitude: 3800,
    hasBoostback: true,
    boostback: [161, 207],
    entry: [380, 393],
    landingBurn: 437,
    touchdown: 462,
    legsDeploy: 450,
    meco: 144,
    separation: 147,
    ses: 155,
    events: crewEvents,
    phases: crewPhases,
    notes: [
      'Crew-12 采用陆地着陆（RTLS）剖面，包含返航点火。',
      '官方时间线中的事件时间为近似值；其余状态为模拟。',
    ],
    summary: {
      title: '一级回收完成',
      lines: [
        'Crew-12 参考时间线：T+07:42 一级在 LZ-1 垂直着陆。',
        '二级在此后继续飞向轨道，演示到此结束。',
      ],
    },
    stage1Keys: [
      [-10, 0, 0],
      [0, 0, 0],
      [15, 250, 50],
      [30, 3_000, 1_500],
      [45, 8_000, 5_000],
      [60, 15_000, 12_000],
      [75, 25_000, 25_000],
      [90, 36_000, 45_000],
      [105, 46_000, 68_000],
      [120, 55_000, 95_000],
      [132, 62_000, 116_000],
      [144, 68_000, 137_000],
      [147, 70_000, 138_000],
      [152, 77_000, 140_000],
      [161, 87_000, 142_000],
      [175, 103_000, 112_000],
      [190, 114_000, 75_000],
      [207, 123_000, 33_000],
      [225, 132_000, 21_000],
      [240, 136_000, 17_000],
      [300, 132_000, 15_200],
      [340, 112_000, 14_700],
      [380, 68_000, 14_300],
      [393, 42_000, 14_150],
      [410, 24_000, 14_100],
      [425, 10_000, 14_050],
      [432, 5_500, 14_020],
      [437, 3_800, 14_000],
      [447, 1_500, 14_000],
      [455, 550, 14_000],
      [460, 120, 14_000],
      [462, 0, 14_000, -1.8, 0],
    ],
    stage2Keys: [
      [-10, 47.6, 0],
      [0, 47.6, 0],
      [60, 15_041.8, 12_000],
      [120, 55_041.8, 95_000],
      [144, 68_041.8, 137_000],
      [147, 70_041.8, 138_000],
      [155, 74_500, 141_000],
      [180, 90_000, 180_000],
      [240, 120_000, 330_000],
      [330, 160_000, 850_000],
      [400, 190_000, 1_350_000],
      [462, 208_000, 1_850_000],
      [497, 220_000, 2_050_000],
    ],
  },
  starlink1038: {
    id: 'starlink1038',
    name: 'Starlink 10-38',
    shortName: 'STARLINK 10-38',
    subtitle: 'Falcon 9 · Starlink · 海上回收',
    recovery: 'sea',
    recoveryLabel: '海上无人船',
    recoveryShort: '海上回收',
    vehicle: 'Falcon 9 Block 5 + Starlink',
    badge: 'ASDS / 海上',
    source: {
      label: 'SpaceX · Starlink 10-38 任务页',
      url: 'https://www.spacex.com/launches/sl-10-38',
      note: '官方时间线未列出返航点火；本项目未插入该事件。',
    },
    sourceSecondary: {
      label: 'SpaceX · Falcon 9 产品页',
      url: 'https://new.spacex.com/vehicles/falcon-9',
    },
    duration: 538,
    start: -10,
    targetDownrange: 280_000,
    targetLateral: 0,
    targetNote: '无人船位置为示意值；世界坐标经过压缩。',
    landingBurnAltitude: 2800,
    hasBoostback: false,
    boostback: null,
    entry: [366, 388],
    landingBurn: 481,
    touchdown: 503,
    legsDeploy: 491,
    meco: 146,
    separation: 150,
    ses: 156,
    events: starlinkEvents,
    phases: starlinkPhases,
    notes: [
      'Starlink 10-38 官方时间线未列返航点火，海上模式中不出现这一事件。',
      '无人船位置与轨迹为可视化示意，不是任务实测数据。',
    ],
    summary: {
      title: '海上回收完成',
      lines: [
        'Starlink 10-38 参考时间线：T+08:23 一级在海上无人船垂直着陆。',
        '该任务没有插入返航点火；一级沿下程方向飞向无人船。',
      ],
    },
    stage1Keys: [
      [-10, 0, 0],
      [0, 0, 0],
      [15, 260, 60],
      [30, 3_100, 1_600],
      [45, 8_200, 5_300],
      [63, 16_000, 13_000],
      [80, 27_000, 28_000],
      [96, 38_000, 48_000],
      [112, 48_000, 73_000],
      [128, 58_000, 103_000],
      [140, 65_000, 132_000],
      [146, 69_000, 150_000],
      [150, 72_000, 152_000],
      [160, 82_000, 157_000],
      [180, 100_000, 172_000],
      [220, 124_000, 198_000],
      [260, 130_000, 221_000],
      [300, 120_000, 242_000],
      [340, 100_000, 258_000],
      [366, 77_000, 268_000],
      [388, 45_000, 273_000],
      [410, 28_000, 276_000],
      [430, 18_000, 278_000],
      [450, 10_000, 279_000],
      [465, 5_400, 279_500],
      [481, 2_800, 280_000],
      [492, 900, 280_000],
      [500, 180, 280_000],
      [503, 0, 280_000, -1.8, 0],
    ],
    stage2Keys: [
      [-10, 47.6, 0],
      [0, 47.6, 0],
      [63, 16_041.8, 13_000],
      [140, 65_041.8, 132_000],
      [146, 69_041.8, 150_000],
      [150, 72_041.8, 152_000],
      [156, 76_000, 155_000],
      [180, 90_000, 200_000],
      [240, 120_000, 350_000],
      [330, 165_000, 900_000],
      [400, 195_000, 1_400_000],
      [503, 215_000, 2_050_000],
      [538, 225_000, 2_350_000],
    ],
  },
};

export const FALCON_MISSION_LIST = Object.values(FALCON_MISSIONS);

export const FALCON_CAMERA_MODES = [
  { id: 'overview', label: '全景', key: '1' },
  { id: 'ground', label: '地面', key: '2' },
  { id: 'stack', label: '跟随整箭', key: '3' },
  { id: 'stage1', label: '跟随一级', key: '4' },
  { id: 'stage2', label: '跟随二级', key: '5' },
  { id: 'landing', label: '着陆平台', key: '6' },
  { id: 'free', label: '自由轨道', key: '7' },
];

export const STARSHIP_EVENTS = [
  event(0, 'liftoff', '点火 · 起飞', 'liftoff', simulated('Super Heavy 33 台发动机点火；概念时间线。')),
  event(62, 'maxq', '最大动压', 'maxq', simulated('最大动压为概念演示值。')),
  event(160, 'hot-stage', '热分离 · 飞船点火', 'hotstage', simulated('热分离（Hot Staging）概念演示：飞船发动机在分离过程中点火，Super Heavy 同时关机。')),
  event(166, 'stage-sep', '助推器分离', 'sep', simulated('助推器与飞船分离；参考 Flight 13 时代构型的概念模型。')),
  event(172, 'boostback', '助推器返航点火', 'boostback', simulated('Super Heavy 调头返航；具体时序为概念演示。')),
  event(300, 'entry', '助推器再入', 'entry', simulated('助推器再入大气层；热载荷与姿态为示意。')),
  event(408, 'catch-burn', '捕获前减速点火', 'landing', simulated('助推器减速并对准发射塔，具体发动机关机时序为示意。')),
  event(420, 'tower-catch', '发射塔机械臂捕获', 'catch', simulated('发射塔机械臂（Chopsticks）夹住 Super Heavy；无着陆腿，与 Falcon 9 回收方式不同。')),
  event(470, 'demo-end', '演示结束', 'end', simulated('飞船继续飞向轨道；演示结束。')),
];

export const STARSHIP_SOURCE = {
  label: 'SpaceX · Starship',
  url: 'https://new.spacex.com/vehicles/starship',
  secondary: {
    label: 'SpaceX · 可重复使用技术更新',
    url: 'https://www.spacex.com/updates/reusability',
  },
  version: '参考 Flight 13 时代构型的概念模型 · 非官方逐秒时间线',
};
