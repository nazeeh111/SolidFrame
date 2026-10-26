# SolidFrame technical reference

Architecture and C++ development notes for the retained CAD engine. [NOTICE](NOTICE) identifies the original source and modifications; applicable terms remain in [LICENSE](LICENSE) and [cpp/LICENSE-chili-wasm.txt](cpp/LICENSE-chili-wasm.txt).

## Architecture

SolidFrame uses an npm workspace monorepo under `packages/` with an interface-driven, pluggable backend architecture:

```
web ──> builder ──> app ──> core
                  ──> i18n ──> core
                  ──> three ──> core
                  ──> ui ──> core + element
                  ──> wasm ──> core
                  ──> storage ──> core

element ──> core
```

- **`core`** — Abstract interfaces (`IShape`, `IShapeFactory`), math (`XYZ`, `Matrix4`, `Plane`), document model, reactive data (`Observable`, `Binding`, `PubSub`), `Result<T,E>`, transactions/undo/redo, commands, serialization, plugin system, service container, UI abstractions
- **`wasm`** — Concrete `ShapeFactory` calling into OCCT via Emscripten bindings
- **`three`** — Three.js viewport, camera controller, visual objects, highlighter, outline pass, gizmo, mesh export
- **`element`** — Custom reactive DOM elements (radio groups, expanders, data converters)
- **`ui`** — Application chrome: main window, ribbon/toolbar, property panels, project tree, dialogs, toast, status bar
- **`app`** — Concrete `Application`, body node classes, command implementations, `CommandService`, `HotkeyService`
- **`builder`** — `AppBuilder` with a fluent `.useIndexedDB().useWasmOcc().useThree().useUI().build()` chain and default ribbon layout
- **`i18n`** — Locale data (en, zh-cn, pt-br)
- **`storage`** — IndexedDB persistence layer
- **`web`** — Entry point: calls `AppBuilder`, shows loading screen, parses URL parameters

## Technology Stack

- **Frontend**: TypeScript, Three.js (0.184)
- **3D Kernel**: OpenCascade 8.0.0 (OCCT) compiled to WebAssembly via Emscripten
- **Bundler**: Rspack 2
- **Linting & Formatting**: Biome (TypeScript), clang-format (C++)
- **Testing**: Rstest + Happy-DOM
- **Package Manager**: npm workspaces

## Getting Started

### Prerequisites

- Node.js
- npm

### Installation

1. Clone the repository

    ```bash
    git clone https://github.com/nazeeh111/SolidFrame.git
    cd SolidFrame
    ```

2. Install dependencies

    ```bash
    npm ci
    ```

### Development

Start the development server:

```bash
npm run dev   # Launches at http://localhost:8080
```

### Building

Build the application:

```bash
npm run build
```

### WASM Build (Optional)

The prebuilt WASM module is included in the repository. If you want to build it from source:

1. Set up WebAssembly dependencies (one-time setup):

    ```bash
    npm run setup:wasm
    ```

2. Build the WebAssembly module:

    ```bash
    npm run build:wasm
    ```

### Testing & Linting

```bash
npm run test    # Run all tests (Rstest + Happy-DOM)
npm run testc   # Tests with coverage
npm run check   # Biome lint + auto-fix
npm run format  # Biome + clang-format across all files
```

### Docker

You can also deploy with Docker:

```bash
docker compose up -d   # Builds and serves the app at http://localhost:8080
```

## Code Style

- **TypeScript**: Biome for linting and formatting — 4-space indent, 110-char line width, double quotes, semicolons always
- **C++**: clang-format with WebKit style
- Interfaces prefixed with `I` (`IShape`, `ICommand`)
- `camelCase` functions/variables, `PascalCase` classes, `UPPER_SNAKE_CASE` constants
- Type-only imports: `import type { IFoo } from "..."`
- Pre-commit hooks via simple-git-hooks + lint-staged

