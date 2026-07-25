"use client";

import { useMemo, useRef, type RefObject } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface Props {
  /** 0..1 track progress, updated imperatively so React never re-renders. */
  progressRef: RefObject<number>;
}

const NODE_COUNT = 190;
const RADIUS = 1.55;
/** Connect nodes closer than this, in world units. Tuned for a readable mesh. */
const LINK_DISTANCE = 0.46;
const ACCENT_COUNT = 7;

function fibonacciSphere(count: number, radius: number): Float32Array {
  const positions = new Float32Array(count * 3);
  const golden = Math.PI * (1 + Math.sqrt(5));

  for (let i = 0; i < count; i += 1) {
    const y = 1 - (i / (count - 1)) * 2;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    positions[i * 3] = Math.cos(theta) * ring * radius;
    positions[i * 3 + 1] = y * radius;
    positions[i * 3 + 2] = Math.sin(theta) * ring * radius;
  }
  return positions;
}

function buildLinks(positions: Float32Array): Float32Array {
  const segments: number[] = [];
  const count = positions.length / 3;

  for (let i = 0; i < count; i += 1) {
    for (let j = i + 1; j < count; j += 1) {
      const dx = positions[i * 3]! - positions[j * 3]!;
      const dy = positions[i * 3 + 1]! - positions[j * 3 + 1]!;
      const dz = positions[i * 3 + 2]! - positions[j * 3 + 2]!;
      if (dx * dx + dy * dy + dz * dz < LINK_DISTANCE * LINK_DISTANCE) {
        segments.push(
          positions[i * 3]!,
          positions[i * 3 + 1]!,
          positions[i * 3 + 2]!,
          positions[j * 3]!,
          positions[j * 3 + 1]!,
          positions[j * 3 + 2]!,
        );
      }
    }
  }
  return new Float32Array(segments);
}

/**
 * three.js draws gl points as raw squares; a radial sprite turns them into the
 * soft circles the design calls for.
 */
function useCircleSprite(): THREE.Texture {
  return useMemo(() => {
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.72, "rgba(255,255,255,1)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, []);
}

function Brain({ progressRef }: Props) {
  const group = useRef<THREE.Group>(null);
  const sprite = useCircleSprite();

  const { nodes, links, accentNodes } = useMemo(() => {
    const nodePositions = fibonacciSphere(NODE_COUNT, RADIUS);
    const accent = new Float32Array(ACCENT_COUNT * 3);

    for (let i = 0; i < ACCENT_COUNT; i += 1) {
      // Spread the accent nodes evenly through the index range.
      const source = Math.floor((i + 0.5) * (NODE_COUNT / ACCENT_COUNT));
      accent[i * 3] = nodePositions[source * 3]!;
      accent[i * 3 + 1] = nodePositions[source * 3 + 1]!;
      accent[i * 3 + 2] = nodePositions[source * 3 + 2]!;
    }

    return {
      nodes: nodePositions,
      links: buildLinks(nodePositions),
      accentNodes: accent,
    };
  }, []);

  useFrame((state, delta) => {
    if (!group.current) return;
    const progress = progressRef.current ?? 0;

    // Continuous slow spin, plus a scrubbed quarter turn across the track.
    group.current.rotation.y += delta * 0.09;
    group.current.rotation.y += (progress * Math.PI * 0.5 - group.current.rotation.y % (Math.PI * 2)) * 0;
    group.current.rotation.x = -0.22 + Math.sin(progress * Math.PI) * 0.28;

    // Push in through the middle of the track, pull back before release. The
    // old 1.5 push parked the camera at the sphere's surface mid-track, which
    // read as a wall of dots instead of a globe; keep the whole sphere in frame.
    const push = Math.sin(Math.min(1, Math.max(0, progress)) * Math.PI);
    state.camera.position.z = 4.2 - push * 0.45;
    state.camera.lookAt(0, 0, 0);
  });

  return (
    <group ref={group}>
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[links, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color="#2f2f2f" transparent opacity={0.55} />
      </lineSegments>

      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[nodes, 3]} />
        </bufferGeometry>
        <pointsMaterial
          color="#8a8a8a"
          size={0.028}
          sizeAttenuation
          transparent
          opacity={0.85}
          map={sprite}
          alphaTest={0.3}
        />
      </points>

      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[accentNodes, 3]} />
        </bufferGeometry>
        <pointsMaterial
          color="#3d7cff"
          size={0.07}
          sizeAttenuation
          transparent
          map={sprite}
          alphaTest={0.3}
        />
      </points>
    </group>
  );
}

/** Act 4's WebGL layer. Never imported statically: Three.js stays out of the entry bundle. */
export default function BrainSphere({ progressRef }: Props) {
  return (
    <Canvas
      aria-hidden
      dpr={[1, 2]}
      camera={{ position: [0, 0, 4.2], fov: 42 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
    >
      <Brain progressRef={progressRef} />
    </Canvas>
  );
}
