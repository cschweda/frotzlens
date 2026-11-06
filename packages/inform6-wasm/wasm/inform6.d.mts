/** Types for the Emscripten-built Inform 6 module (inform6.mjs). */
export interface Inform6FS {
  mkdir(path: string): void
  writeFile(path: string, data: string | Uint8Array): void
  readFile(path: string): Uint8Array
  chdir(path: string): void
}
export interface Inform6Module {
  FS: Inform6FS
  callMain(args: string[]): number
}
declare const factory: (opts?: Record<string, unknown>) => Promise<Inform6Module>
export default factory
