import { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

/* ── Blinking LED rack unit ──────────────────────────────────────────────── */
function RackUnit({ yPos, idx }: { yPos: number; idx: number }) {
  const ledRef  = useRef<THREE.Mesh>(null);
  const led2Ref = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (ledRef.current) {
      const mat = ledRef.current.material as THREE.MeshBasicMaterial;
      mat.color.setStyle(Math.sin(t * 1.8 + idx * 1.2) > 0.4 ? '#00e5a0' : '#001a10');
    }
    if (led2Ref.current) {
      const mat2 = led2Ref.current.material as THREE.MeshBasicMaterial;
      mat2.color.setStyle(Math.sin(t * 2.3 + idx * 0.7 + 1) > 0.5 ? '#00aaff' : '#000d18');
    }
  });

  return (
    <group position={[0, yPos, 0.02]}>
      {/* Unit chassis */}
      <mesh>
        <boxGeometry args={[2.2, 0.3, 0.85]} />
        <meshPhysicalMaterial color="#060e1c" metalness={0.96} roughness={0.06} />
      </mesh>
      {/* Front bezel */}
      <mesh position={[0, 0, 0.435]}>
        <boxGeometry args={[2.2, 0.3, 0.02]} />
        <meshPhysicalMaterial color="#090f1f" metalness={0.9} roughness={0.1} />
      </mesh>
      {/* Drive bays */}
      {[-0.75, -0.38, 0, 0.38, 0.75].map((x, i) => (
        <mesh key={i} position={[x, 0, 0.448]}>
          <boxGeometry args={[0.26, 0.17, 0.005]} />
          <meshPhysicalMaterial color="#040810" metalness={0.8} roughness={0.25} />
        </mesh>
      ))}
      {/* Status LEDs */}
      <mesh ref={ledRef} position={[0.95, 0.04, 0.447]}>
        <circleGeometry args={[0.035, 8]} />
        <meshBasicMaterial color="#00e5a0" />
      </mesh>
      <mesh ref={led2Ref} position={[0.95, -0.06, 0.447]}>
        <circleGeometry args={[0.025, 8]} />
        <meshBasicMaterial color="#00aaff" />
      </mesh>
    </group>
  );
}

/* ── Server Rack ─────────────────────────────────────────────────────────── */
function ServerRack({ active }: { active: boolean }) {
  const groupRef  = useRef<THREE.Group>(null);
  const glowRef   = useRef<THREE.PointLight>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (groupRef.current) {
      groupRef.current.rotation.y = Math.sin(t * 0.1) * 0.28;
      groupRef.current.position.y = Math.sin(t * 0.4) * 0.04;
    }
    if (glowRef.current) {
      glowRef.current.intensity = 3 + Math.sin(t * 1.5) * 0.8;
    }
  });

  const rackH = 4.8;

  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      {/* Main chassis */}
      <mesh>
        <boxGeometry args={[2.5, rackH, 1.1]} />
        <meshPhysicalMaterial color="#040b14" metalness={0.97} roughness={0.04} />
      </mesh>

      {/* Rack units × 10 */}
      {Array.from({ length: 10 }, (_, i) => (
        <RackUnit key={i} yPos={-2.1 + i * 0.44} idx={i} />
      ))}

      {/* Left vertical glow strip */}
      <mesh position={[-1.26, 0, 0.56]}>
        <boxGeometry args={[0.025, rackH, 0.01]} />
        <meshBasicMaterial color="#00d4b4" transparent opacity={0.9} />
      </mesh>
      {/* Right vertical glow strip */}
      <mesh position={[1.26, 0, 0.56]}>
        <boxGeometry args={[0.025, rackH, 0.01]} />
        <meshBasicMaterial color="#00d4b4" transparent opacity={0.9} />
      </mesh>

      {/* Top accent bar */}
      <mesh position={[0, rackH / 2 + 0.04, 0]}>
        <boxGeometry args={[2.5, 0.08, 1.1]} />
        <meshBasicMaterial color="#00d4b4" transparent opacity={0.7} />
      </mesh>
      {/* Bottom accent bar */}
      <mesh position={[0, -rackH / 2 - 0.04, 0]}>
        <boxGeometry args={[2.5, 0.08, 1.1]} />
        <meshBasicMaterial color="#00d4b4" transparent opacity={0.4} />
      </mesh>

      {/* Base platform */}
      <mesh position={[0, -rackH / 2 - 0.18, 0]}>
        <boxGeometry args={[3.2, 0.22, 1.6]} />
        <meshPhysicalMaterial color="#05101e" metalness={0.95} roughness={0.1} />
      </mesh>

      {/* Center glow light */}
      <pointLight ref={glowRef} color="#00d4b4" intensity={3} position={[0, 0, 2]} distance={5} />
      <pointLight color="#004488" intensity={1.2} position={[0, 3, 2]} distance={4} />
    </group>
  );
}

