import {
  CANONICAL_MOTION_SCHEMA_VERSION,
  CanonicalJointId,
  CanonicalJointSample,
  CanonicalMotionClip,
  CanonicalMotionFrame,
  MotionDatasetProvenance,
} from '../types/canonicalMotion';

type Vec3 = readonly [number, number, number];
type Mat3 = readonly [number, number, number, number, number, number, number, number, number];

interface BvhNode {
  name: string;
  offset: Vec3;
  channels: readonly string[];
  channelStart: number;
  children: readonly BvhNode[];
}

const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

const DEFAULT_JOINT_MAP: Readonly<Partial<Record<CanonicalJointId, string>>> = Object.freeze({
  head: 'Head',
  neck: 'Neck',
  sternum: 'Spine1',
  navel: 'Spine',
  pelvisCenter: 'Hips',
  shoulderL: 'LeftArm',
  shoulderR: 'RightArm',
  elbowL: 'LeftForeArm',
  elbowR: 'RightForeArm',
  wristL: 'LeftHand',
  wristR: 'RightHand',
  pelvisL: 'LeftUpLeg',
  pelvisR: 'RightUpLeg',
  kneeL: 'LeftLeg',
  kneeR: 'RightLeg',
  ankleL: 'LeftFoot',
  ankleR: 'RightFoot',
  footL: 'LeftToeBase',
  footR: 'RightToeBase',
});

function multiply(left: Mat3, right: Mat3): Mat3 {
  const result = new Array<number>(9).fill(0);
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 3; column++) {
      for (let cursor = 0; cursor < 3; cursor++) {
        result[row * 3 + column] += left[row * 3 + cursor] * right[cursor * 3 + column];
      }
    }
  }
  return result as unknown as Mat3;
}

function rotate(matrix: Mat3, vector: Vec3): Vec3 {
  return [
    matrix[0] * vector[0] + matrix[1] * vector[1] + matrix[2] * vector[2],
    matrix[3] * vector[0] + matrix[4] * vector[1] + matrix[5] * vector[2],
    matrix[6] * vector[0] + matrix[7] * vector[1] + matrix[8] * vector[2],
  ];
}

