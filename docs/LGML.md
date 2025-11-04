# LGML (LiveGobe Module Language) Roadmap

- [x] **Module System**
  - [x] Create `Module:` namespace for LGML scripts
  - [x] Modules return objects with functions
  - [x] Example: `Module:Math` with `factorial(n)` and `fibonacci(n)`

- [x] **Renderer / Sandbox**
  - [x] Implement server-side execution using `vm2` or Node `vm`
  - [x] Restrict global access to safe helpers only
  - [ ] Optionally: Lua VM (fengari / lua.vm.js) for Lua-like syntax

- [x] **Template Integration**
  - [x] Support `{{#invoke: ModuleName | functionName | args... }}` syntax
  - [x] Parse template calls and execute requested function
  - [x] Safely inject results into page HTML

- [ ] **Caching**
  - [ ] Cache compiled LGML functions for performance
  - [ ] Cache results of pure functions
  - [ ] Invalidate cache when module content changes

- [x] **Security**
  - [x] Restrict access to `require`, `fs`, `process`, or DB
  - [-] Limit execution time and memory usage
  - [ ] Optionally validate LGML code before storing
  
- [-] **Advanced Features (Future)**
  - [x] Support module-to-module calls
  - [ ] Allow modules to define page variables / caching hooks
  - [x] Optionally add async LGML functions