import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseToml, tomlGet, tomlString, tomlStringArray } from '../src/util/toml.ts';

test('parses tables, scalars and arrays', () => {
  const doc = parseToml(`
[project]
name = "demo"
version = "1.2.3"
requires-python = ">=3.10"
dependencies = [
  "fastapi>=0.110",
  "pydantic",
]

[tool.poetry]
name = "demo-poetry"
`);
  assert.equal(tomlString(doc, 'project.name'), 'demo');
  assert.equal(tomlString(doc, 'project.version'), '1.2.3');
  assert.equal(tomlString(doc, 'project.requires-python'), '>=3.10');
  assert.deepEqual(tomlStringArray(doc, 'project.dependencies'), ['fastapi>=0.110', 'pydantic']);
  assert.equal(tomlString(doc, 'tool.poetry.name'), 'demo-poetry');
});

test('parses nested tables and inline tables', () => {
  const doc = parseToml(`
[tool.black]
line-length = 100
target-version = ["py310"]

[tool.ruff]
lint = { select = ["E", "F"] }
`);
  assert.equal(tomlGet(doc, 'tool.black.line-length'), 100);
  assert.deepEqual(tomlStringArray(doc, 'tool.black.target-version'), ['py310']);
  assert.deepEqual(tomlGet(doc, 'tool.ruff.lint'), { select: ['E', 'F'] });
});

test('ignores comments and keeps quoted values intact', () => {
  const doc = parseToml(`
# a comment
name = "value # not a comment"  # real comment
`);
  assert.equal(tomlString(doc, 'name'), 'value # not a comment');
});
