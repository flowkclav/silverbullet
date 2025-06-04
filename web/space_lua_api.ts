import { luaBuildStandardEnv } from "./space_lua/stdlib.ts";
import { parseRef } from "@silverbulletmd/silverbullet/lib/page_ref";
import {
  LuaEnv,
  LuaNativeJSFunction,
  type LuaRuntimeError,
  LuaStackFrame,
  LuaTable,
} from "./space_lua/runtime.ts";
import type { System } from "$lib/plugos/system.ts";

export function buildLuaEnv(system: System<any>) {
  const env = new LuaEnv(luaBuildStandardEnv());

  // Expose all syscalls to Lua
  exposeSyscalls(env, system);

  return env;
}

function exposeSyscalls(env: LuaEnv, system: System<any>) {
  // Expose all syscalls to Lua
  const nativeFs = new LuaStackFrame(env, null);
  for (const syscallName of system.registeredSyscalls.keys()) {
    const [ns, fn] = syscallName.split(".");
    if (!env.has(ns)) {
      env.set(ns, new LuaTable(), nativeFs);
    }
    const luaFn = new LuaNativeJSFunction((...args) => {
      return system.localSyscall(syscallName, args);
    });
    env.get(ns, nativeFs).set(fn, luaFn, nativeFs);
  }
}

export async function buildThreadLocalEnv(
  system: System<any>,
  globalEnv: LuaEnv,
) {
  const tl = new LuaEnv();
  if (system.registeredSyscalls.has("editor.getCurrentPageMeta")) {
    const currentPageMeta = await system.localSyscall(
      "editor.getCurrentPageMeta",
      [],
    );
    if (currentPageMeta) {
      tl.setLocal("currentPage", currentPageMeta);
    } else {
      tl.setLocal("currentPage", {
        name: await system.localSyscall("editor.getCurrentPage", []),
      });
    }
  }
  tl.setLocal("_GLOBAL", globalEnv);
  return tl;
}

export async function handleLuaError(e: LuaRuntimeError, system: System<any>) {
  console.error(
    "Lua eval exception",
    e.message,
    e.sf?.astCtx,
  );
  if (e.sf?.astCtx && e.sf.astCtx.ref) {
    // We got an error and actually know where it came from, let's navigate there to help debugging
    const pageRef = parseRef(e.sf.astCtx.ref);
    await system.localSyscall(
      "editor.flashNotification",
      [
        `Lua error: ${e.message}`,
        "error",
      ],
    );
    await system.localSyscall(
      "editor.flashNotification",
      [
        `Navigating to the place in the code where this error occurred in ${pageRef.page}`,
        "info",
      ],
    );
    await system.localSyscall("editor.navigate", [
      {
        page: pageRef.page,
        pos: (typeof pageRef.pos === "number" ? pageRef.pos : 0) +
          (e.sf.astCtx?.from ?? 0) +
          "```space-lua\n".length,
      },
    ]);
  }
}
