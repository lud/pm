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
import { abortError } from "./cli.js"

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

export function mkdirSyncOrAbort(
  path: PathLike,
  options?: MakeDirectoryOptions,
): void {
  try {
    _mkdirSync(path, options)
  } catch (err) {
    abortError(formatFsError("create directory", String(path), err))
  }
}

export function readdirSyncOrAbort(
  path: PathLike,
  options: ObjectEncodingOptions & { withFileTypes: true },
): Dirent[]
export function readdirSyncOrAbort(
  path: PathLike,
  options?: BufferEncoding | null,
): string[]
export function readdirSyncOrAbort(path: PathLike, options?: unknown): unknown {
  try {
    return _readdirSync(path, options as never)
  } catch (err) {
    abortError(formatFsError("read directory", String(path), err))
  }
}

export function readFileSyncOrAbort(
  path: PathOrFileDescriptor,
  options: BufferEncoding | { encoding: BufferEncoding; flag?: string },
): string
export function readFileSyncOrAbort(
  path: PathOrFileDescriptor,
  options?: (ObjectEncodingOptions & { flag?: string }) | null,
): string | Buffer
export function readFileSyncOrAbort(
  path: PathOrFileDescriptor,
  options?: unknown,
): unknown {
  try {
    return _readFileSync(path, options as never)
  } catch (err) {
    abortError(formatFsError("read file", String(path), err))
  }
}

export function writeFileSyncOrAbort(
  file: PathOrFileDescriptor,
  data: string | NodeJS.ArrayBufferView,
  options?: WriteFileOptions,
): void {
  try {
    _writeFileSync(file, data, options)
  } catch (err) {
    abortError(formatFsError("write file", String(file), err))
  }
}

export function renameSyncOrAbort(from: PathLike, to: PathLike): void {
  try {
    _renameSync(from, to)
  } catch (err) {
    abortError(formatFsError("rename", `${String(from)} → ${String(to)}`, err))
  }
}

export function rmdirSyncOrAbort(path: PathLike): void {
  try {
    _rmdirSync(path)
  } catch (err) {
    abortError(formatFsError("remove directory", String(path), err))
  }
}
