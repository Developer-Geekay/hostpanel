import { useRef, useMemo, useEffect, useState } from 'react';
import { useFrame, useThree, extend } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';

/* ────────────────────────────────────────────────────────────
   Shared helpers
──────────────────────────────────────────────────────────── */
const TEAL  = '#00d4b4';
const BLUE  = '#0088ff';
const GREEN = '#00e5a0';
const AMBER = '#f0b020';
const RED   = '#ff3355';

/** Tiny glowing dot with additive halo layers */
function GlowDot({
  color, position, r = 0.034, intensity = 0.6,
}: {
  color: string; position: [number,number,number]; r?: number; intensity?: number;
}) {
  return (
    <group position={position}>
      <mesh><circleGeometry args={[r, 8]} /><meshBasicMaterial color={color} /></mesh>
      <mesh><circleGeometry args={[r * 2.8, 8]} />
        <meshBasicMaterial color={color} transparent opacity={0.22} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh><circleGeometry args={[r * 5.5, 8]} />
        <meshBasicMaterial color={color} transparent opacity={0.07} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <pointLight color={color} intensity={intensity} distance={0.55} />
    </group>
  );
}

/** Thin glowing edge strip */
function GlowBar({
  args, position, color = TEAL, opacity = 0.85,
}: {
  args: [number,number,number]; position:[number,number,number]; color?: string; opacity?: number;
}) {
  return (
    <group position={position}>
      <mesh><boxGeometry args={args} />
        <meshBasicMaterial color={color} transparent opacity={opacity} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
}

/* ────────────────────────────────────────────────────────────
   Individual rack unit components
──────────────────────────────────────────────────────────── */

/** Status / HQ display panel (2U) */
function StatusPanel({ yPos }: { yPos: number }) {
  const dispRef = useRef<THREE.Mesh>(null);
  const [lines, setLines] = useState(['', '', '']);

  useEffect(() => {
    const hex = () => Math.floor(Math.random()*0xffffff).toString(16).toUpperCase().padStart(6,'0');
    const num = () => (Math.random()*100).toFixed(1);
    const tick = () => setLines([
      `CPU  ${num()}%  MEM ${num()}%`,
      `NET ↑${(Math.random()*900+100).toFixed(0)} MB/s`,
      `0x${hex()} 0x${hex().slice(0,4)}`,
    ]);
    tick();
    const t = setInterval(tick, 1400);
    return () => clearInterval(t);
  }, []);

  return (
    <group position={[0, yPos, 0]}>
      {/* 2U body */}
      <mesh><boxGeometry args={[2.5, 0.75, 0.95]} />
        <meshPhysicalMaterial color="#050d18" metalness={0.97} roughness={0.05} />
      </mesh>
      {/* Front bezel */}
      <mesh position={[0, 0, 0.48]}>
        <boxGeometry args={[2.5, 0.75, 0.015]} />
        <meshPhysicalMaterial color="#080e20" metalness={0.9} roughness={0.1} />
      </mesh>
      {/* Display screen */}
      <mesh position={[-0.4, 0, 0.49]}>
        <boxGeometry args={[1.2, 0.52, 0.005]} />
        <meshBasicMaterial color="#001428" />
      </mesh>
      {/* Screen glow overlay */}
      <mesh position={[-0.4, 0, 0.496]}>
        <boxGeometry args={[1.15, 0.48, 0.001]} />
        <meshBasicMaterial color={TEAL} transparent opacity={0.06} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      {/* Top accent bar on panel */}
      <GlowBar args={[2.5, 0.01, 0.01]} position={[0, 0.375, 0.48]} color={TEAL} opacity={1} />
      {/* Right side controls */}
      {[0.15, 0, -0.15].map((y, i) => (
        <GlowDot key={i} color={i === 0 ? GREEN : i === 1 ? BLUE : TEAL} position={[1.05, y, 0.49]} r={0.03} intensity={0.8} />
      ))}
      {/* Port LEDs row */}
      {Array.from({ length: 8 }, (_, i) => (
        <GlowDot key={i} color={i % 3 === 0 ? GREEN : TEAL} position={[0.55 - i * 0.1, -0.28, 0.49]} r={0.022} intensity={0.3} />
      ))}
    </group>
  );
}

/** Standard 1U server */
function Server1U({ yPos, idx }: { yPos: number; idx: number }) {
  const led1Ref = useRef<boolean>(true);
  const led2Ref = useRef<boolean>(false);
  const m1Ref   = useRef<THREE.MeshBasicMaterial>(null);
  const m2Ref   = useRef<THREE.MeshBasicMaterial>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (m1Ref.current) m1Ref.current.color.setStyle(Math.sin(t * 1.6 + idx) > 0.3 ? GREEN : '#001a10');
    if (m2Ref.current) m2Ref.current.color.setStyle(Math.sin(t * 2.2 + idx * 0.9 + 1) > 0.2 ? BLUE : '#00060f');
  });

  return (
    <group position={[0, yPos, 0]}>
      <mesh><boxGeometry args={[2.5, 0.32, 0.95]} />
        <meshPhysicalMaterial color="#060c1a" metalness={0.97} roughness={0.06} />
      </mesh>
      {/* Front bezel */}
      <mesh position={[0, 0, 0.48]}>
        <boxGeometry args={[2.5, 0.32, 0.012]} />
        <meshPhysicalMaterial color="#08101e" metalness={0.92} roughness={0.1} />
      </mesh>
      {/* Drive bays */}
      {[-0.9,-0.54,-0.18,0.18,0.54,0.9].map((x, i) => (
        <mesh key={i} position={[x, 0.01, 0.489]}>
          <boxGeometry args={[0.28, 0.2, 0.004]} />
          <meshPhysicalMaterial color="#040810" metalness={0.85} roughness={0.2} />
        </mesh>
      ))}
      {/* Status LEDs */}
      <mesh position={[1.1, 0.08, 0.49]}>
        <circleGeometry args={[0.03, 8]} />
        <meshBasicMaterial ref={m1Ref} color={GREEN} />
      </mesh>
      <mesh position={[1.1, -0.06, 0.49]}>
        <circleGeometry args={[0.025, 8]} />
        <meshBasicMaterial ref={m2Ref} color={BLUE} />
      </mesh>
      <pointLight color={GREEN} intensity={0.3} distance={0.3} position={[1.1, 0.08, 0.55]} />
      {/* Power button */}
      <mesh position={[-1.12, 0, 0.49]}>
        <circleGeometry args={[0.032, 12]} />
        <meshBasicMaterial color={TEAL} transparent opacity={0.7} />
      </mesh>
    </group>
  );
}

