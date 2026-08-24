import type {
  Dirent,
  MakeDirectoryOptions,
  ObjectEncodingOptions,
  PathLike,
  PathOrFileDescriptor,
  WriteFileOptions,
} from "node:fs"
import {
  mkdirSync as _mkdirSync,
  readdirSync as _readdirSync,
  readFileSync as _readFileSync,
  renameSync as _renameSync,
  rmdirSync as _rmdirSync,
  writeFileSync as _writeFileSync,
} from "node:fs"

function formatFsError(operation: string, path: string, err: unknown): string {
  const code = (err as NodeJS.ErrnoException).code
  switch (code) {
    case "ENOENT":
      return `${operation}: not found: ${path}`
    case "EACCES":
      return `${operation}: permission denied: ${path}`
    case "ENOTDIR":
      return `${operation}: not a directory: ${path}`
    case "EISDIR":
      return `${operation}: is a directory: ${path}`
    case "EEXIST":
      return `${operation}: already exists: ${path}`
    default:
      return `${operation}: failed: ${path}`
  }
}

/**
 * Filesystem wrappers that turn fs errors into human-readable (and
 * agent-readable) plain Errors. The functional core throws; the CLI
 * shell maps to abortError.
 */

export function mkdirSyncOrThrow(
  path: PathLike,
  options?: MakeDirectoryOptions,
): void {
  try {
    _mkdirSync(path, options)
  } catch (err) {
    throw new Error(formatFsError("create directory", String(path), err))
  }
}

export function readdirSyncOrThrow(
  path: PathLike,
  options: ObjectEncodingOptions & { withFileTypes: true },
): Dirent[]
export function readdirSyncOrThrow(
  path: PathLike,
  options?: BufferEncoding | null,
): string[]
export function readdirSyncOrThrow(path: PathLike, options?: unknown): unknown {
  try {
    return _readdirSync(path, options as never)
  } catch (err) {
    throw new Error(formatFsError("read directory", String(path), err))
  }
}

export function readFileSyncOrThrow(
  path: PathOrFileDescriptor,
  options: BufferEncoding | { encoding: BufferEncoding; flag?: string },
): string
export function readFileSyncOrThrow(
  path: PathOrFileDescriptor,
  options?: (ObjectEncodingOptions & { flag?: string }) | null,
): string | Buffer
export function readFileSyncOrThrow(
  path: PathOrFileDescriptor,
  options?: unknown,
): unknown {
  try {
    return _readFileSync(path, options as never)
  } catch (err) {
    throw new Error(formatFsError("read file", String(path), err))
  }
}

export function writeFileSyncOrThrow(
  file: PathOrFileDescriptor,
  data: string | NodeJS.ArrayBufferView,
  options?: WriteFileOptions,
): void {
  try {
    _writeFileSync(file, data, options)
  } catch (err) {
    throw new Error(formatFsError("write file", String(file), err))
  }
}

export function renameSyncOrThrow(from: PathLike, to: PathLike): void {
  try {
    _renameSync(from, to)
  } catch (err) {
    throw new Error(
      formatFsError("rename", `${String(from)} → ${String(to)}`, err),
    )
  }
}

export function rmdirSyncOrThrow(path: PathLike): void {
  try {
    _rmdirSync(path)
  } catch (err) {
    throw new Error(formatFsError("remove directory", String(path), err))
  }
}