/* ── Floating data particles ─────────────────────────────────────────────── */
function DataParticles() {
  const ref = useRef<THREE.Points>(null);
  const N   = 160;

  const { positions, speeds, phases } = useMemo(() => {
    const positions = new Float32Array(N * 3);
    const speeds    = new Float32Array(N);
    const phases    = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      positions[i * 3]     = (Math.random() - 0.5) * 14;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 10;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 6;
      speeds[i]  = 0.006 + Math.random() * 0.016;
      phases[i]  = Math.random() * Math.PI * 2;
    }
    return { positions, speeds, phases };
  }, []);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const pos = ref.current.geometry.attributes.position.array as Float32Array;
    const t   = clock.getElapsedTime();
    for (let i = 0; i < N; i++) {
      pos[i * 3 + 1] += speeds[i];
      pos[i * 3]     += Math.sin(t * 0.3 + phases[i]) * 0.002;
      if (pos[i * 3 + 1] > 5) {
        pos[i * 3 + 1] = -5;
        pos[i * 3]     = (Math.random() - 0.5) * 14;
      }
    }
    ref.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" array={positions} count={N} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial color="#00d4b4" size={0.045} transparent opacity={0.55} sizeAttenuation />
    </points>
  );
}

/* ── Grid floor ──────────────────────────────────────────────────────────── */
function GridFloor() {
  const ref = useRef<THREE.GridHelper>(null);
  useFrame(({ clock }) => {
    if (ref.current) {
      (ref.current.material as THREE.Material & { opacity: number }).opacity =
        0.18 + Math.sin(clock.getElapsedTime() * 0.4) * 0.04;
    }
  });
  return (
    <gridHelper
      ref={ref}
      args={[30, 40, '#0a2a3a', '#051520']}
      position={[0, -3.2, 0]}
      rotation={[0, 0, 0]}
    />
  );
}

/* ── Ambient hex ring (decorative) ──────────────────────────────────────── */
function HexRing() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.rotation.z = clock.getElapsedTime() * 0.06;
      ref.current.rotation.x = 0.4 + Math.sin(clock.getElapsedTime() * 0.15) * 0.05;
    }
  });
  return (
    <mesh ref={ref} position={[0, 0, -0.5]}>
      <torusGeometry args={[3.5, 0.015, 6, 60]} />
      <meshBasicMaterial color="#00d4b4" transparent opacity={0.25} />
    </mesh>
  );
}

function HexRing2() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.rotation.z = -clock.getElapsedTime() * 0.04;
      ref.current.rotation.x = 0.55;
    }
  });
  return (
    <mesh ref={ref} position={[0, 0, -0.5]}>
      <torusGeometry args={[4.8, 0.01, 6, 80]} />
      <meshBasicMaterial color="#0066aa" transparent opacity={0.2} />
    </mesh>
  );
}

/* ── Camera animator ─────────────────────────────────────────────────────── */
function CameraRig({ drawerOpen }: { drawerOpen: boolean }) {
  const { camera } = useThree();

  useEffect(() => {
    const target = drawerOpen ? new THREE.Vector3(0, 4, 9) : new THREE.Vector3(0, 2.5, 8);
    const start  = camera.position.clone();
    let   t      = 0;
    const anim   = () => {
      t = Math.min(t + 0.02, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      camera.position.lerpVectors(start, target, ease);
      camera.lookAt(0, 0, 0);
      if (t < 1) requestAnimationFrame(anim);
    };
    anim();
  }, [drawerOpen]);

  return null;
}

/* ── Main export ─────────────────────────────────────────────────────────── */
export function ServerScene({ drawerOpen }: { drawerOpen: boolean }) {
  return (
    <>
      <CameraRig drawerOpen={drawerOpen} />
      <color attach="background" args={['#020a12']} />
      <fog   attach="fog"        args={['#020a12', 10, 24]} />

      <ambientLight intensity={0.06} color="#001830" />
      <pointLight   position={[6, 6, 6]}  intensity={0.4} color="#003388" />
      <pointLight   position={[-5, 4, 4]} intensity={0.3} color="#002244" />

      <ServerRack active={false} />
      <DataParticles />
      <GridFloor />
      <HexRing />
      <HexRing2 />
    </>
  );
}