/** 2U Storage array with 12 drive bays and individual drive LEDs */
function StorageArray({ yPos }: { yPos: number }) {
  const ledRefs = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    ledRefs.current.forEach((m, i) => {
      if (!m) return;
      const active = Math.sin(t * 0.8 + i * 0.7) > 0;
      m.color.setStyle(active ? AMBER : '#1a0800');
    });
  });

  return (
    <group position={[0, yPos, 0]}>
      <mesh><boxGeometry args={[2.5, 0.68, 0.95]} />
        <meshPhysicalMaterial color="#060c1a" metalness={0.97} roughness={0.06} />
      </mesh>
      {/* 12 drive bays in 2 rows × 6 */}
      {Array.from({ length: 12 }, (_, i) => {
        const col = i % 6, row = Math.floor(i / 6);
        const x   = -1.0 + col * 0.38;
        const y   =  0.16 - row * 0.32;
        return (
          <group key={i} position={[x, y, 0.485]}>
            <mesh><boxGeometry args={[0.33, 0.26, 0.006]} />
              <meshPhysicalMaterial color="#040810" metalness={0.85} roughness={0.2} />
            </mesh>
            {/* Drive activity LED */}
            <mesh position={[0.13, -0.1, 0.004]}>
              <circleGeometry args={[0.02, 8]} />
              <meshBasicMaterial ref={el => { ledRefs.current[i] = el; }} color={AMBER} />
            </mesh>
          </group>
        );
      })}
      {/* Status lights */}
      <GlowDot color={GREEN} position={[1.1,  0.1, 0.49]} r={0.028} />
      <GlowDot color={TEAL}  position={[1.1, -0.1, 0.49]} r={0.022} />
    </group>
  );
}

