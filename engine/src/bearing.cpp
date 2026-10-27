// Bearing ring builder in C++, compiled to WebAssembly with Emscripten.
//
// Same job as src/geometry/bearing.ts (replicad/OpenCascade), but on Manifold,
// which works on triangle meshes instead of exact B-rep surfaces. That makes
// it much faster, and it can't write STEP, so it's used for the preview and
// STL while OpenCascade still makes the STEP files.
//
// The race math stays in TypeScript (shared/bearing.ts). JS passes in the
// ring's cross-section and the list of cutting tools, so both engines build
// from exactly the same numbers.

#include <emscripten/bind.h>
#include <emscripten/val.h>

#include <algorithm>
#include <chrono>
#include <cmath>
#include <vector>

#include "manifold/manifold.h"

using namespace manifold;
using emscripten::val;

namespace {

// The ring axis is Y (to match the CadQuery/OpenCascade frame). Manifold
// revolves and extrudes along Z, so everything is built Z-up and turned once
// at the end: rotating -90 deg about X sends +Z to +Y.
Manifold zToY(const Manifold& m) { return m.Rotate(-90, 0, 0); }

// Cylinder along Z from z0 to z1 (z here becomes Y after zToY), centred on
// (x, y) in the XY plane. In the Y-up frame the hole sits at (x, -y), since
// the rotation sends +Y to -Z.
Manifold cylinderZ(double x, double y, double r, double z0, double z1, int segments) {
  return Manifold::Cylinder(z1 - z0, r, -1, segments).Translate({x, y, z0});
}

std::vector<double> numbers(const val& array) {
  return emscripten::convertJSArrayToNumberVector<double>(array);
}

template <typename T>
val copyToJs(const char* type, const std::vector<T>& v) {
  // new Float32Array(view) copies out of wasm memory, so the result stays
  // valid after this function's vectors are freed
  return val::global(type).new_(emscripten::typed_memory_view(v.size(), v.data()));
}

}  // namespace

// profile: x0, y0, x1, y1, ... (radius, height) of the closed cross-section
// cylinders: x, z, r, y0, y1 per hole or counterbore (Y-up frame)
// boxes: x0, y0, z0, x1, y1, z1 per box (Y-up frame), e.g. the fill notch
// hexAcrossFlats: > 0 cuts a hex bore through the middle
// dflat: boreR, depth (both 0 for none) adds back a D-flat segment
val buildRing(val profileJs, int segments, val cylindersJs, val boxesJs, double hexAcrossFlats, double dflatR,
              double dflatDepth, double width) {
  const auto t0 = std::chrono::steady_clock::now();

  // 2D (radius, height) -> revolve about Manifold's Y axis, which it makes Z
  const std::vector<double> profile = numbers(profileJs);
  SimplePolygon section;
  for (size_t i = 0; i + 2 <= profile.size(); i += 2) section.push_back({profile[i], profile[i + 1]});
  // Manifold wants outlines counter-clockwise; the inner ring's profile is
  // listed clockwise (it starts at the bore and goes up), so flip if needed.
  double area2 = 0;
  for (size_t i = 0; i < section.size(); i++) {
    const vec2& a = section[i];
    const vec2& b = section[(i + 1) % section.size()];
    area2 += a.x * b.y - b.x * a.y;
  }
  if (area2 < 0) std::reverse(section.begin(), section.end());
  Manifold ring = Manifold::Revolve({section}, segments);

  const double h = width / 2;

  if (hexAcrossFlats > 0) {
    // corner radius from across-flats; first corner on +X, like drawPolysides
    const double r = hexAcrossFlats / std::sqrt(3.0);
    SimplePolygon hex;
    for (int i = 0; i < 6; i++) {
      const double a = manifold::kPi / 3 * i;  // kPi comes with Manifold
      hex.push_back({r * std::cos(a), r * std::sin(a)});
    }
    ring = ring - Manifold::Extrude({hex}, width + 2).Translate({0, 0, -h - 1});
  }

  if (dflatDepth > 0) {
    // the segment of the round bore past the flat, on +X
    const double r = dflatR;
    Manifold box = Manifold::Cube({dflatDepth + 0.5, 2 * r, width}).Translate({r - dflatDepth, -r, -h});
    Manifold disc = Manifold::Cylinder(width, r + 0.5, -1, segments).Translate({0, 0, -h});
    ring = ring + (box ^ disc);
  }

  // Every cutting tool in one batch boolean, like the one-cut version in TS.
  std::vector<Manifold> tools;
  const std::vector<double> cyl = numbers(cylindersJs);
  for (size_t i = 0; i + 5 <= cyl.size(); i += 5) {
    const double x = cyl[i], z = cyl[i + 1], r = cyl[i + 2], y0 = cyl[i + 3], y1 = cyl[i + 4];
    // Y-up (x, z) -> Z-up (x, -z); Y-up height -> Z-up height
    tools.push_back(cylinderZ(x, -z, r, y0, y1, 32));
  }
  const std::vector<double> box = numbers(boxesJs);
  for (size_t i = 0; i + 6 <= box.size(); i += 6) {
    const double x0 = box[i], y0 = box[i + 1], z0 = box[i + 2], x1 = box[i + 3], y1 = box[i + 4], z1 = box[i + 5];
    // Y-up box -> Z-up: x stays, Y-up y is the new z, Y-up z flips to -y
    tools.push_back(Manifold::Cube({x1 - x0, z1 - z0, y1 - y0}).Translate({x0, -z1, y0}));
  }
  if (!tools.empty()) ring = ring - Manifold::BatchBoolean(tools, OpType::Add);

  ring = zToY(ring).CalculateNormals(0, 50);
  const MeshGL mesh = ring.GetMeshGL(0);

  // split interleaved [x y z nx ny nz ...] into the arrays three.js wants
  const size_t n = mesh.vertProperties.size() / mesh.numProp;
  std::vector<float> positions(n * 3), normals(n * 3);
  for (size_t v = 0; v < n; v++) {
    for (int k = 0; k < 3; k++) {
      positions[v * 3 + k] = mesh.vertProperties[v * mesh.numProp + k];
      normals[v * 3 + k] = mesh.vertProperties[v * mesh.numProp + 3 + k];
    }
  }

  const double ms = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count();

  val out = val::object();
  out.set("positions", copyToJs("Float32Array", positions));
  out.set("normals", copyToJs("Float32Array", normals));
  out.set("indices", copyToJs("Uint32Array", mesh.triVerts));
  out.set("volume", ring.Volume());
  out.set("ms", ms);
  out.set("ok", ring.Status() == Manifold::Error::NoError);
  return out;
}

EMSCRIPTEN_BINDINGS(bearing_engine) { emscripten::function("buildRing", &buildRing); }
