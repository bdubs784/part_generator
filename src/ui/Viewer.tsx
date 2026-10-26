import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { MeshData } from '../geometry/mesh'

export interface Body {
  name: string
  mesh: MeshData
  color: string
}

export interface Ball {
  position: [number, number, number]
  radius: number
}

interface Props {
  bodies: Body[]
  balls: Ball[]
  size: number // rough model diameter, for framing the camera
  section: boolean
  resetSignal: number
  ghost: boolean // last good model, shown faded while the inputs are broken
}

// Section view keeps the -Z half, so the cut faces point at the default camera.
// The cut runs through the fill notch on +X and the plain groove on -X.
const SECTION_PLANE = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0)

function BodyMesh({ mesh, color, section, ghost }: { mesh: MeshData; color: string; section: boolean; ghost: boolean }) {
  const { geometry, edges } = useMemo(() => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3))
    geometry.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3))
    geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1))
    const edges = new THREE.BufferGeometry()
    edges.setAttribute('position', new THREE.BufferAttribute(mesh.edges, 3))
    return { geometry, edges }
  }, [mesh])

  useEffect(
    () => () => {
      geometry.dispose()
      edges.dispose()
    },
    [geometry, edges],
  )

  const planes = section ? [SECTION_PLANE] : []
  return (
    <group>
      <mesh geometry={geometry}>
        {/* DoubleSide so the inside shows through the section cut */}
        <meshStandardMaterial
          color={color}
          metalness={0.1}
          roughness={0.6}
          clippingPlanes={planes}
          side={THREE.DoubleSide}
          transparent={ghost}
          opacity={ghost ? 0.25 : 1}
          depthWrite={!ghost}
        />
      </mesh>
      <lineSegments geometry={edges}>
        <lineBasicMaterial color="#1d2430" clippingPlanes={planes} />
      </lineSegments>
    </group>
  )
}

function Balls({ balls, section }: { balls: Ball[]; section: boolean }) {
  const radius = balls[0]?.radius ?? 1
  const geometry = useMemo(() => new THREE.SphereGeometry(radius, 24, 16), [radius])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <group>
      {balls.map((b, i) => (
        <mesh key={i} geometry={geometry} position={b.position}>
          <meshStandardMaterial color="#d9dde3" metalness={0.5} roughness={0.25} clippingPlanes={section ? [SECTION_PLANE] : []} />
        </mesh>
      ))}
    </group>
  )
}

// three's OrbitControls wired up by hand instead of pulling in drei.
function Controls({ size, resetSignal }: { size: number; resetSignal: number }) {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const controls = useRef<OrbitControls | null>(null)

  useEffect(() => {
    const c = new OrbitControls(camera, gl.domElement)
    c.enableDamping = true
    controls.current = c
    return () => c.dispose()
  }, [camera, gl])

  // damping needs an update every frame
  useFrame(() => controls.current?.update())

  // frame the part on load and whenever "reset view" is pressed
  useEffect(() => {
    const d = Math.max(size, 10) * 1.2
    camera.position.set(d * 0.6, d * 0.75, d)
    camera.lookAt(0, 0, 0)
    controls.current?.target.set(0, 0, 0)
    controls.current?.update()
    // size changes on every slider tick; only re-frame on explicit reset
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal, camera])

  return null
}

export function Viewer({ bodies, balls, size, section, resetSignal, ghost }: Props) {
  return (
    <Canvas
      camera={{ fov: 35, near: 0.5, far: 5000 }}
      onCreated={({ gl }) => {
        gl.localClippingEnabled = true
      }}
    >
      <color attach="background" args={['#eef1f5']} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[60, 120, 80]} intensity={1.6} />
      <directionalLight position={[-80, -40, -60]} intensity={0.5} />
      {bodies.map((b) => (
        <BodyMesh key={b.name} mesh={b.mesh} color={b.color} section={section} ghost={ghost} />
      ))}
      {!ghost && <Balls balls={balls} section={section} />}
      <Controls size={size} resetSignal={resetSignal} />
    </Canvas>
  )
}