/** 1U Network switch with 24 port LEDs */
function NetworkSwitch({ yPos }: { yPos: number }) {
  const portRefs = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    portRefs.current.forEach((m, i) => {
      if (!m) return;
      const blink = Math.sin(t * 3 + i * 0.4) > 0.5;
      m.color.setStyle(blink ? GREEN : '#001a08');
    });
  });

  return (
    <group position={[0, yPos, 0]}>
      <mesh><boxGeometry args={[2.5, 0.3, 0.95]} />
        <meshPhysicalMaterial color="#050c18" metalness={0.97} roughness={0.06} />
      </mesh>
      {/* 24 ports in 2 rows */}
      {Array.from({ length: 24 }, (_, i) => {
        const col = i % 12, row = Math.floor(i / 12);
        return (
          <group key={i} position={[-1.05 + col * 0.195, 0.07 - row * 0.14, 0.485]}>
            <mesh><boxGeometry args={[0.14, 0.09, 0.005]} />
              <meshPhysicalMaterial color="#030810" metalness={0.8} roughness={0.3} />
            </mesh>
            <mesh position={[0, 0.055, 0.003]}>
              <circleGeometry args={[0.018, 6]} />
              <meshBasicMaterial ref={el => { portRefs.current[i] = el; }} color={GREEN} />
            </mesh>
          </group>
        );
      })}
      <GlowDot color={BLUE} position={[1.1, 0, 0.49]} r={0.025} intensity={0.5} />
    </group>
  );
}