function add(left: Vec3, right: Vec3): Vec3 {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function rotation(axis: 'X' | 'Y' | 'Z', degrees: number): Mat3 {
  const radians = degrees * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  if (axis === 'X') return [1, 0, 0, 0, cosine, -sine, 0, sine, cosine];
  if (axis === 'Y') return [cosine, 0, sine, 0, 1, 0, -sine, 0, cosine];
  return [cosine, -sine, 0, sine, cosine, 0, 0, 0, 1];
}

function parseHierarchy(header: string): { root: BvhNode; channelCount: number } {
  const tokens = header.match(/[{}]|[^\s{}]+/g) ?? [];
  let cursor = 0;
  let channelCount = 0;
  const next = () => tokens[cursor++];
  const expect = (value: string) => {
    const actual = next();
    if (actual !== value) throw new Error(`Invalid BVH hierarchy: expected ${value}, got ${actual ?? 'EOF'}.`);
  };
  const number = () => {
    const value = Number(next());
    if (!Number.isFinite(value)) throw new Error('Invalid BVH hierarchy number.');
    return value;
  };

  const skipEndSite = () => {
    expect('Site');
    expect('{');
    expect('OFFSET');
    number(); number(); number();
    expect('}');
  };

  const parseNode = (): BvhNode => {
    const kind = next();
    if (kind !== 'ROOT' && kind !== 'JOINT') throw new Error(`Invalid BVH node kind: ${kind ?? 'EOF'}.`);
    const name = next();
    if (!name) throw new Error('BVH node is missing a name.');
    expect('{');
    let offset: Vec3 = [0, 0, 0];
    let channels: readonly string[] = [];
    let channelStart = channelCount;
    const children: BvhNode[] = [];
    while (cursor < tokens.length) {
      const token = tokens[cursor];
      if (token === '}') { cursor++; break; }
      if (token === 'OFFSET') {
        cursor++;
        offset = [number(), number(), number()];
      } else if (token === 'CHANNELS') {
        cursor++;
        const count = number();
        if (!Number.isInteger(count) || count < 0) throw new Error('Invalid BVH channel count.');
        channelStart = channelCount;
        channels = Object.freeze(Array.from({ length: count }, () => next()));
        if (channels.some(channel => !channel)) throw new Error('BVH channel list is incomplete.');
        channelCount += count;
      } else if (token === 'JOINT') {
        children.push(parseNode());
      } else if (token === 'End') {
        cursor++;
        skipEndSite();
      } else {
        throw new Error(`Unsupported BVH hierarchy token: ${token}.`);
      }
    }
    return Object.freeze({ name, offset, channels, channelStart, children: Object.freeze(children) });
  };

  expect('HIERARCHY');
  const root = parseNode();
  return { root, channelCount };
}

function evaluateFrame(root: BvhNode, values: readonly number[]): ReadonlyMap<string, Vec3> {
  const positions = new Map<string, Vec3>();
  const visit = (node: BvhNode, parentPosition: Vec3, parentRotation: Mat3) => {
    const translation = [...node.offset] as [number, number, number];
    let localRotation = IDENTITY;
    let hasPositionChannels = false;
    node.channels.forEach((channel, index) => {
      const value = values[node.channelStart + index];
      if (!Number.isFinite(value)) throw new Error('BVH frame contains a non-finite channel value.');
      if (channel.endsWith('position')) {
        hasPositionChannels = true;
        if (channel.startsWith('X')) translation[0] = value;
        if (channel.startsWith('Y')) translation[1] = value;
        if (channel.startsWith('Z')) translation[2] = value;
      } else if (channel.endsWith('rotation')) {
        const axis = channel[0] as 'X' | 'Y' | 'Z';
        localRotation = multiply(localRotation, rotation(axis, value));
      } else {
        throw new Error(`Unsupported BVH channel: ${channel}.`);
      }
    });
    // UCY's six-channel joints encode their offset in the translation channels.
    // For ordinary three-channel joints the declared OFFSET remains authoritative.
    const localTranslation: Vec3 = hasPositionChannels ? translation : node.offset;
    const worldPosition = add(parentPosition, rotate(parentRotation, localTranslation));
    const worldRotation = multiply(parentRotation, localRotation);
    positions.set(node.name, worldPosition);
    node.children.forEach(child => visit(child, worldPosition, worldRotation));
  };
  visit(root, [0, 0, 0], IDENTITY);
  return positions;
}

function canonicalPoint(position: Vec3, coordinateScale: number): CanonicalJointSample {
  return Object.freeze({
    x: position[0] * coordinateScale,
    y: position[1] * coordinateScale,
    z: position[2] * coordinateScale,
    confidence: 1,
  });
}

export function importBvhCanonicalMotion(input: {
  bvh: string;
  clipId: string;
  label: string;
  exerciseId?: string;
  provenance: MotionDatasetProvenance;
  frameStride?: number;
  maxFrames?: number;
  jointMap?: Readonly<Partial<Record<CanonicalJointId, string>>>;
  /** Required for metric output because BVH itself does not declare units. */
  sourceUnitScaleMeters?: number;
}): CanonicalMotionClip {
  const marker = /\r?\nMOTION\s*\r?\n/.exec(input.bvh);
  if (!marker) throw new Error('BVH is missing its MOTION section.');
  const hierarchy = parseHierarchy(input.bvh.slice(0, marker.index));
  const motionLines = input.bvh.slice(marker.index + marker[0].length).trim().split(/\r?\n/);
  const declaredFrames = Number(motionLines[0]?.match(/^Frames:\s*(\d+)$/)?.[1]);
  const frameTimeSeconds = Number(motionLines[1]?.match(/^Frame Time:\s*([0-9.eE+-]+)$/)?.[1]);
  if (!Number.isInteger(declaredFrames) || declaredFrames <= 0 || !Number.isFinite(frameTimeSeconds) || frameTimeSeconds <= 0) {
    throw new Error('BVH motion header is invalid.');
  }
  const sourceFrames = motionLines.slice(2).filter(Boolean);
  if (sourceFrames.length < declaredFrames) throw new Error('BVH motion frames are incomplete.');
  const frameStride = Math.max(1, Math.floor(input.frameStride ?? 1));
  const maxFrames = Math.max(1, Math.floor(input.maxFrames ?? Number.MAX_SAFE_INTEGER));
  const jointMap = input.jointMap ?? DEFAULT_JOINT_MAP;
  if (input.sourceUnitScaleMeters !== undefined && (
    !Number.isFinite(input.sourceUnitScaleMeters) || input.sourceUnitScaleMeters <= 0
  )) throw new Error('BVH metric unit scale must be positive and finite.');

  const firstValues = sourceFrames[0].trim().split(/\s+/).map(Number);
  if (firstValues.length !== hierarchy.channelCount) {
    throw new Error(`BVH frame 0 has ${firstValues.length} channels; expected ${hierarchy.channelCount}.`);
  }
  const firstPositions = evaluateFrame(hierarchy.root, firstValues);
  const mappedFirstPositions = Object.values(jointMap).flatMap(sourceName => {
    const position = sourceName ? firstPositions.get(sourceName) : undefined;
    return position ? [position] : [];
  });
  const yRange = mappedFirstPositions.length >= 5
    ? Math.max(...mappedFirstPositions.map(position => position[1])) - Math.min(...mappedFirstPositions.map(position => position[1]))
    : 0;
  const coordinateScale = input.sourceUnitScaleMeters ?? (yRange > 1e-6 ? 1 / yRange : Number.NaN);
  if (!Number.isFinite(coordinateScale) || coordinateScale <= 0) {
    throw new Error('BVH cannot be normalized from the mapped first-frame geometry.');
  }
  const frames: CanonicalMotionFrame[] = [];

  for (let sourceIndex = 0; sourceIndex < declaredFrames && frames.length < maxFrames; sourceIndex += frameStride) {
    const values = sourceFrames[sourceIndex].trim().split(/\s+/).map(Number);
    if (values.length !== hierarchy.channelCount) {
      throw new Error(`BVH frame ${sourceIndex} has ${values.length} channels; expected ${hierarchy.channelCount}.`);
    }
    const positions = evaluateFrame(hierarchy.root, values);
    const joints: Partial<Record<CanonicalJointId, CanonicalJointSample>> = {};
    for (const [jointId, sourceName] of Object.entries(jointMap) as [CanonicalJointId, string][]) {
      const position = positions.get(sourceName);
      if (position) joints[jointId] = canonicalPoint(position, coordinateScale);
    }
    frames.push(Object.freeze({
      timeUs: Math.round(sourceIndex * frameTimeSeconds * 1_000_000),
      joints: Object.freeze(joints),
    }));
  }
  if (frames.length === 0) throw new Error('BVH import produced no canonical frames.');

  return Object.freeze({
    schemaVersion: CANONICAL_MOTION_SCHEMA_VERSION,
    clipId: input.clipId,
    exerciseId: input.exerciseId ?? 'unclassified_full_body_motion',
    label: input.label,
    frameRateHz: 1 / frameTimeSeconds / frameStride,
    coordinateSystem: input.sourceUnitScaleMeters === undefined
      ? 'balletos_body_normalized_right_up_forward'
      : 'balletos_metric_right_up_forward',
    provenance: Object.freeze({ ...input.provenance }),
    frames: Object.freeze(frames),
  });
}
