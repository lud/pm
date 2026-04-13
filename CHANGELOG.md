# Changelog

All notable changes to this project will be documented in this file.

## [0.10.0] - 2026-04-13

### 🚀 Features

- Support renaming file slug when title changes

## [0.9.1] - 2026-04-05

### ⚙️ Miscellaneous Tasks

- Fix tests unused variables

## [0.9.0] - 2026-04-05

### 🚀 Features

- Support 'blocked by' in workflows
- New pm-hello skill workflow
- Simplified 'next' command to display a tree of active documents

### 🚜 Refactor

- Avoid double-file read on pm context

### ⚙️ Miscellaneous Tasks

- Claude rules

## [0.8.0] - 2026-04-01

### 🚀 Features

- Added ability to hide doctype from pm next
- Better error output for reserved properties
- New next verbose output format

### 📚 Documentation

- Tell agents how to read a full context

## [0.7.0] - 2026-03-25

### 🚀 Features

- Allow the which command to print document paths

### 🚜 Refactor

- Normalize data representation of documents
- Deleted greedy array document scanner

### 📚 Documentation

- Use long options in skills

### ⚙️ Miscellaneous Tasks

- Cleanup spec documents

## [0.6.0] - 2026-03-24

### 🚀 Features

- Removed built-in types
- New blocked states
- Better formatting output
- Align status breakdown globally
- Added 'next' command to help agents find more work

### 🧪 Testing

- New declarative fixture system for tests

### ⚙️ Miscellaneous Tasks

- Format codebase using biome
- Fixed biome warnings

## [0.5.0] - 2026-03-24

### 🚀 Features

- Allow setting and filtering by custom properties
- Done status for spec is now 'done'
- Remove support for positional property edits

## [0.4.0] - 2026-03-23

### 🚀 Features

- Added the hello skill and pm info command
- Breakdown of statuses in the status command
- Tidy command will format parent ids as full references
- Added the quick feature skill

### 🐛 Bug Fixes

- The tidy command now handles orphans correctly

### 🧪 Testing

- Added test for the cli space
- Ensure parent refs work well in numeric and full format

## [0.3.0] - 2026-03-23

### ⚙️ Miscellaneous Tasks

- Added npm publication tooling
- Renamed package

## [0.2.1] - 2026-03-23

### ⚙️ Miscellaneous Tasks

- Git cliff configuration

## [0.2.0] - 2026-03-23

### 🚀 Features

- Base standard features
- Rename open/closed to active/done
- Export config schema with jsdelivr
- Change no-current help output
- Added tidy command
- Default status command for raw pm call
- Added example skill for guidelines
- Accept variadic arguments to name a new document

### 🐛 Bug Fixes

- Fixed directory naming in tidy command

### 🧪 Testing

- Initialize test suite

### ⚙️ Miscellaneous Tasks

- Use coverage in check command
- Iterations on file relationships
- Added release script