/** Patch panel */
function PatchPanel({ yPos }: { yPos: number }) {
  return (
    <group position={[0, yPos, 0]}>
      <mesh><boxGeometry args={[2.5, 0.22, 0.95]} />
        <meshPhysicalMaterial color="#04080f" metalness={0.95} roughness={0.08} />
      </mesh>
      {Array.from({ length: 24 }, (_, i) => (
        <mesh key={i} position={[-1.1 + i * 0.097, 0, 0.486]} rotation={[Math.PI/2, 0, 0]}>
          <cylinderGeometry args={[0.028, 0.028, 0.015, 8]} />
          <meshPhysicalMaterial color="#0a1828" metalness={0.8} roughness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

/* ────────────────────────────────────────────────────────────
   Rack frame — 4 corner posts + horizontal rails
──────────────────────────────────────────────────────────── */
function RackFrame() {
  const H = 5.2, W = 2.76, D = 1.05, POST = 0.07;
  const corners: [number,number,number][] = [
    [-W/2, 0, -D/2], [-W/2, 0, D/2],
    [ W/2, 0, -D/2], [ W/2, 0, D/2],
  ];
  return (
    <group>
      {corners.map(([x,,z], i) => (
        <mesh key={i} position={[x, 0, z]}>
          <boxGeometry args={[POST, H, POST]} />
          <meshPhysicalMaterial color="#040a14" metalness={0.99} roughness={0.03} />
        </mesh>
      ))}
      {/* Front vertical glow strips */}
      <GlowBar args={[0.012, H, 0.005]} position={[-W/2, 0, D/2 + 0.001]} color={TEAL} opacity={0.95} />
      <GlowBar args={[0.012, H, 0.005]} position={[ W/2, 0, D/2 + 0.001]} color={TEAL} opacity={0.95} />
      {/* Top bar */}
      <mesh position={[0, H/2 + POST/2, 0]}>
        <boxGeometry args={[W + POST, POST, D + POST]} />
        <meshPhysicalMaterial color="#060c18" metalness={0.98} roughness={0.04} />
      </mesh>
      <GlowBar args={[W + POST, 0.01, 0.01]} position={[0, H/2 + POST, D/2]} color={TEAL} opacity={0.85} />
      {/* Bottom base */}
      <mesh position={[0, -H/2 - 0.14, 0]}>
        <boxGeometry args={[W + 0.4, 0.22, D + 0.4]} />
        <meshPhysicalMaterial color="#04080f" metalness={0.96} roughness={0.08} />
      </mesh>
      <GlowBar args={[W + 0.4, 0.008, 0.01]} position={[0, -H/2 - 0.025, D/2 + 0.2]} color={TEAL} opacity={0.6} />
      {/* Platform glow */}
      <mesh position={[0, -H/2 - 0.36, 0]}>
        <boxGeometry args={[W + 0.8, 0.04, D + 0.8]} />
        <meshBasicMaterial color={TEAL} transparent opacity={0.18} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
}

/* ────────────────────────────────────────────────────────────
   Holographic orbital rings
──────────────────────────────────────────────────────────── */
function OrbitalRings() {
  const r1 = useRef<THREE.Mesh>(null);
  const r2 = useRef<THREE.Mesh>(null);
  const r3 = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (r1.current) { r1.current.rotation.z = t * 0.07; r1.current.rotation.x = 0.38; }
    if (r2.current) { r2.current.rotation.z = -t * 0.05; r2.current.rotation.x = 1.1; }
    if (r3.current) { r3.current.rotation.y = t * 0.04; r3.current.rotation.x = 0.6; }
  });

  return (
    <>
      <mesh ref={r1}><torusGeometry args={[3.8, 0.014, 6, 80]} />
        <meshBasicMaterial color={TEAL} transparent opacity={0.28} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh ref={r2}><torusGeometry args={[5.2, 0.009, 6, 100]} />
        <meshBasicMaterial color={BLUE} transparent opacity={0.18} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
      <mesh ref={r3}><torusGeometry args={[4.5, 0.006, 6, 90]} />
        <meshBasicMaterial color={TEAL} transparent opacity={0.14} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </>
  );
}

/* ────────────────────────────────────────────────────────────
   Floating wireframe data cubes
──────────────────────────────────────────────────────────── */
function DataCubes() {
  const cubes = useMemo(() => Array.from({ length: 6 }, (_, i) => ({
    pos: [
      Math.cos(i / 6 * Math.PI * 2) * 4.5,
      (Math.random() - 0.5) * 3,
      Math.sin(i / 6 * Math.PI * 2) * 2.5,
    ] as [number,number,number],
    size: 0.12 + Math.random() * 0.18,
    speed: 0.3 + Math.random() * 0.4,
    phase: i / 6 * Math.PI * 2,
  })), []);

  const refs = useRef<(THREE.LineSegments | null)[]>([]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    refs.current.forEach((m, i) => {
      if (!m) return;
      const c = cubes[i];
      m.rotation.x = t * c.speed * 0.4;
      m.rotation.y = t * c.speed * 0.6;
      m.position.y = cubes[i].pos[1] + Math.sin(t * 0.5 + c.phase) * 0.3;
    });
  });

  return (
    <>
      {cubes.map((c, i) => (
        <lineSegments
          key={i}
          ref={el => { refs.current[i] = el; }}
          position={c.pos}
        >
          <edgesGeometry args={[new THREE.BoxGeometry(c.size, c.size, c.size)]} />
          <lineBasicMaterial color={TEAL} transparent opacity={0.45} blending={THREE.AdditiveBlending} />
        </lineSegments>
      ))}
    </>
  );
}

/* ────────────────────────────────────────────────────────────
   Data particles — organized upward streams
──────────────────────────────────────────────────────────── */
function DataParticles() {
  const ref = useRef<THREE.Points>(null);
  const N   = 200;

  const { positions, speeds, phases } = useMemo(() => {
    const positions = new Float32Array(N * 3);
    const speeds    = new Float32Array(N);
    const phases    = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      // Cluster particles into streams around the rack
      const stream = i % 4;
      const sx = [-2.5, -1.5, 1.5, 2.5][stream];
      positions[i * 3]     = sx + (Math.random() - 0.5) * 0.6;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 10;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 1.5;
      speeds[i] = 0.015 + Math.random() * 0.025;
      phases[i] = Math.random() * Math.PI * 2;
    }
    return { positions, speeds, phases };
  }, []);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const pos = ref.current.geometry.attributes.position.array as Float32Array;
    const t   = clock.getElapsedTime();
    for (let i = 0; i < N; i++) {
      pos[i * 3 + 1] += speeds[i];
      pos[i * 3]     += Math.sin(t * 0.4 + phases[i]) * 0.001;
      if (pos[i * 3 + 1] > 5.5) {
        pos[i * 3 + 1] = -5.5;
        pos[i * 3]     = pos[i * 3] + (Math.random() - 0.5) * 0.1;
      }
    }
    ref.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" array={positions} count={N} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial color={TEAL} size={0.038} transparent opacity={0.55} sizeAttenuation blending={THREE.AdditiveBlending} depthWrite={false} />
    </points>
  );
}

/* ────────────────────────────────────────────────────────────
   Reflective grid floor
──────────────────────────────────────────────────────────── */
function GridFloor() {
  const ref  = useRef<THREE.GridHelper>(null);
  const ref2 = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (ref.current) {
      (ref.current.material as THREE.Material & { opacity: number }).opacity =
        0.22 + Math.sin(t * 0.35) * 0.05;
    }
    if (ref2.current) {
      (ref2.current.material as THREE.MeshBasicMaterial).opacity =
        0.04 + Math.sin(t * 0.6 + 1) * 0.015;
    }
  });

  return (
    <group>
      <gridHelper ref={ref} args={[28, 36, '#0a2a3a', '#061525']} position={[0, -3.2, 0]} />
      {/* Glow reflection on floor */}
      <mesh ref={ref2} rotation={[-Math.PI / 2, 0, 0]} position={[0, -3.18, 0]}>
        <planeGeometry args={[5, 2.5]} />
        <meshBasicMaterial color={TEAL} transparent opacity={0.04} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
}

