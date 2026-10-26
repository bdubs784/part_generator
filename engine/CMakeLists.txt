cmake_minimum_required(VERSION 3.20)
project(bearing_engine CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Manifold: mesh booleans in C++. Pinned so builds are reproducible.
include(FetchContent)
set(MANIFOLD_PAR OFF CACHE BOOL "" FORCE)          # no TBB threads in wasm
set(MANIFOLD_TEST OFF CACHE BOOL "" FORCE)
set(MANIFOLD_CROSS_SECTION ON CACHE BOOL "" FORCE)
set(MANIFOLD_JSBIND OFF CACHE BOOL "" FORCE)       # we write our own bindings
set(MANIFOLD_PYBIND OFF CACHE BOOL "" FORCE)
set(MANIFOLD_CBIND OFF CACHE BOOL "" FORCE)
set(MANIFOLD_EXPORT OFF CACHE BOOL "" FORCE)
set(MANIFOLD_DOWNLOADS ON CACHE BOOL "" FORCE)     # fetch Clipper2
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
FetchContent_Declare(
  manifold
  GIT_REPOSITORY https://github.com/elalish/manifold.git
  GIT_TAG v3.5.4
  GIT_SHALLOW TRUE
)
FetchContent_MakeAvailable(manifold)

add_executable(bearing_engine src/bearing.cpp)
target_link_libraries(bearing_engine PRIVATE manifold::manifold)
target_compile_options(bearing_engine PRIVATE -O3)
target_link_options(bearing_engine PRIVATE
  -O3
  -lembind
  -sMODULARIZE=1
  -sEXPORT_ES6=1
  -sEXPORT_NAME=createBearingEngine
  -sENVIRONMENT=web,worker,node
  -sALLOW_MEMORY_GROWTH=1
  -sFILESYSTEM=0
)
set_target_properties(bearing_engine PROPERTIES SUFFIX ".mjs")