/* ────────────────────────────────────────────────────────────
   Camera animation
──────────────────────────────────────────────────────────── */
function CameraRig({ drawerOpen }: { drawerOpen: boolean }) {
  const { camera } = useThree();
  const targetRef  = useRef(new THREE.Vector3(0, 1.8, 8.5));

  useEffect(() => {
    targetRef.current.set(
      drawerOpen ? 0.4 : 0,
      drawerOpen ? 3.0 : 1.8,
      drawerOpen ? 9.5 : 8.5,
    );
  }, [drawerOpen]);

  useFrame(() => {
    camera.position.lerp(targetRef.current, 0.025);
    camera.lookAt(0, 0.2, 0);
  });

  return null;
}

/* ────────────────────────────────────────────────────────────
   Full scene
──────────────────────────────────────────────────────────── */
export function ServerScene({ drawerOpen }: { drawerOpen: boolean }) {
  return (
    <>
      <CameraRig drawerOpen={drawerOpen} />
      <color attach="background" args={['#020a12']} />
      <fog   attach="fog"        args={['#020912', 11, 26]} />

      {/* Ambient */}
      <ambientLight intensity={0.05} color="#001020" />
      <pointLight position={[0, 2, 3]}    intensity={1.8} color="#00d4b4" distance={7} />
      <pointLight position={[0, -2, 3]}   intensity={0.8} color="#003366" distance={5} />
      <pointLight position={[4, 4, 4]}    intensity={0.5} color="#002244" distance={8} />
      <pointLight position={[-4, 2, 2]}   intensity={0.4} color="#004433" distance={6} />

      {/* Rack */}
      <group position={[0, 0, 0]}>
        <RackFrame />
        <StatusPanel    yPos={ 2.25} />
        <Server1U       yPos={ 1.66} idx={0} />
        <NetworkSwitch  yPos={ 1.3}  />
        <StorageArray   yPos={ 0.74} />
        <Server1U       yPos={ 0.0}  idx={1} />
        <PatchPanel     yPos={-0.34} />
        <Server1U       yPos={-0.66} idx={2} />
        <Server1U       yPos={-1.0}  idx={3} />
        <StorageArray   yPos={-1.5}  />
      </group>

      {/* Environment */}
      <DataParticles />
      <OrbitalRings />
      <DataCubes />
      <GridFloor />

      {/* Post-processing */}
      <EffectComposer>
        <Bloom
          luminanceThreshold={0.18}
          luminanceSmoothing={0.9}
          intensity={1.6}
          mipmapBlur
        />
        <Vignette eskil={false} offset={0.22} darkness={0.65} />
      </EffectComposer>
    </>
  );
}
